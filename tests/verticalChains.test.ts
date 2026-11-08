import { describe, expect, it } from 'vitest';
import sample from '../examples/moon-splitting-ibn-masud-anas.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import type { GraphNode, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

const MIN_NODE_GAP = 70;

function getNode(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing graph node ${id}`).toBeDefined();
  return found!;
}

function expectVerticalChain(graph: RenderableGraph, ids: string[]): void {
  const chain = ids.map((id) => getNode(graph, id));
  for (let index = 1; index < chain.length; index += 1) {
    expect(chain[index].x, `${ids[index]} should stay below ${ids[index - 1]}`).toBeCloseTo(chain[index - 1].x, 6);
    expect(chain[index].y).toBeGreaterThan(chain[index - 1].y);
    expect(graph.edges.some((edge) => edge.source === ids[index - 1] && edge.target === ids[index])).toBe(true);
  }
}

function expectNarratorSpacing(graph: RenderableGraph): void {
  const ranks = new Map<number, GraphNode[]>();
  for (const narrator of graph.nodes.filter((candidate) => candidate.type === 'narrator')) {
    ranks.set(narrator.y, [...(ranks.get(narrator.y) ?? []), narrator]);
  }
  for (const rank of ranks.values()) {
    const ordered = [...rank].sort((left, right) => left.x - right.x);
    for (let index = 1; index < ordered.length; index += 1) {
      const left = ordered[index - 1];
      const right = ordered[index];
      expect(right.x - left.x, `${left.id} and ${right.id} should have room between their boxes`)
        .toBeGreaterThanOrEqual((left.width + right.width) / 2 + MIN_NODE_GAP - 1e-6);
    }
  }
}

describe('vertical chains beside branching narrators', () => {
  it('moves whole independent chains when a neighboring root needs room for its children', () => {
    const reports = [
      makeReport('left', ['A root', 'A child', 'A grandchild', 'A collector'], 'Left chain'),
      ...Array.from({ length: 5 }, (_, index) => makeReport(
        `branch-${index}`,
        ['B root', `B child ${index}`, `B grandchild ${index}`, `B collector ${index}`],
        `Branch ${index}`,
      )),
      makeReport('right', ['C root', 'C child', 'C grandchild', 'C collector'], 'Right chain'),
    ];
    const graph = buildRenderableGraph(reports);

    // The root row may widen to accommodate the fan-out. Its single-child
    // neighbors should then keep their columns through every lower rank.
    expectVerticalChain(graph, ['n:A root', 'n:A child', 'n:A grandchild', 'c:left']);
    expectVerticalChain(graph, ['n:C root', 'n:C child', 'n:C grandchild', 'c:right']);
    for (let index = 0; index < 5; index += 1) {
      expectVerticalChain(graph, [`n:B child ${index}`, `n:B grandchild ${index}`, `c:branch-${index}`]);
    }
    expectNarratorSpacing(graph);
    expect(graph.hasCycle).toBe(false);
  });

  it('keeps dense neighboring fan-outs separated while preserving their unbranched tails', () => {
    const reports = ['A', 'B', 'C'].flatMap((root) => Array.from({ length: 3 }, (_, index) => makeReport(
      `${root}-${index}`,
      [`${root} root`, `${root} child ${index}`, `${root} tail ${index}`, `${root} collector ${index}`],
      `${root} report ${index}`,
    )));
    const graph = buildRenderableGraph(reports);

    expectNarratorSpacing(graph);
    for (const root of ['A', 'B', 'C']) {
      for (let index = 0; index < 3; index += 1) {
        expectVerticalChain(graph, [`n:${root} child ${index}`, `n:${root} tail ${index}`, `c:${root}-${index}`]);
      }
    }
  });

  it('aligns the free single-child branches on the moon sample’s Shuʿba rank', () => {
    const parsed = parseBundleJson(JSON.stringify(sample));
    expect(parsed.error).toBeUndefined();
    const bundle = parsed.bundle!;
    const graph = buildRenderableGraph(
      bundle.reports, bundle.nodePositions, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend,
    );
    const narrators = new Map(graph.nodes.filter((candidate) => candidate.type === 'narrator').map((narrator) => [narrator.id, narrator]));
    const ranks = [...new Set([...narrators.values()].map((narrator) => narrator.y))].sort((left, right) => left - right);
    const shuba = getNode(graph, 'n:شعبة بن الحجاج');
    expect(shuba.y).toBe(ranks[4]);

    const parentsOf = (id: string): string[] => [...new Set(graph.edges
      .filter((edge) => edge.target === id && narrators.has(edge.source))
      .map((edge) => edge.source))];
    const freeLinks = [...narrators.values()].filter((narrator) => narrator.y === shuba.y).flatMap((child) => {
      const parents = parentsOf(child.id);
      if (parents.length !== 1) return [];
      const parent = narrators.get(parents[0])!;
      if (parent.y !== ranks[3]) return [];
      const nextRankChildren = new Set(graph.edges
        .filter((edge) => edge.source === parent.id && narrators.get(edge.target)?.y === child.y)
        .map((edge) => edge.target));
      return nextRankChildren.size === 1 ? [{ parent, child }] : [];
    });

    // These four routes have no sibling collision to resolve. The other nodes
    // on this rank may move sideways to accommodate branches or shared parents.
    expect(freeLinks.map(({ child }) => child.id).sort()).toEqual([
      'n:عبد الله بن عبد الوهاب',
      'n:زهير بن حرب',
      'n:عبد بن حميد',
      'n:سفيان بن عيينة',
    ].sort());
    expect(parentsOf(shuba.id)).toHaveLength(2);
    for (const { parent, child } of freeLinks) {
      expect(child.x, `${child.id} should stay below ${parent.id}`).toBeCloseTo(parent.x, 6);
    }
    expectNarratorSpacing(graph);
    expect(graph.nodes).toHaveLength(45);
    expect(graph.edges).toHaveLength(36);
  });
});
