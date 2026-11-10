import type { Viz } from '@viz-js/viz';
import { countEdgeCrossings } from './edgeCrossings';
import { getVerticalCurvePoints } from './edgeGeometry';
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

export interface GraphvizGraphLayout {
  positions: Map<string, Point>;
  /** Cubic chains for real edges, keyed by graphvizEdgeKey(source, target). */
  routes: Map<string, Point[]>;
}

export function graphvizEdgeKey(source: string, target: string): string {
  return JSON.stringify([source, target]);
}

let viz: Viz | undefined;
let initialization: Promise<void> | undefined;
const cachedLayouts = new Map<string, GraphvizGraphLayout>();

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

function copyLayout(layout: GraphvizGraphLayout): GraphvizGraphLayout {
  return {
    positions: copyPositions(layout.positions),
    routes: new Map([...layout.routes].map(([key, points]) => [key, points.map((point) => ({ ...point }))])),
  };
}

function inches(pixels: number): string {
  if (!Number.isFinite(pixels) || pixels < 0) {
    throw new Error('Graphviz layout dimensions must be finite and non-negative.');
  }
  return (pixels / POINTS_PER_INCH).toFixed(9);
}

interface GraphvizOutput {
  objects?: Array<{ name?: string; pos?: string; _gvid?: number }>;
  edges?: Array<{
    tail?: number;
    head?: number;
    style?: string;
    _draw_?: Array<{ op?: string; points?: number[][] }>;
  }>;
}

function getPositions(rendered: GraphvizOutput, nodes: GraphvizLayoutNode[], dotIds: Map<string, string>): Map<string, Point> {
  const pointsByDotId = new Map<string, Point>();
  for (const node of rendered.objects ?? []) {
    if (typeof node.name !== 'string' || typeof node.pos !== 'string') continue;
    const [x, y] = node.pos.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) pointsByDotId.set(node.name, { x, y });
  }
  const positions = new Map<string, Point>();
  for (const node of nodes) {
    const point = pointsByDotId.get(dotIds.get(node.id)!);
    if (!point) throw new Error('Graphviz did not return a position for every graph node.');
    positions.set(node.id, point);
  }
  return positions;
}

