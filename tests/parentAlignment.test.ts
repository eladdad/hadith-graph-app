import { describe, expect, it } from 'vitest';
import sample from '../examples/moon-splitting-ibn-masud-anas.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import type { GraphNode, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

const MIN_NODE_GAP = 70;

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing graph node ${id}`).toBeDefined();
  return found!;
}

function expectSeparated(left: GraphNode, right: GraphNode): void {
  expect(right.x - left.x).toBeGreaterThanOrEqual((left.width + right.width) / 2 + MIN_NODE_GAP - 1e-6);
}

describe('automatic parent alignment', () => {
  it('continues a right-hand branch beneath its parent when lower ranks become sparse', () => {
    const graph = buildRenderableGraph([
      makeReport('left', ['A', 'Left collector'], 'The shorter left branch'),
      makeReport('right', ['B', 'Right child', 'Right grandchild', 'Right collector'], 'The longer right branch'),
    ]);

    const parent = node(graph, 'n:B');
    expect(parent.x).toBeGreaterThan(node(graph, 'n:A').x);
    expect(node(graph, 'n:Right child').x).toBeCloseTo(parent.x);
    expect(node(graph, 'n:Right grandchild').x).toBeCloseTo(parent.x);
    expect(node(graph, 'c:right').x).toBeCloseTo(parent.x);
    expect(node(graph, 'c:left').y).toBe(node(graph, 'n:Right child').y);
    expect(node(graph, 'n:Right grandchild').y).toBeGreaterThan(node(graph, 'n:Right child').y);
  });

  it('places siblings beside the parent column with enough space between them', () => {
    const graph = buildRenderableGraph([
      makeReport('a', ['Parent', 'Child A', 'Collector A'], 'First sibling'),
      makeReport('b', ['Parent', 'Child B', 'Collector B'], 'Second sibling'),
    ]);

    const parent = node(graph, 'n:Parent');
    const children = [node(graph, 'n:Child A'), node(graph, 'n:Child B')].sort((a, b) => a.x - b.x);
    expectSeparated(children[0], children[1]);
    expect(children[0].x).toBeLessThanOrEqual(parent.x);
    expect(children[1].x).toBeGreaterThanOrEqual(parent.x);
    // There are no other occupants: neither sibling needs to be pushed farther
    // away than the one adjacent slot necessary to resolve this collision.
    for (const child of children) {
      expect(Math.abs(child.x - parent.x)).toBeLessThanOrEqual(child.width + MIN_NODE_GAP + 1e-6);
    }
    expect(node(graph, 'c:a').x).toBeCloseTo(node(graph, 'n:Child A').x);
    expect(node(graph, 'c:b').x).toBeCloseTo(node(graph, 'n:Child B').x);
  });

  it('centers a shared child between its parents when that column is free', () => {
    const graph = buildRenderableGraph([
      makeReport('a', ['A', 'Shared child', 'Collector A'], 'First parent route'),
      makeReport('b', ['B', 'Shared child', 'Collector B'], 'Second parent route'),
    ]);

    const a = node(graph, 'n:A');
    const b = node(graph, 'n:B');
    const child = node(graph, 'n:Shared child');
    expect(child.x).toBeCloseTo((a.x + b.x) / 2);
    expect(child.y).toBeGreaterThan(a.y);
    expect(child.y).toBeGreaterThan(b.y);
  });

  it('includes a parent from an earlier rank when aligning a shared descendant', () => {
    const graph = buildRenderableGraph([
      makeReport('short', ['A', 'Shared child', 'Collector A'], 'Route with a long edge'),
      makeReport('long', ['B', 'Intermediate C', 'Intermediate D', 'Shared child', 'Collector B'], 'Longer route'),
    ]);

    const a = node(graph, 'n:A');
    const b = node(graph, 'n:B');
    const c = node(graph, 'n:Intermediate C');
    const d = node(graph, 'n:Intermediate D');
    const child = node(graph, 'n:Shared child');
    expect(c.x).toBeCloseTo(b.x);
    expect(d.x).toBeCloseTo(c.x);
    // dot balances the full graph, including the long edge and matn widths;
    // the shared child should remain between both sources, without requiring
    // the previous layout's exact arithmetic midpoint.
    expect(child.x).toBeGreaterThanOrEqual(Math.min(a.x, d.x));
    expect(child.x).toBeLessThanOrEqual(Math.max(a.x, d.x));
    expect(child.y).toBeGreaterThan(d.y);
    expect(d.y).toBeGreaterThan(c.y);
    expect(c.y).toBeGreaterThan(a.y);
  });

  it('keeps narrator boxes on every sample rank separated after parent alignment', () => {
    const parsed = parseBundleJson(JSON.stringify(sample));
    expect(parsed.error).toBeUndefined();
    const bundle = parsed.bundle!;
    const graph = buildRenderableGraph(
      bundle.reports, bundle.nodePositions, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend,
    );
    const ranks = new Map<number, GraphNode[]>();
    for (const narrator of graph.nodes.filter((candidate) => candidate.type === 'narrator')) {
      ranks.set(narrator.y, [...(ranks.get(narrator.y) ?? []), narrator]);
    }

    expect(graph.nodes).toHaveLength(45);
    expect(graph.edges).toHaveLength(36);
    for (const rank of ranks.values()) {
      const ordered = [...rank].sort((a, b) => a.x - b.x);
      for (let i = 1; i < ordered.length; i += 1) {
        expectSeparated(ordered[i - 1], ordered[i]);
      }
    }
  });
});
