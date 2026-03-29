import { buildMatnTextSegments } from './matnHighlights';
import type {
  GraphEdge,
  GraphNode,
  GraphTextLine,
  GraphTextSegment,
  HadithFontSizes,
  HadithReport,
  HighlightLegendItem,
  NodePositionMap,
  NodeWidthMap,
  RenderableGraph,
} from './types';

const NARRATOR_PREFIX = 'n:';
const COLLECTOR_PREFIX = 'c:';
const MATN_NODE_PREFIX = 'm:';

const NARRATOR_NODE_WIDTH = 190;
const NARRATOR_MIN_HEIGHT = 56;
const NARRATOR_SIDE_PADDING = 16;

const MATN_NODE_DEFAULT_WIDTH = 360;
export const MATN_NODE_MIN_WIDTH = 220;
export const MATN_NODE_MAX_WIDTH = 760;
export const MATN_NODE_SIDE_PADDING = 14;
const MATN_NODE_TOP_PADDING = 14;
const MATN_NODE_BOTTOM_PADDING = 14;
export const DEFAULT_NARRATOR_FONT_SIZE = 13;
export const DEFAULT_MATN_FONT_SIZE = 12;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 24;
const DEFAULT_GRAPH_WIDTH = 900;
const DEFAULT_GRAPH_HEIGHT = 420;
const MIN_TEXT_WRAP_WIDTH = 80;
const LINE_HEIGHT_PADDING = 4;
const TEXT_MEASURE_FONT_FAMILY = "'IBM Plex Sans', 'Noto Naskh Arabic', 'Trebuchet MS', sans-serif";
const NARRATOR_BASE_HEIGHT = 24;
const HORIZONTAL_GAP = 70;
const VERTICAL_GAP = 120;
const PADDING_X = 96;
const PADDING_Y = 72;

export function clampFontSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

export function getNormalizedFontSizes(fontSizes?: Partial<HadithFontSizes>): HadithFontSizes {
  return {
    narrator: clampFontSize(fontSizes?.narrator ?? DEFAULT_NARRATOR_FONT_SIZE, DEFAULT_NARRATOR_FONT_SIZE),
    matn: clampFontSize(fontSizes?.matn ?? DEFAULT_MATN_FONT_SIZE, DEFAULT_MATN_FONT_SIZE),
  };
}

function lineHeight(fontSize: number): number {
  return fontSize + LINE_HEIGHT_PADDING;
}

export function clampMatnNodeWidth(width: number): number {
  return Math.min(MATN_NODE_MAX_WIDTH, Math.max(MATN_NODE_MIN_WIDTH, Math.round(width)));
}

export function getSharedNarratorNodeId(name: string): string {
  return `${NARRATOR_PREFIX}${name}`;
}

export function getCollectorNodeId(reportId: string): string {
  return `${COLLECTOR_PREFIX}${reportId}`;
}

export function getNarratorNodeIdForReport(
  report: Pick<HadithReport, 'id' | 'isnad'>,
  narratorIndex: number,
): string {
  const narratorName = report.isnad[narratorIndex] ?? '';
  return narratorIndex === report.isnad.length - 1
    ? getCollectorNodeId(report.id)
    : getSharedNarratorNodeId(narratorName);
}

function matnNodeId(sourceReportId: string): string {
  return `${MATN_NODE_PREFIX}${sourceReportId}`;
}

function nodeLabelSort(a: string, b: string, labelsById: Map<string, { label: string }>): number {
  const labelA = labelsById.get(a)?.label ?? a;
  const labelB = labelsById.get(b)?.label ?? b;
  return labelA.localeCompare(labelB, 'ar');
}

let textMeasureContext: CanvasRenderingContext2D | null | undefined;

function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (textMeasureContext !== undefined) {
    return textMeasureContext;
  }

  if (typeof document === 'undefined') {
    textMeasureContext = null;
    return textMeasureContext;
  }

  const canvas = document.createElement('canvas');
  textMeasureContext = canvas.getContext('2d');
  if (textMeasureContext) {
    textMeasureContext.font = `12px ${TEXT_MEASURE_FONT_FAMILY}`;
  }

  return textMeasureContext;
}

function measureTextWidth(text: string, fontSize: number): number {
  const context = getTextMeasureContext();
  if (!context) {
    return text.length * fontSize * 0.6;
  }

  context.font = `${fontSize}px ${TEXT_MEASURE_FONT_FAMILY}`;
  return context.measureText(text).width;
}

