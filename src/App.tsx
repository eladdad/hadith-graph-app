import { ChangeEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import {
  bundleToJson,
  createEmptyBundle,
  getEdgeIdsForReport,
  getMatnNodeIdForReport,
  getNodeIdsForReport,
  makeExportFilename,
  parseBundleJson,
  removeHighlightLegendItemFromBundle,
  updateReportNoteInBundle,
} from './bundle';
import { AboutDialog } from './components/AboutDialog';
import { GraphCanvas } from './components/GraphCanvas';
import { ReportEditorPanel } from './components/ReportEditorPanel';
import { ReportNoteCard } from './components/ReportNoteCard';
import { ReportNoteDialog } from './components/ReportNoteDialog';
import { SidebarControls } from './components/SidebarControls';
import { buildRenderableGraph, clampFontSize } from './graph';
import { useBoxSelection } from './hooks/useBoxSelection';
import { useGraphViewport } from './hooks/useGraphViewport';
import { useNodeDrag } from './hooks/useNodeDrag';
import { useNodeResize } from './hooks/useNodeResize';
import { useReportEditor } from './hooks/useReportEditor';
import type { GraphNode, HadithBundle } from './types';
import khosrowDaughterExample from '../drawio_graph_conversion/khosrow_daughter.hadith-graph.json';

const THEME_STORAGE_KEY = 'hadith-graph-theme';

type ThemeMode = 'light' | 'dark';

function idSetsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
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

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return 'dark';
}

function getValidatedExampleBundle(): { bundle?: HadithBundle; error?: string } {
  return parseBundleJson(JSON.stringify(khosrowDaughterExample));
}

