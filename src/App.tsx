import {
  ChangeEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { HighlightedMatn } from './components/HighlightedMatn';
import { MAX_FONT_SIZE, MIN_FONT_SIZE, buildRenderableGraph, clampFontSize } from './graph';
import { useBoxSelection } from './hooks/useBoxSelection';
import { useNodeDrag } from './hooks/useNodeDrag';
import { useNodeResize } from './hooks/useNodeResize';
import {
  HIGHLIGHT_COLOR_OPTIONS,
  getHighlightExcerpt,
  sanitizeHighlightColor,
  sanitizeMatnHighlights,
} from './matnHighlights';
import type { GraphNode, HadithBundle, HadithReport, HighlightLegendItem, MatnHighlight } from './types';
import khosrowDaughterExample from '../drawio_graph_conversion/khosrow_daughter.hadith-graph.json';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.8;
const THEME_STORAGE_KEY = 'hadith-graph-theme';

type ThemeMode = 'light' | 'dark';

interface SelectionRange {
  start: number;
  end: number;
}

interface PanState {
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

interface ViewportState {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
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

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function highlightsEqual(left: MatnHighlight[], right: MatnHighlight[]): boolean {
  return left.length === right.length
    && left.every((item, index) => (
      item.id === right[index]?.id
      && item.legendId === right[index]?.legendId
      && item.start === right[index]?.start
      && item.end === right[index]?.end
    ));
}

function getSelectionRangeWithin(root: HTMLElement): SelectionRange | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const startRange = document.createRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = document.createRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  const start = startRange.toString().length;
  const end = endRange.toString().length;
  return end > start ? { start, end } : null;
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
  const [editorNarrators, setEditorNarrators] = useState<string[]>(() => emptyNarratorDraft());
  const [editorMatn, setEditorMatn] = useState('');
  const [editorHighlights, setEditorHighlights] = useState<MatnHighlight[]>([]);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [message, setMessage] = useState('Ready. Create reports and drag nodes to arrange your graph.');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [previewSelection, setPreviewSelection] = useState<SelectionRange | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [newLegendLabel, setNewLegendLabel] = useState('');
  const [newLegendColor, setNewLegendColor] = useState(HIGHLIGHT_COLOR_OPTIONS[0]?.color ?? '#f59e0b');
  const [isSharedLegendOpen, setIsSharedLegendOpen] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const matnPreviewRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const graphScrollRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<PanState | null>(null);
  const viewportRef = useRef<ViewportState>({ zoom: 1, scrollLeft: 0, scrollTop: 0 });
  const pendingZoomViewportRef = useRef<ViewportState | null>(null);

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
  const highlightLegendById = useMemo(
    () => new Map(bundle.highlightLegend.map((entry) => [entry.id, entry])),
    [bundle.highlightLegend],
  );
  const highlightUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    bundle.reports.forEach((report) => {
      report.matnHighlights.forEach((highlight) => {
        counts.set(highlight.legendId, (counts.get(highlight.legendId) ?? 0) + 1);
      });
    });
    return counts;
  }, [bundle.reports]);

  const editorIsDirty = useMemo(() => {
    if (editingReport) {
      return (
        !arraysEqual(normalizedDraftNarrators, editingReport.isnad)
        || normalizedDraftMatn !== editingReport.matn
        || !highlightsEqual(editorHighlights, editingReport.matnHighlights)
      );
    }

    return normalizedDraftNarrators.length > 0 || normalizedDraftMatn.length > 0 || editorHighlights.length > 0;
  }, [editingReport, editorHighlights, normalizedDraftNarrators, normalizedDraftMatn]);

  const resetEditor = useCallback((): void => {
    setEditingReportId(null);
    setEditorNarrators(emptyNarratorDraft());
    setEditorMatn('');
    setEditorHighlights([]);
    setPreviewSelection(null);
    setActiveHighlightId(null);
  }, []);

  const loadReportIntoEditor = useCallback((report: HadithReport): void => {
    setEditingReportId(report.id);
    setEditorNarrators(report.isnad.length > 0 ? [...report.isnad] : emptyNarratorDraft());
    setEditorMatn(report.matn);
    setEditorHighlights(report.matnHighlights.map((highlight) => ({ ...highlight })));
    setPreviewSelection(null);
    setActiveHighlightId(null);
  }, []);

  const loadReportIntoCreateForm = useCallback((report: HadithReport): void => {
    setEditingReportId(null);
    setEditorNarrators(report.isnad.length > 0 ? [...report.isnad] : emptyNarratorDraft());
    setEditorMatn(report.matn);
    setEditorHighlights(report.matnHighlights.map((highlight) => ({ ...highlight })));
    setPreviewSelection(null);
    setActiveHighlightId(null);
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
    const validLegendIds = new Set(bundle.highlightLegend.map((entry) => entry.id));
    setEditorHighlights((previous) => {
      const next = sanitizeMatnHighlights(previous, normalizedDraftMatn, validLegendIds);
      return highlightsEqual(previous, next) ? previous : next;
    });
  }, [bundle.highlightLegend, normalizedDraftMatn]);

  useEffect(() => {
    setPreviewSelection((previous) => {
      if (!previous) {
        return previous;
      }
      const end = Math.min(previous.end, normalizedDraftMatn.length);
      const start = Math.min(previous.start, end);
      return end > start ? { start, end } : null;
    });
  }, [normalizedDraftMatn]);

  useEffect(() => {
    if (!activeHighlightId) {
      return;
    }

    if (!editorHighlights.some((highlight) => highlight.id === activeHighlightId)) {
      setActiveHighlightId(null);
    }
  }, [activeHighlightId, editorHighlights]);

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
      viewportRef.current = {
        zoom: viewportRef.current.zoom,
        scrollLeft: scrollContainer.scrollLeft,
        scrollTop: scrollContainer.scrollTop,
      };
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

  useLayoutEffect(() => {
    const scrollContainer = graphScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const pendingViewport = pendingZoomViewportRef.current;
    if (pendingViewport && Math.abs(pendingViewport.zoom - zoom) < 0.0001) {
      scrollContainer.scrollLeft = pendingViewport.scrollLeft;
      scrollContainer.scrollTop = pendingViewport.scrollTop;
      viewportRef.current = pendingViewport;
      pendingZoomViewportRef.current = null;
      return;
    }

    viewportRef.current = {
      zoom,
      scrollLeft: scrollContainer.scrollLeft,
      scrollTop: scrollContainer.scrollTop,
    };
  }, [graph.height, graph.width, zoom]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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
    graphEdges: graph.edges,
    graphNodes: graph.nodes,
    selectedNodeIds,
    setSelectedNodeIds,
    clientPointToSvg,
    setBundle,
    onDragCommitted: (movedCount, snapped) => {
      setMessage(
        snapped
          ? `Moved ${movedCount} selected node(s) and snapped the node under its parent. Export JSON to save this layout.`
          : `Moved ${movedCount} selected node(s). Export JSON to save this layout.`,
      );
    },
  });

  const { isResizing, handleResizePointerDown: onResizePointerDownRaw } = useNodeResize({
    clientPointToSvg,
    setSelectedNodeIds,
    setBundle,
    onResizeCommitted: () => {
      setMessage('Matn node resized. Export JSON to save width and layout.');
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
      viewportRef.current = {
        zoom: viewportRef.current.zoom,
        scrollLeft: scrollContainer.scrollLeft,
        scrollTop: scrollContainer.scrollTop,
      };
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = scrollContainer.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const currentViewport = pendingZoomViewportRef.current ?? viewportRef.current;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentViewport.zoom * Math.exp(-event.deltaY * 0.0015)));
    if (Math.abs(nextZoom - currentViewport.zoom) < 0.0001) {
      return;
    }

    const graphX = (currentViewport.scrollLeft + pointerX) / currentViewport.zoom;
    const graphY = (currentViewport.scrollTop + pointerY) / currentViewport.zoom;
    const nextViewport: ViewportState = {
      zoom: nextZoom,
      scrollLeft: graphX * nextZoom - pointerX,
      scrollTop: graphY * nextZoom - pointerY,
    };

    pendingZoomViewportRef.current = nextViewport;
    viewportRef.current = nextViewport;
    setZoom(nextZoom);
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

  const loadBundleIntoApp = useCallback((nextBundle: HadithBundle, successMessage: string): void => {
    setBundle(nextBundle);
    resetEditor();
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage(successMessage);
  }, [resetBoxSelection, resetEditor]);

  const handleFontSizeChange = (key: 'narrator' | 'matn', rawValue: string): void => {
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

    loadBundleIntoApp(parsed.bundle, `Imported ${file.name} with ${parsed.bundle.reports.length} report(s).`);
  };

  const handleLoadExample = useCallback((): void => {
    const parsed = getValidatedExampleBundle();
    if (!parsed.bundle) {
      setMessage(parsed.error ?? 'Could not load the bundled example graph.');
      return;
    }

    if (!confirmDiscardEditorChanges()) {
      return;
    }

    loadBundleIntoApp(
      parsed.bundle,
      `Loaded example graph: ${parsed.bundle.title} (${parsed.bundle.reports.length} report(s)).`,
    );
  }, [confirmDiscardEditorChanges, loadBundleIntoApp]);

  const handleNarratorChange = (index: number, value: string): void => {
    setEditorNarrators((previous) => previous.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const capturePreviewSelection = useCallback((): void => {
    const preview = matnPreviewRef.current;
    if (!preview) {
      return;
    }

    const nextRange = getSelectionRangeWithin(preview);
    setPreviewSelection(nextRange);
    if (!nextRange) {
      setActiveHighlightId(null);
    }
  }, []);

  const applyHighlightToRange = useCallback((legend: HighlightLegendItem, range: SelectionRange): void => {
    setEditorHighlights((previous) => {
      const remaining = previous.filter((highlight) => highlight.end <= range.start || highlight.start >= range.end);
      return sanitizeMatnHighlights(
        [
          ...remaining,
          {
            id: createClientId(),
            legendId: legend.id,
            start: range.start,
            end: range.end,
          },
        ],
        normalizedDraftMatn,
        new Set([...bundle.highlightLegend.map((entry) => entry.id), legend.id]),
      );
    });
    setActiveHighlightId(null);
  }, [bundle.highlightLegend, normalizedDraftMatn]);

  const handleApplyExistingLegend = useCallback((legendId: string): void => {
    if (!previewSelection) {
      setMessage('Select text in the normalized matn preview first.');
      return;
    }

    const legend = highlightLegendById.get(legendId);
    if (!legend) {
      setMessage('That highlight label is no longer available.');
      return;
    }

    applyHighlightToRange(legend, previewSelection);
    setMessage(`Applied "${legend.label}" to the selected matn text.`);
  }, [applyHighlightToRange, highlightLegendById, previewSelection]);

  const handleCreateLegendAndApply = useCallback((): void => {
    if (!previewSelection) {
      setMessage('Select text in the normalized matn preview first.');
      return;
    }

    const label = normalizeDraftText(newLegendLabel);
    if (label.length === 0) {
      setMessage('Enter a label before creating a shared highlight.');
      return;
    }

    const color = sanitizeHighlightColor(newLegendColor);
    const existing = bundle.highlightLegend.find((entry) => (
      entry.label.localeCompare(label, undefined, { sensitivity: 'accent' }) === 0
      && entry.color === color
    ));
    const legend = existing ?? {
      id: createClientId(),
      label,
      color,
    };

    if (!existing) {
      setBundle((previous) => ({
        ...previous,
        updatedAt: new Date().toISOString(),
        highlightLegend: [...previous.highlightLegend, legend],
      }));
    }

    applyHighlightToRange(legend, previewSelection);
    setNewLegendLabel('');
    setMessage(existing
      ? `Reused "${legend.label}" for the selected matn text.`
      : `Added "${legend.label}" to the shared legend and applied it.`);
  }, [applyHighlightToRange, bundle.highlightLegend, newLegendColor, newLegendLabel, previewSelection]);

  const handleRemoveHighlight = useCallback((highlightId: string): void => {
    setEditorHighlights((previous) => previous.filter((highlight) => highlight.id !== highlightId));
    if (activeHighlightId === highlightId) {
      setActiveHighlightId(null);
    }
  }, [activeHighlightId]);

  const handleFocusHighlight = useCallback((highlight: MatnHighlight): void => {
    setPreviewSelection({ start: highlight.start, end: highlight.end });
    setActiveHighlightId(highlight.id);
    const highlightedElement = matnPreviewRef.current?.querySelector<HTMLElement>(`[data-highlight-id="${highlight.id}"]`);
    highlightedElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

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
      const result = updateReportInBundle(bundle, editingReportId, editorNarrators, editorMatn, editorHighlights);
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

    const result = addReportToBundleFromFields(bundle, editorNarrators, editorMatn, editorHighlights);
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

            <div className="field-group">
              <div className="field-label-row">
                <span className="field-label">Highlights</span>
                <span className="highlight-selection-note" dir="auto">
                  {previewSelection
                    ? `"${normalizedDraftMatn.slice(previewSelection.start, previewSelection.end)}"`
                    : 'Select text in the normalized preview to tag it.'}
                </span>
              </div>

              {bundle.highlightLegend.length > 0 ? (
                <div className="highlight-actions">
                  {bundle.highlightLegend.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="legend-apply-button"
                      onClick={() => handleApplyExistingLegend(entry.id)}
                      disabled={!previewSelection}
                    >
                      <span className="legend-swatch" style={{ backgroundColor: entry.color }} />
                      <span>{entry.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="highlight-create">
                <input
                  type="text"
                  value={newLegendLabel}
                  onChange={(event) => setNewLegendLabel(event.target.value)}
                  placeholder="New highlight label"
                />
                <div className="color-picker-row">
                  <label className="color-picker-field">
                    <span>Custom color</span>
                    <input
                      type="color"
                      value={newLegendColor}
                      onChange={(event) => setNewLegendColor(sanitizeHighlightColor(event.target.value))}
                      aria-label="Choose custom highlight color"
                    />
                  </label>
                  <span className="color-code">{newLegendColor}</span>
                </div>
                <div className="highlight-color-row">
                  {HIGHLIGHT_COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.color}
                      type="button"
                      className={newLegendColor === option.color ? 'color-swatch-button selected' : 'color-swatch-button'}
                      onClick={() => setNewLegendColor(option.color)}
                      aria-label={`Use ${option.name}`}
                      title={option.name}
                    >
                      <span className="color-swatch-dot" style={{ backgroundColor: option.color }} />
                    </button>
                  ))}
                </div>
                <button type="button" onClick={handleCreateLegendAndApply} disabled={!previewSelection}>
                  Create & Apply
                </button>
              </div>

              <HighlightedMatn
                ref={matnPreviewRef}
                className="matn-preview"
                text={normalizedDraftMatn}
                highlights={editorHighlights}
                legend={bundle.highlightLegend}
                activeHighlightId={activeHighlightId}
                dir="auto"
                tabIndex={0}
                onMouseUp={capturePreviewSelection}
                onKeyUp={capturePreviewSelection}
              />

              {editorHighlights.length > 0 ? (
                <div className="highlight-chip-list">
                  {editorHighlights.map((highlight) => {
                    const legend = highlightLegendById.get(highlight.legendId);
                    const excerpt = getHighlightExcerpt(normalizedDraftMatn, highlight);
                    if (!legend) {
                      return null;
                    }

                    return (
                      <div key={highlight.id} className={activeHighlightId === highlight.id ? 'highlight-chip active' : 'highlight-chip'}>
                        <button type="button" className="highlight-chip-main" onClick={() => handleFocusHighlight(highlight)}>
                          <span className="legend-swatch" style={{ backgroundColor: legend.color }} />
                          <span className="highlight-chip-label">{legend.label}</span>
                          <span className="highlight-chip-text" dir="auto">{excerpt}</span>
                        </button>
                        <button type="button" className="highlight-chip-remove" onClick={() => handleRemoveHighlight(highlight.id)}>
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

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
            ref={graphScrollRef}
            className={isPanning ? 'graph-scroll panning' : 'graph-scroll'}
            onPointerDown={handleGraphPointerDown}
            onContextMenu={handleGraphContextMenu}
          >
            <GraphCanvas
              graph={graph}
              zoom={zoom}
              svgRef={svgRef}
              narratorFontSize={bundle.fontSizes.narrator}
              matnFontSize={bundle.fontSizes.matn}
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

        {isRightSidebarOpen ? (
          <aside className="sidebar">
          <section className="panel sidebar-panel">
            <div>
              <h1>Hadith Graph Builder</h1>
              <p className="subtitle">Bundle: {bundle.title}</p>
            </div>
            <div className="actions">
              <button type="button" onClick={handleNewBundle}>New Bundle</button>
              <button type="button" onClick={handleLoadExample}>Load Example Graph</button>
              <button type="button" onClick={handleOpenImport}>Import JSON</button>
              <button type="button" onClick={handleExport}>Export JSON</button>
              <button type="button" onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}>
                {theme === 'light' ? 'Dark Theme' : 'Light Theme'}
              </button>
            </div>
            <div className="font-controls">
              <label className="font-control">
                <span>Narrator Font {bundle.fontSizes.narrator}px</span>
                <input
                  type="range"
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  step={1}
                  value={bundle.fontSizes.narrator}
                  onChange={(event) => handleFontSizeChange('narrator', event.target.value)}
                />
              </label>
              <label className="font-control">
                <span>Matn Font {bundle.fontSizes.matn}px</span>
                <input
                  type="range"
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  step={1}
                  value={bundle.fontSizes.matn}
                  onChange={(event) => handleFontSizeChange('matn', event.target.value)}
                />
              </label>
            </div>
            <div className="shared-legend">
              <button
                type="button"
                className="shared-legend-toggle"
                onClick={() => setIsSharedLegendOpen((current) => !current)}
              >
                <span>Highlight Legend</span>
                <span>{isSharedLegendOpen ? 'Hide' : `Show (${bundle.highlightLegend.length})`}</span>
              </button>
              {isSharedLegendOpen ? (
                bundle.highlightLegend.length > 0 ? (
                  <div className="shared-legend-list">
                    {bundle.highlightLegend.map((entry) => (
                      <div key={entry.id} className="shared-legend-item">
                        <span className="legend-swatch" style={{ backgroundColor: entry.color }} />
                        <span className="shared-legend-label">{entry.label}</span>
                        <span className="shared-legend-count">{highlightUsageCounts.get(entry.id) ?? 0}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="subtitle">Add highlights from the matn preview to build a shared legend.</p>
                )
              ) : null}
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
                        <HighlightedMatn
                          className="report-matn"
                          text={report.matn}
                          highlights={report.matnHighlights}
                          legend={bundle.highlightLegend}
                          dir="auto"
                        />
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
        ) : null}
      </main>
    </div>
  );
}

export default App;
