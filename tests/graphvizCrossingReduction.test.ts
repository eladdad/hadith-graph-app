import { instance, type Viz } from '@viz-js/viz';
import { afterEach, describe, expect, it, vi } from 'vitest';
import example from '../drawio_graph_conversion/khosrow_daughter.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { countEdgeCrossings } from '../src/edgeCrossings';
import { getVerticalCurvePoints } from '../src/edgeGeometry';
import {
  graphvizEdgeKey,
  layoutGraphvizGraph,
  layoutGraphvizGraphWithRoutes,
  type GraphvizGraphLayout,
  type GraphvizLayoutNode,
} from '../src/graphvizLayout';
import type { LayoutEdge, Point } from '../src/layerPlacement';
import { orderMatnsBySimilarity } from '../src/matnSimilarity';

afterEach(() => vi.restoreAllMocks());

function fixture(prefix: string) {
  const bundle = parseBundleJson(JSON.stringify(example)).bundle!;
  const nodes = new Map<string, GraphvizLayoutNode>();
  const edges = new Map<string, LayoutEdge>();
  for (const report of bundle.reports) {
    const chain = report.isnad.map((name, index) => index === report.isnad.length - 1
      ? `c:${prefix}:${report.id}` : `n:${prefix}:${name}`);
    chain.forEach((id) => nodes.set(id, { id, width: 190, height: 56, type: 'narrator' }));
    for (let index = 1; index < chain.length; index += 1) {
      const edge = { source: chain[index - 1], target: chain[index] };
      edges.set(graphvizEdgeKey(edge.source, edge.target), edge);
    }
    const id = `m:${prefix}:${report.id}`;
    nodes.set(id, { id, width: 360, height: 140, type: 'matn', anchorId: chain.at(-1) });
  }
  const order = orderMatnsBySimilarity(bundle.reports, bundle.highlightLegend).map((report) => `m:${prefix}:${report.id}`);
  const allEdges = [...edges.values(), ...[...nodes.values()].filter((node) => node.anchorId)
    .map((node) => ({ source: node.anchorId!, target: node.id }))];
  return { nodes: [...nodes.values()], edges: [...edges.values()], allEdges, order };
}

function originalPositions(raw: { objects: Array<{ id?: string; pos?: string }> }): Map<string, Point> {
  return new Map(raw.objects.filter((node) => node.id && node.pos).map((node) => {
    const [x, y] = node.pos!.split(',').map(Number);
    return [decodeURIComponent(node.id!), { x, y }];
  }));
}

function score(layout: GraphvizGraphLayout, input: ReturnType<typeof fixture>): number {
  const nodes = new Map(input.nodes.map((node) => [node.id, node]));
  return countEdgeCrossings(input.allEdges.map(({ source, target }) => ({
    source, target,
    points: layout.routes.get(graphvizEdgeKey(source, target)) ?? getVerticalCurvePoints(
      { x: layout.positions.get(source)!.x, y: layout.positions.get(source)!.y + nodes.get(source)!.height / 2 },
      { x: layout.positions.get(target)!.x, y: layout.positions.get(target)!.y - nodes.get(target)!.height / 2 },
    ),
  })));
}

async function renderSpy() {
  const probe = await instance();
  return vi.spyOn(Object.getPrototypeOf(probe) as Pick<Viz, 'renderJSON'>, 'renderJSON');
}

