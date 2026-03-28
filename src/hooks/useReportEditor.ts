import {
  Dispatch,
  FormEvent,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  addReportToBundleFromFields,
  deleteReportFromBundle,
  getNodeIdsForReport,
  getReportIdForMatnNode,
  updateReportInBundle,
} from '../bundle';
import {
  HIGHLIGHT_COLOR_OPTIONS,
  sanitizeHighlightColor,
  sanitizeMatnHighlights,
} from '../matnHighlights';
import type { HadithBundle, HadithReport, HighlightLegendItem, MatnHighlight } from '../types';

export interface SelectionRange {
  start: number;
  end: number;
}

interface UseReportEditorParams {
  bundle: HadithBundle;
  setBundle: Dispatch<SetStateAction<HadithBundle>>;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  resetBoxSelection: () => void;
  setMessage: Dispatch<SetStateAction<string>>;
}

export interface ReportEditorController {
  editingReportId: string | null;
  editingReport: HadithReport | null;
  editingReportIndex: number;
  editorNarrators: string[];
  editorMatn: string;
  editorHighlights: MatnHighlight[];
  normalizedDraftMatn: string;
  previewSelection: SelectionRange | null;
  activeHighlightId: string | null;
  newLegendLabel: string;
  newLegendColor: string;
  chainPreview: string;
  highlightLegendById: Map<string, HighlightLegendItem>;
  matnPreviewRef: RefObject<HTMLDivElement | null>;
  resetEditor: () => void;
  confirmDiscardEditorChanges: () => boolean;
  clearActiveReportSelection: () => boolean;
  startNewReport: () => void;
  selectReport: (report: HadithReport) => void;
  selectReportFromMatnNode: (nodeId: string) => boolean;
  useReportAsTemplate: (report: HadithReport) => void;
  setMatn: (value: string) => void;
  changeNarrator: (index: number, value: string) => void;
  addNarrator: () => void;
  removeNarrator: (index: number) => void;
  capturePreviewSelection: () => void;
  applyExistingLegend: (legendId: string) => void;
  setNewLegendLabel: (value: string) => void;
  setNewLegendColor: (value: string) => void;
  createLegendAndApply: () => void;
  removeHighlight: (highlightId: string) => void;
  focusHighlight: (highlight: MatnHighlight) => void;
  saveReport: (event: FormEvent<HTMLFormElement>) => void;
  deleteReport: () => void;
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

function highlightsEqual(left: MatnHighlight[], right: MatnHighlight[]): boolean {
  return left.length === right.length
    && left.every((item, index) => (
      item.id === right[index]?.id
      && item.legendId === right[index]?.legendId
      && item.start === right[index]?.start
      && item.end === right[index]?.end
    ));
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

export function useReportEditor({
  bundle,
  setBundle,
  setSelectedNodeIds,
  resetBoxSelection,
  setMessage,
}: UseReportEditorParams): ReportEditorController {
  const [editorNarrators, setEditorNarrators] = useState<string[]>(() => emptyNarratorDraft());
  const [editorMatn, setEditorMatn] = useState('');
  const [editorHighlights, setEditorHighlights] = useState<MatnHighlight[]>([]);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [previewSelection, setPreviewSelection] = useState<SelectionRange | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [newLegendLabel, setNewLegendLabelState] = useState('');
  const [newLegendColor, setNewLegendColorState] = useState(HIGHLIGHT_COLOR_OPTIONS[0]?.color ?? '#f59e0b');
  const matnPreviewRef = useRef<HTMLDivElement>(null);

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

  const chainPreview = useMemo(
    () => (normalizedDraftNarrators.length > 0
      ? normalizedDraftNarrators.join(' -> ')
      : 'Add narrators to build the chain.'),
    [normalizedDraftNarrators],
  );

  const resetEditor = useCallback((): void => {
    setEditingReportId(null);
    setEditorNarrators(emptyNarratorDraft());
    setEditorMatn('');
    setEditorHighlights([]);
    setPreviewSelection(null);
    setActiveHighlightId(null);
  }, []);

  const populateEditorFromReport = useCallback((report: HadithReport, nextEditingReportId: string | null): void => {
    setEditingReportId(nextEditingReportId);
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

  const clearActiveReportSelection = useCallback((): boolean => {
    if (!editingReportId) {
      return true;
    }

    if (!confirmDiscardEditorChanges()) {
      return false;
    }

    resetEditor();
    return true;
  }, [confirmDiscardEditorChanges, editingReportId, resetEditor]);

  const startNewReport = useCallback((): void => {
    if (!confirmDiscardEditorChanges()) {
      return;
    }

    resetEditor();
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage('Report editor cleared. Add a new chain and matn.');
  }, [confirmDiscardEditorChanges, resetBoxSelection, resetEditor, setMessage, setSelectedNodeIds]);

  const selectReport = useCallback((report: HadithReport): void => {
    if (editingReportId !== report.id && !confirmDiscardEditorChanges()) {
      return;
    }

    populateEditorFromReport(report, report.id);
    setSelectedNodeIds(getNodeIdsForReport(report));
    resetBoxSelection();
    setMessage('Editing selected report. Save changes to update the graph.');
  }, [
    confirmDiscardEditorChanges,
    editingReportId,
    populateEditorFromReport,
    resetBoxSelection,
    setMessage,
    setSelectedNodeIds,
  ]);

  const selectReportFromMatnNode = useCallback((nodeId: string): boolean => {
    const reportId = getReportIdForMatnNode(nodeId);
    if (!reportId) {
      return false;
    }

    const report = bundle.reports.find((item) => item.id === reportId);
    if (!report) {
      return false;
    }

    if (editingReportId !== report.id && !confirmDiscardEditorChanges()) {
      return true;
    }

    populateEditorFromReport(report, report.id);
    setSelectedNodeIds(getNodeIdsForReport(report));
    resetBoxSelection();
    setMessage('Editing selected report. Save changes to update the graph.');
    return true;
  }, [
    bundle.reports,
    confirmDiscardEditorChanges,
    editingReportId,
    populateEditorFromReport,
    resetBoxSelection,
    setMessage,
    setSelectedNodeIds,
  ]);

  const useReportAsTemplate = useCallback((report: HadithReport): void => {
    if (!confirmDiscardEditorChanges()) {
      return;
    }

    populateEditorFromReport(report, null);
    setSelectedNodeIds(getNodeIdsForReport(report));
    resetBoxSelection();
    setMessage('Report copied into the add form. Adjust the chain or matn, then add it as a new report.');
  }, [
    confirmDiscardEditorChanges,
    populateEditorFromReport,
    resetBoxSelection,
    setMessage,
    setSelectedNodeIds,
  ]);

  const setMatn = useCallback((value: string): void => {
    setEditorMatn(value);
  }, []);

  const changeNarrator = useCallback((index: number, value: string): void => {
    setEditorNarrators((previous) => previous.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }, []);

  const addNarrator = useCallback((): void => {
    setEditorNarrators((previous) => [...previous, '']);
  }, []);

  const removeNarrator = useCallback((index: number): void => {
    setEditorNarrators((previous) => {
      if (previous.length <= 1) {
        return emptyNarratorDraft();
      }

      const next = previous.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : emptyNarratorDraft();
    });
  }, []);

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

  const applyExistingLegend = useCallback((legendId: string): void => {
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
  }, [applyHighlightToRange, highlightLegendById, previewSelection, setMessage]);

  const setNewLegendLabel = useCallback((value: string): void => {
    setNewLegendLabelState(value);
  }, []);

  const setNewLegendColor = useCallback((value: string): void => {
    setNewLegendColorState(sanitizeHighlightColor(value));
  }, []);

  const createLegendAndApply = useCallback((): void => {
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
    setNewLegendLabelState('');
    setMessage(existing
      ? `Reused "${legend.label}" for the selected matn text.`
      : `Added "${legend.label}" to the shared legend and applied it.`);
  }, [applyHighlightToRange, bundle.highlightLegend, newLegendColor, newLegendLabel, previewSelection, setBundle, setMessage]);

  const removeHighlight = useCallback((highlightId: string): void => {
    setEditorHighlights((previous) => previous.filter((highlight) => highlight.id !== highlightId));
    if (activeHighlightId === highlightId) {
      setActiveHighlightId(null);
    }
  }, [activeHighlightId]);

  const focusHighlight = useCallback((highlight: MatnHighlight): void => {
    setPreviewSelection({ start: highlight.start, end: highlight.end });
    setActiveHighlightId(highlight.id);
    const highlightedElement = matnPreviewRef.current?.querySelector<HTMLElement>(`[data-highlight-id="${highlight.id}"]`);
    highlightedElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  const saveReport = useCallback((event: FormEvent<HTMLFormElement>): void => {
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
        populateEditorFromReport(savedReport, savedReport.id);
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
  }, [
    bundle,
    editingReportId,
    editorHighlights,
    editorMatn,
    editorNarrators,
    populateEditorFromReport,
    resetEditor,
    setBundle,
    setMessage,
    setSelectedNodeIds,
  ]);

  const deleteReport = useCallback((): void => {
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
  }, [bundle, editingReportId, resetBoxSelection, resetEditor, setBundle, setMessage, setSelectedNodeIds]);

  return {
    editingReportId,
    editingReport,
    editingReportIndex,
    editorNarrators,
    editorMatn,
    editorHighlights,
    normalizedDraftMatn,
    previewSelection,
    activeHighlightId,
    newLegendLabel,
    newLegendColor,
    chainPreview,
    highlightLegendById,
    matnPreviewRef,
    resetEditor,
    confirmDiscardEditorChanges,
    clearActiveReportSelection,
    startNewReport,
    selectReport,
    selectReportFromMatnNode,
    useReportAsTemplate,
    setMatn,
    changeNarrator,
    addNarrator,
    removeNarrator,
    capturePreviewSelection,
    applyExistingLegend,
    setNewLegendLabel,
    setNewLegendColor,
    createLegendAndApply,
    removeHighlight,
    focusHighlight,
    saveReport,
    deleteReport,
  };
}