function getRoutes(
  rendered: GraphvizOutput,
  nodes: GraphvizLayoutNode[],
  edges: LayoutEdge[],
  dotIds: Map<string, string>,
  positions: Map<string, Point>,
  reversed: boolean,
): Map<string, Point[]> | null {
  const idsByDotId = new Map([...dotIds].map(([id, dotId]) => [dotId, id]));
  const idsByGraphvizIndex = new Map<number, string>();
  for (const node of rendered.objects ?? []) {
    const id = typeof node.name === 'string' ? idsByDotId.get(node.name) : undefined;
    if (id !== undefined && typeof node._gvid === 'number') idsByGraphvizIndex.set(node._gvid, id);
  }
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edgeKeys = new Set(edges.map(({ source, target }) => graphvizEdgeKey(source, target)));
  const routes = new Map<string, Point[]>();
  for (const edge of rendered.edges ?? []) {
    if (edge.style === 'invis' || typeof edge.tail !== 'number' || typeof edge.head !== 'number') continue;
    const source = idsByGraphvizIndex.get(reversed ? edge.head : edge.tail);
    const target = idsByGraphvizIndex.get(reversed ? edge.tail : edge.head);
    if (source === undefined || target === undefined || !edgeKeys.has(graphvizEdgeKey(source, target))) continue;
    const rawPoints = edge._draw_?.find((draw) => draw.op === 'b' || draw.op === 'B')?.points;
    if (!Array.isArray(rawPoints) || rawPoints.length < 4 || (rawPoints.length - 1) % 3 !== 0
      || rawPoints.some((point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) return null;
    const points = rawPoints.map(([x, y]) => ({ x, y }));
    if (reversed) points.reverse();
    // DOT reserves badge space in narrator widths. Compass ports keep routes
    // on the actual top/bottom borders; use our precise border coordinates so
    // SVG arrowheads are not left with Graphviz's clipping/arrowhead gap.
    points[0] = { x: positions.get(source)!.x, y: positions.get(source)!.y + nodesById.get(source)!.height / 2 };
    points[points.length - 1] = { x: positions.get(target)!.x, y: positions.get(target)!.y - nodesById.get(target)!.height / 2 };
    routes.set(graphvizEdgeKey(source, target), points);
  }
  return routes.size === edges.length ? routes : null;
}

function validOrderAndDirection(positions: Map<string, Point>, orderedMatnIds: string[], edges: LayoutEdge[]): boolean {
  return orderedMatnIds.every((id, index) => index === 0 || positions.get(id)!.x > positions.get(orderedMatnIds[index - 1])!.x)
    && edges.every(({ source, target }) => positions.get(source)!.y < positions.get(target)!.y);
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
  return layoutGraphvizGraphWithRoutes(inputNodes, narratorEdges, horizontalGap, verticalGap, matnOrder).positions;
}

export function layoutGraphvizGraphWithRoutes(
  inputNodes: GraphvizLayoutNode[],
  narratorEdges: LayoutEdge[],
  horizontalGap: number,
  verticalGap: number,
  matnOrder?: string[],
): GraphvizGraphLayout {
  if (!viz) {
    throw new Error('Graphviz layout has not been initialized.');
  }
  if (inputNodes.length === 0) return { positions: new Map(), routes: new Map() };

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
      edgesByPair.set(graphvizEdgeKey(source, target), { source, target });
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
    return copyLayout(cached);
  }

  // Matching groups let dot prefer vertical collector/card edges itself.
  const columnByAnchor = new Map<string, string>();
  for (const attachment of attachments) {
    if (!columnByAnchor.has(attachment.source)) {
      columnByAnchor.set(attachment.source, `column${columnByAnchor.size}`);
    }
  }
  const makeDot = (mode: 'baseline' | 'top-down' | 'bottom-up'): string => {
    const routed = mode !== 'baseline';
    const reversed = mode === 'bottom-up';
    return [
    'digraph layout {',
    `graph [rankdir=${reversed ? 'BT' : 'TB'}, ${routed ? 'mclimit=5, ' : ''}nodesep=${inches(horizontalGap)}, ranksep=${inches(verticalGap)}, margin=0, pad=0, splines=${routed ? 'polyline' : 'false'}];`,
    ...(routed ? [`edge [dir=none, tailport=${reversed ? 'n' : 's'}, headport=${reversed ? 's' : 'n'}];`] : []),
    'node [shape=box, label="", fixedsize=true, margin=0];',
    ...nodes.map((node) => {
      const column = columnByAnchor.get(node.type === 'matn' ? node.anchorId ?? '' : node.id);
      return `${dotIds.get(node.id)} [id="${encodeURIComponent(node.id)}", width=${inches(node.width)}, height=${inches(node.height)}`
        + `${column && !reversed ? `, group=${column}` : ''}];`;
    }),
    ...edges.map(({ source, target }) => reversed
      ? `${dotIds.get(target)} -> ${dotIds.get(source)};`
      : `${dotIds.get(source)} -> ${dotIds.get(target)};`),
    ...(matns.length > 0
      ? [`{ rank=${reversed ? 'source' : 'sink'}; ${matns.map((node) => dotIds.get(node.id)).join('; ')}; }`]
      : []),
    // Flat invisible edges constrain only the matn rank's reading order. Dot
    // still positions every node and reserves clearance for the real cards.
    ...(orderedMatnIds.length > 1
      ? [`${orderedMatnIds.map((id) => dotIds.get(id)).join(' -> ')} [style=invis, weight=100];`]
      : []),
    '}',
  ].join('\n');
  };

  const rendered = viz.renderJSON(makeDot('baseline'), { engine: 'dot', yInvert: true }) as GraphvizOutput;
  let best: GraphvizGraphLayout = { positions: getPositions(rendered, nodes, dotIds), routes: new Map() };
  if (orderedMatnIds.length >= 2) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    let bestScore = countEdgeCrossings(edges.map(({ source, target }) => ({
      source, target,
      points: getVerticalCurvePoints(
        { x: best.positions.get(source)!.x, y: best.positions.get(source)!.y + nodesById.get(source)!.height / 2 },
        { x: best.positions.get(target)!.x, y: best.positions.get(target)!.y - nodesById.get(target)!.height / 2 },
      ),
    })));
    // Keep the matn order fixed while trying DOT from both ends of the DAG.
    // Score the paths that will actually be drawn, not just rank inversions.
    for (const mode of ['top-down', 'bottom-up'] as const) {
      if (bestScore === 0) break;
      try {
        const candidateOutput = viz.renderJSON(makeDot(mode), { engine: 'dot', yInvert: true }) as GraphvizOutput;
        const positions = getPositions(candidateOutput, nodes, dotIds);
        if (!validOrderAndDirection(positions, orderedMatnIds, edges)) continue;
        const routes = getRoutes(candidateOutput, nodes, edges, dotIds, positions, mode === 'bottom-up');
        if (!routes) continue;
        const score = countEdgeCrossings(edges.map(({ source, target }) => ({
          source, target, points: routes.get(graphvizEdgeKey(source, target))!,
        })));
        if (score < bestScore) {
          best = { positions, routes };
          bestScore = score;
        }
      } catch {
        // Optional optimization must not prevent a valid original layout.
      }
    }
  }

  cachedLayouts.set(key, copyLayout(best));
  if (cachedLayouts.size > MAX_CACHED_LAYOUTS) {
    cachedLayouts.delete(cachedLayouts.keys().next().value!);
  }
  return copyLayout(best);
}
