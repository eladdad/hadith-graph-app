import { ChangeEvent, Dispatch, PointerEvent as ReactPointerEvent, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { NarratorFocusControls, NarratorFocusReport } from './components/NarratorFocusPanel';
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
import { buildNarratorFocusGraph, getNarratorFocus, getNarratorOptions } from './narratorFocus';
import type { NarratorFocusMode } from './narratorFocus';
import type { GraphNode, HadithBundle, NodePositionMap } from './types';
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
  const [focusedNarrator, setFocusedNarrator] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<NarratorFocusMode>('local');
  const [focusPositions, setFocusPositions] = useState<Record<string, NodePositionMap>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fullGraphViewport = useRef<{ zoom: number; scrollLeft: number; scrollTop: number } | null>(null);
  const narratorOptions = useMemo(() => getNarratorOptions(bundle.reports), [bundle.reports]);
  const focus = useMemo(
    () => focusedNarrator ? getNarratorFocus(bundle.reports, focusedNarrator) : null,
    [bundle.reports, focusedNarrator],
  );
  const isLocalFocus = focus !== null && focusMode === 'local';
  const reportNumbers = useMemo(
    () => new Map(bundle.reports.map((report, index) => [report.id, index + 1])),
    [bundle.reports],
  );

  const graph = useMemo(
    () => isLocalFocus && focus ? buildNarratorFocusGraph(focus, bundle.fontSizes) : buildRenderableGraph(
      focus?.reports ?? bundle.reports,
      focus ? focusPositions[focus.name] ?? {} : bundle.nodePositions,
      bundle.nodeWidths,
      bundle.fontSizes,
      bundle.highlightLegend,
      { reportNumbers },
    ),
    [bundle.reports, bundle.nodePositions, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend, focus, isLocalFocus, focusPositions, reportNumbers],
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
    const validNodeIds = new Set(bundle.reports.flatMap(getNodeIdsForReport));
    setSelectedNodeIds((previous) => {
      const filtered = previous.filter((id) => validNodeIds.has(id));
      return filtered.length === previous.length ? previous : filtered;
    });
  }, [bundle.reports]);

  useEffect(() => {
    if (focusedNarrator && !narratorOptions.some((option) => option.name === focusedNarrator)) {
      setFocusedNarrator(null);
    }
  }, [focusedNarrator, narratorOptions]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const viewport = useGraphViewport({
    graphWidth: graph.width,
    graphHeight: graph.height,
  });

  const setGraphLayoutBundle: Dispatch<SetStateAction<HadithBundle>> = useCallback((action) => {
    if (!focusedNarrator) {
      setBundle(action);
      return;
    }
    if (isLocalFocus) {
      return;
    }
    // Focus coordinates belong to a view; they must not overwrite the saved
    // positions of shared narrators in the full corpus.
    setFocusPositions((previous) => {
      const viewBundle = { ...bundle, nodePositions: previous[focusedNarrator] ?? {} };
      const next = typeof action === 'function' ? action(viewBundle) : action;
      return { ...previous, [focusedNarrator]: next.nodePositions };
    });
  }, [bundle, focusedNarrator, isLocalFocus]);

  const { isDragging, handleNodePointerDown: onNodePointerDownRaw } = useNodeDrag({
    graphNodes: graph.nodes,
    graphShiftX: graph.shiftX ?? 0,
    graphShiftY: graph.shiftY ?? 0,
    selectedNodeIds,
    setSelectedNodeIds,
    clientPointToSvg: viewport.clientPointToSvg,
    setBundle: setGraphLayoutBundle,
    onDragCommitted: (movedCount, snapped) => {
      setMessage(focusedNarrator ? 'Arranged this narrator focus view. The full graph layout is preserved.' : (
        snapped
          ? `Moved ${movedCount} selected node(s) and aligned them to nearby anchor lines. Export JSON to save this layout.`
          : `Moved ${movedCount} selected node(s). Export JSON to save this layout.`
      ));
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
    () => new Set(isLocalFocus
      ? graph.edges.filter((edge) => edge.reports?.some((report) => report.id === reportEditor.editingReport?.id)).map((edge) => edge.id)
      : reportEditor.editingReport ? getEdgeIdsForReport(reportEditor.editingReport) : []),
    [graph.edges, isLocalFocus, reportEditor.editingReport],
  );

  const visibleSelectedSet = useMemo(() => {
    if (!isLocalFocus) {
      return selectedSet;
    }
    const selected = new Set(graph.edges.filter((edge) => selectedEdgeSet.has(edge.id))
      .flatMap((edge) => [edge.source, edge.target]));
    if (focus?.reportReferences.some((report) => report.id === reportEditor.editingReport?.id)) {
      graph.nodes.filter((node) => node.id.startsWith('focus:center:')).forEach((node) => selected.add(node.id));
    }
    return selected;
  }, [focus, graph.edges, graph.nodes, isLocalFocus, reportEditor.editingReport, selectedEdgeSet, selectedSet]);

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
    if (!reportEditor.editingReport || !selectedMatnNode || viewport.zoom <= 0.3) {
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

    if (isLocalFocus) {
      setSelectedNodeIds([]);
      event.preventDefault();
      return;
    }

    onCanvasPointerDownRaw(event);
  }, [isLocalFocus, onCanvasPointerDownRaw, reportEditor]);

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
    if (isLocalFocus && event.button === 0) {
      event.preventDefault();
      event.stopPropagation();
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
    isLocalFocus,
    onNodePointerDownRaw,
    reportEditor,
    selectedNodeIds,
    selectedSet,
  ]);

  const handleSelectReport = useCallback((reportId: string): void => {
    if (isBoxSelecting || isDragging || isResizing) {
      return;
    }

    reportEditor.selectReportFromMatnNode(getMatnNodeIdForReport(reportId));
  }, [isBoxSelecting, isDragging, isResizing, reportEditor]);

  const handleFocusNarrator = useCallback((name: string | null): void => {
    if (isDragging || isResizing || isBoxSelecting) {
      return;
    }
    if (name && reportEditor.editingReport && !reportEditor.editingReport.isnad.includes(name)) {
      if (!reportEditor.clearActiveReportSelection()) {
        return;
      }
      setSelectedNodeIds([]);
    }
    if (name && !focusedNarrator) {
      fullGraphViewport.current = {
        zoom: viewport.zoom,
        scrollLeft: viewport.graphScrollRef.current?.scrollLeft ?? 0,
        scrollTop: viewport.graphScrollRef.current?.scrollTop ?? 0,
      };
    }
    resetBoxSelection();
    setFocusedNarrator(name);
  }, [isDragging, isResizing, isBoxSelecting, reportEditor, resetBoxSelection, focusedNarrator, viewport]);

  const focusViewportKey = useRef('');
  useEffect(() => {
    const key = `${focusedNarrator ?? ''}:${focusMode}`;
    if (focusViewportKey.current === key) {
      return;
    }
    focusViewportKey.current = key;
    if (focusedNarrator) {
      const anchor = graph.nodes.find((node) => node.type === 'narrator' && node.label === focusedNarrator);
      if (anchor) {
        const height = viewport.graphScrollRef.current?.clientHeight ?? 700;
        viewport.centerOnNode(anchor, isLocalFocus ? Math.min(0.9, Math.max(0.6, (height - 48) / graph.height)) : 0.75);
      }
    } else if (fullGraphViewport.current) {
      const saved = fullGraphViewport.current;
      const container = viewport.graphScrollRef.current;
      if (container) {
        viewport.centerOnNode({
          x: (saved.scrollLeft + container.clientWidth / 2) / saved.zoom,
          y: (saved.scrollTop + container.clientHeight / 2) / saved.zoom,
        }, saved.zoom);
      }
      fullGraphViewport.current = null;
    }
  }, [focusedNarrator, focusMode, graph, isLocalFocus, viewport]);

  const loadBundleIntoApp = useCallback((nextBundle: HadithBundle, successMessage: string): void => {
    setBundle(nextBundle);
    setFocusedNarrator(null);
    setFocusPositions({});
    fullGraphViewport.current = null;
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
    setFocusedNarrator(null);
    setFocusPositions({});
    fullGraphViewport.current = null;
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
      <header className="masthead">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path d="M11 10v7a5 5 0 0 0 5 5h8a5 5 0 0 0 5-5v-7M20 22v8" />
            <circle cx="11" cy="9" r="4" />
            <circle cx="29" cy="9" r="4" />
            <circle cx="20" cy="31" r="4" />
          </svg>
          <div>
            <p className="eyebrow">Isnād &amp; matn</p>
            <h1>Hadith Graph Builder</h1>
          </div>
        </div>
        <p className="masthead-caption">A workspace for tracing traditions.</p>
      </header>
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

        <section className="graph-card" aria-label="Transmission graph">
          <div className="graph-header">
          <div className="graph-toolbar">
            <div className="graph-title-block">
              <h2>Transmission graph</h2>
              <p>
                {focus ? `${focus.reports.length} of ${bundle.reports.length}` : bundle.reports.length} report{bundle.reports.length === 1 ? '' : 's'}
                {' '}<span aria-hidden="true">·</span>{' '}
                {graph.nodes.length} node{graph.nodes.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="graph-toolbar-actions">
            <button type="button" onClick={viewport.fitGraph} disabled={graph.nodes.length === 0}>Fit graph</button>
            <button
              type="button"
              className="graph-toolbar-button"
              onClick={() => setIsLeftSidebarOpen((current) => !current)}
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                <path d="M7.5 4v12" />
              </svg>
              {isLeftSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            </button>
            </div>
          </div>
          {bundle.reports.length > 0 ? (
            <NarratorFocusControls
              options={narratorOptions}
              narrator={focusedNarrator}
              mode={focusMode}
              onNarratorChange={handleFocusNarrator}
              onModeChange={setFocusMode}
              matchingReportCount={focus?.reports.length ?? bundle.reports.length}
              totalReportCount={bundle.reports.length}
            />
          ) : null}
          </div>
          <div className={isLocalFocus
            ? `graph-workspace local-focus-workspace${focus?.reportReferences.some((report) => report.id === reportEditor.editingReport?.id) ? ' with-local-report' : ''}`
            : 'graph-workspace'}>
          <div
            ref={viewport.graphScrollRef}
            className={viewport.isPanning ? 'graph-scroll panning' : 'graph-scroll'}
            onPointerDown={handleGraphPointerDown}
            onContextMenu={viewport.handleGraphContextMenu}
          >
            {graph.nodes.length === 0 ? (
              <div className="graph-empty-state">
                <svg className="empty-graph-mark" viewBox="0 0 160 104" fill="none" aria-hidden="true">
                  <path d="M44 32v18a10 10 0 0 0 10 10h52a10 10 0 0 0 10-10V32M80 60v19" />
                  <rect x="18" y="10" width="52" height="26" rx="6" />
                  <rect x="90" y="10" width="52" height="26" rx="6" />
                  <rect x="54" y="78" width="52" height="26" rx="6" />
                  <path d="M33 23h22M105 23h22M69 91h22" />
                </svg>
                <p className="eyebrow">From text to transmission</p>
                <h3>Your graph starts here</h3>
                <p>Create a report in the sidebar, or load an<br className="empty-state-break" /> example graph from Options.</p>
              </div>
            ) : null}
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
                selectedSet={visibleSelectedSet}
                selectedEdgeSet={selectedEdgeSet}
                selectedReportId={reportEditor.editingReport?.id}
                isDragging={isDragging}
                isResizing={isResizing}
                onCanvasPointerDown={handleCanvasPointerDown}
                onNodePointerDown={handleNodePointerDown}
                onResizePointerDown={handleResizePointerDown}
                onSelectReport={handleSelectReport}
                onFocusNarrator={handleFocusNarrator}
                focusedNarrator={focusedNarrator}
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
          {isLocalFocus && focus ? (
            <div className="focus-details">
              <NarratorFocusReport
                report={focus.reportReferences.some((report) => report.id === reportEditor.editingReport?.id)
                  ? reportEditor.editingReport : null}
                reportNumber={reportEditor.editingReportIndex + 1}
                highlightLegend={bundle.highlightLegend}
                matnFontSize={bundle.fontSizes.matn}
                onEditNote={handleOpenNoteEditor}
              />
            </div>
          ) : null}
          </div>
          <div className="graph-footer">
            <div className="graph-key" aria-label="Graph legend">
              <span><i className="graph-key-authority" aria-hidden="true" /> Attribution authority</span>
              <span><i className="graph-key-narrator" aria-hidden="true" /> Narrator</span>
              <span><i className="graph-key-matn" aria-hidden="true" /> Matn</span>
            </div>
            <span className="graph-hint">{isLocalFocus ? 'Double-click a narrator to focus' : 'Drag nodes to arrange · Double-click a narrator to focus'} <span aria-hidden="true">·</span> Ctrl + scroll to zoom</span>
            <span className="graph-zoom">{Math.round(viewport.zoom * 100)}%</span>
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
