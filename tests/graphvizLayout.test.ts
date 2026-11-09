import { instance, type Viz } from '@viz-js/viz';
import { afterEach, describe, expect, it, vi } from 'vitest';
import corpus from '../examples/moon-splitting-full.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import { layoutGraphvizGraph, type GraphvizLayoutNode } from '../src/graphvizLayout';
import type { Point } from '../src/layerPlacement';
import { makeReport } from './helpers';

afterEach(() => vi.restoreAllMocks());

function expectInputNodes(points: Map<string, Point>, nodes: GraphvizLayoutNode[]): void {
  expect([...points.keys()].sort()).toEqual(nodes.map((node) => node.id).sort());
  for (const point of points.values()) expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
}

function snapshot(points: Map<string, Point>): Record<string, Point> {
  return Object.fromEntries([...points].map(([id, point]) => [id, { ...point }]));
}

function fixture() {
  const ids = ['n:quoted "teacher"', 'n:شعبة بن الحجاج', 'n:backslash\\and\nnewline', 'n:shared <child>', 'c:a:b', 'c:wording "two"'];
  const nodes: GraphvizLayoutNode[] = [
    ...ids.map((id): GraphvizLayoutNode => ({ id, width: 190, height: 56, type: 'narrator' })),
    { id: 'm:wording\none', width: 440, height: 140, type: 'matn', anchorId: ids[4] },
    { id: 'm:wording "two"', width: 220, height: 200, type: 'matn', anchorId: ids[5] },
  ];
  const edges = [
    { source: ids[0], target: ids[3] }, { source: ids[1], target: ids[2] },
    { source: ids[2], target: ids[3] }, { source: ids[3], target: ids[4] }, { source: ids[3], target: ids[5] },
  ];
  return { nodes, edges };
}

