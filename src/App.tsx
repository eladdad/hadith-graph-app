import { ChangeEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { bundleToJson, createEmptyBundle, getEdgeIdsForReport, getNodeIdsForReport, makeExportFilename, parseBundleJson } from './bundle';
import { GraphCanvas } from './components/GraphCanvas';
import { ReportEditorPanel } from './components/ReportEditorPanel';
import { RightSidebar } from './components/RightSidebar';
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
    return 'light';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getValidatedExampleBundle(): { bundle?: HadithBundle; error?: string } {
  return parseBundleJson(JSON.stringify(khosrowDaughterExample));
}

function App() {
  const [bundle, setBundle] = useState<HadithBundle>(() => createEmptyBundle('My Hadith Bundle'));
  const [message, setMessage] = useState('Ready. Create reports and drag nodes to arrange your graph.');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [isSharedLegendOpen, setIsSharedLegendOpen] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

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
    const nextBundle = createEmptyBundle(title ?? 'My Hadith Bundle');
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

  const layoutClassName = [
    'layout',
    !isLeftSidebarOpen ? 'left-sidebar-collapsed' : '',
    !isRightSidebarOpen ? 'right-sidebar-collapsed' : '',
  ]
    .filter((value) => value.length > 0)
    .join(' ');

  return (
    <div className="app-shell" data-theme={theme}>
      <main className={layoutClassName}>
        {isLeftSidebarOpen ? (
          <ReportEditorPanel
            controller={reportEditor}
            highlightLegend={bundle.highlightLegend}
            message={message}
          />
        ) : null}

        <section className="graph-card">
          <div className="graph-toolbar">
            <button
              type="button"
              className="graph-toolbar-button"
              onClick={() => setIsLeftSidebarOpen((current) => !current)}
            >
              {isLeftSidebarOpen ? 'Hide Editor' : 'Show Editor'}
            </button>
            <button
              type="button"
              className="graph-toolbar-button"
              onClick={() => setIsRightSidebarOpen((current) => !current)}
            >
              {isRightSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            </button>
          </div>
          <div
            ref={viewport.graphScrollRef}
            className={viewport.isPanning ? 'graph-scroll panning' : 'graph-scroll'}
            onPointerDown={handleGraphPointerDown}
            onContextMenu={viewport.handleGraphContextMenu}
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
          </div>
        </section>

        {isRightSidebarOpen ? (
          <RightSidebar
            bundle={bundle}
            theme={theme}
            isSharedLegendOpen={isSharedLegendOpen}
            highlightUsageCounts={highlightUsageCounts}
            editingReportId={reportEditor.editingReportId}
            fileInputRef={fileInputRef}
            onNewBundle={handleNewBundle}
            onLoadExample={handleLoadExample}
            onOpenImport={handleOpenImport}
            onExport={handleExport}
            onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
            onToggleSharedLegend={() => setIsSharedLegendOpen((current) => !current)}
            onFontSizeChange={handleFontSizeChange}
            onImport={handleImport}
            onStartNewReport={reportEditor.startNewReport}
            onSelectReport={reportEditor.selectReport}
            onUseReportAsTemplate={reportEditor.useReportAsTemplate}
          />
        ) : null}
      </main>
    </div>
  );
}

export default App;
