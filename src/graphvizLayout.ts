import type { Viz } from '@viz-js/viz';
import type { LayoutEdge, Point } from './layerPlacement';

const POINTS_PER_INCH = 72;
const MAX_CACHED_LAYOUTS = 8;

export interface GraphvizLayoutNode {
  id: string;
  width: number;
  height: number;
  type: 'narrator' | 'matn';
  anchorId?: string;
}

let viz: Viz | undefined;
let initialization: Promise<void> | undefined;
const cachedLayouts = new Map<string, Map<string, Point>>();

/** Load the WebAssembly engine once, before the synchronous graph builder runs. */
export function initializeGraphvizLayout(): Promise<void> {
  if (!initialization) {
    initialization = import('@viz-js/viz')
      .then((module) => module.instance())
      .then((instance) => { viz = instance; })
      .catch((error: unknown) => {
        initialization = undefined;
        throw error;
      });
  }
  return initialization;
}

function copyPositions(positions: Map<string, Point>): Map<string, Point> {
  return new Map([...positions].map(([id, point]) => [id, { ...point }]));
}

function inches(pixels: number): string {
  if (!Number.isFinite(pixels) || pixels < 0) {
    throw new Error('Graphviz layout dimensions must be finite and non-negative.');
  }
  return (pixels / POINTS_PER_INCH).toFixed(9);
}

interface GraphvizOutput {
  objects?: Array<{ name?: string; pos?: string }>;
}

/**
 * Lay out the complete graph, including actual measured matn nodes. Both axes
 * come directly from dot; the application can translate the whole graph into
 * its canvas, but does not compact ranks or reposition text cards afterward.
 */
export function layoutGraphvizGraph(
  inputNodes: GraphvizLayoutNode[],
  narratorEdges: LayoutEdge[],
  horizontalGap: number,
  verticalGap: number,
  matnOrder?: string[],
): Map<string, Point> {
  if (!viz) {
    throw new Error('Graphviz layout has not been initialized.');
  }
  if (inputNodes.length === 0) return new Map();

  const nodes = inputNodes.map(({ id, width, height, type, anchorId }) => ({
    id, width, height, type, anchorId,
  })).sort((a, b) => a.id.localeCompare(b.id));
  // The encoded id attribute is retained in Graphviz JSON for inspection, while
  // generated DOT identifiers keep arbitrary user text out of DOT syntax.
  const dotIds = new Map(nodes.map((node, index) => [node.id, `n${index}`]));
  if (dotIds.size !== nodes.length) {
    throw new Error('Graphviz layout node identifiers must be unique.');
  }
  const matns = nodes.filter((node) => node.type === 'matn');
  const matnIds = new Set(matns.map((node) => node.id));
  const requestedOrder = [...new Set(matnOrder?.filter((id) => matnIds.has(id)) ?? [])];
  const orderedMatnIds = requestedOrder.length > 0
    ? [...requestedOrder, ...matns.filter((node) => !requestedOrder.includes(node.id)).map((node) => node.id)] : [];
  const attachments = matns.filter((node) => node.anchorId && dotIds.has(node.anchorId))
    .map((node) => ({ source: node.anchorId!, target: node.id }));
  const edgesByPair = new Map<string, LayoutEdge>();
  for (const { source, target } of [...narratorEdges, ...attachments]) {
    if (dotIds.has(source) && dotIds.has(target)) {
      edgesByPair.set(JSON.stringify([source, target]), { source, target });
    }
  }
  const edges = [...edgesByPair.values()].sort((a, b) => (
    a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
  ));
  const key = JSON.stringify([nodes, edges, horizontalGap, verticalGap, orderedMatnIds]);
  const cached = cachedLayouts.get(key);
  if (cached) {
    cachedLayouts.delete(key);
    cachedLayouts.set(key, cached);
    return copyPositions(cached);
  }

  // Matching groups let dot prefer vertical collector/card edges itself.
  const columnByAnchor = new Map<string, string>();
  for (const attachment of attachments) {
    if (!columnByAnchor.has(attachment.source)) {
      columnByAnchor.set(attachment.source, `column${columnByAnchor.size}`);
    }
  }
  const dot = [
    'digraph layout {',
    `graph [rankdir=TB, nodesep=${inches(horizontalGap)}, ranksep=${inches(verticalGap)}, margin=0, pad=0, splines=false];`,
    'node [shape=box, label="", fixedsize=true, margin=0];',
    ...nodes.map((node) => {
      const column = columnByAnchor.get(node.type === 'matn' ? node.anchorId ?? '' : node.id);
      return `${dotIds.get(node.id)} [id="${encodeURIComponent(node.id)}", width=${inches(node.width)}, height=${inches(node.height)}`
        + `${column ? `, group=${column}` : ''}];`;
    }),
    ...edges.map(({ source, target }) => `${dotIds.get(source)} -> ${dotIds.get(target)};`),
    ...(matns.length > 0
      ? [`{ rank=sink; ${matns.map((node) => dotIds.get(node.id)).join('; ')}; }`]
      : []),
    // Flat invisible edges constrain only the matn rank's reading order. Dot
    // still positions every node and reserves clearance for the real cards.
    ...(orderedMatnIds.length > 1
      ? [`${orderedMatnIds.map((id) => dotIds.get(id)).join(' -> ')} [style=invis, weight=100];`]
      : []),
    '}',
  ].join('\n');

  const rendered = viz.renderJSON(dot, { engine: 'dot', yInvert: true }) as GraphvizOutput;
  const pointsByDotId = new Map<string, Point>();
  for (const node of rendered.objects ?? []) {
    if (typeof node.name !== 'string' || typeof node.pos !== 'string') continue;
    const [x, y] = node.pos.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) pointsByDotId.set(node.name, { x, y });
  }
  const positions = new Map<string, Point>();
  for (const node of nodes) {
    const point = pointsByDotId.get(dotIds.get(node.id)!);
    if (!point) {
      throw new Error('Graphviz did not return a position for every graph node.');
    }
    positions.set(node.id, point);
  }

  cachedLayouts.set(key, copyPositions(positions));
  if (cachedLayouts.size > MAX_CACHED_LAYOUTS) {
    cachedLayouts.delete(cachedLayouts.keys().next().value!);
  }
  return positions;
}