function wrapTextToWidth(text: string, maxWidth: number, fontSize: number): string[] {
  const splitWordToWidth = (word: string): string[] => {
    const segments: string[] = [];
    let segment = '';

    for (const char of word) {
      const candidate = `${segment}${char}`;
      if (segment.length > 0 && measureTextWidth(candidate, fontSize) > maxWidth) {
        segments.push(segment);
        segment = char;
      } else {
        segment = candidate;
      }
    }

    if (segment.length > 0) {
      segments.push(segment);
    }

    return segments;
  };

  const wrapSingleLine = (line: string): string[] => {
    const words = line.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      return [''];
    }

    const lines: string[] = [];
    let current = '';

    const pushCurrent = (): void => {
      if (current.length > 0) {
        lines.push(current);
        current = '';
      }
    };

    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (measureTextWidth(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }

      pushCurrent();

      if (measureTextWidth(word, fontSize) <= maxWidth) {
        current = word;
        continue;
      }

      const segments = splitWordToWidth(word);
      lines.push(...segments.slice(0, -1));
      current = segments[segments.length - 1] ?? '';
    }

    pushCurrent();

    return lines.length > 0 ? lines : [''];
  };

  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line) => wrapSingleLine(line));
}

function splitSegmentToWidth(
  segment: { text: string; color?: string; highlightId?: string; label?: string },
  maxWidth: number,
  fontSize: number,
): GraphTextSegment[] {
  const parts: GraphTextSegment[] = [];
  let current = '';

  for (const char of segment.text) {
    const candidate = `${current}${char}`;
    if (current.length > 0 && measureTextWidth(candidate, fontSize) > maxWidth) {
      parts.push({
        text: current,
        width: measureTextWidth(current, fontSize),
        color: segment.color,
        highlightId: segment.highlightId,
        label: segment.label,
      });
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    parts.push({
      text: current,
      width: measureTextWidth(current, fontSize),
      color: segment.color,
      highlightId: segment.highlightId,
      label: segment.label,
    });
  }

  return parts;
}

function tokenizeMatnSegments(
  segments: ReturnType<typeof buildMatnTextSegments>,
): Array<{ text: string; color?: string; highlightId?: string; label?: string; isNewline: boolean; isWhitespace: boolean }> {
  const tokens: Array<{ text: string; color?: string; highlightId?: string; label?: string; isNewline: boolean; isWhitespace: boolean }> = [];

  for (const segment of segments) {
    const parts = segment.text.split(/(\n|\s+)/);
    for (const part of parts) {
      if (part.length === 0) {
        continue;
      }

      tokens.push({
        text: part,
        color: segment.color,
        highlightId: segment.highlightId,
        label: segment.label,
        isNewline: part === '\n',
        isWhitespace: part.trim().length === 0 && part !== '\n',
      });
    }
  }

  return tokens;
}

function wrapMatnSegmentsToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  legendById: Map<string, HighlightLegendItem>,
  highlights: HadithReport['matnHighlights'],
): GraphTextLine[] {
  const sourceSegments = buildMatnTextSegments(text, highlights, legendById);
  const tokens = tokenizeMatnSegments(sourceSegments);
  const lines: GraphTextLine[] = [];
  let currentSegments: GraphTextSegment[] = [];
  let currentText = '';

  const appendSegment = (segment: GraphTextSegment): void => {
    const previous = currentSegments[currentSegments.length - 1];
    if (
      previous
      && previous.color === segment.color
      && previous.highlightId === segment.highlightId
      && previous.label === segment.label
    ) {
      previous.text += segment.text;
      previous.width += segment.width;
      return;
    }

    currentSegments.push(segment);
  };

  const pushLine = (): void => {
    const width = currentSegments.reduce((sum, segment) => sum + segment.width, 0);
    lines.push({
      width,
      segments: currentSegments.length > 0 ? currentSegments : [{ text: '', width: 0 }],
    });
    currentSegments = [];
    currentText = '';
  };

  const addToken = (token: { text: string; color?: string; highlightId?: string; label?: string }): void => {
    const width = measureTextWidth(token.text, fontSize);
    appendSegment({
      text: token.text,
      width,
      color: token.color,
      highlightId: token.highlightId,
      label: token.label,
    });
    currentText += token.text;
  };

  for (const token of tokens) {
    if (token.isNewline) {
      pushLine();
      continue;
    }

    if (currentText.length === 0 && token.isWhitespace) {
      continue;
    }

    const tokenWidth = measureTextWidth(token.text, fontSize);
    const candidate = `${currentText}${token.text}`;
    const candidateWidth = measureTextWidth(candidate, fontSize);

    if (currentText.length === 0) {
      if (tokenWidth <= maxWidth) {
        addToken(token);
      } else {
        splitSegmentToWidth(token, maxWidth, fontSize).forEach((segment, index, splitParts) => {
          appendSegment(segment);
          currentText += segment.text;
          if (index < splitParts.length - 1) {
            pushLine();
          }
        });
      }
      continue;
    }

    if (candidateWidth <= maxWidth) {
      addToken(token);
      continue;
    }

    if (token.isWhitespace) {
      pushLine();
      continue;
    }

    pushLine();
    if (tokenWidth <= maxWidth) {
      addToken(token);
      continue;
    }

    splitSegmentToWidth(token, maxWidth, fontSize).forEach((segment, index, splitParts) => {
      appendSegment(segment);
      currentText += segment.text;
      if (index < splitParts.length - 1) {
        pushLine();
      }
    });
  }

  if (currentSegments.length > 0 || lines.length === 0) {
    pushLine();
  }

  return lines;
}

