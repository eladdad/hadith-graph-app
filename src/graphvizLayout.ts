import type { Viz } from '@viz-js/viz';
import type { LayoutEdge, LayoutFootprint, LayoutLayer, Point } from './layerPlacement';
import { alignVerticalChains } from './verticalAlignment';

const POINTS_PER_INCH = 72;
const MAX_CACHED_LAYOUTS = 8;

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
 * Let dot choose the horizontal layout, then enforce the app's exact spacing
 * and private-chain alignment. Vertical levels remain the caller's measured
 * ranks, so changing level spacing does not change the horizontal arrangement.
 */
export function layoutGraphvizLayers(
  layers: LayoutLayer[],
  inputEdges: LayoutEdge[],
  gap: number,
  inputFootprints: LayoutFootprint[] = [],
): Map<string, Point> {
  if (!viz) {
    throw new Error('Graphviz layout has not been initialized.');
  }

  const nodes = layers.flatMap((layer) => layer.nodes);
  if (nodes.length === 0) return new Map();

  // Only generated identifiers enter DOT; narrator names can contain quotes,
  // Unicode, newlines, or other characters with meaning in the DOT language.
  const dotIds = new Map(nodes.map((node, index) => [node.id, `n${index}`]));
  const edges = inputEdges.filter((edge) => dotIds.has(edge.source) && dotIds.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target }))
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  const footprintWidths = new Map<string, number>();
  for (const { anchor, width } of inputFootprints) {
    if (dotIds.has(anchor)) {
      footprintWidths.set(anchor, Math.max(footprintWidths.get(anchor) ?? 0, width));
    }
  }
  const footprints = [...footprintWidths].sort(([a], [b]) => a.localeCompare(b))
    .map(([anchor, width]) => ({ anchor, width }));
  const key = JSON.stringify([layers, edges, gap, footprints]);
  const cached = cachedLayouts.get(key);
  if (cached) {
    cachedLayouts.delete(key);
    cachedLayouts.set(key, cached);
    return copyPositions(cached);
  }

  const columnByAnchor = new Map(footprints.map(({ anchor }, index) => [anchor, `column${index}`]));
  const dot = [
    'digraph layout {',
    `graph [rankdir=TB, nodesep=${inches(gap)}, ranksep=1, margin=0, pad=0, splines=false];`,
    'node [shape=box, label="", fixedsize=true, margin=0];',
    ...nodes.map((node) => {
      const column = columnByAnchor.get(node.id);
      return `${dotIds.get(node.id)} [width=${inches(node.width)}, height=${inches(node.height)}`
        + `${column ? `, group=${column}` : ''}];`;
    }),
    ...layers.filter((layer) => layer.nodes.length > 0).map((layer) => (
      `{ rank=same; ${layer.nodes.map((node) => dotIds.get(node.id)).join('; ')}; }`
    )),
    ...edges.map(({ source, target }) => `${dotIds.get(source)} -> ${dotIds.get(target)};`),
    ...footprints.map(({ width }, index) => (
      `f${index} [width=${inches(width)}, height=0.01, style=invis, group=column${index}];`
    )),
    ...footprints.map(({ anchor }, index) => (
      `${dotIds.get(anchor)} -> f${index} [style=invis, weight=1000];`
    )),
    ...(footprints.length > 0
      ? [`{ rank=max; ${footprints.map((_, index) => `f${index}`).join('; ')}; }`]
      : []),
    '}',
  ].join('\n');

  const rendered = viz.renderJSON(dot, { engine: 'dot' }) as GraphvizOutput;
  const xByDotId = new Map<string, number>();
  for (const node of rendered.objects ?? []) {
    if (typeof node.name !== 'string' || typeof node.pos !== 'string') continue;
    const x = Number(node.pos.split(',')[0]);
    if (Number.isFinite(x)) xByDotId.set(node.name, x);
  }

  const preferred = new Map<string, Point>();
  for (const layer of layers) {
    for (const node of layer.nodes) {
      const x = xByDotId.get(dotIds.get(node.id)!);
      if (x === undefined) {
        throw new Error('Graphviz did not return a position for every narrator.');
      }
      preferred.set(node.id, { x, y: layer.y });
    }
  }
  const orderedLayers = layers.map((layer) => ({
    ...layer,
    nodes: [...layer.nodes].sort((a, b) => (
      preferred.get(a.id)!.x - preferred.get(b.id)!.x || a.id.localeCompare(b.id)
    )),
  }));

  // The invisible bottom row guides dot's crossing reduction and card widths.
  // Keep it out of compaction: its synthetic edges must not change which real
  // narrator chains have one parent/child, and matns attach to collectors exactly.
  const positions = alignVerticalChains(orderedLayers, edges, preferred, gap, footprints);
  cachedLayouts.set(key, copyPositions(positions));
  if (cachedLayouts.size > MAX_CACHED_LAYOUTS) {
    cachedLayouts.delete(cachedLayouts.keys().next().value!);
  }
  return positions;
}
