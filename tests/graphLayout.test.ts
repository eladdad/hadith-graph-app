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

function sampleEdge(path: string): Point[] {
  const coordinates = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
  expect(path).toMatch(/^M .* C /);
  expect(coordinates).toHaveLength(8);
  const [x0, y0, x1, y1, x2, y2, x3, y3] = coordinates;
  return Array.from({ length: 41 }, (_, index) => {
    const t = index / 40;
    const u = 1 - t;
    return {
      x: u ** 3 * x0 + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3,
      y: u ** 3 * y0 + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3,
    };
  });
}

// Approximate the actual visible Bezier curves with short segments. Count each
// intersecting pair once, excluding shared endpoints and collinear overlap.
function countProperCrossings(graph: RenderableGraph): number {
  const segments = graph.edges.map((edge) => ({ edge, points: sampleEdge(edge.path) }));
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length; j += 1) {
      const b = segments[j];
      if ([a.edge.source, a.edge.target].some((id) => id === b.edge.source || id === b.edge.target)) {
        continue;
      }
      const intersects = a.points.slice(1).some((aEnd, aIndex) => {
        const aStart = a.points[aIndex];
        return b.points.slice(1).some((bEnd, bIndex) => {
          const bStart = b.points[bIndex];
          return cross(aStart, aEnd, bStart) * cross(aStart, aEnd, bEnd) < -1e-6
            && cross(bStart, bEnd, aStart) * cross(bStart, bEnd, aEnd) < -1e-6;
        });
      });
      if (intersects) {
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
  it('attaches curved edges to outward ports after normal, reversed and same-level manual placement', () => {
    const report = makeReport('route', ['Source', 'Collector'], 'Wording.');
    for (const [sourceY, targetY] of [[100, 400], [400, 100], [100, 100]]) {
      const graph = buildRenderableGraph([report], {
        'n:Source': { x: 200, y: sourceY },
        'c:route': { x: 600, y: targetY },
      });
      const source = node(graph, 'n:Source');
      const target = node(graph, 'c:route');
      const edge = graph.edges[0];
      const points = sampleEdge(edge.path);
      const direction = sourceY <= targetY ? 1 : -1;
      const [, , control1X, control1Y, control2X, control2Y] = edge.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);

      expect(points[0]).toEqual({ x: source.x, y: source.y + direction * source.height / 2 });
      expect(points.at(-1)).toEqual({ x: target.x, y: target.y - direction * target.height / 2 });
      expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      expect(control1X).toBe(source.x);
      expect(control2X).toBe(target.x);
      expect((control1Y - points[0].y) * direction).toBeGreaterThan(0);
      expect((points.at(-1)!.y - control2Y) * direction).toBeGreaterThan(0);
      expect(edge.labelX).toBeCloseTo(points[20].x, 6);
      expect(edge.labelY).toBeCloseTo(points[20].y, 6);
    }
  });

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