type IndexedGraphNode = {
  id: string;
  label: string;
  type: 'narrator' | 'matn';
  matn?: string;
  matnHighlights?: HadithReport['matnHighlights'];
  matnAnchorId?: string;
};

type IndexedGraph = {
  nodesById: Map<string, IndexedGraphNode>;
  adjacency: Map<string, Set<string>>;
  indegree: Map<string, number>;
  edgesById: Map<string, { source: string; target: string }>;
};

type NodeMeta = {
  width: number;
  height: number;
  labelLines: string[];
  matnLines?: string[];
  matnLineSegments?: GraphTextLine[];
};

type GraphTopology = {
  narratorNodeIds: string[];
  matnNodeIds: string[];
  depth: Map<string, number>;
  rows: Map<number, string[]>;
  hasCycle: boolean;
};

type AutoLayout = {
  rowCenterY: Map<number, number>;
  autoX: Map<string, number>;
  autoWidth: number;
  autoHeight: number;
};

function createEmptyRenderableGraph(): RenderableGraph {
  return {
    nodes: [],
    edges: [],
    width: DEFAULT_GRAPH_WIDTH,
    height: DEFAULT_GRAPH_HEIGHT,
    hasCycle: false,
    shiftX: 0,
    shiftY: 0,
  };
}

function ensureDirectedNode(
  adjacency: Map<string, Set<string>>,
  indegree: Map<string, number>,
  id: string,
): void {
  if (!adjacency.has(id)) {
    adjacency.set(id, new Set<string>());
  }

  if (!indegree.has(id)) {
    indegree.set(id, 0);
  }
}

function addDirectedEdge(
  adjacency: Map<string, Set<string>>,
  indegree: Map<string, number>,
  source: string,
  target: string,
): void {
  const neighbors = adjacency.get(source);
  if (!neighbors || neighbors.has(target)) {
    return;
  }

  neighbors.add(target);
  indegree.set(target, (indegree.get(target) ?? 0) + 1);
}

