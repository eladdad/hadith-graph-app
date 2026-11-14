import type { LayoutEdge, LayoutFootprint, LayoutLayer, Point } from './layerPlacement';

interface Column {
  id: string;
  nodes: string[];
  depth: number;
  ordinal: number;
  width: number;
  footprint: number;
}

let cached: { key: string; positions: Map<string, Point> } | undefined;

function copyPositions(positions: Map<string, Point>): Map<string, Point> {
  return new Map([...positions].map(([id, point]) => [id, { ...point }]));
}

/**
 * Reserve descendant columns first, then place narrators above their students.
 * A redundant transmission is a cross-link for placement only: the caller
 * retains the complete edge set for drawing, selection and report provenance.
 */
export function layoutBottomUp(
  layers: LayoutLayer[],
  inputEdges: LayoutEdge[],
  gap: number,
  footprints: LayoutFootprint[] = [],
  fixedRows: number[] = [],
): Map<string, Point> {
  const edges = [...new Map(inputEdges.map(({ source, target }) => [
    JSON.stringify([source, target]), { source, target },
  ])).values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  const key = JSON.stringify([layers, edges, gap, footprints, fixedRows]);
  if (cached?.key === key) return copyPositions(cached.positions);
  const nodes = new Map(layers.flatMap((layer, rank) => layer.nodes.map((node, ordinal) => [
    node.id, { ...node, rank, ordinal, y: layer.y },
  ] as const)));
  if (nodes.size === 0) return new Map();
  const ordinal = new Map([...nodes.keys()].map((id, index) => [id, index]));
  const children = new Map([...nodes.keys()].map((id) => [id, new Set<string>()]));
  for (const { source, target } of edges) {
    if (nodes.has(source) && nodes.has(target) && nodes.get(source)!.rank < nodes.get(target)!.rank) {
      children.get(source)!.add(target);
    }
  }

  // Longest-path ranks come from the full graph. Removing a direct edge only
  // when another forward route reaches its target preserves reachability and
  // those ranks, without counting the same descendant as a second branch.
  const descendants = new Map<string, Set<string>>();
  for (const layer of [...layers].reverse()) {
    for (const node of layer.nodes) {
      const reachable = new Set<string>();
      for (const child of children.get(node.id)!) {
        reachable.add(child);
        for (const descendant of descendants.get(child) ?? []) reachable.add(descendant);
      }
      descendants.set(node.id, reachable);
    }
  }
  for (const [id, targets] of children) {
    const direct = [...targets];
    children.set(id, new Set(direct.filter((target) => !direct.some((other) => (
      other !== target && descendants.get(other)!.has(target)
    )))));
  }
  const parents = new Map([...nodes.keys()].map((id) => [id, new Set<string>()]));
  for (const [source, targets] of children) for (const target of targets) parents.get(target)!.add(source);

  // Treat each exclusive chain as one movable column, including collectors
  // at different depths. No subsequent clearance adjustment can bend it.
  const groups = new Map([...nodes.keys()].map((id) => [id, id]));
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
  for (const [source, targets] of children) {
    if (targets.size !== 1) continue;
    const target = [...targets][0];
    if (parents.get(target)!.size === 1) groups.set(root(target), root(source));
  }
  const columns = new Map<string, Column>();
  for (const [id, node] of nodes) {
    const group = root(id);
    const column = columns.get(group) ?? {
      id: group, nodes: [], depth: node.rank, ordinal: ordinal.get(id)!, width: 0, footprint: 0,
    };
    column.nodes.push(id);
    column.depth = Math.max(column.depth, node.rank);
    column.width = Math.max(column.width, node.width);
    columns.set(group, column);
  }
  for (const { anchor, width } of footprints) {
    if (nodes.has(anchor)) {
      const column = columns.get(root(anchor))!;
      // Several default matns at one column stack vertically; they need the
      // widest footprint, not a separate horizontal allocation for each card.
      column.footprint = Math.max(column.footprint, width);
    }
  }
  const nextColumns = new Map([...columns.keys()].map((id) => [id, new Set<string>()]));
  const previousColumns = new Map([...columns.keys()].map((id) => [id, new Set<string>()]));
  for (const [source, targets] of children) for (const target of targets) {
    const from = root(source);
    const to = root(target);
    if (from !== to) {
      nextColumns.get(from)!.add(to);
      previousColumns.get(to)!.add(from);
    }
  }
  const compareColumns = (a: string, b: string): number => columns.get(a)!.ordinal - columns.get(b)!.ordinal;
  const terminalOrder: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const next = [...nextColumns.get(id)!].sort(compareColumns);
    if (next.length === 0) terminalOrder.push(id);
    for (const child of next) visit(child);
  };
  for (const id of [...columns.keys()].filter((id) => previousColumns.get(id)!.size === 0).sort(compareColumns)) visit(id);
  for (const id of [...columns.keys()].sort(compareColumns)) visit(id);
  const fixedTerminals = [...new Set(fixedRows.flatMap((rank) => (
    layers[rank]?.nodes.map((node) => root(node.id)).filter((id) => nextColumns.get(id)!.size === 0) ?? []
  )))];
  const fixedSet = new Set(fixedTerminals);
  const terminals = [...fixedTerminals, ...terminalOrder.filter((id) => !fixedSet.has(id))];
  const positions = new Map<string, number>();
  let cursor = 0;
  for (const id of terminals) {
    const column = columns.get(id)!;
    const width = Math.max(column.width, column.footprint);
    positions.set(id, cursor + width / 2);
    cursor += width + gap;
  }

  const bottomUp = [...columns.keys()].sort((a, b) => (
    columns.get(b)!.depth - columns.get(a)!.depth || compareColumns(a, b)
  ));
  const targetFor = (id: string): number | undefined => {
    const centers: number[] = [];
    for (const parent of columns.get(id)!.nodes) {
      const byRank = new Map<number, string[]>();
      for (const child of children.get(parent)!) {
        if (root(child) === id) continue;
        const rank = nodes.get(child)!.rank;
        byRank.set(rank, [...(byRank.get(rank) ?? []), child]);
      }
      for (const [, students] of [...byRank].sort(([a], [b]) => a - b)) {
        const left = Math.min(...students.map((child) => (
          positions.get(root(child))! - (nodes.get(child)!.visibleWidth ?? nodes.get(child)!.width) / 2
        )));
        const right = Math.max(...students.map((child) => (
          positions.get(root(child))! + (nodes.get(child)!.visibleWidth ?? nodes.get(child)!.width) / 2
        )));
        centers.push((left + right) / 2);
      }
    }
    return centers.length > 0 ? centers.reduce((sum, x) => sum + x, 0) / centers.length : undefined;
  };
  for (const id of bottomUp) positions.set(id, targetFor(id) ?? positions.get(id)!);

  // Derive a new row order from descendant positions. A consistent tie-break
  // across ranks keeps all separation constraints acyclic, including columns
  // spanning several ranks; unrelated columns do not acquire artificial gaps.
  const horizontalOrder = [...columns.keys()].sort((a, b) => (
    positions.get(a)! - positions.get(b)! || compareColumns(a, b)
  ));
  const horizontalIndex = new Map(horizontalOrder.map((id, index) => [id, index]));
  const outgoing = new Map(horizontalOrder.map((id) => [id, new Map<string, number>()]));
  const incoming = new Map(horizontalOrder.map((id) => [id, new Map<string, number>()]));
  const separate = (left: string, right: string, distance: number): void => {
    if (left === right) return;
    const required = Math.max(outgoing.get(left)!.get(right) ?? 0, distance);
    outgoing.get(left)!.set(right, required);
    incoming.get(right)!.set(left, required);
  };
  for (const layer of layers) {
    const row = [...layer.nodes].sort((a, b) => horizontalIndex.get(root(a.id))! - horizontalIndex.get(root(b.id))!);
    for (let index = 1; index < row.length; index += 1) {
      separate(root(row[index - 1].id), root(row[index].id), (row[index - 1].width + row[index].width) / 2 + gap);
    }
  }
  const cardColumns = horizontalOrder.filter((id) => columns.get(id)!.footprint > 0);
  for (let index = 1; index < cardColumns.length; index += 1) {
    const left = cardColumns[index - 1];
    const right = cardColumns[index];
    separate(left, right, (columns.get(left)!.footprint + columns.get(right)!.footprint) / 2 + gap);
  }

  // Expand lower columns wherever their ancestors or card footprints require
  // more room. Both envelopes satisfy every separation; their midpoint avoids
  // pushing the entire collection toward one side.
  const leftward = new Map(positions);
  const rightward = new Map(positions);
  for (const id of horizontalOrder) for (const [next, distance] of outgoing.get(id)!) {
    rightward.set(next, Math.max(rightward.get(next)!, rightward.get(id)! + distance));
  }
  for (const id of [...horizontalOrder].reverse()) for (const [next, distance] of outgoing.get(id)!) {
    leftward.set(id, Math.min(leftward.get(id)!, leftward.get(next)! - distance));
  }
  for (const id of horizontalOrder) positions.set(id, (leftward.get(id)! + rightward.get(id)!) / 2);

  // Descendants now own their columns. Place ancestors above those final
  // positions, allowing only the deviation required by neighbors sharing a
  // rank or a card row. Shared students can require such a compromise. This
  // upward pass never pulls a completed descendant branch toward its parent.
  for (let pass = 0; pass < 24; pass += 1) {
    let movement = 0;
    for (const id of bottomUp) {
      const target = targetFor(id);
      if (target === undefined) continue;
      let left = -Infinity;
      let right = Infinity;
      for (const [neighbor, distance] of incoming.get(id)!) left = Math.max(left, positions.get(neighbor)! + distance);
      for (const [neighbor, distance] of outgoing.get(id)!) right = Math.min(right, positions.get(neighbor)! - distance);
      const x = Math.max(left, Math.min(right, target));
      movement = Math.max(movement, Math.abs(x - positions.get(id)!));
      positions.set(id, x);
    }
    if (movement < 1e-7) break;
  }
  const result = new Map([...nodes].map(([id, node]) => [id, { x: positions.get(root(id))!, y: node.y }]));
  cached = { key, positions: copyPositions(result) };
  return result;
}