describe('direct Graphviz layout integration', () => {
  it('handles empty and disconnected graphs without inventing nodes', () => {
    expect(layoutGraphvizGraph([], [], 70, 200)).toEqual(new Map());
    const nodes: GraphvizLayoutNode[] = ['one', 'two', 'three']
      .map((id) => ({ id, width: 190, height: 56, type: 'narrator' }));
    const points = layoutGraphvizGraph(nodes, [], 70, 200);
    expectInputNodes(points, nodes);
    const xs = [...points.values()].map((point) => point.x).sort((a, b) => a - b);
    for (let index = 1; index < xs.length; index += 1) expect(xs[index] - xs[index - 1]).toBeGreaterThanOrEqual(259);
  });

  it('preserves arbitrary IDs and directed merges and puts real matns on the bottom rank', () => {
    const { nodes, edges } = fixture();
    const before = JSON.stringify({ nodes, edges });
    const points = layoutGraphvizGraph(nodes, edges, 70, 200);
    expectInputNodes(points, nodes);
    for (const edge of edges) expect(points.get(edge.source)!.y).toBeLessThan(points.get(edge.target)!.y);
    const matns = nodes.filter((node) => node.type === 'matn');
    expect(new Set(matns.map((node) => points.get(node.id)!.y)).size).toBe(1);
    const narratorBottom = Math.max(...nodes.filter((node) => node.type === 'narrator')
      .map((node) => points.get(node.id)!.y + node.height / 2));
    for (const matn of matns) expect(points.get(matn.id)!.y - matn.height / 2).toBeGreaterThan(narratorBottom);
    expect(JSON.stringify({ nodes, edges })).toBe(before);
  });

  it('normalizes input order and protects cached maps and points from mutation', () => {
    const { nodes, edges } = fixture();
    const first = layoutGraphvizGraph(nodes, edges, 70, 200);
    const expected = snapshot(first);
    const reversed = layoutGraphvizGraph([...nodes].reverse(), [...edges].reverse(), 70, 200);
    expect(snapshot(reversed)).toEqual(expected);
    first.get(nodes[0].id)!.x = Infinity;
    first.delete(nodes.at(-1)!.id);
    first.set('not-an-input-node', { x: 1, y: 1 });
    reversed.get(nodes[0].id)!.y = -1000;
    const repeated = layoutGraphvizGraph(nodes, edges, 70, 200);
    expect(snapshot(repeated)).toEqual(expected);
    expectInputNodes(repeated, nodes);
  });

  it('uses actual dot XY for every narrator and actual matn with only a common canvas translation', async () => {
    // This spy calls the real engine; neither its implementation nor output is replaced.
    const probe = await instance();
    const renderJSON = vi.spyOn(Object.getPrototypeOf(probe) as Pick<Viz, 'renderJSON'>, 'renderJSON');
    const reports = [
      makeReport('raw-proof-a', ['Raw proof root', 'Raw proof collector A'], 'First wording. '.repeat(18)),
      makeReport('raw-proof-b', ['Raw proof root', 'Raw proof collector B'], 'Second wording. '.repeat(7)),
    ];
    const graph = buildRenderableGraph(reports, {}, { 'm:raw-proof-a': 440, 'm:raw-proof-b': 260 });
    expect(renderJSON).toHaveBeenCalledTimes(1);
    expect(renderJSON.mock.calls[0][1]).toMatchObject({ engine: 'dot', yInvert: true });
    const raw = renderJSON.mock.results[0].value as {
      objects: Array<{ _gvid: number; id?: string; pos?: string; width?: string; height?: string }>;
      edges: Array<{ tail: number; head: number }>;
    };
    const objects = raw.objects.filter((node) => node.id && node.pos);
    const points = new Map(objects.map((node) => {
      const [x, y] = node.pos!.split(',').map(Number);
      return [decodeURIComponent(node.id!), { x, y }];
    }));
    expect([...points.keys()].sort()).toEqual(graph.nodes.map((node) => node.id).sort());
    const ids = new Map(objects.map((node) => [node._gvid, decodeURIComponent(node.id!)]));
    const edges = raw.edges.map((edge) => ids.get(edge.tail) + '->' + ids.get(edge.head));
    for (const report of reports) expect(edges).toContain('c:' + report.id + '->m:' + report.id);
    const first = graph.nodes[0];
    const offsetX = first.x - points.get(first.id)!.x;
    const offsetY = first.y - points.get(first.id)!.y;
    for (const node of graph.nodes) {
      expect(node.x - points.get(node.id)!.x, node.id + ' must retain dot x').toBeCloseTo(offsetX, 6);
      expect(node.y - points.get(node.id)!.y, node.id + ' must retain dot y').toBeCloseTo(offsetY, 6);
    }
    const matns = graph.nodes.filter((node) => node.type === 'matn');
    for (const matn of matns) {
      const engineNode = objects.find((node) => decodeURIComponent(node.id!) === matn.id)!;
      expect(Number(engineNode.width) * 72, matn.id + ' must use its actual width').toBeCloseTo(matn.width, 1);
      expect(Number(engineNode.height) * 72, matn.id + ' must use its actual height').toBeCloseTo(matn.height, 1);
    }
    expect(matns[0].height).not.toBe(matns[1].height);
    expect(matns[0].y).toBe(matns[1].y);
    expect(matns[0].y - matns[0].height / 2).not.toBe(matns[1].y - matns[1].height / 2);
  });

  it('overrides only explicitly saved narrator and matn coordinates', () => {
    const reports = [
      makeReport('saved-proof-a', ['Saved proof root', 'Saved proof collector A'], 'First wording.'),
      makeReport('saved-proof-b', ['Saved proof root', 'Saved proof collector B'], 'Second wording.'),
    ];
    const automatic = buildRenderableGraph(reports);
    const saved: Record<string, Point> = {
      'c:saved-proof-a': { x: 4000, y: 1800 }, 'm:saved-proof-b': { x: 5300, y: 2900 },
    };
    const pinned = buildRenderableGraph(reports, saved);
    for (const node of pinned.nodes) {
      const before = automatic.nodes.find((candidate) => candidate.id === node.id)!;
      expect(node.x - (pinned.shiftX ?? 0)).toBeCloseTo(saved[node.id]?.x ?? before.x - (automatic.shiftX ?? 0), 6);
      expect(node.y - (pinned.shiftY ?? 0)).toBeCloseTo(saved[node.id]?.y ?? before.y - (automatic.shiftY ?? 0), 6);
    }
    expect(pinned.nodes.find((node) => node.id === 'm:saved-proof-a')!.x)
      .not.toBe(pinned.nodes.find((node) => node.id === 'c:saved-proof-a')!.x);
  });

  it('lays out all 244 reports with finite bounds, bottom-rank matns and card clearance', () => {
    const parsed = parseBundleJson(JSON.stringify(corpus));
    expect(parsed.error).toBeUndefined();
    const reports = parsed.bundle!.reports;
    expect(reports).toHaveLength(244);
    const graph = buildRenderableGraph(reports);
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const matns = graph.nodes.filter((node) => node.type === 'matn').sort((a, b) => a.x - b.x);
    expect(matns).toHaveLength(reports.length);
    expect(Number.isFinite(graph.width) && graph.width > 0).toBe(true);
    expect(Number.isFinite(graph.height) && graph.height > 0).toBe(true);
    for (const node of graph.nodes) {
      expect([node.x, node.y, node.width, node.height].every(Number.isFinite), node.id).toBe(true);
      expect(node.x - node.width / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(node.y - node.height / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(node.x + node.width / 2).toBeLessThanOrEqual(graph.width + 1e-6);
      expect(node.y + node.height / 2).toBeLessThanOrEqual(graph.height + 1e-6);
    }
    const narratorBottom = Math.max(...graph.nodes.filter((node) => node.type === 'narrator')
      .map((node) => node.y + node.height / 2));
    for (const report of reports) {
      const matn = nodes.get('m:' + report.id)!;
      expect(nodes.has('c:' + report.id)).toBe(true);
      expect(matn.y).toBe(matns[0].y);
      expect(matn.y - matn.height / 2).toBeGreaterThan(narratorBottom);
    }
    for (let index = 1; index < matns.length; index += 1) {
      const left = matns[index - 1];
      const right = matns[index];
      expect(right.x - right.width / 2 - (left.x + left.width / 2)).toBeGreaterThanOrEqual(40);
    }
    for (const edge of graph.edges) expect(nodes.get(edge.source)!.y).toBeLessThan(nodes.get(edge.target)!.y);
  }, 30_000);
});