function topologicalSort(
  nodeIds: string[],
  adjacency: Map<string, Set<string>>,
  indegree: Map<string, number>,
  compare: (a: string, b: string) => number,
): string[] {
  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const indegreeCopy = new Map(indegree);
  const order: string[] = [];

  while (queue.length > 0) {
    queue.sort(compare);
    const current = queue.shift();
    if (!current) {
      break;
    }

    order.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const nextIndegree = (indegreeCopy.get(neighbor) ?? 0) - 1;
      indegreeCopy.set(neighbor, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return order;
}

function buildIndexedGraph(reports: HadithReport[]): IndexedGraph {
  const nodesById = new Map<string, IndexedGraphNode>();
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const edgesById = new Map<string, { source: string; target: string }>();

  const ensureNode = (node: IndexedGraphNode): void => {
    if (nodesById.has(node.id)) {
      return;
    }

    nodesById.set(node.id, node);
    ensureDirectedNode(adjacency, indegree, node.id);
  };

  reports.forEach((report, index) => {
    const matnId = matnNodeId(report.id);
    ensureNode({
      id: matnId,
      label: `Matn ${index + 1}`,
      type: 'matn',
      matn: report.matn,
      matnHighlights: report.matnHighlights,
      matnAnchorId: report.isnad.length > 0
        ? getNarratorNodeIdForReport(report, report.isnad.length - 1)
        : undefined,
    });

    report.isnad.forEach((narratorName, narratorIndex) => {
      ensureNode({
        id: getNarratorNodeIdForReport(report, narratorIndex),
        label: narratorName,
        type: 'narrator',
      });
    });

    for (let i = 0; i < report.isnad.length - 1; i += 1) {
      const source = getNarratorNodeIdForReport(report, i);
      const target = getNarratorNodeIdForReport(report, i + 1);
      addDirectedEdge(adjacency, indegree, source, target);
      edgesById.set(`${source}->${target}`, { source, target });
    }
  });

  return {
    nodesById,
    adjacency,
    indegree,
    edgesById,
  };
}

function buildGraphTopology(indexedGraph: IndexedGraph): GraphTopology {
  const narratorNodeIds: string[] = [];
  const matnNodeIds: string[] = [];

  for (const node of indexedGraph.nodesById.values()) {
    if (node.type === 'narrator') {
      narratorNodeIds.push(node.id);
    } else {
      matnNodeIds.push(node.id);
    }
  }

  const topoOrder = topologicalSort(
    narratorNodeIds,
    indexedGraph.adjacency,
    indexedGraph.indegree,
    (a, b) => nodeLabelSort(a, b, indexedGraph.nodesById),
  );
  const hasCycle = topoOrder.length !== narratorNodeIds.length;
  const orderedNarratorIds = [...topoOrder];

  if (hasCycle) {
    const remainingNarrators = [...narratorNodeIds].sort((a, b) => nodeLabelSort(a, b, indexedGraph.nodesById));
    remainingNarrators.forEach((id) => {
      if (!orderedNarratorIds.includes(id)) {
        orderedNarratorIds.push(id);
      }
    });
  }

  const depth = new Map<string, number>();
  orderedNarratorIds.forEach((id) => depth.set(id, 0));

  orderedNarratorIds.forEach((id) => {
    const sourceDepth = depth.get(id) ?? 0;
    for (const neighbor of indexedGraph.adjacency.get(id) ?? []) {
      depth.set(neighbor, Math.max(depth.get(neighbor) ?? 0, sourceDepth + 1));
    }
  });

  const rows = new Map<number, string[]>();
  orderedNarratorIds.forEach((id) => {
    const rowIndex = depth.get(id) ?? 0;
    if (!rows.has(rowIndex)) {
      rows.set(rowIndex, []);
    }
    rows.get(rowIndex)?.push(id);
  });

  rows.forEach((rowNodes) => {
    rowNodes.sort((a, b) => nodeLabelSort(a, b, indexedGraph.nodesById));
  });

  return {
    narratorNodeIds,
    matnNodeIds,
    depth,
    rows,
    hasCycle,
  };
}

function buildNodeMeta(
  nodesById: Map<string, IndexedGraphNode>,
  nodeWidths: NodeWidthMap,
  fontSizes: HadithFontSizes,
  highlightLegendById: Map<string, HighlightLegendItem>,
): Map<string, NodeMeta> {
  const nodeMeta = new Map<string, NodeMeta>();

  for (const node of nodesById.values()) {
    if (node.type === 'matn') {
      const matnNodeWidth = clampMatnNodeWidth(nodeWidths[node.id] ?? MATN_NODE_DEFAULT_WIDTH);
      const matnLineSegments = wrapMatnSegmentsToWidth(
        node.matn ?? '',
        Math.max(MIN_TEXT_WRAP_WIDTH, matnNodeWidth - MATN_NODE_SIDE_PADDING * 2),
        fontSizes.matn,
        highlightLegendById,
        node.matnHighlights ?? [],
      );
      const matnLines = matnLineSegments.map((line) => line.segments.map((segment) => segment.text).join(''));
      const height = MATN_NODE_TOP_PADDING
        + matnLineSegments.length * lineHeight(fontSizes.matn)
        + MATN_NODE_BOTTOM_PADDING;

      nodeMeta.set(node.id, {
        width: matnNodeWidth,
        height,
        labelLines: [node.label],
        matnLines,
        matnLineSegments,
      });
      continue;
    }

    const labelLines = wrapTextToWidth(
      node.label,
      Math.max(MIN_TEXT_WRAP_WIDTH, NARRATOR_NODE_WIDTH - NARRATOR_SIDE_PADDING * 2),
      fontSizes.narrator,
    );
    const height = Math.max(NARRATOR_MIN_HEIGHT, NARRATOR_BASE_HEIGHT + labelLines.length * lineHeight(fontSizes.narrator));
    nodeMeta.set(node.id, {
      width: NARRATOR_NODE_WIDTH,
      height,
      labelLines,
    });
  }

  return nodeMeta;
}

function buildAutoLayout(rows: Map<number, string[]>, nodeMeta: Map<string, NodeMeta>): AutoLayout {
  const rowIndices = Array.from(rows.keys()).sort((a, b) => a - b);
  const rowCenterY = new Map<number, number>();
  let yCursor = PADDING_Y;

  for (const rowIndex of rowIndices) {
    const rowNodes = rows.get(rowIndex) ?? [];
    const rowHeight = Math.max(...rowNodes.map((id) => nodeMeta.get(id)?.height ?? NARRATOR_MIN_HEIGHT));
    const centerY = yCursor + rowHeight / 2;
    rowCenterY.set(rowIndex, centerY);
    yCursor += rowHeight + VERTICAL_GAP;
  }

  let autoWidth = DEFAULT_GRAPH_WIDTH;
  const autoX = new Map<string, number>();

  for (const rowIndex of rowIndices) {
    const rowNodes = rows.get(rowIndex) ?? [];
    let xCursor = PADDING_X;
    for (const id of rowNodes) {
      const meta = nodeMeta.get(id);
      if (!meta) {
        continue;
      }
      autoX.set(id, xCursor + meta.width / 2);
      xCursor += meta.width + HORIZONTAL_GAP;
    }

    const rowWidth = rowNodes.length > 0 ? xCursor - HORIZONTAL_GAP + PADDING_X : PADDING_X * 2;
    autoWidth = Math.max(autoWidth, rowWidth);
  }

  const autoHeight = rowIndices.length > 0
    ? Math.max(DEFAULT_GRAPH_HEIGHT, yCursor - VERTICAL_GAP + PADDING_Y)
    : DEFAULT_GRAPH_HEIGHT;

  return {
    rowCenterY,
    autoX,
    autoWidth,
    autoHeight,
  };
}

function buildNarratorNodes(
  indexedGraph: IndexedGraph,
  topology: GraphTopology,
  nodeMeta: Map<string, NodeMeta>,
  autoLayout: AutoLayout,
  nodePositions: NodePositionMap,
): GraphNode[] {
  return topology.narratorNodeIds.map((id) => {
    const node = indexedGraph.nodesById.get(id);
    const meta = nodeMeta.get(id);
    const rowIndex = topology.depth.get(id) ?? 0;
    const defaultX = autoLayout.autoX.get(id) ?? PADDING_X;
    const defaultY = autoLayout.rowCenterY.get(rowIndex) ?? PADDING_Y;

    const legacyCollectorPosition = id.startsWith(COLLECTOR_PREFIX) && node
      ? nodePositions[getSharedNarratorNodeId(node.label)]
      : undefined;
    const savedPosition = nodePositions[id] ?? legacyCollectorPosition;

    return {
      id,
      label: node?.label ?? id,
      labelLines: meta?.labelLines ?? [node?.label ?? id],
      matnLines: meta?.matnLines,
      matnLineSegments: meta?.matnLineSegments,
      type: node?.type ?? 'narrator',
      width: meta?.width ?? NARRATOR_NODE_WIDTH,
      height: meta?.height ?? NARRATOR_MIN_HEIGHT,
      x: typeof savedPosition?.x === 'number' && Number.isFinite(savedPosition.x) ? savedPosition.x : defaultX,
      y: typeof savedPosition?.y === 'number' && Number.isFinite(savedPosition.y) ? savedPosition.y : defaultY,
    };
  });
}

function buildMatnNodes(
  indexedGraph: IndexedGraph,
  topology: GraphTopology,
  nodeMeta: Map<string, NodeMeta>,
  narratorNodes: GraphNode[],
): GraphNode[] {
  const narratorBottom = narratorNodes.length > 0
    ? Math.max(...narratorNodes.map((node) => node.y + node.height / 2))
    : PADDING_Y;
  const matnTopY = narratorBottom + VERTICAL_GAP;
  const narratorNodeById = new Map(narratorNodes.map((node) => [node.id, node]));

  return topology.matnNodeIds.map((id) => {
    const node = indexedGraph.nodesById.get(id);
    const meta = nodeMeta.get(id);
    const width = meta?.width ?? MATN_NODE_DEFAULT_WIDTH;
    const height = meta?.height ?? NARRATOR_MIN_HEIGHT;
    const anchorNode = narratorNodeById.get(node?.matnAnchorId ?? '');
    const anchorRight = anchorNode ? anchorNode.x + anchorNode.width / 2 : PADDING_X + width;

    return {
      id,
      label: node?.label ?? id,
      labelLines: meta?.labelLines ?? [node?.label ?? id],
      matnLines: meta?.matnLines,
      matnLineSegments: meta?.matnLineSegments,
      type: node?.type ?? 'matn',
      width,
      height,
      x: anchorRight - width / 2,
      y: matnTopY + height / 2,
    };
  });
}

function shiftNodesIntoBounds(nodes: GraphNode[]): { shiftX: number; shiftY: number } {
  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2));
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
  const shiftX = minX < PADDING_X ? PADDING_X - minX : 0;
  const shiftY = minY < PADDING_Y ? PADDING_Y - minY : 0;

  if (shiftX > 0 || shiftY > 0) {
    nodes.forEach((node) => {
      node.x += shiftX;
      node.y += shiftY;
    });
  }

  return { shiftX, shiftY };
}

