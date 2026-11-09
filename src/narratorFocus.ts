import { AUTHORITY_REPORT_GAP, getAuthorityReportMetrics, getNormalizedFontSizes, wrapTextToWidth } from './graph';
import { buildVerticalCurve } from './edgeGeometry';
import type { GraphEdge, GraphNode, GraphReportReference, HadithFontSizes, HadithReport, RenderableGraph } from './types';

export type NarratorFocusMode = 'local' | 'reports';

export interface NarratorOption {
  name: string;
  reportCount: number;
}

export interface FocusNeighbor {
  name: string;
  reports: GraphReportReference[];
}

export interface FocusCell {
  source: string | null;
  student: string | null;
  reports: GraphReportReference[];
}

export interface NarratorFocus {
  name: string;
  reports: HadithReport[];
  reportReferences: GraphReportReference[];
  sources: FocusNeighbor[];
  students: FocusNeighbor[];
  cells: FocusCell[];
}

export function getNarratorOptions(reports: HadithReport[]): NarratorOption[] {
  const counts = new Map<string, number>();
  for (const report of reports) {
    for (const name of new Set(report.isnad)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts].map(([name, reportCount]) => ({ name, reportCount }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

function addNeighbor(neighbors: Map<string, FocusNeighbor>, name: string | null, reference: GraphReportReference): void {
  if (name === null) {
    return;
  }
  const neighbor = neighbors.get(name) ?? { name, reports: [] };
  if (!neighbor.reports.some((report) => report.id === reference.id)) {
    neighbor.reports.push(reference);
  }
  neighbors.set(name, neighbor);
}

function compareBoundaryNames(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a.localeCompare(b, 'ar');
}

export function getNarratorFocus(reports: HadithReport[], name: string): NarratorFocus {
  const matchingReports: HadithReport[] = [];
  const reportReferences: GraphReportReference[] = [];
  const sources = new Map<string, FocusNeighbor>();
  const students = new Map<string, FocusNeighbor>();
  const cells = new Map<string, FocusCell>();

  reports.forEach((report, index) => {
    if (!report.isnad.includes(name)) {
      return;
    }
    const reference = { id: report.id, number: index + 1 };
    matchingReports.push(report);
    reportReferences.push(reference);
    report.isnad.forEach((narrator, narratorIndex) => {
      if (narrator !== name) {
        return;
      }
      const source = narratorIndex > 0 ? report.isnad[narratorIndex - 1] : null;
      const student = narratorIndex + 1 < report.isnad.length ? report.isnad[narratorIndex + 1] : null;
      addNeighbor(sources, source, reference);
      addNeighbor(students, student, reference);
      // Build each cell from an observed occurrence, never the Cartesian
      // product of independently collected sources and students.
      const key = JSON.stringify([source, student]);
      const cell = cells.get(key) ?? { source, student, reports: [] };
      if (!cell.reports.some((item) => item.id === report.id)) {
        cell.reports.push(reference);
      }
      cells.set(key, cell);
    });
  });

  return {
    name,
    reports: matchingReports,
    reportReferences,
    sources: [...sources.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    students: [...students.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    cells: [...cells.values()].sort((a, b) => compareBoundaryNames(a.source, b.source) || compareBoundaryNames(a.student, b.student)),
  };
}

const LOCAL_NODE_WIDTH = 220;
const LOCAL_NODE_GAP = 70;
const LOCAL_PADDING_X = 72;
const LOCAL_PADDING_Y = 64;
const LOCAL_CONNECTOR_GAP = 140;

function makeLocalNode(id: string, name: string, fontSize: number): GraphNode {
  const labelLines = wrapTextToWidth(name, LOCAL_NODE_WIDTH - 32, fontSize);
  return {
    id,
    label: name,
    labelLines,
    type: 'narrator',
    width: LOCAL_NODE_WIDTH,
    height: Math.max(56, 24 + labelLines.length * (fontSize + 4)),
    x: 0,
    y: 0,
  };
}

function rowWidth(nodes: GraphNode[]): number {
  return nodes.reduce((width, node) => width + node.width, 0) + Math.max(0, nodes.length - 1) * LOCAL_NODE_GAP;
}

function positionRow(nodes: GraphNode[], y: number, width: number): void {
  let nextX = (width - rowWidth(nodes)) / 2;
  for (const node of nodes) {
    node.x = nextX + node.width / 2;
    node.y = y;
    nextX += node.width + LOCAL_NODE_GAP;
  }
}

function localEdge(
  source: GraphNode,
  target: GraphNode,
  reports: GraphReportReference[],
  incoming: boolean,
): GraphEdge {
  const fromY = source.y + source.height / 2;
  const toY = target.y - target.height / 2;
  const curve = buildVerticalCurve({ x: source.x, y: fromY }, { x: target.x, y: toY }, 1, incoming ? 0.2 : 0.8);
  return {
    id: `${source.id}->${target.id}`,
    source: source.id,
    target: target.id,
    path: curve.path,
    label: reports.map((report) => `#${report.number}`).join(', '),
    reports,
    labelX: curve.labelX,
    labelY: curve.labelY,
  };
}

export function buildNarratorFocusGraph(focus: NarratorFocus, fontSizes?: Partial<HadithFontSizes>): RenderableGraph {
  if (focus.reports.length === 0) {
    return { nodes: [], edges: [], width: 900, height: 420, hasCycle: false, shiftX: 0, shiftY: 0 };
  }
  const fontSize = getNormalizedFontSizes(fontSizes).narrator;
  const center = makeLocalNode(`focus:center:${focus.name}`, focus.name, fontSize);
  const standaloneReports = focus.cells.find((cell) => cell.source === null && cell.student === null)?.reports;
  if (standaloneReports?.length) {
    // An isolated attribution has no edge on which to display its number.
    center.attributedReports = standaloneReports;
  }
  const centerAnnotation = getAuthorityReportMetrics(center.attributedReports);
  center.height = Math.max(center.height, centerAnnotation.height);
  const centerFootprintWidth = center.width + (centerAnnotation.width > 0
    ? 2 * (AUTHORITY_REPORT_GAP + centerAnnotation.width) : 0);
  const sources = focus.sources.map((source) => makeLocalNode(`focus:source:${source.name}`, source.name, fontSize));
  const students = focus.students.map((student) => makeLocalNode(`focus:student:${student.name}`, student.name, fontSize));
  const sourceHeight = Math.max(0, ...sources.map((source) => source.height));
  const studentHeight = Math.max(0, ...students.map((student) => student.height));
  const width = Math.max(900, Math.max(rowWidth(sources), rowWidth(students), centerFootprintWidth) + LOCAL_PADDING_X * 2);
  const sourceBottom = LOCAL_PADDING_Y + sourceHeight;
  const centerTop = sources.length > 0 ? sourceBottom + LOCAL_CONNECTOR_GAP : LOCAL_PADDING_Y;
  const studentTop = centerTop + center.height + LOCAL_CONNECTOR_GAP;
  positionRow(sources, LOCAL_PADDING_Y + sourceHeight / 2, width);
  positionRow([center], centerTop + center.height / 2, width);
  positionRow(students, studentTop + studentHeight / 2, width);
  const height = Math.max(420,
    (students.length > 0 ? studentTop + studentHeight : centerTop + center.height) + LOCAL_PADDING_Y);
  const edges = [
    ...sources.map((source, index) => localEdge(source, center, focus.sources[index].reports, true)),
    ...students.map((student, index) => localEdge(center, student, focus.students[index].reports, false)),
  ];
  const authorityNames = new Set(focus.reports.map((report) => report.isnad[0]));
  const nodes = [...sources, center, ...students];
  nodes.forEach((node) => {
    node.isAuthority = authorityNames.has(node.label);
  });
  return {
    nodes,
    edges,
    width,
    height,
    hasCycle: false,
    shiftX: 0,
    shiftY: 0,
  };
}
