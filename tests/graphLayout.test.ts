import { describe, expect, it } from 'vitest';
import sample from '../examples/moon-splitting-ibn-masud-anas.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import type { GraphNode, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

type Point = { x: number; y: number };

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

// Count only intersections inside both visible edge segments: touching a shared
// endpoint, passing through an endpoint, and collinear overlaps are not crossings.
function countProperCrossings(graph: RenderableGraph): number {
  const segments = graph.edges.map((edge) => {
    const coordinates = edge.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    expect(coordinates).toHaveLength(4);
    return {
      edge,
      start: { x: coordinates[0], y: coordinates[1] },
      end: { x: coordinates[2], y: coordinates[3] },
    };
  });
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length; j += 1) {
      const b = segments[j];
      if ([a.edge.source, a.edge.target].some((id) => id === b.edge.source || id === b.edge.target)) {
        continue;
      }
      if (cross(a.start, a.end, b.start) * cross(a.start, a.end, b.end) < -1e-6
        && cross(b.start, b.end, a.start) * cross(b.start, b.end, a.end) < -1e-6) {
        count += 1;
      }
    }
  }
  return count;
}

function positionsById(graph: RenderableGraph): Record<string, Point> {
  return Object.fromEntries(graph.nodes
    .filter((node) => node.type === 'narrator')
    .map((node) => [node.id, { x: node.x, y: node.y }]));
}

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing graph node ${id}`).toBeDefined();
  return found!;
}

describe('automatic graph layout', () => {
  it('uncrosses independent branches whose alphabetical row orders conflict', () => {
    const graph = buildRenderableGraph([
      makeReport('r1', ['A', 'Z', 'Collector 1'], 'First report'),
      makeReport('r2', ['B', 'C', 'Collector 2'], 'Second report'),
    ]);

    expect(countProperCrossings(graph)).toBe(0);
    expect(node(graph, 'n:A').y).toBe(node(graph, 'n:B').y);
    expect(node(graph, 'n:Z').y).toBe(node(graph, 'n:C').y);
    expect(node(graph, 'n:A').y).toBeLessThan(node(graph, 'n:Z').y);
    expect(node(graph, 'n:Z').y).toBeLessThan(node(graph, 'c:r1').y);
    expect(graph.nodes).toHaveLength(8);
    expect(graph.edges).toHaveLength(4);
    expect(graph.hasCycle).toBe(false);
  });

  it('reduces actual edge crossings in the Ibn Masud and Anas import sample', () => {
    const parsed = parseBundleJson(JSON.stringify(sample));
    expect(parsed.error).toBeUndefined();
    const bundle = parsed.bundle!;
    const graph = buildRenderableGraph(
      bundle.reports, bundle.nodePositions, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend,
    );

    // The original alphabetical-per-level layout has 42 proper crossings in this fixture.
    expect(countProperCrossings(graph)).toBeLessThan(42);
    expect(graph.nodes).toHaveLength(45);
    expect(graph.edges).toHaveLength(36);
    expect(graph.hasCycle).toBe(false);

    // Reordering must not change the reported chain direction or its assigned levels.
    for (const edge of graph.edges) {
      expect(node(graph, edge.source).y).toBeLessThan(node(graph, edge.target).y);
    }
  });

  it('also reduces crossings when some routes skip intermediate levels', () => {
    const graph = buildRenderableGraph([
      makeReport('r1', ['A', 'Z', 'End 1'], 'First report'),
      makeReport('r2', ['B', 'Y', 'End 2'], 'Second report'),
      makeReport('r3', ['C', 'D', 'E', 'Z', 'End 3'], 'Third report'),
      makeReport('r4', ['C', 'F', 'G', 'Y', 'End 4'], 'Fourth report'),
    ]);

    // The paths through C place Y and Z three levels below their other teachers.
    expect(node(graph, 'n:Z').y).toBeGreaterThan(node(graph, 'n:E').y);
    expect(node(graph, 'n:Y').y).toBeGreaterThan(node(graph, 'n:G').y);
    expect(node(graph, 'n:A').y).toBe(node(graph, 'n:C').y);
    expect(node(graph, 'n:B').y).toBe(node(graph, 'n:C').y);
    // The original alphabetical-per-level layout has nine proper crossings here.
    expect(countProperCrossings(graph)).toBeLessThan(9);
    expect(graph.hasCycle).toBe(false);
  });

  it('is deterministic when the same identified reports are imported in another order', () => {
    const reports = [
      makeReport('r1', ['A', 'Z', 'Same collector'], 'First report'),
      makeReport('r2', ['B', 'C', 'Same collector'], 'Second report'),
      makeReport('r3', ['A', 'C', 'Another collector'], 'Third report'),
    ];
    const first = positionsById(buildRenderableGraph(reports));

    expect(positionsById(buildRenderableGraph(reports))).toEqual(first);
    expect(positionsById(buildRenderableGraph([...reports].reverse()))).toEqual(first);
  });

  it('preserves saved narrator and collector coordinates, including legacy collector positions', () => {
    const saved = {
      'n:A': { x: 430, y: 205 },
      'c:r1': { x: 670, y: 690 },
      'n:Collector 2': { x: 1020, y: 730 },
    };
    const graph = buildRenderableGraph([
      makeReport('r1', ['A', 'Z', 'Collector 1'], 'First report'),
      makeReport('r2', ['B', 'C', 'Collector 2'], 'Second report'),
    ], saved);

    for (const [id, position] of [
      ['n:A', saved['n:A']],
      ['c:r1', saved['c:r1']],
      ['c:r2', saved['n:Collector 2']],
    ] as const) {
      const actual = node(graph, id);
      expect(actual.x - (graph.shiftX ?? 0)).toBe(position.x);
      expect(actual.y - (graph.shiftY ?? 0)).toBe(position.y);
    }
  });
});
