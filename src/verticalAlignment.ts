import type { LayoutEdge, LayoutFootprint, LayoutLayer, Point } from './layerPlacement';
import { centerStudents } from './studentCentering';

interface Separation {
  left: string;
  right: string;
  distance: number;
}

function reaches(graph: Map<string, Set<string>>, source: string, target: string): boolean {
  const pending = [source];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (id === target) {
      return true;
    }
    if (!seen.has(id)) {
      seen.add(id);
      pending.push(...(graph.get(id) ?? []));
    }
  }
  return false;
}

function isAcyclic(graph: Map<string, Set<string>>): boolean {
  const indegree = new Map([...graph.keys()].map((id) => [id, 0]));
  for (const neighbors of graph.values()) {
    for (const id of neighbors) indegree.set(id, (indegree.get(id) ?? 0) + 1);
  }
  const order = [...indegree.keys()].filter((id) => indegree.get(id) === 0);
  for (let index = 0; index < order.length; index += 1) {
    for (const id of graph.get(order[index]) ?? []) {
      indegree.set(id, indegree.get(id)! - 1);
      if (indegree.get(id) === 0) order.push(id);
    }
  }
  return order.length === indegree.size;
}

/** Make room for crowded ranks by moving whole private chains together. */
export function alignVerticalChains(
  layers: LayoutLayer[],
  edges: LayoutEdge[],
  preferred: Map<string, Point>,
  gap: number,
  footprints: LayoutFootprint[] = [],
  refineCentering = true,
): Map<string, Point> {
  const rank = new Map(layers.flatMap((layer, index) => layer.nodes.map((node) => [node.id, index] as const)));
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  for (const { source, target } of edges) {
    if (!rank.has(source) || !rank.has(target)) {
      continue;
    }
    if (!parents.has(target)) parents.set(target, new Set());
    if (!children.has(source)) children.set(source, new Set());
    parents.get(target)!.add(source);
    children.get(source)!.add(target);
  }

  const separations: Separation[] = layers.flatMap((layer) => layer.nodes.slice(1).map((node, index) => ({
    left: layer.nodes[index].id,
    right: node.id,
    distance: (layer.nodes[index].width + node.width) / 2 + gap,
  })));
  let groups = new Map([...rank.keys()].map((id) => [id, id]));
  const root = (id: string): string => {
    let result = id;
    while (groups.get(result) !== result) result = groups.get(result)!;
    let current = id;
    while (current !== result) {
      const next = groups.get(current)!;
      groups.set(current, result);
      current = next;
    }
    return result;
  };

  const candidates = edges.filter(({ source, target }) => (
    rank.has(source) && rank.has(target) && rank.get(source)! < rank.get(target)!
    && children.get(source)?.size === 1 && parents.get(target)?.size === 1
  )).sort((a, b) => (
    rank.get(a.source)! - rank.get(b.source)!
    || a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
  ));

  if (!refineCentering && footprints.length === 0
    && candidates.every(({ source, target }) => preferred.get(source)!.x === preferred.get(target)!.x)) {
    return preferred;
  }

  const spacingGraph = (): Map<string, Set<string>> => {
    const ordered = new Map<string, Set<string>>();
    for (const { left, right } of separations) {
      const l = root(left);
      const r = root(right);
      if (!ordered.has(l)) ordered.set(l, new Set());
      ordered.get(l)!.add(r);
    }
    return ordered;
  };

  // Most orders permit all private chains to align. Check that in one pass;
  // only conflicting orders need the more expensive merge-by-merge checks.
  for (const { source, target } of candidates) groups.set(root(target), root(source));
  if (!isAcyclic(spacingGraph())) {
    groups = new Map([...rank.keys()].map((id) => [id, id]));
    for (const { source, target } of candidates) {
      const a = root(source);
      const b = root(target);
      if (a === b) continue;
      const ordered = spacingGraph();
      // Identifying blocks already ordered relative to each other would make
      // spacing impossible. Keep that particular chain bent instead.
      if (!reaches(ordered, a, b) && !reaches(ordered, b, a)) groups.set(b, a);
    }
  }

  const targets = new Map<string, { sum: number; count: number }>();
  for (const [id, point] of preferred) {
    const group = root(id);
    const previous = targets.get(group) ?? { sum: 0, count: 0 };
    targets.set(group, { sum: previous.sum + point.x, count: previous.count + 1 });
  }
  const outgoing = new Map([...targets.keys()].map((id) => [id, new Map<string, number>()]));
  const indegree = new Map([...targets.keys()].map((id) => [id, 0]));
  for (const { left, right, distance } of separations) {
    const a = root(left);
    const b = root(right);
    const neighbors = outgoing.get(a)!;
    if (!neighbors.has(b)) indegree.set(b, indegree.get(b)! + 1);
    neighbors.set(b, Math.max(neighbors.get(b) ?? 0, distance));
  }

  // Prefer finishing a branch before starting its neighbor, even when their
  // collectors occupy different ranks. Comparing column centers alone can put
  // a short route's matn between the leaves of a wider neighboring branch.
  // Row separations still take precedence through the topological sort below.
  const branchPriority = new Map<string, number>();
  if (footprints.length > 0) {
    const visited = new Set<string>();
    for (const start of rank.keys()) {
      const stack = [start];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const group = root(id);
        if (!branchPriority.has(group)) branchPriority.set(group, branchPriority.size);
        const descendants = [...(children.get(id) ?? [])].sort((a, b) => (
          preferred.get(a)!.x - preferred.get(b)!.x
          || rank.get(a)! - rank.get(b)! || a.localeCompare(b)
        ));
        stack.push(...descendants.reverse());
      }
    }
  }

  const compareTargets = (a: string, b: string): number => {
    const left = targets.get(a)!;
    const right = targets.get(b)!;
    return (branchPriority.get(a) ?? 0) - (branchPriority.get(b) ?? 0)
      || left.sum / left.count - right.sum / right.count || a.localeCompare(b);
  };
  const pending = [...targets.keys()].filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (pending.length > 0) {
    pending.sort(compareTargets);
    const current = pending.shift()!;
    order.push(current);
    for (const id of outgoing.get(current)!.keys()) {
      indegree.set(id, indegree.get(id)! - 1);
      if (indegree.get(id) === 0) pending.push(id);
    }
  }

  // Collectors may finish on different ranks. Their text cards still occupy a
  // shared row, so reserve that width between collector columns globally. Use
  // a topological extension of existing row constraints to avoid adding cycles.
  const footprintWidths = new Map<string, number>();
  for (const { anchor, width } of footprints) {
    if (rank.has(anchor)) {
      const group = root(anchor);
      footprintWidths.set(group, Math.max(footprintWidths.get(group) ?? 0, width));
    }
  }
  const columns = order.filter((id) => footprintWidths.has(id));
  for (let index = 1; index < columns.length; index += 1) {
    const left = columns[index - 1];
    const right = columns[index];
    const distance = (footprintWidths.get(left)! + footprintWidths.get(right)!) / 2 + gap;
    const neighbors = outgoing.get(left)!;
    neighbors.set(right, Math.max(neighbors.get(right) ?? 0, distance));
  }

  const rightward = new Map([...targets].map(([id, { sum, count }]) => [id, sum / count]));
  const leftward = new Map(rightward);
  for (const id of order) {
    for (const [next, distance] of outgoing.get(id)!) {
      rightward.set(next, Math.max(rightward.get(next)!, rightward.get(id)! + distance));
    }
  }
  for (const id of [...order].reverse()) {
    for (const [next, distance] of outgoing.get(id)!) {
      leftward.set(id, Math.min(leftward.get(id)!, leftward.get(next)! - distance));
    }
  }

  // Both directional compactions satisfy every spacing constraint, so their
  // midpoint does too. Balancing them avoids moving all crowded branches right.
  const balanced = new Map([...targets.keys()].map((group) => [
    group, (leftward.get(group)! + rightward.get(group)!) / 2,
  ]));
  const centered = refineCentering ? centerStudents(layers, children, root, balanced, outgoing) : balanced;
  return new Map([...preferred].map(([id, point]) => [id, { x: centered.get(root(id))!, y: point.y }]));
}
