import { positionLayers } from './layerPlacement';
import type { LayoutEdge, LayoutFootprint, LayoutLayer, Point } from './layerPlacement';

interface Segment extends LayoutEdge {
  start: Point;
  end: Point;
}

interface Score {
  crossings: number;
  horizontalSpan: number;
}

const SWEEP_COUNT = 8;
const TRANSPOSE_PAIR_BUDGET = 2_000_000;
const MAX_TRANSPOSE_ATTEMPTS = 600;

// Dragging changes saved positions, not automatic ordering. Reuse the order
// while the topology and node dimensions stay the same.
let cachedOrder: { key: string; rows: string[][] } | undefined;

function copyLayers(layers: LayoutLayer[]): LayoutLayer[] {
  return layers.map((layer) => ({ ...layer, nodes: [...layer.nodes] }));
}

function intersects(a: Segment, b: Segment): boolean {
  if (a.source === b.source || a.source === b.target || a.target === b.source || a.target === b.target) {
    return false;
  }

  const rx = a.end.x - a.start.x;
  const ry = a.end.y - a.start.y;
  const sx = b.end.x - b.start.x;
  const sy = b.end.y - b.start.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) {
    return false;
  }

  const dx = b.start.x - a.start.x;
  const dy = b.start.y - a.start.y;
  const t = (dx * sy - dy * sx) / denominator;
  const u = (dx * ry - dy * rx) / denominator;
  // Shared endpoints and collinear segments are not proper crossings.
  return t > 1e-8 && t < 1 - 1e-8 && u > 1e-8 && u < 1 - 1e-8;
}

function score(layers: LayoutLayer[], edges: LayoutEdge[], gap: number, footprints: LayoutFootprint[]): Score {
  // Keep trial placements cheap. The chosen order receives final student
  // centering once, with its node and matn separation constraints intact.
  const centers = positionLayers(layers, edges, gap, footprints, false);
  const heights = new Map(layers.flatMap((layer) => layer.nodes.map((node) => [node.id, node.height] as const)));
  const segments: Segment[] = [];
  let horizontalSpan = 0;

  for (const edge of edges) {
    const source = centers.get(edge.source);
    const target = centers.get(edge.target);
    if (!source || !target) {
      continue;
    }

    const direction = target.y >= source.y ? 1 : -1;
    segments.push({
      ...edge,
      start: { x: source.x, y: source.y + direction * (heights.get(edge.source) ?? 0) / 2 },
      end: { x: target.x, y: target.y - direction * (heights.get(edge.target) ?? 0) / 2 },
    });
    horizontalSpan += (target.x - source.x) ** 2;
  }

  let crossings = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (intersects(segments[i], segments[j])) {
        crossings += 1;
      }
    }
  }
  return { crossings, horizontalSpan };
}

function improves(candidate: Score, previous: Score): boolean {
  return candidate.crossings < previous.crossings
    || (candidate.crossings === previous.crossings && candidate.horizontalSpan < previous.horizontalSpan);
}

/** Seed branches from their fixed descendants before crossing-reduction sweeps. */
function orderTowardFixedRows(layers: LayoutLayer[], edges: LayoutEdge[], fixedRows: Set<number>, gap: number): void {
  const rank = new Map(layers.flatMap((layer, index) => layer.nodes.map((node) => [node.id, index] as const)));
  const successors = new Map<string, string[]>();
  for (const { source, target } of edges) {
    if ((rank.get(target) ?? -1) > (rank.get(source) ?? Infinity)) {
      successors.set(source, [...(successors.get(source) ?? []), target]);
    }
  }
  const fixedX = new Map<string, number>();
  const descendants = new Map<string, Set<string>>();
  for (const index of fixedRows) {
    let x = 0;
    for (const node of layers[index]?.nodes ?? []) {
      fixedX.set(node.id, x + node.width / 2);
      descendants.set(node.id, new Set([node.id]));
      x += node.width + gap;
    }
  }
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    if (fixedRows.has(index)) continue;
    const weighted = layers[index].nodes.map((node, previousIndex) => {
      const targets = new Set((successors.get(node.id) ?? []).flatMap((id) => [...(descendants.get(id) ?? [])]));
      descendants.set(node.id, targets);
      return {
        node,
        previousIndex,
        target: targets.size > 0
          ? [...targets].reduce((sum, id) => sum + fixedX.get(id)!, 0) / targets.size
          : previousIndex * gap,
      };
    });
    weighted.sort((a, b) => a.target - b.target || a.previousIndex - b.previousIndex);
    layers[index].nodes = weighted.map(({ node }) => node);
  }
}

