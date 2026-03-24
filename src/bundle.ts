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

function nodeIdsForReport(report: HadithReport): string[] {
  const ids = new Set<string>();
  ids.add(`${REPORT_PREFIX}${report.id}`);
  for (const narrator of report.isnad) {
    ids.add(`${NARRATOR_PREFIX}${narrator}`);
  }
  return Array.from(ids);
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
  const isnad = parseIsnadText(isnadInput);
  const matn = sanitizeText(matnInput);

  if (isnad.length < 1) {
    return { error: 'Isnad must include at least one narrator.' };
  }
  if (matn.length === 0) {
    return { error: 'Matn cannot be empty.' };
  }

  const report: HadithReport = {
    id: makeId(),
    isnad,
    matn,
    createdAt: nowIso(),
  };

  const nextReports = [...bundle.reports, report];
  if (hasNarratorCycle(nextReports)) {
    return {
      error:
        'This report creates a cycle in the narrator chain. The graph must stay acyclic, so the report was not added.',
    };
  }

  return {
    bundle: {
      ...bundle,
      updatedAt: nowIso(),
      reports: nextReports,
    },
    addedNodeIds: nodeIdsForReport(report),
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

    if (typeof rawMatn !== 'string' || sanitizeText(rawMatn).length === 0) {
      return { error: `Report ${index + 1} has an empty matn.` };
    }

    const report: HadithReport = {
      id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : makeId(),
      isnad,
      matn: sanitizeText(rawMatn),
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
