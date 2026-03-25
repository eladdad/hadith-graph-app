import {
  ChangeEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import './styles.css';
import {
  addReportToBundleFromFields,
  bundleToJson,
  createEmptyBundle,
  deleteReportFromBundle,
  getNodeIdsForReport,
  makeExportFilename,
  parseBundleJson,
  updateReportInBundle,
} from './bundle';
import { GraphCanvas } from './components/GraphCanvas';
import { buildRenderableGraph } from './graph';
import { useBoxSelection } from './hooks/useBoxSelection';
import { useNodeDrag } from './hooks/useNodeDrag';
import { useNodeResize } from './hooks/useNodeResize';
import type { GraphNode, HadithBundle, HadithReport } from './types';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.8;

interface PanState {
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

function emptyNarratorDraft(): string[] {
  return [''];
}

function normalizeDraftText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeDraftMatn(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .trim();
}

function normalizeDraftNarrators(values: string[]): string[] {
  return values
    .map((value) => normalizeDraftText(value))
    .filter((value) => value.length > 0);
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function downloadJson(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function App() {
  const [bundle, setBundle] = useState<HadithBundle>(() => createEmptyBundle('My Hadith Bundle'));
  const [editorNarrators, setEditorNarrators] = useState<string[]>(() => emptyNarratorDraft());
  const [editorMatn, setEditorMatn] = useState('');
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [message, setMessage] = useState('Ready. Create reports and drag nodes to arrange your graph.');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const graphScrollRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<PanState | null>(null);

  const graph = useMemo(
    () => buildRenderableGraph(bundle.reports, bundle.nodePositions, bundle.nodeWidths),
    [bundle.reports, bundle.nodePositions, bundle.nodeWidths],
  );

  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const editingReport = useMemo(
    () => bundle.reports.find((report) => report.id === editingReportId) ?? null,
    [bundle.reports, editingReportId],
  );

  const editingReportIndex = useMemo(
    () => (editingReportId ? bundle.reports.findIndex((report) => report.id === editingReportId) : -1),
    [bundle.reports, editingReportId],
  );

  const normalizedDraftNarrators = useMemo(() => normalizeDraftNarrators(editorNarrators), [editorNarrators]);
  const normalizedDraftMatn = useMemo(() => normalizeDraftMatn(editorMatn), [editorMatn]);

  const editorIsDirty = useMemo(() => {
    if (editingReport) {
      return (
        !arraysEqual(normalizedDraftNarrators, editingReport.isnad)
        || normalizedDraftMatn !== editingReport.matn
      );
    }

    return normalizedDraftNarrators.length > 0 || normalizedDraftMatn.length > 0;
  }, [editingReport, normalizedDraftNarrators, normalizedDraftMatn]);

  const resetEditor = useCallback((): void => {
    setEditingReportId(null);
    setEditorNarrators(emptyNarratorDraft());
    setEditorMatn('');
  }, []);

  const loadReportIntoEditor = useCallback((report: HadithReport): void => {
    setEditingReportId(report.id);
    setEditorNarrators(report.isnad.length > 0 ? [...report.isnad] : emptyNarratorDraft());
    setEditorMatn(report.matn);
  }, []);

  const loadReportIntoCreateForm = useCallback((report: HadithReport): void => {
    setEditingReportId(null);
    setEditorNarrators(report.isnad.length > 0 ? [...report.isnad] : emptyNarratorDraft());
    setEditorMatn(report.matn);
  }, []);

  const confirmDiscardEditorChanges = useCallback((): boolean => {
    if (!editorIsDirty) {
      return true;
    }

    return window.confirm('Discard unsaved report changes?');
  }, [editorIsDirty]);

  useEffect(() => {
    const validNodeIds = new Set(graph.nodes.map((node) => node.id));
    setSelectedNodeIds((previous) => {
      const filtered = previous.filter((id) => validNodeIds.has(id));
      return filtered.length === previous.length ? previous : filtered;
    });
  }, [graph.nodes]);

  useEffect(() => {
    if (editingReportId && !editingReport) {
      resetEditor();
    }
  }, [editingReport, editingReportId, resetEditor]);

  useEffect(() => {
    if (!isPanning) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const panState = panStateRef.current;
      const scrollContainer = graphScrollRef.current;
      if (!panState || !scrollContainer) {
        return;
      }

      const deltaX = event.clientX - panState.startClientX;
      const deltaY = event.clientY - panState.startClientY;

      scrollContainer.scrollLeft = panState.startScrollLeft - deltaX;
      scrollContainer.scrollTop = panState.startScrollTop - deltaY;
    };

    const finishPan = (): void => {
      panStateRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishPan);
    window.addEventListener('pointercancel', finishPan);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishPan);
      window.removeEventListener('pointercancel', finishPan);
    };
  }, [isPanning]);

  const clientPointToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const ctm = svg.getScreenCTM();
    if (!ctm) {
      return null;
    }

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }, []);

  const { isDragging, handleNodePointerDown: onNodePointerDownRaw } = useNodeDrag({
    graphNodes: graph.nodes,
    selectedNodeIds,
    setSelectedNodeIds,
    clientPointToSvg,
    setBundle,
    onDragCommitted: (movedCount) => {
      setMessage(`Moved ${movedCount} selected node(s). Export JSON to save this layout.`);
    },
  });

  const { isResizing, handleResizePointerDown: onResizePointerDownRaw } = useNodeResize({
    clientPointToSvg,
    setSelectedNodeIds,
    setBundle,
    onResizeCommitted: () => {
      setMessage('Report node resized. Export JSON to save width and layout.');
    },
  });

  const {
    isBoxSelecting,
    selectionBox,
    handleCanvasPointerDown,
    resetBoxSelection,
  } = useBoxSelection({
    nodes: graph.nodes,
    selectedNodeIds,
    setSelectedNodeIds,
    isDragging,
    isResizing,
    clientPointToSvg,
  });

  const handleNodePointerDown = useCallback((event: ReactPointerEvent<SVGGElement>, nodeId: string): void => {
    if (isBoxSelecting || isResizing) {
      return;
    }
    onNodePointerDownRaw(event, nodeId);
  }, [isBoxSelecting, isResizing, onNodePointerDownRaw]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<SVGRectElement>, node: GraphNode, edge: 'left' | 'right'): void => {
      if (isDragging || isBoxSelecting) {
        return;
      }
      onResizePointerDownRaw(event, node, edge);
    },
    [isDragging, isBoxSelecting, onResizePointerDownRaw],
  );

  const handleGraphPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if ((event.button !== 1 && event.button !== 2) || isDragging || isResizing || isBoxSelecting) {
      return;
    }

    const scrollContainer = graphScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    panStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: scrollContainer.scrollLeft,
      startScrollTop: scrollContainer.scrollTop,
    };

    setIsPanning(true);
    event.preventDefault();
    event.stopPropagation();
  }, [isDragging, isResizing, isBoxSelecting]);

  const handleGraphWheel = useCallback((event: WheelEvent): void => {
    const scrollContainer = graphScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const deltaMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? scrollContainer.clientHeight
        : 1;

    if (!event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      scrollContainer.scrollLeft += event.deltaX * deltaMultiplier;
      scrollContainer.scrollTop += event.deltaY * deltaMultiplier;
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = scrollContainer.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    setZoom((previousZoom) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, previousZoom * Math.exp(-event.deltaY * 0.0015)));
      if (Math.abs(nextZoom - previousZoom) < 0.0001) {
        return previousZoom;
      }

      const graphX = (scrollContainer.scrollLeft + pointerX) / previousZoom;
      const graphY = (scrollContainer.scrollTop + pointerY) / previousZoom;

      requestAnimationFrame(() => {
        const nextScrollContainer = graphScrollRef.current;
        if (!nextScrollContainer) {
          return;
        }

        nextScrollContainer.scrollLeft = graphX * nextZoom - pointerX;
        nextScrollContainer.scrollTop = graphY * nextZoom - pointerY;
      });

      return nextZoom;
    });
  }, []);

  useEffect(() => {
    const scrollContainer = graphScrollRef.current;
    if (!scrollContainer) {
      return undefined;
    }

    scrollContainer.addEventListener('wheel', handleGraphWheel, { passive: false });

    return () => {
      scrollContainer.removeEventListener('wheel', handleGraphWheel);
    };
  }, [handleGraphWheel]);

  const handleGraphContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
  }, []);

  const handleStartNewReport = useCallback((): void => {
    if (!confirmDiscardEditorChanges()) {
      return;
    }

    resetEditor();
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage('Report editor cleared. Add a new chain and matn.');
  }, [confirmDiscardEditorChanges, resetBoxSelection, resetEditor]);

  const handleSelectReport = useCallback((report: HadithReport): void => {
    if (editingReportId !== report.id && !confirmDiscardEditorChanges()) {
      return;
    }

    loadReportIntoEditor(report);
    setSelectedNodeIds(getNodeIdsForReport(report));
    resetBoxSelection();
    setMessage('Editing selected report. Save changes to update the graph.');
  }, [confirmDiscardEditorChanges, editingReportId, loadReportIntoEditor, resetBoxSelection]);

  const handleUseReportAsTemplate = useCallback((report: HadithReport): void => {
    if (!confirmDiscardEditorChanges()) {
      return;
    }

    loadReportIntoCreateForm(report);
    setSelectedNodeIds(getNodeIdsForReport(report));
    resetBoxSelection();
    setMessage('Report copied into the add form. Adjust the chain or matn, then add it as a new report.');
  }, [confirmDiscardEditorChanges, loadReportIntoCreateForm, resetBoxSelection]);

  const handleNewBundle = (): void => {
    if (!confirmDiscardEditorChanges()) {
      return;
    }

    const title = window.prompt('Bundle title', 'My Hadith Bundle');
    const nextBundle = createEmptyBundle(title ?? 'My Hadith Bundle');
    setBundle(nextBundle);
    resetEditor();
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage('Started a fresh bundle in memory. Use Export to save it as a file.');
  };

  const handleExport = (): void => {
    const filename = makeExportFilename(bundle);
    downloadJson(filename, bundleToJson(bundle));
    setMessage(`Exported ${filename}`);
  };

  const handleOpenImport = (): void => {
    fileInputRef.current?.click();
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const text = await file.text();
    const parsed = parseBundleJson(text);

    if (!parsed.bundle) {
      setMessage(parsed.error ?? 'Could not import this file.');
      return;
    }

    if (!confirmDiscardEditorChanges()) {
      return;
    }

    setBundle(parsed.bundle);
    resetEditor();
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage(`Imported ${file.name} with ${parsed.bundle.reports.length} report(s).`);
  };

  const handleNarratorChange = (index: number, value: string): void => {
    setEditorNarrators((previous) => previous.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const handleAddNarrator = (): void => {
    setEditorNarrators((previous) => [...previous, '']);
  };

  const handleRemoveNarrator = (index: number): void => {
    setEditorNarrators((previous) => {
      if (previous.length <= 1) {
        return emptyNarratorDraft();
      }

      const next = previous.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : emptyNarratorDraft();
    });
  };

  const handleSaveReport = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (editingReportId) {
      const result = updateReportInBundle(bundle, editingReportId, editorNarrators, editorMatn);
      if (!result.bundle) {
        setMessage(result.error ?? 'Failed to save report.');
        return;
      }

      setBundle(result.bundle);
      const savedReport = result.bundle.reports.find((report) => report.id === editingReportId);
      if (savedReport) {
        loadReportIntoEditor(savedReport);
      }

      if (result.updatedNodeIds && result.updatedNodeIds.length > 0) {
        setSelectedNodeIds(result.updatedNodeIds);
      }

      setMessage('Report updated and graph refreshed.');
      return;
    }

    const result = addReportToBundleFromFields(bundle, editorNarrators, editorMatn);
    if (!result.bundle) {
      setMessage(result.error ?? 'Failed to add report.');
      return;
    }

    setBundle(result.bundle);
    resetEditor();

    if (result.addedNodeIds && result.addedNodeIds.length > 0) {
      setSelectedNodeIds(result.addedNodeIds);
      setMessage(`Report added and ${result.addedNodeIds.length} node(s) auto-selected.`);
      return;
    }

    setMessage('Report added and graph updated.');
  };

  const handleDeleteReport = (): void => {
    if (!editingReportId) {
      return;
    }

    if (!window.confirm('Delete this report from the bundle?')) {
      return;
    }

    const result = deleteReportFromBundle(bundle, editingReportId);
    if (!result.bundle) {
      setMessage(result.error ?? 'Failed to delete report.');
      return;
    }

    setBundle(result.bundle);
    resetEditor();
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage('Report deleted.');
  };

  const chainPreview = normalizedDraftNarrators.length > 0
    ? normalizedDraftNarrators.join(' -> ')
    : 'Add narrators to build the chain.';

  return (
    <div className="app-shell">
      <main className="layout">
        <section className="panel">
          <div className="editor-header">
            <div>
              <h2>{editingReport ? `Edit Report #${editingReportIndex + 1}` : 'Create Report'}</h2>
              <p className="subtitle">
                {editingReport
                  ? 'Update the chain and matn, then save to refresh the graph.'
                  : 'Build a chain one narrator at a time, then add the report.'}
              </p>
            </div>
            {editingReport ? (
              <button type="button" onClick={handleStartNewReport}>New Report</button>
            ) : null}
          </div>

          <form className="form" onSubmit={handleSaveReport}>
            <div className="field-group">
              <div className="field-label-row">
                <span className="field-label">Chain</span>
                <button type="button" onClick={handleAddNarrator}>Add Narrator</button>
              </div>

              <div className="chain-editor">
                {editorNarrators.map((narrator, index) => (
                  <div className="chain-row" key={`narrator-${index}`}>
                    <div className="chain-index">{index + 1}</div>
                    <input
                      type="text"
                      dir="auto"
                      value={narrator}
                      onChange={(event) => handleNarratorChange(index, event.target.value)}
                      placeholder={`Narrator ${index + 1}`}
                    />
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => handleRemoveNarrator(index)}
                      disabled={editorNarrators.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="chain-preview" dir="auto">{chainPreview}</div>
            </div>

            <label>
              Matn
              <textarea
                dir="auto"
                value={editorMatn}
                onChange={(event) => setEditorMatn(event.target.value)}
                placeholder="The report statement"
                rows={6}
              />
            </label>

            <div className="editor-actions">
              <button type="submit" className="primary">
                {editingReport ? 'Save Changes' : 'Add Report'}
              </button>
              {editingReport ? (
                <button type="button" onClick={() => handleUseReportAsTemplate(editingReport)}>
                  Copy To New
                </button>
              ) : null}
              {editingReport ? (
                <button type="button" onClick={handleStartNewReport}>Cancel</button>
              ) : null}
              {editingReport ? (
                <button type="button" className="danger-button" onClick={handleDeleteReport}>
                  Delete Report
                </button>
              ) : null}
            </div>
          </form>

          <div className="status" role="status">{message}</div>
        </section>

        <section className="graph-card">
          <div
            ref={graphScrollRef}
            className={isPanning ? 'graph-scroll panning' : 'graph-scroll'}
            onPointerDown={handleGraphPointerDown}
            onContextMenu={handleGraphContextMenu}
          >
            <GraphCanvas
              graph={graph}
              zoom={zoom}
              svgRef={svgRef}
              isBoxSelecting={isBoxSelecting}
              selectionBox={selectionBox}
              selectedSet={selectedSet}
              isDragging={isDragging}
              isResizing={isResizing}
              onCanvasPointerDown={handleCanvasPointerDown}
              onNodePointerDown={handleNodePointerDown}
              onResizePointerDown={handleResizePointerDown}
            />
          </div>
        </section>

        <aside className="sidebar">
          <section className="panel sidebar-panel">
            <div>
              <h1>Hadith Graph Builder</h1>
              <p className="subtitle">Bundle: {bundle.title}</p>
            </div>
            <div className="actions">
              <button type="button" onClick={handleNewBundle}>New Bundle</button>
              <button type="button" onClick={handleOpenImport}>Import JSON</button>
              <button type="button" onClick={handleExport}>Export JSON</button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.hadith-graph.json"
              hidden
              onChange={handleImport}
            />
          </section>

          <section className="panel sidebar-panel reports-panel">
            <div className="list-header">
              <h3>Reports ({bundle.reports.length})</h3>
              <button type="button" onClick={handleStartNewReport}>New</button>
            </div>
            <ol className="report-list">
              {bundle.reports.map((report, index) => {
                const selected = editingReportId === report.id;

                return (
                  <li key={report.id}>
                    <div className={selected ? 'report-card selected' : 'report-card'}>
                      <button
                        type="button"
                        className="report-card-main"
                        onClick={() => handleSelectReport(report)}
                      >
                        <div className="report-chain" dir="auto">{report.isnad.join(' -> ')}</div>
                        <div className="report-matn" dir="auto">{report.matn}</div>
                        <div className="report-meta">#{index + 1}</div>
                      </button>
                      <div className="report-card-actions">
                        <button type="button" onClick={() => handleSelectReport(report)}>Edit</button>
                        <button type="button" onClick={() => handleUseReportAsTemplate(report)}>Use As Template</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
