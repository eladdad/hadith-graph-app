import { describe, expect, it } from 'vitest';
import sample from '../examples/moon-splitting-ibn-masud-anas.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import type { GraphNode, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, 'Missing graph node ' + id).toBeDefined();
  return found!;
}

function expectDirectedChain(graph: RenderableGraph, ids: string[]): void {
  for (let index = 1; index < ids.length; index += 1) {
    expect(node(graph, ids[index]).y).toBeGreaterThan(node(graph, ids[index - 1]).y);
    expect(graph.edges.some((edge) => edge.source === ids[index - 1] && edge.target === ids[index])).toBe(true);
  }
}

function expectNodeClearance(graph: RenderableGraph): void {
  const overlaps: string[] = [];
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const a = graph.nodes[index];
    expect([a.x, a.y, a.width, a.height].every(Number.isFinite)).toBe(true);
    for (const b of graph.nodes.slice(index + 1)) {
      if (Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-6
        && Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 1e-6) overlaps.push(a.id + '/' + b.id);
    }
  }
  expect(overlaps).toEqual([]);
}

describe('Graphviz chains beside branching narrators', () => {
  it('preserves independent routes beside a neighboring fan-out', () => {
    const reports = [
      makeReport('left', ['A root', 'A child', 'A grandchild', 'A collector'], 'Left chain'),
      ...Array.from({ length: 5 }, (_, index) => makeReport(
        'branch-' + index, ['B root', 'B child ' + index, 'B grandchild ' + index, 'B collector ' + index], 'Branch ' + index,
      )),
      makeReport('right', ['C root', 'C child', 'C grandchild', 'C collector'], 'Right chain'),
    ];
    const graph = buildRenderableGraph(reports);
    expectDirectedChain(graph, ['n:A root', 'n:A child', 'n:A grandchild', 'c:left']);
    expectDirectedChain(graph, ['n:C root', 'n:C child', 'n:C grandchild', 'c:right']);
    for (let index = 0; index < 5; index += 1) {
      expectDirectedChain(graph, ['n:B root', 'n:B child ' + index, 'n:B grandchild ' + index, 'c:branch-' + index]);
    }
    expect(graph.nodes.filter((candidate) => candidate.type === 'matn')).toHaveLength(reports.length);
    expectNodeClearance(graph);
    expect(graph.hasCycle).toBe(false);
  });

  it('keeps dense neighboring fan-outs separated and deterministic under report reordering', () => {
    const reports = ['A', 'B', 'C'].flatMap((root) => Array.from({ length: 3 }, (_, index) => makeReport(
      root + '-' + index, [root + ' root', root + ' child ' + index, root + ' tail ' + index, root + ' collector ' + index],
      root + ' report ' + index,
    )));
    const graph = buildRenderableGraph(reports);
    const reversed = buildRenderableGraph([...reports].reverse());
    expectNodeClearance(graph);
    for (const root of ['A', 'B', 'C']) {
      for (let index = 0; index < 3; index += 1) {
        expectDirectedChain(graph, ['n:' + root + ' root', 'n:' + root + ' child ' + index, 'n:' + root + ' tail ' + index, 'c:' + root + '-' + index]);
      }
    }
    for (const before of graph.nodes) {
      const after = node(reversed, before.id);
      expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
    }
  });

  it('retains shared sample narrators and observed connections without imposing custom columns', () => {
    const bundle = parseBundleJson(JSON.stringify(sample)).bundle!;
    const graph = buildRenderableGraph(bundle.reports);
    const shuba = node(graph, 'n:شعبة بن الحجاج');
    const incoming = graph.edges.filter((edge) => edge.target === shuba.id);
    expect(incoming).toHaveLength(2);
    for (const edge of incoming) expect(node(graph, edge.source).y).toBeLessThan(shuba.y);
    for (const edge of graph.edges) expect(node(graph, edge.source).y).toBeLessThan(node(graph, edge.target).y);
    expectNodeClearance(graph);
    expect(graph.nodes).toHaveLength(45);
    expect(graph.edges).toHaveLength(36);
  });
});
