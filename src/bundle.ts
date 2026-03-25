import { hasNarratorCycle } from './graph';
import type { HadithBundle, HadithReport, NodePositionMap, NodeWidthMap } from './types';

const BUNDLE_FORMAT = 'hadith-graph-bundle';
const NARRATOR_PREFIX = 'n:';
const REPORT_PREFIX = 'r:';

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeMatn(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .trim();
}

function sanitizeNarrators(values: string[]): string[] {
  return values
    .map((value) => sanitizeText(value))
    .filter((value) => value.length > 0);
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseNodePositions(raw: unknown): { positions?: NodePositionMap; error?: string } {
  if (typeof raw === 'undefined') {
    return { positions: {} };
  }

  if (!isObjectLike(raw)) {
    return { error: 'Bundle field "nodePositions" must be an object.' };
  }

  const positions: NodePositionMap = {};
  for (const [nodeId, rawPosition] of Object.entries(raw)) {
    if (!isObjectLike(rawPosition)) {
      return { error: `Node position for "${nodeId}" is invalid.` };
    }

    const x = rawPosition.x;
    const y = rawPosition.y;
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
      return { error: `Node position for "${nodeId}" must have numeric x and y.` };
    }

    positions[nodeId] = { x, y };
  }

  return { positions };
}

function parseNodeWidths(raw: unknown): { widths?: NodeWidthMap; error?: string } {
  if (typeof raw === 'undefined') {
    return { widths: {} };
  }

  if (!isObjectLike(raw)) {
    return { error: 'Bundle field "nodeWidths" must be an object.' };
  }

  const widths: NodeWidthMap = {};
  for (const [nodeId, rawWidth] of Object.entries(raw)) {
    if (typeof rawWidth !== 'number' || !Number.isFinite(rawWidth)) {
      return { error: `Node width for "${nodeId}" must be a number.` };
    }
    widths[nodeId] = rawWidth;
  }

  return { widths };
}

export function getNodeIdsForReport(report: HadithReport): string[] {
  const ids = new Set<string>();
  ids.add(`${REPORT_PREFIX}${report.id}`);
  for (const narrator of report.isnad) {
    ids.add(`${NARRATOR_PREFIX}${narrator}`);
  }
  return Array.from(ids);
}

function filterMapKeys<T>(input: Record<string, T>, validKeys: Set<string>): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(input)) {
    if (validKeys.has(key)) {
      next[key] = value;
    }
  }
  return next;
}

function finalizeReportsUpdate(
  bundle: HadithBundle,
  nextReports: HadithReport[],
): { bundle?: HadithBundle; error?: string } {
  if (hasNarratorCycle(nextReports)) {
    return {
      error:
        'This report creates a cycle in the narrator chain. The graph must stay acyclic, so the change was not saved.',
    };
  }

  const validNodeIds = new Set<string>();
  nextReports.forEach((report) => {
    getNodeIdsForReport(report).forEach((nodeId) => validNodeIds.add(nodeId));
  });

  return {
    bundle: {
      ...bundle,
      updatedAt: nowIso(),
      reports: nextReports,
      nodePositions: filterMapKeys(bundle.nodePositions, validNodeIds) as NodePositionMap,
      nodeWidths: filterMapKeys(bundle.nodeWidths, validNodeIds) as NodeWidthMap,
    },
  };
}

function validateReportFields(
  narratorsInput: string[],
  matnInput: string,
): { isnad?: string[]; matn?: string; error?: string } {
  const isnad = sanitizeNarrators(narratorsInput);
  const matn = sanitizeMatn(matnInput);

  if (isnad.length < 1) {
    return { error: 'Isnad must include at least one narrator.' };
  }

  if (matn.length === 0) {
    return { error: 'Matn cannot be empty.' };
  }

  return { isnad, matn };
}

export function parseIsnadText(input: string): string[] {
  return input
    .split(/\r?\n|->|→|،|,/)
    .map((item) => sanitizeText(item))
    .filter((item) => item.length > 0);
}

export function createEmptyBundle(title = 'Untitled Bundle'): HadithBundle {
  const timestamp = nowIso();
  return {
    format: BUNDLE_FORMAT,
    version: 1,
    title: sanitizeText(title) || 'Untitled Bundle',
    createdAt: timestamp,
    updatedAt: timestamp,
    reports: [],
    nodePositions: {},
    nodeWidths: {},
  };
}

export function addReportToBundle(
  bundle: HadithBundle,
  isnadInput: string,
  matnInput: string,
): { bundle?: HadithBundle; addedNodeIds?: string[]; error?: string } {
  return addReportToBundleFromFields(bundle, parseIsnadText(isnadInput), matnInput);
}

export function addReportToBundleFromFields(
  bundle: HadithBundle,
  narratorsInput: string[],
  matnInput: string,
): { bundle?: HadithBundle; addedNodeIds?: string[]; error?: string } {
  const validated = validateReportFields(narratorsInput, matnInput);
  if (!validated.isnad || typeof validated.matn !== 'string') {
    return { error: validated.error ?? 'Could not add this report.' };
  }

  const report: HadithReport = {
    id: makeId(),
    isnad: validated.isnad,
    matn: validated.matn,
    createdAt: nowIso(),
  };

  const nextReports = [...bundle.reports, report];
  const result = finalizeReportsUpdate(bundle, nextReports);
  if (!result.bundle) {
    return {
      error: result.error?.replace('change was not saved', 'report was not added') ?? 'Could not add this report.',
    };
  }

  return {
    bundle: result.bundle,
    addedNodeIds: getNodeIdsForReport(report),
  };
}

