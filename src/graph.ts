import type { HadithFontSizes, HadithReport, NodePositionMap, NodeWidthMap, RenderableGraph } from './types';

const NARRATOR_PREFIX = 'n:';
const MATN_NODE_PREFIX = 'r:';

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

function narratorLineHeight(fontSize: number): number {
  return fontSize + 4;
}

function matnLineHeight(fontSize: number): number {
  return fontSize + 4;
}

export function clampMatnNodeWidth(width: number): number {
  return Math.min(MATN_NODE_MAX_WIDTH, Math.max(MATN_NODE_MIN_WIDTH, Math.round(width)));
}

function narratorId(name: string): string {
  return `${NARRATOR_PREFIX}${name}`;
}

function matnNodeId(sourceReportId: string): string {
  return `${MATN_NODE_PREFIX}${sourceReportId}`;
}

function nodeLabelSort(a: string, b: string, labels: Map<string, string>): number {
  const labelA = labels.get(a) ?? a;
  const labelB = labels.get(b) ?? b;
  return labelA.localeCompare(labelB, 'ar');
}

function splitLongToken(token: string, maxCharsPerLine: number): string[] {
  const slices: string[] = [];
  for (let i = 0; i < token.length; i += maxCharsPerLine) {
    slices.push(token.slice(i, i + maxCharsPerLine));
  }
  return slices;
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
    textMeasureContext.font = "12px 'IBM Plex Sans', 'Noto Naskh Arabic', 'Trebuchet MS', sans-serif";
  }

  return textMeasureContext;
}