function App() {
  const [bundle, setBundle] = useState<HadithBundle>(() => createEmptyBundle('My Hadith Bundle'));
  const [message, setMessage] = useState('Ready. Create reports and drag nodes to arrange your graph.');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isNoteEditorOpen, setIsNoteEditorOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const graph = useMemo(
    () => buildRenderableGraph(
      bundle.reports,
      bundle.nodePositions,
      bundle.nodeWidths,
      bundle.fontSizes,
      bundle.highlightLegend,
    ),
    [bundle.reports, bundle.nodePositions, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend],
  );

  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const highlightUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    bundle.reports.forEach((report) => {
      report.matnHighlights.forEach((highlight) => {
        counts.set(highlight.legendId, (counts.get(highlight.legendId) ?? 0) + 1);
      });
    });
    return counts;
  }, [bundle.reports]);

  useEffect(() => {
    const validNodeIds = new Set(graph.nodes.map((node) => node.id));
    setSelectedNodeIds((previous) => {
      const filtered = previous.filter((id) => validNodeIds.has(id));
      return filtered.length === previous.length ? previous : filtered;
    });
  }, [graph.nodes]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const viewport = useGraphViewport({
    graphWidth: graph.width,
    graphHeight: graph.height,
  });

  const { isDragging, handleNodePointerDown: onNodePointerDownRaw } = useNodeDrag({
    graphNodes: graph.nodes,
    graphShiftX: graph.shiftX ?? 0,
    graphShiftY: graph.shiftY ?? 0,
    selectedNodeIds,
    setSelectedNodeIds,
    clientPointToSvg: viewport.clientPointToSvg,
    setBundle,
    onDragCommitted: (movedCount, snapped) => {
      setMessage(
        snapped
          ? `Moved ${movedCount} selected node(s) and aligned them to nearby anchor lines. Export JSON to save this layout.`
          : `Moved ${movedCount} selected node(s). Export JSON to save this layout.`,
      );
    },
  });

  const { isResizing, handleResizePointerDown: onResizePointerDownRaw } = useNodeResize({
    clientPointToSvg: viewport.clientPointToSvg,
    setSelectedNodeIds,
    setBundle,
    onResizeCommitted: () => {
      setMessage('Matn node resized. Export JSON to save width and layout.');
    },
  });

  const {
    isBoxSelecting,
    selectionBox,
    handleCanvasPointerDown: onCanvasPointerDownRaw,
    resetBoxSelection,
  } = useBoxSelection({
    nodes: graph.nodes,
    selectedNodeIds,
    setSelectedNodeIds,
    isDragging,
    isResizing,
    clientPointToSvg: viewport.clientPointToSvg,
  });

  const reportEditor = useReportEditor({
    bundle,
    setBundle,
    setSelectedNodeIds,
    resetBoxSelection,
    setMessage,
  });

  const selectedEdgeSet = useMemo(
    () => new Set(reportEditor.editingReport ? getEdgeIdsForReport(reportEditor.editingReport) : []),
    [reportEditor.editingReport],
  );

  const selectedMatnNode = useMemo(() => {
    if (!reportEditor.editingReport) {
      return null;
    }

    const matnNodeId = getMatnNodeIdForReport(reportEditor.editingReport.id);
    return graph.nodes.find((node) => node.id === matnNodeId) ?? null;
  }, [graph.nodes, reportEditor.editingReport]);

  const graphContentWidth = Math.round(graph.width * viewport.zoom);
  const graphContentBaseHeight = Math.round(graph.height * viewport.zoom);

  const selectedReportNoteOverlay = useMemo(() => {
    if (!reportEditor.editingReport || !selectedMatnNode) {
      return null;
    }

    const overlayWidth = Math.min(360, Math.max(220, graphContentWidth - 24));
    const halfWidth = overlayWidth / 2;
    const left = Math.min(
      graphContentWidth - halfWidth - 12,
      Math.max(halfWidth + 12, selectedMatnNode.x * viewport.zoom),
    );
    const top = (selectedMatnNode.y + selectedMatnNode.height / 2) * viewport.zoom + 18;

    return {
      contentHeight: Math.max(graphContentBaseHeight, Math.ceil(top + 260)),
      reportLabel: `Report #${reportEditor.editingReportIndex + 1}`,
      style: {
        left: `${left}px`,
        top: `${top}px`,
        width: `${overlayWidth}px`,
      },
    };
  }, [
    graphContentBaseHeight,
    graphContentWidth,
    reportEditor.editingReport,
    reportEditor.editingReportIndex,
    selectedMatnNode,
    viewport.zoom,
  ]);

  useEffect(() => {
    if (!reportEditor.editingReport) {
      setIsNoteEditorOpen(false);
      setNoteDraft('');
      return;
    }

    if (isNoteEditorOpen) {
      setNoteDraft(reportEditor.editingReport.note);
    }
  }, [isNoteEditorOpen, reportEditor.editingReport]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<SVGRectElement>, node: GraphNode, edge: 'left' | 'right'): void => {
      if (isDragging || isBoxSelecting) {
        return;
      }

      onResizePointerDownRaw(event, node, edge);
    },
    [isBoxSelecting, isDragging, onResizePointerDownRaw],
  );

  const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) {
      onCanvasPointerDownRaw(event);
      return;
    }

    const additiveSelect = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!additiveSelect && !reportEditor.clearActiveReportSelection()) {
      event.preventDefault();
      return;
    }

    onCanvasPointerDownRaw(event);
  }, [onCanvasPointerDownRaw, reportEditor]);

  const handleGraphPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (isDragging || isResizing || isBoxSelecting) {
      return;
    }

    viewport.handleGraphPointerDown(event);
  }, [isBoxSelecting, isDragging, isResizing, viewport]);

  const handleNodePointerDown = useCallback((event: ReactPointerEvent<SVGGElement>, nodeId: string): void => {
    if (isBoxSelecting || isResizing) {
      return;
    }

    const additiveSelect = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!additiveSelect && event.button === 0 && reportEditor.selectReportFromMatnNode(nodeId)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!additiveSelect && event.button === 0 && reportEditor.editingReport) {
      const nextSelection = selectedSet.has(nodeId) ? selectedNodeIds : [nodeId];
      const reportNodeIds = getNodeIdsForReport(reportEditor.editingReport);
      if (!idSetsEqual(nextSelection, reportNodeIds) && !reportEditor.clearActiveReportSelection()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    onNodePointerDownRaw(event, nodeId);
  }, [
    isBoxSelecting,
    isResizing,
    onNodePointerDownRaw,
    reportEditor,
    selectedNodeIds,
    selectedSet,
  ]);

  const loadBundleIntoApp = useCallback((nextBundle: HadithBundle, successMessage: string): void => {
    setBundle(nextBundle);
    reportEditor.resetEditor();
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage(successMessage);
  }, [reportEditor, resetBoxSelection]);

  const handleNewBundle = useCallback((): void => {
    if (!reportEditor.confirmDiscardEditorChanges()) {
      return;
    }

    const title = window.prompt('Bundle title', 'My Hadith Bundle');
    if (title === null) {
      return;
    }

    const nextBundle = createEmptyBundle(title);
    setBundle(nextBundle);
    reportEditor.resetEditor();
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage('Started a fresh bundle in memory. Use Export to save it as a file.');
  }, [reportEditor, resetBoxSelection]);

  const handleExport = useCallback((): void => {
    const filename = makeExportFilename(bundle);
    downloadJson(filename, bundleToJson(bundle));
    setMessage(`Exported ${filename}`);
  }, [bundle]);

  const handleOpenImport = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const handleFontSizeChange = useCallback((key: 'narrator' | 'matn', rawValue: string): void => {
    const numericValue = Number(rawValue);
    const nextValue = clampFontSize(
      Number.isFinite(numericValue) ? numericValue : bundle.fontSizes[key],
      bundle.fontSizes[key],
    );

    setBundle((previous) => {
      if (previous.fontSizes[key] === nextValue) {
        return previous;
      }

      return {
        ...previous,
        updatedAt: new Date().toISOString(),
        fontSizes: {
          ...previous.fontSizes,
          [key]: nextValue,
        },
      };
    });
  }, [bundle.fontSizes]);

  const handleImport = useCallback(async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
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

    if (!reportEditor.confirmDiscardEditorChanges()) {
      return;
    }

    loadBundleIntoApp(parsed.bundle, `Imported ${file.name} with ${parsed.bundle.reports.length} report(s).`);
  }, [loadBundleIntoApp, reportEditor]);

  const handleLoadExample = useCallback((): void => {
    const parsed = getValidatedExampleBundle();
    if (!parsed.bundle) {
      setMessage(parsed.error ?? 'Could not load the bundled example graph.');
      return;
    }

    if (!reportEditor.confirmDiscardEditorChanges()) {
      return;
    }

    loadBundleIntoApp(
      parsed.bundle,
      `Loaded example graph: ${parsed.bundle.title} (${parsed.bundle.reports.length} report(s)).`,
    );
  }, [loadBundleIntoApp, reportEditor]);

  const handleRemoveHighlightLegend = useCallback((legendId: string): void => {
    const entry = bundle.highlightLegend.find((item) => item.id === legendId);
    if (!entry) {
      setMessage('That highlight category no longer exists.');
      return;
    }

    const usageCount = highlightUsageCounts.get(legendId) ?? 0;
    if (usageCount > 0) {
      const confirmed = window.confirm(
        `Remove "${entry.label}" from the legend? This will also remove ${usageCount} highlight(s) using it.`,
      );
      if (!confirmed) {
        return;
      }
    }

    const result = removeHighlightLegendItemFromBundle(bundle, legendId);
    if (!result.bundle) {
      setMessage(result.error ?? 'Could not remove this highlight category.');
      return;
    }

    setBundle(result.bundle);
    setMessage(
      usageCount > 0
        ? `Removed "${entry.label}" and cleared ${result.removedHighlights ?? 0} matching highlight(s).`
        : `Removed "${entry.label}" from the shared legend.`,
    );
  }, [bundle, highlightUsageCounts]);

  const handleOpenNoteEditor = useCallback((): void => {
    if (!reportEditor.editingReport) {
      return;
    }

    setNoteDraft(reportEditor.editingReport.note);
    setIsNoteEditorOpen(true);
  }, [reportEditor.editingReport]);

  const handleCloseNoteEditor = useCallback((): void => {
    setIsNoteEditorOpen(false);
  }, []);

  const handleSaveNote = useCallback((): void => {
    if (!reportEditor.editingReport) {
      return;
    }

    const result = updateReportNoteInBundle(bundle, reportEditor.editingReport.id, noteDraft);
    if (!result.bundle) {
      setMessage(result.error ?? 'Failed to save report note.');
      return;
    }

    const nextNote = result.bundle.reports.find((report) => report.id === reportEditor.editingReport?.id)?.note ?? '';
    setBundle(result.bundle);
    setIsNoteEditorOpen(false);
    setMessage(
      nextNote.length > 0
        ? `Saved note for Report #${reportEditor.editingReportIndex + 1}.`
        : `Cleared note for Report #${reportEditor.editingReportIndex + 1}.`,
    );
  }, [bundle, noteDraft, reportEditor.editingReport, reportEditor.editingReportIndex]);

  const layoutClassName = isLeftSidebarOpen ? 'layout' : 'layout left-sidebar-collapsed';

  return (
    <div className="app-shell" data-theme={theme}>
      <main className={layoutClassName}>
        {isLeftSidebarOpen ? (
          <aside className="sidebar">
            <SidebarControls
              bundle={bundle}
              theme={theme}
              highlightUsageCounts={highlightUsageCounts}
              fileInputRef={fileInputRef}
              onNewBundle={handleNewBundle}
              onLoadExample={handleLoadExample}
              onOpenImport={handleOpenImport}
              onExport={handleExport}
              onOpenAbout={() => setIsAboutOpen(true)}
              onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
              onFontSizeChange={handleFontSizeChange}
              onImport={handleImport}
              onRemoveHighlightLegend={handleRemoveHighlightLegend}
            />
            <ReportEditorPanel
              controller={reportEditor}
              highlightLegend={bundle.highlightLegend}
              message={message}
            />
          </aside>
        ) : null}

        <section className="graph-card">
          <div className="graph-toolbar">
            <button
              type="button"
              className="graph-toolbar-button"
              onClick={() => setIsLeftSidebarOpen((current) => !current)}
            >
              {isLeftSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            </button>
          </div>
          <div
            ref={viewport.graphScrollRef}
            className={viewport.isPanning ? 'graph-scroll panning' : 'graph-scroll'}
            onPointerDown={handleGraphPointerDown}
            onContextMenu={viewport.handleGraphContextMenu}
          >
            <div
              className="graph-content"
              style={{
                width: `${graphContentWidth}px`,
                height: `${selectedReportNoteOverlay?.contentHeight ?? graphContentBaseHeight}px`,
              }}
            >
              <GraphCanvas
                graph={graph}
                zoom={viewport.zoom}
                svgRef={viewport.svgRef}
                narratorFontSize={bundle.fontSizes.narrator}
                matnFontSize={bundle.fontSizes.matn}
                isBoxSelecting={isBoxSelecting}
                selectionBox={selectionBox}
                selectedSet={selectedSet}
                selectedEdgeSet={selectedEdgeSet}
                isDragging={isDragging}
                isResizing={isResizing}
                onCanvasPointerDown={handleCanvasPointerDown}
                onNodePointerDown={handleNodePointerDown}
                onResizePointerDown={handleResizePointerDown}
              />
              {selectedReportNoteOverlay && reportEditor.editingReport ? (
                <ReportNoteCard
                  className="report-note-card graph-note-card"
                  report={reportEditor.editingReport}
                  reportLabel={selectedReportNoteOverlay.reportLabel}
                  onEdit={handleOpenNoteEditor}
                  style={selectedReportNoteOverlay.style}
                />
              ) : null}
            </div>
          </div>
        </section>

      </main>

      <ReportNoteDialog
        isOpen={isNoteEditorOpen}
        reportLabel={reportEditor.editingReport ? `Report #${reportEditor.editingReportIndex + 1}` : 'Report'}
        value={noteDraft}
        onChange={setNoteDraft}
        onClose={handleCloseNoteEditor}
        onSave={handleSaveNote}
      />

      <AboutDialog
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}

export default App;