function buildEdges(edgesById: Map<string, { source: string; target: string }>, nodes: GraphNode[]): GraphEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: GraphEdge[] = [];

  for (const [edgeId, edge] of edgesById.entries()) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      continue;
    }

    const dy = target.y - source.y;
    const verticalDirection = dy >= 0 ? 1 : -1;
    const sourceY = source.y + verticalDirection * (source.height / 2);
    const targetY = target.y - verticalDirection * (target.height / 2);

    edges.push({
      id: edgeId,
      source: edge.source,
      target: edge.target,
      path: `M ${source.x} ${sourceY} L ${target.x} ${targetY}`,
      label: undefined,
      labelX: source.x + (target.x - source.x) / 2,
      labelY: source.y + dy / 2 - verticalDirection * 10,
    });
  }

  return edges;
}

export function hasNarratorCycle(reports: HadithReport[]): boolean {
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const narratorIds: string[] = [];
  const seenNarrators = new Set<string>();

  for (const report of reports) {
    for (const name of report.isnad) {
      if (!seenNarrators.has(name)) {
        seenNarrators.add(name);
        narratorIds.push(name);
      }
      ensureDirectedNode(adjacency, indegree, name);
    }

    for (let i = 0; i < report.isnad.length - 1; i += 1) {
      addDirectedEdge(adjacency, indegree, report.isnad[i], report.isnad[i + 1]);
    }
  }

  return topologicalSort(narratorIds, adjacency, indegree, (a, b) => a.localeCompare(b, 'ar')).length !== narratorIds.length;
}