/**
 * Order existing ranks without changing their levels or spacing. Barycenter
 * sweeps explore orders; actual straight-edge crossings decide which to keep,
 * including edges that span several ranks. This matches the current renderer
 * rather than assuming edges follow virtual nodes in intervening ranks.
 */
export function orderLayers(
  input: LayoutLayer[],
  inputEdges: LayoutEdge[],
  gap: number,
  inputFootprints: LayoutFootprint[] = [],
  inputFixedRows: readonly number[] = [],
): string[][] {
  const edges = [...inputEdges].sort((a, b) => (
    a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
  ));
  const footprints = [...inputFootprints].sort((a, b) => a.anchor.localeCompare(b.anchor));
  const fixedRows = new Set(inputFixedRows);
  const key = JSON.stringify([input, edges, gap, footprints, [...fixedRows].sort((a, b) => a - b)]);
  if (cachedOrder?.key === key) {
    return cachedOrder.rows.map((row) => [...row]);
  }

  let layers = copyLayers(input);
  let best = copyLayers(layers);
  let bestScore = score(best, edges, gap, footprints);
  if (fixedRows.size > 0) {
    orderTowardFixedRows(layers, edges, fixedRows, gap);
    const candidate = score(layers, edges, gap, footprints);
    if (improves(candidate, bestScore)) {
      best = copyLayers(layers);
      bestScore = candidate;
    }
  }
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const { source, target } of edges) {
    predecessors.set(target, [...(predecessors.get(target) ?? []), source]);
    successors.set(source, [...(successors.get(source) ?? []), target]);
  }

  for (let sweep = 0; sweep < SWEEP_COUNT && bestScore.crossings > 0; sweep += 1) {
    const neighbors = sweep % 2 === 0 ? predecessors : successors;
    const indices = layers.map((_, index) => index);
    if (sweep % 2 === 1) {
      indices.reverse();
    }

    // Fixed sinks already provide a stable reading direction. Reuse one
    // placement through this exploratory sweep; full placements still score
    // every candidate. Recompacting every rank makes large fixed-sink graphs
    // unnecessarily expensive, especially when private chains conflict.
    const sweepCenters = fixedRows.size > 0 ? positionLayers(layers, edges, gap, footprints, false) : undefined;
    for (const index of indices) {
      if (fixedRows.has(index)) continue;
      const centers = sweepCenters ?? positionLayers(layers, edges, gap, footprints, false);
      const weighted = layers[index].nodes.map((node, previousIndex) => {
        const xs = (neighbors.get(node.id) ?? []).flatMap((id) => {
          const center = centers.get(id);
          return center ? [center.x] : [];
        });
        return {
          node,
          previousIndex,
          barycenter: xs.length > 0
            ? xs.reduce((sum, x) => sum + x, 0) / xs.length
            : centers.get(node.id)?.x ?? 0,
        };
      });
      weighted.sort((a, b) => a.barycenter - b.barycenter || a.previousIndex - b.previousIndex);
      layers[index].nodes = weighted.map(({ node }) => node);
    }

    const candidate = score(layers, edges, gap, footprints);
    if (improves(candidate, bestScore)) {
      best = copyLayers(layers);
      bestScore = candidate;
    }
  }

  layers = best;
  // Bound quadratic scoring work for large collections. Small graphs get two
  // bidirectional local-swap passes; larger graphs still get the sweeps.
  const pairs = Math.max(1, edges.length * (edges.length - 1) / 2);
  let attempts = Math.min(MAX_TRANSPOSE_ATTEMPTS, Math.floor(TRANSPOSE_PAIR_BUDGET / pairs));
  for (let pass = 0; pass < 4 && attempts > 0; pass += 1) {
    let changed = false;
    const indices = layers.map((_, index) => index);
    if (pass % 2 === 1) {
      indices.reverse();
    }
    for (const index of indices) {
      if (fixedRows.has(index)) continue;
      const nodes = layers[index].nodes;
      for (let step = 0; step < nodes.length - 1 && attempts > 0; step += 1) {
        const left = pass % 2 === 0 ? step : nodes.length - 2 - step;
        [nodes[left], nodes[left + 1]] = [nodes[left + 1], nodes[left]];
        attempts -= 1;
        const candidate = score(layers, edges, gap, footprints);
        if (improves(candidate, bestScore)) {
          bestScore = candidate;
          changed = true;
        } else {
          [nodes[left], nodes[left + 1]] = [nodes[left + 1], nodes[left]];
        }
      }
    }
    if (!changed) {
      break;
    }
  }

  const rows = layers.map((layer) => layer.nodes.map((node) => node.id));
  cachedOrder = { key, rows };
  return rows.map((row) => [...row]);
}
