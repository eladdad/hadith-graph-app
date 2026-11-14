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
  setNarratorCollectorInBundle,
} from './bundle';
import { getCollectorNarrators } from './collectors';
import { AboutDialog } from './components/AboutDialog';
import { GraphCanvas } from './components/GraphCanvas';
import { MatnView } from './components/MatnView';
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
import { buildNarratorFocusGraph, getNarratorFocus, getNarratorOptions, getStudentFocus } from './narratorFocus';
import { normalizeVerticalSpacing } from './layoutSettings';
import type { NarratorFocusMode } from './narratorFocus';
import type { GraphNode, GraphRepresentation, HadithBundle, MatnSortMode, NodePositionMap } from './types';
import khosrowDaughterExample from '../drawio_graph_conversion/khosrow_daughter.hadith-graph.json';

const THEME_STORAGE_KEY = 'hadith-graph-theme';
const EMPTY_NODE_POSITIONS: NodePositionMap = {};

type ThemeMode = 'light' | 'dark';

interface SavedLayoutRestore {
  positions: NodePositionMap;
  scope: string | null;
  representation: GraphRepresentation;
  matnSort: MatnSortMode;
  reports: HadithBundle['reports'];
}

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
  const [workspaceView, setWorkspaceView] = useState<'graph' | 'matns'>('graph');
  const [isNoteEditorOpen, setIsNoteEditorOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [focusedNarrator, setFocusedNarrator] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<NarratorFocusMode>('local');
  const [representation, setRepresentation] = useState<GraphRepresentation>('merged');
  const [matnSort, setMatnSort] = useState<MatnSortMode>('default');
  const [highlightPositions, setHighlightPositions] = useState<Record<string, NodePositionMap>>({});
  const [focusPositions, setFocusPositions] = useState<Record<string, NodePositionMap>>({});
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [savedLayoutRestore, setSavedLayoutRestore] = useState<SavedLayoutRestore | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fullGraphViewport = useRef<{ zoom: number; scrollLeft: number; scrollTop: number; representation: GraphRepresentation; matnSort: MatnSortMode } | null>(null);
  const fitLayoutAfterUpdate = useRef(false);
  const collectorNarrators = useMemo(
    () => getCollectorNarrators(bundle.reports, bundle.collectorOverrides),
    [bundle.reports, bundle.collectorOverrides],
  );
  const narratorOptions = useMemo(() => getNarratorOptions(bundle.reports), [bundle.reports]);
  const focus = useMemo(
    () => focusedNarrator ? getNarratorFocus(bundle.reports, focusedNarrator) : null,
    [bundle.reports, focusedNarrator],
  );
  const isLocalFocus = focus !== null && focusMode === 'local';
  const focusPositionKey = JSON.stringify([focusedNarrator, representation]);
  const currentSavedPositions = matnSort === 'highlights' ? highlightPositions[focusPositionKey] ?? EMPTY_NODE_POSITIONS
    : focusedNarrator ? focusPositions[focusPositionKey] ?? EMPTY_NODE_POSITIONS
    : representation === 'trie' ? bundle.trieNodePositions ?? EMPTY_NODE_POSITIONS : bundle.nodePositions;
  const studentFocus = useMemo(
    () => isLocalFocus && focus && selectedStudent ? getStudentFocus(focus, selectedStudent) : null,
    [focus, isLocalFocus, selectedStudent],
  );
  const studentReportIds = useMemo(
    () => studentFocus ? new Set(studentFocus.reports.map((report) => report.id)) : undefined,
    [studentFocus],
  );
  const reportNumbers = useMemo(
    () => new Map(bundle.reports.map((report, index) => [report.id, index + 1])),
    [bundle.reports],
  );

  const graph = useMemo(
    () => isLocalFocus && focus ? buildNarratorFocusGraph(focus, bundle.fontSizes, { verticalSpacing: bundle.verticalSpacing }) : buildRenderableGraph(
      focus?.reports ?? bundle.reports,
      currentSavedPositions,
      bundle.nodeWidths,
      bundle.fontSizes,
      bundle.highlightLegend,
      { reportNumbers, verticalSpacing: bundle.verticalSpacing, representation, matnSort, collectorNarrators },
    ),
    [bundle.reports, currentSavedPositions, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend, bundle.verticalSpacing, focus, isLocalFocus, reportNumbers, representation, matnSort, collectorNarrators],
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
    const validNodeIds = new Set(bundle.reports.flatMap((report) => getNodeIdsForReport(report, representation, collectorNarrators)));
    setSelectedNodeIds((previous) => {
      const filtered = previous.filter((id) => validNodeIds.has(id));
      return filtered.length === previous.length ? previous : filtered;
    });
  }, [bundle.reports, representation, collectorNarrators]);

  useEffect(() => {
    if (focusedNarrator && !narratorOptions.some((option) => option.name === focusedNarrator)) {
      setFocusedNarrator(null);
    }
  }, [focusedNarrator, narratorOptions]);

  useEffect(() => {
    if (!isLocalFocus || !focus?.students.some((student) => student.name === selectedStudent)) {
      setSelectedStudent(null);
    }
  }, [focus, isLocalFocus, selectedStudent]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const viewport = useGraphViewport({
    graphWidth: graph.width,
    graphHeight: graph.height,
  });

  useEffect(() => {
    setSavedLayoutRestore((previous) => previous && previous.reports !== bundle.reports ? null : previous);
  }, [bundle.reports]);

  useEffect(() => {
    // Changed annotations must be free to produce a new similarity order.
    setHighlightPositions({});
  }, [bundle.reports, bundle.highlightLegend, collectorNarrators]);

  useEffect(() => {
    if (fitLayoutAfterUpdate.current) {
      fitLayoutAfterUpdate.current = false;
      viewport.fitGraph();
    }
  }, [graph, viewport.fitGraph]);

  const setGraphLayoutBundle: Dispatch<SetStateAction<HadithBundle>> = useCallback((action) => {
    if (isLocalFocus) return;
    if (matnSort === 'highlights') {
      // Similarity layouts belong to this view, preserving default coordinates.
      setHighlightPositions((previous) => {
        const viewBundle = { ...bundle, nodePositions: previous[focusPositionKey] ?? EMPTY_NODE_POSITIONS };
        const next = typeof action === 'function' ? action(viewBundle) : action;
        return { ...previous, [focusPositionKey]: next.nodePositions };
      });
      return;
    }
    if (!focusedNarrator) {
      if (representation === 'merged') {
        setBundle(action);
      } else {
        setBundle((previous) => {
          const viewBundle = { ...previous, nodePositions: previous.trieNodePositions ?? EMPTY_NODE_POSITIONS };
          const next = typeof action === 'function' ? action(viewBundle) : action;
          return { ...next, nodePositions: previous.nodePositions, trieNodePositions: next.nodePositions };
        });
      }
      return;
    }
    // Focus coordinates belong to a view; they must not overwrite the saved
    // positions of shared narrators in the full corpus.
    setFocusPositions((previous) => {
      const viewBundle = { ...bundle, nodePositions: previous[focusPositionKey] ?? EMPTY_NODE_POSITIONS };
      const next = typeof action === 'function' ? action(viewBundle) : action;
      return { ...previous, [focusPositionKey]: next.nodePositions };
    });
  }, [bundle, focusedNarrator, focusPositionKey, isLocalFocus, representation, matnSort]);

  const canAutoArrange = !isLocalFocus && Object.keys(currentSavedPositions).length > 0;
  const canRestoreSavedLayout = savedLayoutRestore !== null
    && savedLayoutRestore.scope === focusedNarrator && savedLayoutRestore.representation === representation
    && savedLayoutRestore.matnSort === matnSort
    && savedLayoutRestore.reports === bundle.reports;

  const handleAutoArrange = useCallback((): void => {
    if (!canAutoArrange) return;
    setSavedLayoutRestore({ positions: currentSavedPositions, scope: focusedNarrator, representation, matnSort, reports: bundle.reports });
    fitLayoutAfterUpdate.current = true;
    setGraphLayoutBundle((previous) => ({ ...previous, nodePositions: {}, updatedAt: new Date().toISOString() }));
    setMessage(matnSort === 'highlights' ? 'Reapplied highlight ordering. The default graph layout is preserved.' : focusedNarrator
      ? 'Automatically arranged this narrator focus view. The full graph layout is preserved.'
      : 'Automatically arranged the graph. Export JSON to save it, or restore the saved layout.');
  }, [canAutoArrange, currentSavedPositions, focusedNarrator, representation, matnSort, bundle.reports, setGraphLayoutBundle]);

  const handleRestoreSavedLayout = useCallback((): void => {
    if (!canRestoreSavedLayout || isLocalFocus || !savedLayoutRestore) return;
    fitLayoutAfterUpdate.current = true;
    setGraphLayoutBundle((previous) => ({
      ...previous, nodePositions: savedLayoutRestore.positions, updatedAt: new Date().toISOString(),
    }));
    setSavedLayoutRestore(null);
    setMessage(matnSort === 'highlights' ? 'Restored the highlight-ordered view layout. The default graph layout is preserved.' : focusedNarrator
      ? 'Restored the saved layout for this narrator focus view. The full graph layout is preserved.'
      : 'Restored the saved graph layout.');
  }, [canRestoreSavedLayout, isLocalFocus, savedLayoutRestore, setGraphLayoutBundle, focusedNarrator, matnSort]);

  const { isDragging, handleNodePointerDown: onNodePointerDownRaw } = useNodeDrag({
    graphNodes: graph.nodes,
    graphShiftX: graph.shiftX ?? 0,
    graphShiftY: graph.shiftY ?? 0,
    selectedNodeIds,
    setSelectedNodeIds,
    clientPointToSvg: viewport.clientPointToSvg,
    setBundle: setGraphLayoutBundle,
    onDragCommitted: (movedCount, snapped) => {
      setMessage(matnSort === 'highlights' ? 'Arranged this highlight-ordered view. The default graph layout is preserved.' : focusedNarrator ? 'Arranged this narrator focus view. The full graph layout is preserved.' : (
        snapped
          ? `Moved ${movedCount} selected node(s) and aligned them to nearby anchor lines. Export JSON to save this layout.`
          : `Moved ${movedCount} selected node(s). Export JSON to save this layout.`
      ));
    },
  });

  const handleMatnWidthChange = useCallback((nodeId: string, width: number): void => {
    // Card widths belong to reports; only the active view's coordinate is released.
    setBundle((previous) => {
      const next = { ...previous, nodeWidths: { ...previous.nodeWidths, [nodeId]: width } };
      if (focusedNarrator || matnSort === 'highlights') return next;
      const positions = { ...(representation === 'trie' ? previous.trieNodePositions : previous.nodePositions) };
      delete positions[nodeId];
      return representation === 'trie' ? { ...next, trieNodePositions: positions } : { ...next, nodePositions: positions };
    });
    if (matnSort === 'highlights') {
      setHighlightPositions((previous) => {
        const positions = { ...previous[focusPositionKey] };
        delete positions[nodeId];
        return { ...previous, [focusPositionKey]: positions };
      });
    } else if (focusedNarrator) {
      setFocusPositions((previous) => {
        const positions = { ...previous[focusPositionKey] };
        delete positions[nodeId];
        return { ...previous, [focusPositionKey]: positions };
      });
    }
  }, [focusedNarrator, focusPositionKey, representation, matnSort]);

  const { isResizing, handleResizePointerDown: onResizePointerDownRaw } = useNodeResize({
    clientPointToSvg: viewport.clientPointToSvg,
    setSelectedNodeIds,
    setBundle,
    onResize: handleMatnWidthChange,
    onResizeCommitted: () => {
      setMessage(matnSort === 'highlights'
        ? 'Matn node resized. Export JSON to save its width. The default graph layout is preserved.'
        : 'Matn node resized. Export JSON to save width and layout.');
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
    representation,
    setBundle,
    setSelectedNodeIds,
    resetBoxSelection,
    setMessage,
  });

  const selectedEdgeSet = useMemo(
    () => new Set(isLocalFocus
      ? graph.edges.filter((edge) => edge.reports?.some((report) => studentReportIds
        ? studentReportIds.has(report.id) : report.id === reportEditor.editingReport?.id)).map((edge) => edge.id)
      : reportEditor.editingReport ? getEdgeIdsForReport(reportEditor.editingReport, representation, collectorNarrators) : []),
    [graph.edges, isLocalFocus, reportEditor.editingReport, studentReportIds, representation, collectorNarrators],
  );

  const handleRepresentationChange = useCallback((next: GraphRepresentation): void => {
    if (next === representation || isLocalFocus || isDragging || isResizing || isBoxSelecting) return;
    setRepresentation(next);
    setSelectedNodeIds(reportEditor.editingReport ? getNodeIdsForReport(reportEditor.editingReport, next, collectorNarrators) : []);
    resetBoxSelection();
    setSelectedStudent(null);
    fitLayoutAfterUpdate.current = true;
    setMessage(next === 'trie' ? 'Showing chains as a prefix tree.' : 'Showing shared narrators in the merged graph.');
  }, [representation, isLocalFocus, isDragging, isResizing, isBoxSelecting, reportEditor.editingReport, resetBoxSelection, collectorNarrators]);

  const handleMatnSortChange = useCallback((next: MatnSortMode): void => {
    if (next === matnSort || isLocalFocus || isDragging || isResizing || isBoxSelecting) return;
    resetBoxSelection();
    fitLayoutAfterUpdate.current = true;
    setMatnSort(next);
    setMessage(next === 'highlights'
      ? 'Matns ordered by shared highlight labels and coverage. The default graph layout is preserved.'
      : 'Showing the default graph layout.');
  }, [matnSort, isLocalFocus, isDragging, isResizing, isBoxSelecting, resetBoxSelection]);

  const visibleSelectedSet = useMemo(() => {
    if (!isLocalFocus) {
      return selectedSet;
    }
    const selected = new Set(graph.edges.filter((edge) => selectedEdgeSet.has(edge.id))
      .flatMap((edge) => [edge.source, edge.target]));
    if (studentFocus || focus?.reportReferences.some((report) => report.id === reportEditor.editingReport?.id)) {
      graph.nodes.filter((node) => node.id.startsWith('focus:center:')).forEach((node) => selected.add(node.id));
    }
    return selected;
  }, [focus, graph.edges, graph.nodes, isLocalFocus, reportEditor.editingReport, selectedEdgeSet, selectedSet, studentFocus]);

  const localSelectedReport = focus?.reportReferences.some((report) => report.id === reportEditor.editingReport?.id)
    && (!studentReportIds || studentReportIds.has(reportEditor.editingReport?.id ?? ''))
    ? reportEditor.editingReport : null;

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
      if (isDragging || isBoxSelecting || isLocalFocus) {
        return;
      }

      onResizePointerDownRaw(event, node, edge);
    },
    [isBoxSelecting, isDragging, isLocalFocus, onResizePointerDownRaw],
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
      setSelectedStudent(null);
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

  const handleSelectStudent = useCallback((name: string): void => {
    if (!isLocalFocus || isDragging || isResizing || isBoxSelecting || !focus?.students.some((student) => student.name === name)) {
      return;
    }
    const next = selectedStudent === name ? null : name;
    setSelectedStudent(next);
    setMessage(next ? `Highlighted sources reported by ${name}. Choose a report-count badge to inspect individual reports.` : 'Student source highlight cleared.');
  }, [focus, isLocalFocus, isDragging, isResizing, isBoxSelecting, selectedStudent]);

  const handleNodePointerDown = useCallback((event: ReactPointerEvent<SVGGElement>, nodeId: string): void => {
    if (isBoxSelecting || isResizing) {
      return;
    }
    if (isLocalFocus && event.button === 0) {
      const student = graph.nodes.find((node) => node.id === nodeId && node.id.startsWith('focus:student:'));
      if (student) {
        handleSelectStudent(student.label);
      }
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
      const reportNodeIds = getNodeIdsForReport(reportEditor.editingReport, representation, collectorNarrators);
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
    graph.nodes,
    handleSelectStudent,
    onNodePointerDownRaw,
    reportEditor,
    selectedNodeIds,
    selectedSet,
    representation,
    collectorNarrators,
  ]);

  const handleSelectReport = useCallback((reportId: string): void => {
    if (isBoxSelecting || isDragging || isResizing) {
      return;
    }

    reportEditor.selectReportFromMatnNode(getMatnNodeIdForReport(reportId), () => setSelectedStudent(null));
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
        representation,
        matnSort,
      };
    }
    resetBoxSelection();
    setSelectedStudent(null);
    setFocusedNarrator(name);
  }, [isDragging, isResizing, isBoxSelecting, reportEditor, resetBoxSelection, focusedNarrator, viewport, representation, matnSort]);

  const handleCollectorChange = useCallback((isCollector: boolean): void => {
    if (!focusedNarrator || isDragging || isResizing || isBoxSelecting) return;
    const result = setNarratorCollectorInBundle(bundle, focusedNarrator, isCollector);
    if (!result.bundle) {
      setMessage(result.error ?? 'Could not change this narrator’s collector setting.');
      return;
    }
    const nextCollectors = getCollectorNarrators(result.bundle.reports, result.bundle.collectorOverrides);
    setBundle(result.bundle);
    setFocusPositions({});
    setHighlightPositions({});
    setSavedLayoutRestore(null);
    resetBoxSelection();
    setSelectedNodeIds(reportEditor.editingReport
      ? getNodeIdsForReport(reportEditor.editingReport, representation, nextCollectors) : []);
    fitLayoutAfterUpdate.current = true;
    setMessage(isCollector
      ? `${focusedNarrator} is now a collector, with a separate node per report in Merged. Export JSON to save this setting.`
      : `${focusedNarrator} now shares one node across reports in Merged. Export JSON to save this setting.`);
  }, [bundle, focusedNarrator, isDragging, isResizing, isBoxSelecting, reportEditor.editingReport, representation, resetBoxSelection]);

  const handleFocusModeChange = useCallback((mode: NarratorFocusMode): void => {
    setSelectedStudent(null);
    setFocusMode(mode);
  }, []);

  const focusViewportKey = useRef('');
  useEffect(() => {
    const key = JSON.stringify([focusedNarrator, focusMode, representation]);
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
      if (container && saved.representation === representation && saved.matnSort === matnSort) {
        viewport.centerOnNode({
          x: (saved.scrollLeft + container.clientWidth / 2) / saved.zoom,
          y: (saved.scrollTop + container.clientHeight / 2) / saved.zoom,
        }, saved.zoom);
      } else {
        viewport.fitGraph();
      }
      fullGraphViewport.current = null;
    }
  }, [focusedNarrator, focusMode, representation, matnSort, graph, isLocalFocus, viewport]);

  const loadBundleIntoApp = useCallback((nextBundle: HadithBundle, successMessage: string): void => {
    setBundle(nextBundle);
    setFocusedNarrator(null);
    setSelectedStudent(null);
    setFocusPositions({});
    setHighlightPositions({});
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
    setSelectedStudent(null);
    setFocusPositions({});
    setHighlightPositions({});
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

  const handleVerticalSpacingChange = useCallback((rawValue: string): void => {
    const verticalSpacing = normalizeVerticalSpacing(Number(rawValue));
    setBundle((previous) => normalizeVerticalSpacing(previous.verticalSpacing) === verticalSpacing
      ? previous : { ...previous, verticalSpacing, updatedAt: new Date().toISOString() });
  }, []);

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
      { ...parsed.bundle, nodePositions: {}, trieNodePositions: {} },
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
        <div className="workspace-view-toggle" role="group" aria-label="Workspace view">
          <button type="button" aria-pressed={workspaceView === 'graph'} onClick={() => setWorkspaceView('graph')}>Transmission graph</button>
          <button type="button" aria-pressed={workspaceView === 'matns'} onClick={() => setWorkspaceView('matns')}>Matns</button>
        </div>
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
              onVerticalSpacingChange={handleVerticalSpacingChange}
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

        {workspaceView === 'matns' ? (
          <MatnView
            reports={bundle.reports}
            legend={bundle.highlightLegend}
            fontSize={bundle.fontSizes.matn}
            selectedReportId={reportEditor.editingReport?.id}
            isSidebarOpen={isLeftSidebarOpen}
            onToggleSidebar={() => setIsLeftSidebarOpen((current) => !current)}
            onSelectReport={(reportId) => {
              handleSelectReport(reportId);
              setIsLeftSidebarOpen(true);
            }}
          />
        ) : null}
        <section className="graph-card" aria-label="Transmission graph" hidden={workspaceView !== 'graph'}>
          <div className="graph-header">
          <div className="graph-toolbar">
            <div className="graph-title-block">
              <h2>Transmission graph</h2>
              <p>
                {focus ? `${focus.reports.length} of ${bundle.reports.length}` : bundle.reports.length} report{bundle.reports.length === 1 ? '' : 's'}
                {' '}<span aria-hidden="true">·</span>{' '}
                {graph.nodes.length} node{graph.nodes.length === 1 ? '' : 's'}
                {!isLocalFocus && graph.nodes.length > 0 ? (
                  <> <span aria-hidden="true">·</span> <span data-layout-engine={canAutoArrange ? 'saved' : 'custom'}>
                    {canAutoArrange ? 'Saved layout' : 'Automatic layout'}
                  </span></>
                ) : null}
              </p>
            </div>
            <div className="graph-toolbar-actions">
            {!isLocalFocus ? (
              <label className="graph-matn-sort" title={matnSort === 'highlights'
                ? 'Groups similar highlights from left to right and adjusts narrator branches to follow them.'
                : 'Automatic layout places narrators above their student branches. Saved manual positions are preserved.'}>
                <span>Matn order</span>
                <select
                  value={matnSort}
                  onChange={(event) => handleMatnSortChange(event.target.value as MatnSortMode)}
                  disabled={bundle.reports.length === 0 || isDragging || isResizing || isBoxSelecting}
                >
                  <option value="default">Default</option>
                  <option value="highlights">By elements/highlights</option>
                </select>
              </label>
            ) : null}
            {!isLocalFocus ? (
              <div className="graph-representation-toggle" role="group" aria-label="Graph representation">
                {(['merged', 'trie'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={representation === mode}
                    disabled={isDragging || isResizing || isBoxSelecting}
                    onClick={() => handleRepresentationChange(mode)}
                  >
                    {mode === 'merged' ? 'Merged' : 'Trie'}
                  </button>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={viewport.fitGraph} disabled={graph.nodes.length === 0}>Fit graph</button>
            <button type="button" onClick={handleAutoArrange} disabled={!canAutoArrange}>Auto-arrange</button>
            {canRestoreSavedLayout ? (
              <button type="button" onClick={handleRestoreSavedLayout} disabled={isLocalFocus}>Restore saved layout</button>
            ) : null}
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
              onModeChange={handleFocusModeChange}
              matchingReportCount={focus?.reports.length ?? bundle.reports.length}
              totalReportCount={bundle.reports.length}
              isCollector={focusedNarrator !== null && collectorNarrators.has(focusedNarrator)}
              onCollectorChange={handleCollectorChange}
              collectorDisabled={isDragging || isResizing || isBoxSelecting}
            />
          ) : null}
          {studentFocus && focus ? (
            <div className="student-focus-summary" role="status" aria-label="Student source highlight">
              <span>
                <bdi>{studentFocus.student}</bdi>: {studentFocus.reports.length} report{studentFocus.reports.length === 1 ? '' : 's'}.
                {' '}Sources: {studentFocus.sources.map((source) => <bdi key={source} className="student-focus-source">{source}</bdi>)}
                {studentFocus.includesFocusedAuthority ? <span className="student-focus-source"><bdi>{focus.name}</bdi> (attribution ends here)</span> : null}
              </span>
              <button type="button" onClick={() => setSelectedStudent(null)}>Clear student highlight</button>
            </div>
          ) : null}
          </div>
          <div className={isLocalFocus
            ? `graph-workspace local-focus-workspace${localSelectedReport ? ' with-local-report' : ''}`
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
                highlightedReportIds={studentReportIds}
                isDragging={isDragging}
                isResizing={isResizing}
                onCanvasPointerDown={handleCanvasPointerDown}
                onNodePointerDown={handleNodePointerDown}
                onResizePointerDown={handleResizePointerDown}
                onSelectReport={handleSelectReport}
                onFocusNarrator={handleFocusNarrator}
                focusedNarrator={focusedNarrator}
                selectedStudent={selectedStudent}
                onSelectStudent={isLocalFocus ? handleSelectStudent : undefined}
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
                report={localSelectedReport}
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
            <span className="graph-hint">{isLocalFocus ? 'Click a student to highlight sources · Double-click a narrator to focus' : 'Drag nodes to arrange · Double-click a narrator to focus'} <span aria-hidden="true">·</span> Ctrl + scroll to zoom</span>
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