export function buildRenderableGraph(
  reports: HadithReport[],
  nodePositions: NodePositionMap = {},
  nodeWidths: NodeWidthMap = {},
  fontSizes?: Partial<HadithFontSizes>,
  highlightLegend: HighlightLegendItem[] = [],
): RenderableGraph {
  const normalizedFontSizes = getNormalizedFontSizes(fontSizes);
  const highlightLegendById = new Map(highlightLegend.map((entry) => [entry.id, entry]));
  const indexedGraph = buildIndexedGraph(reports);

  if (indexedGraph.nodesById.size === 0) {
    return createEmptyRenderableGraph();
  }

  const topology = buildGraphTopology(indexedGraph);
  const nodeMeta = buildNodeMeta(indexedGraph.nodesById, nodeWidths, normalizedFontSizes, highlightLegendById);
  const autoLayout = buildAutoLayout(topology.rows, nodeMeta);
  const narratorNodes = buildNarratorNodes(indexedGraph, topology, nodeMeta, autoLayout, nodePositions);
  const matnNodes = buildMatnNodes(indexedGraph, topology, nodeMeta, narratorNodes);
  const nodeById = new Map<string, GraphNode>([...narratorNodes, ...matnNodes].map((node) => [node.id, node]));
  const nodes = Array.from(indexedGraph.nodesById.keys())
    .map((id) => nodeById.get(id))
    .filter((node): node is GraphNode => node !== undefined);
  const { shiftX, shiftY } = shiftNodesIntoBounds(nodes);
  const edges = buildEdges(indexedGraph.edgesById, nodes);
  const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2));

  return {
    nodes,
    edges,
    width: Math.max(autoLayout.autoWidth, maxX + PADDING_X),
    height: Math.max(autoLayout.autoHeight, maxY + PADDING_Y),
    hasCycle: topology.hasCycle,
    shiftX,
    shiftY,
  };
}