export function updateReportInBundle(
  bundle: HadithBundle,
  reportId: string,
  narratorsInput: string[],
  matnInput: string,
): { bundle?: HadithBundle; updatedNodeIds?: string[]; error?: string } {
  const existingReport = bundle.reports.find((report) => report.id === reportId);
  if (!existingReport) {
    return { error: 'Report not found.' };
  }

  const validated = validateReportFields(narratorsInput, matnInput);
  if (!validated.isnad || typeof validated.matn !== 'string') {
    return { error: validated.error ?? 'Could not save this report.' };
  }

  const updatedReport: HadithReport = {
    ...existingReport,
    isnad: validated.isnad,
    matn: validated.matn,
  };

  const nextReports = bundle.reports.map((report) => (report.id === reportId ? updatedReport : report));
  const result = finalizeReportsUpdate(bundle, nextReports);
  if (!result.bundle) {
    return { error: result.error ?? 'Could not save this report.' };
  }

  return {
    bundle: result.bundle,
    updatedNodeIds: getNodeIdsForReport(updatedReport),
  };
}

export function deleteReportFromBundle(
  bundle: HadithBundle,
  reportId: string,
): { bundle?: HadithBundle; error?: string } {
  const reportExists = bundle.reports.some((report) => report.id === reportId);
  if (!reportExists) {
    return { error: 'Report not found.' };
  }

  const nextReports = bundle.reports.filter((report) => report.id !== reportId);
  const result = finalizeReportsUpdate(bundle, nextReports);
  if (!result.bundle) {
    return { error: result.error ?? 'Could not delete this report.' };
  }

  return {
    bundle: result.bundle,
  };
}

export function parseBundleJson(text: string): { bundle?: HadithBundle; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'Invalid JSON file.' };
  }

  if (!isObjectLike(parsed)) {
    return { error: 'Bundle must be a JSON object.' };
  }

  if (parsed.format !== BUNDLE_FORMAT) {
    return { error: `Unsupported format. Expected "${BUNDLE_FORMAT}".` };
  }

  if (parsed.version !== 1) {
    return { error: 'Unsupported version. This app currently supports version 1 only.' };
  }

  if (!Array.isArray(parsed.reports)) {
    return { error: 'Bundle field "reports" must be an array.' };
  }

  const reports: HadithReport[] = [];
  for (let index = 0; index < parsed.reports.length; index += 1) {
    const raw = parsed.reports[index];
    if (!isObjectLike(raw)) {
      return { error: `Report ${index + 1} is invalid.` };
    }

    const rawIsnad = raw.isnad;
    const rawMatn = raw.matn;

    if (!Array.isArray(rawIsnad)) {
      return { error: `Report ${index + 1} has an invalid isnad.` };
    }

    const isnad = rawIsnad
      .filter((item): item is string => typeof item === 'string')
      .map((item) => sanitizeText(item))
      .filter((item) => item.length > 0);

    if (isnad.length < 1) {
      return { error: `Report ${index + 1} must have at least one narrator in isnad.` };
    }

    if (typeof rawMatn !== 'string' || sanitizeMatn(rawMatn).length === 0) {
      return { error: `Report ${index + 1} has an empty matn.` };
    }

    const report: HadithReport = {
      id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : makeId(),
      isnad,
      matn: sanitizeMatn(rawMatn),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
    };
    reports.push(report);
  }

  if (hasNarratorCycle(reports)) {
    return { error: 'Imported bundle contains a narrator cycle, so it cannot be loaded.' };
  }

  const parsedNodePositions = parseNodePositions(parsed.nodePositions);
  if (!parsedNodePositions.positions) {
    return { error: parsedNodePositions.error ?? 'Invalid node positions.' };
  }

  const parsedNodeWidths = parseNodeWidths(parsed.nodeWidths);
  if (!parsedNodeWidths.widths) {
    return { error: parsedNodeWidths.error ?? 'Invalid node widths.' };
  }

  const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : nowIso();
  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : nowIso();
  const title = typeof parsed.title === 'string' ? sanitizeText(parsed.title) : 'Untitled Bundle';

  return {
    bundle: {
      format: BUNDLE_FORMAT,
      version: 1,
      title: title.length > 0 ? title : 'Untitled Bundle',
      createdAt,
      updatedAt,
      reports,
      nodePositions: parsedNodePositions.positions,
      nodeWidths: parsedNodeWidths.widths,
    },
  };
}

export function bundleToJson(bundle: HadithBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function makeExportFilename(bundle: HadithBundle): string {
  const cleanTitle = bundle.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = cleanTitle.length > 0 ? cleanTitle : 'hadith-graph';
  return `${base}.hadith-graph.json`;
}