describe('crossing reduction with fixed matn order', () => {
  it('reduces crossings on the bundled topology while retaining exact matn order and complete border-anchored routes', async () => {
    const input = fixture('quality');
    const spy = await renderSpy();
    const result = layoutGraphvizGraphWithRoutes(input.nodes, input.edges, 70, 180, input.order);
    const baseline = { positions: originalPositions(spy.mock.results[0].value as Parameters<typeof originalPositions>[0]), routes: new Map<string, Point[]>() };

    expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
    expect(score(result, input)).toBeLessThan(score(baseline, input));
    expect(input.order.toSorted((a, b) => result.positions.get(a)!.x - result.positions.get(b)!.x)).toEqual(input.order);
    expect(result.routes.size).toBe(input.allEdges.length);
    const nodes = new Map(input.nodes.map((node) => [node.id, node]));
    for (const { source, target } of input.allEdges) {
      const route = result.routes.get(graphvizEdgeKey(source, target))!;
      expect(route.length).toBeGreaterThanOrEqual(4);
      expect((route.length - 1) % 3).toBe(0);
      expect(route.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      expect(route[0]).toEqual({ x: result.positions.get(source)!.x, y: result.positions.get(source)!.y + nodes.get(source)!.height / 2 });
      expect(route.at(-1)).toEqual({ x: result.positions.get(target)!.x, y: result.positions.get(target)!.y - nodes.get(target)!.height / 2 });
      expect(result.positions.get(source)!.y).toBeLessThan(result.positions.get(target)!.y);
    }
  });

  it('keeps the default layout on one original DOT pass and protects cached positions and every control point', async () => {
    const input = fixture('cache');
    const spy = await renderSpy();
    const normal = layoutGraphvizGraphWithRoutes(input.nodes, input.edges, 70, 180);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(normal.positions).toEqual(originalPositions(spy.mock.results[0].value as Parameters<typeof originalPositions>[0]));
    expect(normal.routes.size).toBe(0);
    const sorted = layoutGraphvizGraphWithRoutes(input.nodes, input.edges, 70, 180, input.order);
    const expected = structuredClone(sorted);
    expect(sorted.routes.size).toBeGreaterThan(0);
    sorted.positions.values().next().value!.x = Infinity;
    sorted.positions.clear();
    sorted.routes.values().next().value![1].y = Infinity;
    sorted.routes.clear();
    const calls = spy.mock.calls.length;
    expect(layoutGraphvizGraphWithRoutes([...input.nodes].reverse(), [...input.edges].reverse(), 70, 180, input.order)).toEqual(expected);
    expect(spy).toHaveBeenCalledTimes(calls);
    expect(layoutGraphvizGraph(input.nodes, input.edges, 70, 180)).toEqual(normal.positions);
    expect(spy).toHaveBeenCalledTimes(calls);
  });

  it('skips extra optimization passes when the ordered graph already has no conflicts', async () => {
    const nodes: GraphvizLayoutNode[] = [
      { id: 'zero-root', width: 190, height: 56, type: 'narrator' },
      { id: 'zero-m1', width: 240, height: 100, type: 'matn', anchorId: 'zero-root' },
      { id: 'zero-m2', width: 240, height: 100, type: 'matn', anchorId: 'zero-root' },
    ];
    const spy = await renderSpy();
    const result = layoutGraphvizGraphWithRoutes(nodes, [], 70, 180, ['zero-m2', 'zero-m1']);
    expect(result.routes.size).toBe(0);
    expect(result.positions.get('zero-m2')!.x).toBeLessThan(result.positions.get('zero-m1')!.x);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each(['error', 'invalid-route', 'invalid-order'] as const)('falls back to the valid baseline when optional optimization returns %s', async (failure) => {
    const input = fixture(failure);
    const probe = await instance();
    const prototype = Object.getPrototypeOf(probe) as Pick<Viz, 'renderJSON'>;
    const render = prototype.renderJSON;
    let calls = 0;
    const spy = vi.spyOn(prototype, 'renderJSON').mockImplementation(function (dot, options) {
      calls += 1;
      if (calls > 1 && failure === 'error') throw new Error('Optional optimizer failed.');
      const raw = render.call(this, dot, options) as {
        objects: Array<{ id?: string; pos?: string }>;
        edges: Array<{ _draw_?: Array<{ op: string; points?: number[][] }> }>;
      };
      if (calls > 1 && failure === 'invalid-route') {
        const curve = raw.edges.flatMap((edge) => edge._draw_ ?? []).find((draw) => draw.op === 'b');
        curve!.points![0][0] = Infinity;
      }
      if (calls > 1 && failure === 'invalid-order') {
        const matns = raw.objects.filter((node) => node.id && decodeURIComponent(node.id).startsWith('m:'));
        const positions = matns.map((node) => node.pos).reverse();
        matns.forEach((node, index) => { node.pos = positions[index]; });
      }
      return raw;
    });
    const result = layoutGraphvizGraphWithRoutes(input.nodes, input.edges, 70, 180, input.order);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(result.routes.size).toBe(0);
    expect(result.positions).toEqual(originalPositions(spy.mock.results[0].value as Parameters<typeof originalPositions>[0]));
  });
});
