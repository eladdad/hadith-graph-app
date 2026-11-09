import { getNormalizedFontSizes, wrapTextToWidth } from './graph';
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
const LOCAL_COLUMN_GAP = 90;
const LOCAL_ROW_GAP = 24;
const LOCAL_PADDING_X = 72;
const LOCAL_PADDING_Y = 64;

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

function columnHeight(nodes: GraphNode[]): number {
  return nodes.reduce((height, node) => height + node.height, 0) + Math.max(0, nodes.length - 1) * LOCAL_ROW_GAP;
}

function positionColumn(nodes: GraphNode[], x: number, height: number): void {
  let nextY = (height - columnHeight(nodes)) / 2;
  for (const node of nodes) {
    node.x = x;
    node.y = nextY + node.height / 2;
    nextY += node.height + LOCAL_ROW_GAP;
  }
}

function localEdge(source: GraphNode, target: GraphNode, reports: GraphReportReference[]): GraphEdge {
  const fromX = source.x + source.width / 2;
  const toX = target.x - target.width / 2;
  return {
    id: `${source.id}->${target.id}`,
    source: source.id,
    target: target.id,
    path: `M ${fromX} ${source.y} L ${toX} ${target.y}`,
    reports,
    // The table provides individual report links. Keeping this local view
    // free of long number lists makes high-degree narrators readable.
    labelX: (fromX + toX) / 2,
    labelY: (source.y + target.y) / 2 - 10,
  };
}

export function buildNarratorFocusGraph(focus: NarratorFocus, fontSizes?: Partial<HadithFontSizes>): RenderableGraph {
  if (focus.reports.length === 0) {
    return { nodes: [], edges: [], width: 900, height: 420, hasCycle: false, shiftX: 0, shiftY: 0 };
  }
  const fontSize = getNormalizedFontSizes(fontSizes).narrator;
  const center = makeLocalNode(`focus:center:${focus.name}`, focus.name, fontSize);
  const sources = focus.sources.map((source) => makeLocalNode(`focus:source:${source.name}`, source.name, fontSize));
  const students = focus.students.map((student) => makeLocalNode(`focus:student:${student.name}`, student.name, fontSize));
  const width = LOCAL_PADDING_X * 2 + LOCAL_NODE_WIDTH * 3 + LOCAL_COLUMN_GAP * 2;
  const height = Math.max(420, Math.max(columnHeight(sources), columnHeight(students), center.height) + LOCAL_PADDING_Y * 2);
  positionColumn(sources, LOCAL_PADDING_X + LOCAL_NODE_WIDTH / 2, height);
  positionColumn([center], width / 2, height);
  positionColumn(students, width - LOCAL_PADDING_X - LOCAL_NODE_WIDTH / 2, height);
  const edges = [
    ...sources.map((source, index) => localEdge(source, center, focus.sources[index].reports)),
    ...students.map((student, index) => localEdge(center, student, focus.students[index].reports)),
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
