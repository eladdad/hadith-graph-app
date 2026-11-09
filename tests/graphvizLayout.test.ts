import { describe, expect, it } from 'vitest';
import corpus from '../examples/moon-splitting-full.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import { layoutGraphvizLayers } from '../src/graphvizLayout';
import type { LayoutEdge, LayoutFootprint, LayoutLayer, Point } from '../src/layerPlacement';

const GAP = 70;
const EPSILON = 1e-6;

function expectInputNodes(positions: Map<string, Point>, layers: LayoutLayer[]): void {
  const inputIds = layers.flatMap((layer) => layer.nodes.map((node) => node.id));
  expect([...positions.keys()].sort()).toEqual([...inputIds].sort());
  for (const layer of layers) {
    for (const node of layer.nodes) {
      const point = positions.get(node.id)!;
      expect(Number.isFinite(point.x), `${node.id} should have a finite x`).toBe(true);
      expect(point.y, `${node.id} should retain its assigned rank`).toBe(layer.y);
    }
  }
}

function snapshot(positions: Map<string, Point>): Record<string, Point> {
  return Object.fromEntries([...positions].map(([id, point]) => [id, { ...point }]));
}

function mergeFixture(): { layers: LayoutLayer[]; edges: LayoutEdge[]; footprints: LayoutFootprint[] } {
  const ids = ['n:quoted "teacher"', 'n:شعبة بن الحجاج', 'n:backslash\\and\nnewline', 'n:shared <child>', 'c:a:b', 'c:wording "two"'];
  const makeNode = (id: string) => ({ id, width: 190, height: 56 });
  return {
    layers: [
      { y: 100, nodes: ids.slice(0, 2).map(makeNode) },
      { y: 300, nodes: [makeNode(ids[2])] },
      { y: 500, nodes: [makeNode(ids[3])] },
      { y: 700, nodes: ids.slice(4).map(makeNode) },
    ],
    edges: [
      { source: ids[0], target: ids[3] },
      { source: ids[1], target: ids[2] },
      { source: ids[2], target: ids[3] },
      { source: ids[3], target: ids[4] },
      { source: ids[3], target: ids[5] },
    ],
    footprints: [{ anchor: ids[4], width: 440 }, { anchor: ids[5], width: 220 }],
  };
}

describe('Graphviz layout integration', () => {
  it('handles empty graphs and disconnected nodes without inventing output nodes', () => {
    expect(layoutGraphvizLayers([], [], GAP, [])).toEqual(new Map());
    const layers: LayoutLayer[] = [
      { y: 100, nodes: [{ id: 'isolated-a', width: 190, height: 56 }, { id: 'isolated-b', width: 220, height: 70 }] },
      { y: 300, nodes: [] },
      { y: 500, nodes: [{ id: 'isolated-c', width: 190, height: 56 }] },
    ];
    const positions = layoutGraphvizLayers(layers, [], GAP, []);

    expectInputNodes(positions, layers);
    const firstRank = layers[0].nodes.sort((a, b) => positions.get(a.id)!.x - positions.get(b.id)!.x);
    expect(positions.get(firstRank[1].id)!.x - positions.get(firstRank[0].id)!.x)
      .toBeGreaterThanOrEqual((firstRank[0].width + firstRank[1].width) / 2 + GAP - EPSILON);
  });

  it('preserves arbitrary IDs and assigned ranks through a merge with a skipped rank', () => {
    const { layers, edges, footprints } = mergeFixture();
    const before = JSON.stringify({ layers, edges, footprints });
    const positions = layoutGraphvizLayers(layers, edges, GAP, footprints);

    expectInputNodes(positions, layers);
    for (const edge of edges) {
      expect(positions.get(edge.source)!.y).toBeLessThan(positions.get(edge.target)!.y);
    }
    expect(JSON.stringify({ layers, edges, footprints })).toBe(before);
  });

  it('is deterministic across edge and footprint ordering and protects cached coordinates from mutation', () => {
    const { layers, edges, footprints } = mergeFixture();
    const original = layoutGraphvizLayers(layers, edges, GAP, footprints);
    const expected = snapshot(original);
    const reordered = layoutGraphvizLayers(layers, [...edges].reverse(), GAP, [...footprints].reverse());

    expect(snapshot(reordered)).toEqual(expected);
    const firstId = layers[0].nodes[0].id;
    const lastId = layers.at(-1)!.nodes.at(-1)!.id;
    original.get(firstId)!.x = Infinity;
    original.delete(lastId);
    original.set('not-an-input-node', { x: 1, y: 1 });
    reordered.get(firstId)!.y = -1000;

    const repeated = layoutGraphvizLayers(layers, edges, GAP, footprints);
    expect(snapshot(repeated)).toEqual(expected);
    expectInputNodes(repeated, layers);
  });

  it('lays out the complete corpus with finite bounds and aligned, separated matn cards', () => {
    const parsed = parseBundleJson(JSON.stringify(corpus));
    expect(parsed.error).toBeUndefined();
    const reports = parsed.bundle!.reports;
    expect(reports).toHaveLength(244);
    const graph = buildRenderableGraph(reports);
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const matns = graph.nodes.filter((node) => node.type === 'matn').sort((a, b) => a.x - b.x);

    expect(matns).toHaveLength(reports.length);
    expect(Number.isFinite(graph.width) && graph.width > 0).toBe(true);
    expect(Number.isFinite(graph.height) && graph.height > 0).toBe(true);
    for (const node of graph.nodes) {
      expect([node.x, node.y, node.width, node.height].every(Number.isFinite), `${node.id} should have finite dimensions`)
        .toBe(true);
      expect(node.x - node.width / 2).toBeGreaterThanOrEqual(-EPSILON);
      expect(node.y - node.height / 2).toBeGreaterThanOrEqual(-EPSILON);
      expect(node.x + node.width / 2).toBeLessThanOrEqual(graph.width + EPSILON);
      expect(node.y + node.height / 2).toBeLessThanOrEqual(graph.height + EPSILON);
    }

    const top = matns[0].y - matns[0].height / 2;
    const narratorBottom = Math.max(...graph.nodes.filter((node) => node.type === 'narrator')
      .map((node) => node.y + node.height / 2));
    expect(top).toBeGreaterThan(narratorBottom);
    for (const report of reports) {
      const collector = nodesById.get(`c:${report.id}`);
      const matn = nodesById.get(`m:${report.id}`);
      expect(collector, `Missing collector for ${report.id}`).toBeDefined();
      expect(matn, `Missing matn for ${report.id}`).toBeDefined();
      expect(matn!.x).toBeCloseTo(collector!.x, 6);
      expect(matn!.y - matn!.height / 2).toBeCloseTo(top, 6);
    }
    for (let index = 1; index < matns.length; index += 1) {
      const left = matns[index - 1];
      const right = matns[index];
      expect(right.x - right.width / 2 - (left.x + left.width / 2), `${left.id} and ${right.id} should have clearance`)
        .toBeGreaterThanOrEqual(40 - EPSILON);
    }
    for (const edge of graph.edges) {
      expect(nodesById.has(edge.source)).toBe(true);
      expect(nodesById.has(edge.target)).toBe(true);
    }
  }, 30_000);
});
