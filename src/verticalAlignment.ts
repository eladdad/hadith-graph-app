import type { LayoutEdge, LayoutFootprint, LayoutLayer, Point } from './layerPlacement';

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

/** Preserve report provenance when distinct incoming paths later merge. */
function prepareReportOrder(
  layers: LayoutLayer[],
  preferred: Map<string, Point>,
  rank: Map<string, number>,
  gap: number,
  footprints: LayoutFootprint[],
): { layers: LayoutLayer[]; constraints: Separation[] } {
  if (!footprints.some((footprint) => footprint.path?.length)) {
    return { layers, constraints: [] };
  }

  const compareNodes = (a: string, b: string): number => (
    preferred.get(a)!.x - preferred.get(b)!.x
    || rank.get(a)! - rank.get(b)! || a.localeCompare(b)
  );
  const comparePaths = (a: string[], b: string[]): number => {
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      if (a[index] !== b[index]) return compareNodes(a[index], b[index]);
    }
    return a.length - b.length;
  };
  const columnsByAnchor = new Map<string, { anchor: string; width: number; path: string[] }>();
  for (const footprint of footprints) {
    if (!rank.has(footprint.anchor)) continue;
    const path = (footprint.path ?? []).filter((id) => rank.has(id));
    if (path.at(-1) !== footprint.anchor) path.push(footprint.anchor);
    const previous = columnsByAnchor.get(footprint.anchor);
    columnsByAnchor.set(footprint.anchor, {
      anchor: footprint.anchor,
      width: Math.max(previous?.width ?? 0, footprint.width),
      path: previous && comparePaths(previous.path, path) <= 0 ? previous.path : path,
    });
  }
  const columns = [...columnsByAnchor.values()].sort((a, b) => (
    comparePaths(a.path, b.path) || a.anchor.localeCompare(b.anchor)
  ));
  const precedence = new Map([...rank.keys()].map((id) => [id, new Set<string>()]));
  const constraints: Separation[] = [];
  const addPrecedence = (left: string, right: string): boolean => {
    if (left === right || reaches(precedence, right, left)) return false;
    precedence.get(left)!.add(right);
    return true;
  };

  // Report columns take precedence over a collector row order chosen without
  // knowledge of which incoming narrator path each collector continues.
  for (let index = 1; index < columns.length; index += 1) {
    const left = columns[index - 1];
    const right = columns[index];
    addPrecedence(left.anchor, right.anchor);
    constraints.push({
      left: left.anchor,
      right: right.anchor,
      distance: (left.width + right.width) / 2 + gap,
    });
  }

  // Adjacent lexicographic paths cover each boundary between incoming branch
  // groups. Retain their direction during compaction too. Equal-x branches may
  // stay aligned, but must not separate in the opposite order afterward.
  for (let index = 1; index < columns.length; index += 1) {
    const leftPath = columns[index - 1].path;
    const rightPath = columns[index].path;
    let fork = 0;
    while (fork < Math.min(leftPath.length, rightPath.length)
      && leftPath[fork] === rightPath[fork]) fork += 1;
    const left = leftPath[fork];
    const right = rightPath[fork];
    if (left === undefined || right === undefined) continue;
    const delta = preferred.get(right)!.x - preferred.get(left)!.x;
    if (delta >= -1e-6 && addPrecedence(left, right)) {
      constraints.push({ left, right, distance: Math.min(1, Math.max(0, delta)) });
    }
  }

  // Keep Graphviz's row order where it agrees with the report constraints.
  // A topological extension then gives every rank a compatible ordering before
  // private chains are contracted into shared horizontal columns.
  for (const layer of layers) {
    for (let index = 1; index < layer.nodes.length; index += 1) {
      addPrecedence(layer.nodes[index - 1].id, layer.nodes[index].id);
    }
  }
  const indegree = new Map([...rank.keys()].map((id) => [id, 0]));
  for (const neighbors of precedence.values()) {
    for (const id of neighbors) indegree.set(id, indegree.get(id)! + 1);
  }
  const pending = [...rank.keys()].filter((id) => indegree.get(id) === 0);
  const order = new Map<string, number>();
  while (pending.length > 0) {
    pending.sort(compareNodes);
    const id = pending.shift()!;
    order.set(id, order.size);
    for (const next of precedence.get(id)!) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) pending.push(next);
    }
  }
  return {
    layers: layers.map((layer) => ({
      ...layer,
      nodes: [...layer.nodes].sort((a, b) => order.get(a.id)! - order.get(b.id)!),
    })),
    constraints,
  };
}

/** Make room for crowded ranks by moving whole private chains together. */
export function alignVerticalChains(
  layers: LayoutLayer[],
  edges: LayoutEdge[],
  preferred: Map<string, Point>,
  gap: number,
  footprints: LayoutFootprint[] = [],
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

  const reportOrder = prepareReportOrder(layers, preferred, rank, gap, footprints);
  const separations: Separation[] = reportOrder.layers.flatMap((layer) => layer.nodes.slice(1).map((node, index) => ({
    left: layer.nodes[index].id,
    right: node.id,
    distance: (layer.nodes[index].width + node.width) / 2 + gap,
  }))).concat(reportOrder.constraints);
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

  if (footprints.length === 0
    && candidates.every(({ source, target }) => preferred.get(source)!.x === preferred.get(target)!.x)) {
    return preferred;
  }

  const spacingGraph = (): Map<string, Set<string>> => {
    const ordered = new Map<string, Set<string>>();
    for (const { left, right, distance } of separations) {
      const l = root(left);
      const r = root(right);
      if (l === r && distance === 0) continue;
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
    if (a === b && distance === 0) continue;
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
  return new Map([...preferred].map(([id, point]) => {
    const group = root(id);
    return [id, { x: (leftward.get(group)! + rightward.get(group)!) / 2, y: point.y }];
  }));
}
