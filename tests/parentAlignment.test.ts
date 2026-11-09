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

function expectDirectedAndSeparated(graph: RenderableGraph): void {
  for (const edge of graph.edges) {
    const source = node(graph, edge.source);
    const target = node(graph, edge.target);
    expect(target.y - target.height / 2).toBeGreaterThan(source.y + source.height / 2);
  }
  const overlaps: string[] = [];
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const a = graph.nodes[index];
    for (const b of graph.nodes.slice(index + 1)) {
      if (Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-6
        && Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 1e-6) overlaps.push(a.id + '/' + b.id);
    }
  }
  expect(overlaps).toEqual([]);
}

describe('Graphviz placement around parents', () => {
  it('keeps independent routes directed and separated when their lengths differ', () => {
    const reports = [
      makeReport('left', ['A', 'Left collector'], 'The shorter route'),
      makeReport('right', ['B', 'Right child', 'Right grandchild', 'Right collector'], 'The longer route'),
    ];
    const before = JSON.stringify(reports);
    const graph = buildRenderableGraph(reports);
    expectDirectedAndSeparated(graph);
    expect(node(graph, 'c:right').y).toBeGreaterThan(node(graph, 'n:Right grandchild').y);
    expect(node(graph, 'm:left').y).toBe(node(graph, 'm:right').y);
    expect(JSON.stringify(reports)).toBe(before);
  });

  it('gives sibling branches room without changing their parent or collector identities', () => {
    const graph = buildRenderableGraph([
      makeReport('a', ['Parent', 'Child A', 'Collector A'], 'First sibling'),
      makeReport('b', ['Parent', 'Child B', 'Collector B'], 'Second sibling'),
    ]);
    expectDirectedAndSeparated(graph);
    expect(graph.edges.filter((edge) => edge.source === 'n:Parent').map((edge) => edge.target).sort())
      .toEqual(['n:Child A', 'n:Child B']);
    expect(node(graph, 'c:a').label).toBe('Collector A');
    expect(node(graph, 'c:b').label).toBe('Collector B');
  });

  it('keeps a shared child below both observed parents', () => {
    const graph = buildRenderableGraph([
      makeReport('a', ['A', 'Shared child', 'Collector A'], 'First parent route'),
      makeReport('b', ['B', 'Shared child', 'Collector B'], 'Second parent route'),
    ]);
    expectDirectedAndSeparated(graph);
    expect(graph.edges.filter((edge) => edge.target === 'n:Shared child').map((edge) => edge.source).sort())
      .toEqual(['n:A', 'n:B']);
    expect(node(graph, 'n:Shared child').y).toBeGreaterThan(Math.max(node(graph, 'n:A').y, node(graph, 'n:B').y));
  });

  it('retains a direct incoming edge alongside a longer incoming route', () => {
    const graph = buildRenderableGraph([
      makeReport('short', ['A', 'Shared child', 'Collector A'], 'Route with a long edge'),
      makeReport('long', ['B', 'Intermediate C', 'Intermediate D', 'Shared child', 'Collector B'], 'Longer route'),
    ]);
    expectDirectedAndSeparated(graph);
    expect(graph.edges.find((edge) => edge.source === 'n:A' && edge.target === 'n:Shared child')?.reports)
      .toEqual([{ id: 'short', number: 1 }]);
    const path = ['n:B', 'n:Intermediate C', 'n:Intermediate D', 'n:Shared child', 'c:long'];
    for (let index = 1; index < path.length; index += 1) {
      expect(graph.edges.some((edge) => edge.source === path[index - 1] && edge.target === path[index])).toBe(true);
    }
  });

  it('keeps every measured sample node separated without changing its graph', () => {
    const bundle = parseBundleJson(JSON.stringify(sample)).bundle!;
    const graph = buildRenderableGraph(bundle.reports, {}, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend);
    expect(graph.nodes).toHaveLength(45);
    expect(graph.edges).toHaveLength(36);
    expectDirectedAndSeparated(graph);
  });
});
