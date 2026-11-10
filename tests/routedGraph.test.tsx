import { createRef, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import example from '../drawio_graph_conversion/khosrow_daughter.hadith-graph.json';
import { getEdgeIdsForReport, parseBundleJson } from '../src/bundle';
import { GraphCanvas } from '../src/components/GraphCanvas';
import { buildVerticalCurve } from '../src/edgeGeometry';
import { buildRenderableGraph } from '../src/graph';
import { orderMatnsBySimilarity } from '../src/matnSimilarity';
import type { GraphNode, RenderableGraph } from '../src/types';

interface Point { x: number; y: number }

function pathPoints(path: string): Point[] {
  const coordinates = path.match(/-?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?/gi)!.map(Number);
  expect(coordinates.every(Number.isFinite)).toBe(true);
  expect((coordinates.length - 2) % 6).toBe(0);
  return Array.from({ length: coordinates.length / 2 }, (_, index) => ({
    x: coordinates[index * 2], y: coordinates[index * 2 + 1],
  }));
}

function cubicAt(points: Point[], start: number, t: number): Point {
  const u = 1 - t;
  const coordinate = (axis: 'x' | 'y') => u ** 3 * points[start][axis]
    + 3 * u * u * t * points[start + 1][axis]
    + 3 * u * t * t * points[start + 2][axis]
    + t ** 3 * points[start + 3][axis];
  return { x: coordinate('x'), y: coordinate('y') };
}

function distanceToPath(point: Point, points: Point[]): number {
  let closest = Infinity;
  for (let start = 0; start + 3 < points.length; start += 3) {
    const distance = (t: number) => {
      const onCurve = cubicAt(points, start, t);
      return Math.hypot(point.x - onCurve.x, point.y - onCurve.y);
    };
    let bestStep = 0;
    for (let step = 0; step <= 100; step += 1) {
      if (distance(step / 100) < distance(bestStep / 100)) bestStep = step;
    }
    let left = Math.max(0, (bestStep - 1) / 100);
    let right = Math.min(1, (bestStep + 1) / 100);
    for (let iteration = 0; iteration < 28; iteration += 1) {
      const a = left + (right - left) / 3;
      const b = right - (right - left) / 3;
      if (distance(a) < distance(b)) right = b;
      else left = a;
    }
    closest = Math.min(closest, distance((left + right) / 2), distance(0), distance(1));
  }
  return closest;
}

function expectAttached(path: string, source: GraphNode, target: GraphNode): Point[] {
  const points = pathPoints(path);
  const direction = target.y >= source.y ? 1 : -1;
  expect(points[0].x).toBeCloseTo(source.x, 6);
  expect(points[0].y).toBeCloseTo(source.y + direction * source.height / 2, 6);
  expect(points.at(-1)!.x).toBeCloseTo(target.x, 6);
  expect(points.at(-1)!.y).toBeCloseTo(target.y - direction * target.height / 2, 6);
  return points;
}

function bundle() {
  const parsed = parseBundleJson(JSON.stringify(example));
  if (!parsed.bundle) throw new Error(parsed.error);
  return parsed.bundle;
}

function buildSorted(positions = {}) {
  const data = bundle();
  return buildRenderableGraph(data.reports, positions, data.nodeWidths, data.fontSizes, data.highlightLegend, { matnSort: 'highlights' });
}

function canvas(graph: RenderableGraph) {
  const { fontSizes } = bundle();
  const props: ComponentProps<typeof GraphCanvas> = {
    graph, zoom: 1, svgRef: createRef<SVGSVGElement>(), narratorFontSize: fontSizes.narrator, matnFontSize: fontSizes.matn,
    isBoxSelecting: false, selectionBox: null, selectedSet: new Set(), selectedEdgeSet: new Set(),
    isDragging: false, isResizing: false, onCanvasPointerDown: vi.fn(), onNodePointerDown: vi.fn(),
    onResizePointerDown: vi.fn(), onSelectReport: vi.fn(),
  };
  return <GraphCanvas {...props} />;
}

describe('routed highlight-sorted graph', () => {
  it('keeps the real example order and report identities while attaching cubic routes and badges to their actual paths', () => {
    const data = bundle();
    const before = JSON.stringify(data);
    const graph = buildRenderableGraph(data.reports, {}, data.nodeWidths, data.fontSizes, data.highlightLegend, { matnSort: 'highlights' });
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const matns = graph.nodes.filter((node) => node.type === 'matn').sort((left, right) => left.x - right.x);
    expect(matns.map((node) => node.report!.id))
      .toEqual(orderMatnsBySimilarity(data.reports, data.highlightLegend).map((report) => report.id));
    expect(matns).toHaveLength(24);
    for (const [index, report] of data.reports.entries()) {
      expect(nodes.get(`m:${report.id}`)?.report).toEqual({ id: report.id, number: index + 1 });
    }
    expect(graph.edges.map((edge) => edge.id).sort())
      .toEqual([...new Set(data.reports.flatMap((report) => getEdgeIdsForReport(report)))].sort());
    expect(graph.edges.some((edge) => pathPoints(edge.path).length > 4)).toBe(true);
    for (const edge of graph.edges) {
      const points = expectAttached(edge.path, nodes.get(edge.source)!, nodes.get(edge.target)!);
      expect(distanceToPath({ x: edge.labelX, y: edge.labelY }, points)).toBeLessThan(0.001);
      for (const reference of edge.reports ?? []) {
        expect(data.reports[reference.number - 1].id).toBe(reference.id);
      }
    }
    expect(Object.keys(graph.matnAttachmentPaths ?? {}).sort()).toEqual(matns.map((node) => node.id).sort());
    for (const matn of matns) {
      expectAttached(graph.matnAttachmentPaths![matn.id], nodes.get(matn.matnAnchorId!)!, matn);
    }
    expect(JSON.stringify(data)).toBe(before);
  });

  it('renders Graphviz matn attachment routes without adding invisible order constraints to the canvas', () => {
    const graph = buildSorted();
    const { container } = render(canvas(graph));
    const attachments = container.querySelectorAll<SVGPathElement>('path[data-matn-attachment]');
    expect(attachments).toHaveLength(24);
    for (const attachment of attachments) {
      expect(attachment.getAttribute('d')).toBe(graph.matnAttachmentPaths![attachment.dataset.matnAttachment!]);
    }
    expect(container.querySelectorAll('path.graph-edge')).toHaveLength(graph.edges.length);
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(graph.nodes.length);
  });

  it('recomputes direct connections for moved manual nodes and leaves the default routing unchanged', () => {
    const data = bundle();
    const defaultBefore = buildRenderableGraph(data.reports, {}, data.nodeWidths, data.fontSizes, data.highlightLegend);
    const automatic = buildSorted();
    const moved = automatic.nodes.find((node) => node.id === automatic.edges[0].source)!;
    const manual = buildSorted({ [moved.id]: { x: moved.x + 300, y: moved.y + 15 } });
    const nodes = new Map(manual.nodes.map((node) => [node.id, node]));
    expect(manual.matnAttachmentPaths).toBeUndefined();
    for (const edge of manual.edges) {
      const source = nodes.get(edge.source)!;
      const target = nodes.get(edge.target)!;
      expectAttached(edge.path, source, target);
      const direction = target.y >= source.y ? 1 : -1;
      expect(edge.path).toBe(buildVerticalCurve(
        { x: source.x, y: source.y + direction * source.height / 2 },
        { x: target.x, y: target.y - direction * target.height / 2 }, direction,
      ).path);
    }
    expect(manual.edges.some((edge) => (edge.source === moved.id || edge.target === moved.id)
      && edge.path !== automatic.edges.find((original) => original.id === edge.id)!.path)).toBe(true);
    const { container } = render(canvas(manual));
    for (const matn of manual.nodes.filter((node) => node.type === 'matn')) {
      const source = nodes.get(matn.matnAnchorId!)!;
      const attachment = container.querySelector(`path[data-matn-attachment="${matn.id}"]`)!;
      expectAttached(attachment.getAttribute('d')!, source, matn);
      expect(pathPoints(attachment.getAttribute('d')!)).toHaveLength(4);
    }
    const defaultAfter = buildRenderableGraph(data.reports, {}, data.nodeWidths, data.fontSizes, data.highlightLegend, { matnSort: 'default' });
    expect(defaultAfter).toEqual(defaultBefore);
    expect(defaultAfter.matnAttachmentPaths).toBeUndefined();
  });
});
