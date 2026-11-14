import type { LayoutLayer } from './layerPlacement';

interface Term {
  coefficients: Array<{ group: number; value: number }>;
  offset: number;
}

interface Neighbor {
  group: number;
  distance: number;
}

const CONTACT_EPSILON = 1e-8;
const MOVEMENT_EPSILON = 1e-8;
const MAX_SWEEPS = 160;

/**
 * Center student groups after space has been reserved for their whole branches.
 * Variables represent complete private chains, and every move respects the
 * existing node and matn separations. Tight neighbors move together so a
 * crowded row cannot permanently pin an otherwise movable narrator in place.
 */
export function centerStudents(
  layers: LayoutLayer[],
  children: Map<string, Set<string>>,
  groupFor: (id: string) => string,
  coordinates: Map<string, number>,
  separations: Map<string, Map<string, number>>,
): Map<string, number> {
  const ids = [...coordinates.keys()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const x = ids.map((id) => coordinates.get(id)!);
  const originalMean = x.reduce((sum, value) => sum + value, 0) / x.length;
  const nodeInfo = new Map(layers.flatMap((layer, rank) => layer.nodes.map((node, order) => [
    node.id, { rank, order, width: node.visibleWidth ?? node.width },
  ] as const)));
  const terms: Term[] = [];

  // The row order is fixed during refinement, so its two outer students also
  // remain the visible bounds of this group. Different ranks get separate
  // targets; no student changes its assigned level.
  for (const layer of [...layers].reverse()) {
    for (const parent of layer.nodes) {
      const byRank = new Map<number, string[]>();
      for (const child of children.get(parent.id) ?? []) {
        const info = nodeInfo.get(child)!;
        if (info.rank <= nodeInfo.get(parent.id)!.rank) continue;
        byRank.set(info.rank, [...(byRank.get(info.rank) ?? []), child]);
      }
      for (const [, students] of [...byRank].sort(([a], [b]) => a - b)) {
        students.sort((a, b) => nodeInfo.get(a)!.order - nodeInfo.get(b)!.order);
        const first = students[0];
        const last = students[students.length - 1];
        const coefficients = new Map<number, number>();
        for (const [id, value] of [[parent.id, 1], [first, -0.5], [last, -0.5]] as const) {
          const group = index.get(groupFor(id))!;
          coefficients.set(group, (coefficients.get(group) ?? 0) + value);
        }
        const entries = [...coefficients].filter(([, value]) => value !== 0)
          .map(([group, value]) => ({ group, value }));
        if (entries.length > 0) {
          terms.push({ coefficients: entries, offset: (nodeInfo.get(last)!.width - nodeInfo.get(first)!.width) / 4 });
        }
      }
    }
  }
  if (terms.length === 0) return coordinates;

  const outgoing: Neighbor[][] = ids.map(() => []);
  const incoming: Neighbor[][] = ids.map(() => []);
  for (const [from, neighbors] of separations) {
    const left = index.get(from)!;
    for (const [to, distance] of neighbors) {
      const right = index.get(to)!;
      outgoing[left].push({ group: right, distance });
      incoming[right].push({ group: left, distance });
    }
  }
  const affected = ids.map(() => [] as Array<{ term: number; value: number }>);
  const errors = terms.map((term, i) => {
    for (const { group, value } of term.coefficients) affected[group].push({ term: i, value });
    return term.coefficients.reduce((sum, { group, value }) => sum + x[group] * value, -term.offset);
  });

  // Include both single columns and the outer student pair. Moving the pair
  // together lets siblings push a common tight neighbor without getting stuck
  // when moving either sibling separately would temporarily worsen centering.
  const seeds: number[][] = [];
  const seenSeeds = new Set<string>();
  const addSeed = (groups: number[]): void => {
    const key = [...groups].sort((a, b) => a - b).join(',');
    if (groups.length > 0 && !seenSeeds.has(key)) {
      seenSeeds.add(key);
      seeds.push(groups);
    }
  };
  for (const term of terms) {
    for (const { group } of term.coefficients) addSeed([group]);
    addSeed(term.coefficients.filter(({ value }) => value < 0).map(({ group }) => group));
  }

  const move = (seed: number[], direction: number): number => {
    const block = new Set(seed);
    const members = [...seed];
    const neighbors = direction > 0 ? outgoing : incoming;
    let totalMovement = 0;
    for (let step = 0; step < ids.length; step += 1) {
      // Take the directional closure of contacts before moving. Every outside
      // neighbor then leaves a positive amount of space for this whole block.
      for (let cursor = 0; cursor < members.length; cursor += 1) {
        const current = members[cursor];
        for (const next of neighbors[current]) {
          if (!block.has(next.group) && direction * (x[next.group] - x[current]) - next.distance <= CONTACT_EPSILON) {
            block.add(next.group);
            members.push(next.group);
          }
        }
      }
      const coefficients = new Map<number, number>();
      let available = Infinity;
      for (const current of members) {
        for (const { term, value } of affected[current]) {
          coefficients.set(term, (coefficients.get(term) ?? 0) + direction * value);
        }
        for (const next of neighbors[current]) {
          if (!block.has(next.group)) {
            available = Math.min(available, direction * (x[next.group] - x[current]) - next.distance);
          }
        }
      }
      let slope = 0;
      let curvature = 0;
      for (const [term, value] of coefficients) {
        slope += errors[term] * value;
        curvature += value * value;
      }
      if (curvature === 0) break;
      const optimum = -slope / curvature;
      const distance = Math.min(optimum, available);
      if (distance <= MOVEMENT_EPSILON) break;
      for (const current of members) x[current] += direction * distance;
      for (const [term, value] of coefficients) errors[term] += distance * value;
      totalMovement += distance;
      if (optimum <= available + CONTACT_EPSILON) break;
      // A separation became tight. Grow the block and continue only if the
      // combined move still reduces the total squared centering error.
    }
    return totalMovement;
  };

  for (let sweep = 0; sweep < MAX_SWEEPS; sweep += 1) {
    let largestMove = 0;
    const orderedSeeds = sweep % 2 === 0 ? seeds : [...seeds].reverse();
    for (const seed of orderedSeeds) {
      largestMove = Math.max(largestMove, move(seed, -1), move(seed, 1));
    }
    if (largestMove <= MOVEMENT_EPSILON) break;
  }

  // Centering has no preferred absolute origin. Keep the initial mean so a
  // refinement does not introduce an arbitrary translation of the whole graph.
  const shift = originalMean - x.reduce((sum, value) => sum + value, 0) / x.length;
  return new Map(ids.map((id, i) => [id, x[i] + shift]));
}