function measureTextWidth(text: string, fontSize: number): number {
  const context = getTextMeasureContext();
  if (!context) {
    return text.length * fontSize * 0.6;
  }

  context.font = `${fontSize}px 'IBM Plex Sans', 'Noto Naskh Arabic', 'Trebuchet MS', sans-serif`;
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

export function hasNarratorCycle(reports: HadithReport[]): boolean {
  const nodes = new Set<string>();
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const report of reports) {
    for (const name of report.isnad) {
      nodes.add(name);
      if (!adjacency.has(name)) {
        adjacency.set(name, new Set<string>());
      }
      if (!indegree.has(name)) {
        indegree.set(name, 0);
      }
    }

    for (let i = 0; i < report.isnad.length - 1; i += 1) {
      const source = report.isnad[i];
      const target = report.isnad[i + 1];
      const neighbors = adjacency.get(source);
      if (!neighbors) {
        continue;
      }
      if (neighbors.has(target)) {
        continue;
      }
      neighbors.add(target);
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  }

  const queue: string[] = Array.from(nodes).filter((name) => (indegree.get(name) ?? 0) === 0);
  let processed = 0;

  while (queue.length > 0) {
    queue.sort((a, b) => a.localeCompare(b, 'ar'));
    const current = queue.shift();
    if (!current) {
      break;
    }
    processed += 1;
    for (const neighbor of adjacency.get(current) ?? []) {
      const nextIndegree = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return processed !== nodes.size;
}

export function buildRenderableGraph(
  reports: HadithReport[],
  nodePositions: NodePositionMap = {},
  nodeWidths: NodeWidthMap = {},
  fontSizes?: Partial<HadithFontSizes>,
): RenderableGraph {
  const normalizedFontSizes = getNormalizedFontSizes(fontSizes);
  const labels = new Map<string, string>();
  const matnByNodeId = new Map<string, string>();
  const matnAnchorByNodeId = new Map<string, string>();
  const types = new Map<string, 'narrator' | 'matn'>();

  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const edgeWeights = new Map<string, { source: string; target: string; weight: number; showWeight: boolean }>();

  const ensureNode = (id: string, label: string, type: 'narrator' | 'matn'): void => {
    if (!labels.has(id)) {
      labels.set(id, label);
      types.set(id, type);
      adjacency.set(id, new Set<string>());
      indegree.set(id, indegree.get(id) ?? 0);
    }
  };

  const addEdge = (source: string, target: string, countWeight: boolean): void => {
    const neighbors = adjacency.get(source);
    if (!neighbors) {
      return;
    }

    if (!neighbors.has(target)) {
      neighbors.add(target);
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }

    const edgeId = `${source}->${target}`;
    const existing = edgeWeights.get(edgeId);
    if (existing) {
      if (countWeight) {
        existing.weight += 1;
      }
      return;
    }

    edgeWeights.set(edgeId, {
      source,
      target,
      weight: countWeight ? 1 : 0,
      showWeight: countWeight,
    });
  };

  reports.forEach((report, index) => {
    const matnId = matnNodeId(report.id);
    ensureNode(matnId, `Matn ${index + 1}`, 'matn');
    matnByNodeId.set(matnId, report.matn);

    report.isnad.forEach((narratorName) => {
      ensureNode(narratorId(narratorName), narratorName, 'narrator');
    });

    for (let i = 0; i < report.isnad.length - 1; i += 1) {
      const source = narratorId(report.isnad[i]);
      const target = narratorId(report.isnad[i + 1]);
      addEdge(source, target, true);
    }

    const lastNarrator = report.isnad[report.isnad.length - 1];
    if (lastNarrator) {
      matnAnchorByNodeId.set(matnId, narratorId(lastNarrator));
    }
  });

  if (labels.size === 0) {
    return {
      nodes: [],
      edges: [],
      width: 900,
      height: 420,
      hasCycle: false,
    };
  }

  const narratorNodeIds = Array.from(labels.keys()).filter((id) => (types.get(id) ?? 'narrator') === 'narrator');
  const matnNodeIds = Array.from(labels.keys()).filter((id) => (types.get(id) ?? 'narrator') === 'matn');

  const queue: string[] = narratorNodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const indegreeCopy = new Map(indegree);
  const topoOrder: string[] = [];

  while (queue.length > 0) {
    queue.sort((a, b) => nodeLabelSort(a, b, labels));
    const current = queue.shift();
    if (!current) {
      break;
    }

    topoOrder.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const nextIndegree = (indegreeCopy.get(neighbor) ?? 0) - 1;
      indegreeCopy.set(neighbor, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  const hasCycle = topoOrder.length !== narratorNodeIds.length;
  if (hasCycle) {
    const fallbackNodes = narratorNodeIds.sort((a, b) => nodeLabelSort(a, b, labels));
    fallbackNodes.forEach((id) => {
      if (!topoOrder.includes(id)) {
        topoOrder.push(id);
      }
    });
  }

  const depth = new Map<string, number>();
  topoOrder.forEach((id) => depth.set(id, 0));

  topoOrder.forEach((id) => {
    const sourceDepth = depth.get(id) ?? 0;
    for (const neighbor of adjacency.get(id) ?? []) {
      depth.set(neighbor, Math.max(depth.get(neighbor) ?? 0, sourceDepth + 1));
    }
  });

  const rows = new Map<number, string[]>();
  topoOrder.forEach((id) => {
    const rowIndex = depth.get(id) ?? 0;
    if (!rows.has(rowIndex)) {
      rows.set(rowIndex, []);
    }
    rows.get(rowIndex)?.push(id);
  });

  rows.forEach((rowNodes) => {
    rowNodes.sort((a, b) => {
      const typeA = types.get(a) === 'narrator' ? 0 : 1;
      const typeB = types.get(b) === 'narrator' ? 0 : 1;
      if (typeA !== typeB) {
        return typeA - typeB;
      }
      return nodeLabelSort(a, b, labels);
    });
  });

  const nodeMeta = new Map<string, { width: number; height: number; labelLines: string[]; matnLines?: string[] }>();
  for (const id of labels.keys()) {
    const type = types.get(id) ?? 'narrator';
    const label = labels.get(id) ?? id;

    if (type === 'matn') {
      const matnNodeWidth = clampMatnNodeWidth(nodeWidths[id] ?? MATN_NODE_DEFAULT_WIDTH);
      const matnLines = wrapTextToWidth(
        matnByNodeId.get(id) ?? '',
        Math.max(80, matnNodeWidth - MATN_NODE_SIDE_PADDING * 2),
        normalizedFontSizes.matn,
      );
      const height = MATN_NODE_TOP_PADDING
        + matnLines.length * matnLineHeight(normalizedFontSizes.matn)
        + MATN_NODE_BOTTOM_PADDING;

      nodeMeta.set(id, {
        width: matnNodeWidth,
        height,
        labelLines: [label],
        matnLines,
      });
      continue;
    }

    const labelLines = wrapTextToWidth(
      label,
      Math.max(80, NARRATOR_NODE_WIDTH - NARRATOR_SIDE_PADDING * 2),
      normalizedFontSizes.narrator,
    );
    const height = Math.max(NARRATOR_MIN_HEIGHT, 24 + labelLines.length * narratorLineHeight(normalizedFontSizes.narrator));
    nodeMeta.set(id, {
      width: NARRATOR_NODE_WIDTH,
      height,
      labelLines,
    });
  }

  const horizontalGap = 70;
  const verticalGap = 120;
  const paddingX = 96;
  const paddingY = 72;

  const rowIndices = Array.from(rows.keys()).sort((a, b) => a - b);

  const rowCenterY = new Map<number, number>();
  let yCursor = paddingY;
  for (const rowIndex of rowIndices) {
    const rowNodes = rows.get(rowIndex) ?? [];
    const rowHeight = Math.max(...rowNodes.map((id) => nodeMeta.get(id)?.height ?? NARRATOR_MIN_HEIGHT));
    const centerY = yCursor + rowHeight / 2;
    rowCenterY.set(rowIndex, centerY);
    yCursor += rowHeight + verticalGap;
  }

  let autoWidth = 900;
  const autoX = new Map<string, number>();
  for (const rowIndex of rowIndices) {
    const rowNodes = rows.get(rowIndex) ?? [];
    let xCursor = paddingX;
    for (const id of rowNodes) {
      const meta = nodeMeta.get(id);
      if (!meta) {
        continue;
      }
      autoX.set(id, xCursor + meta.width / 2);
      xCursor += meta.width + horizontalGap;
    }

    const rowWidth = rowNodes.length > 0 ? xCursor - horizontalGap + paddingX : paddingX * 2;
    autoWidth = Math.max(autoWidth, rowWidth);
  }

  const autoHeight = rowIndices.length > 0
    ? Math.max(420, yCursor - verticalGap + paddingY)
    : 420;

  const narratorNodes = narratorNodeIds.map((id) => {
    const meta = nodeMeta.get(id);
    const rowIndex = depth.get(id) ?? 0;

    const defaultX = autoX.get(id) ?? paddingX;
    const defaultY = rowCenterY.get(rowIndex) ?? paddingY;

    const savedPosition = nodePositions[id];

    return {
      id,
      label: labels.get(id) ?? id,
      labelLines: meta?.labelLines ?? [labels.get(id) ?? id],
      matnLines: meta?.matnLines,
      type: types.get(id) ?? 'narrator',
      width: meta?.width ?? NARRATOR_NODE_WIDTH,
      height: meta?.height ?? NARRATOR_MIN_HEIGHT,
      x: typeof savedPosition?.x === 'number' && Number.isFinite(savedPosition.x) ? savedPosition.x : defaultX,
      y: typeof savedPosition?.y === 'number' && Number.isFinite(savedPosition.y) ? savedPosition.y : defaultY,
    };
  });

  const narratorBottom = narratorNodes.length > 0
    ? Math.max(...narratorNodes.map((node) => node.y + node.height / 2))
    : paddingY;
  const matnTopY = narratorBottom + verticalGap;
  const narratorNodeById = new Map(narratorNodes.map((node) => [node.id, node]));

  const matnNodes = matnNodeIds.map((id) => {
    const meta = nodeMeta.get(id);
    const anchorNode = narratorNodeById.get(matnAnchorByNodeId.get(id) ?? '');
    const width = meta?.width ?? MATN_NODE_DEFAULT_WIDTH;
    const height = meta?.height ?? NARRATOR_MIN_HEIGHT;
    const anchorRight = anchorNode ? anchorNode.x + anchorNode.width / 2 : paddingX + width;

    return {
      id,
      label: labels.get(id) ?? id,
      labelLines: meta?.labelLines ?? [labels.get(id) ?? id],
      matnLines: meta?.matnLines,
      type: types.get(id) ?? 'matn',
      width,
      height,
      x: anchorRight - width / 2,
      y: matnTopY + height / 2,
    };
  });

  const nodes = Array.from(labels.keys())
    .map((id) => narratorNodeById.get(id) ?? matnNodes.find((node) => node.id === id))
    .filter((node): node is NonNullable<typeof node> => node !== undefined);

  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2));
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
  const shiftX = minX < paddingX ? paddingX - minX : 0;
  const shiftY = minY < paddingY ? paddingY - minY : 0;

  if (shiftX > 0 || shiftY > 0) {
    nodes.forEach((node) => {
      node.x += shiftX;
      node.y += shiftY;
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = Array.from(edgeWeights.entries())
    .map(([edgeId, edge]) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) {
        return null;
      }

      const dy = target.y - source.y;
      const verticalDirection = dy >= 0 ? 1 : -1;
      const sourceY = source.y + verticalDirection * (source.height / 2);
      const targetY = target.y - verticalDirection * (target.height / 2);
      const control = Math.max(50, Math.abs(dy) * 0.35);
      const path = `M ${source.x} ${sourceY} C ${source.x} ${sourceY + verticalDirection * control}, ${target.x} ${targetY - verticalDirection * control}, ${target.x} ${targetY}`;

      return {
        id: edgeId,
        source: edge.source,
        target: edge.target,
        path,
        label: edge.showWeight && edge.weight > 1 ? `x${edge.weight}` : undefined,
        labelX: source.x + (target.x - source.x) / 2,
        labelY: source.y + dy / 2 - verticalDirection * 10,
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

  const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2));

  return {
    nodes,
    edges,
    width: Math.max(autoWidth, maxX + paddingX),
    height: Math.max(autoHeight, maxY + paddingY),
    hasCycle,
  };
}
