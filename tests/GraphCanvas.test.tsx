import { createRef, type ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphCanvas } from '../src/components/GraphCanvas';
import { buildRenderableGraph, MATN_NODE_HEADER_HEIGHT } from '../src/graph';
import type { GraphNode, RenderableGraph } from '../src/types';
import { makeGraph, makeReport } from './helpers';

function makeMatnNode(segments: GraphNode['matnLineSegments']): GraphNode {
  return {
    id: 'm:r1', label: 'Report #1', labelLines: ['Report #1'],
    report: { id: 'r1', number: 1 },
    matnLines: ['Matn body'], matnLineSegments: segments,
    type: 'matn', x: 150, y: 120, width: 240, height: 90,
  };
}

function canvas(graph: RenderableGraph, overrides: Partial<ComponentProps<typeof GraphCanvas>> = {}) {
  return <GraphCanvas
    graph={graph}
    zoom={1}
    svgRef={createRef<SVGSVGElement>()}
    narratorFontSize={13}
    matnFontSize={12}
    isBoxSelecting={false}
    selectionBox={null}
    selectedSet={new Set()}
    selectedEdgeSet={new Set()}
    isDragging={false}
    isResizing={false}
    onCanvasPointerDown={vi.fn()}
    onNodePointerDown={vi.fn()}
    onResizePointerDown={vi.fn()}
    onSelectReport={vi.fn()}
    {...overrides}
  />;
}

describe('GraphCanvas', () => {
  it('keeps a matn count selectable when text collapses without treating its badge as a node drag', () => {
    const onNodePointerDown = vi.fn();
    const onSelectReport = vi.fn();
    const graph = makeGraph({ nodes: [makeMatnNode([
      { width: 80, segments: [{ text: 'Matn body', width: 80 }] },
    ])] });
    const props = { onNodePointerDown, onSelectReport };
    const { container, rerender } = render(canvas(graph, props));
    const badge = () => container.querySelector('.matn-report-label .report-count-badge')!;

    expect(screen.getByText('Matn body')).toBeInTheDocument();
    expect(badge()).toHaveAttribute('data-report-count', '1');
    expect(screen.queryByText('Report #1')).not.toBeInTheDocument();
    expect(container.querySelector('.matn-highlight-marker-generic')).not.toBeInTheDocument();
    fireEvent.pointerDown(badge(), { button: 0 });
    expect(onNodePointerDown).not.toHaveBeenCalled();
    fireEvent.click(badge());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Select report #1' }));
    expect(onSelectReport).toHaveBeenCalledWith('r1');

    rerender(canvas(graph, { ...props, zoom: 0.2 }));
    expect(container.querySelector('.matn-node-text')).not.toBeInTheDocument();
    expect(container.querySelector('.matn-highlight-marker-generic')).toBeInTheDocument();
    expect(badge()).toHaveAttribute('data-report-count', '1');
    fireEvent.click(badge());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Select report #1' }));
    expect(onSelectReport).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(container.querySelector('.node-matn-hitbox')!, { button: 0 });
    expect(onNodePointerDown).toHaveBeenLastCalledWith(expect.anything(), 'm:r1');
  });

  it('keeps highlight markers when collapsed matn has highlights', () => {
    const graph = makeGraph({ nodes: [makeMatnNode([
      { width: 80, segments: [{ text: 'Highlighted', width: 80, color: '#ffcc00', highlightId: 'h1', label: 'Theme' }] },
    ])] });
    const { container } = render(canvas(graph, { zoom: 0.2 }));
    expect(container.querySelector('.matn-highlight-marker')).toBeInTheDocument();
    expect(container.querySelector('.matn-highlight-marker-generic')).not.toBeInTheDocument();
  });

  it('keeps collapsed colours, marker sizes, and stack spacing constant on screen when zooming further out', () => {
    const coloured = makeMatnNode([
      { width: 150, segments: [
        { text: 'First', width: 50, color: '#ffcc00', highlightId: 'h1', label: 'First theme' },
        { text: 'Second', width: 50, color: '#10b981', highlightId: 'h2', label: 'Second theme' },
        { text: 'Third', width: 50, color: '#6366f1', highlightId: 'h3', label: 'Third theme' },
      ] },
    ]);
    const plain = { ...makeMatnNode([{ width: 80, segments: [{ text: 'Plain body', width: 80 }] }]), id: 'm:plain', x: 450 };
    const graph = makeGraph({ nodes: [coloured, plain], width: 900, height: 420 });
    const { container, rerender } = render(canvas(graph, { zoom: 0.3 }));

    function screenMarkerGeometry(zoom: number) {
      const overlay = container.querySelector<SVGSVGElement>('svg.matn-marker-overlay')!;
      const graphSvg = container.querySelector('svg.graph-svg')!;
      expect(overlay).toBeInTheDocument();
      expect(overlay.parentElement).toBe(graphSvg.parentElement);
      // Without a viewBox or scaled ancestors these geometry values are literal
      // screen pixels, rather than a calculation that assumes inverse scaling.
      expect(overlay).not.toHaveAttribute('viewBox');
      expect(overlay).not.toHaveAttribute('transform');
      expect(Number(overlay.getAttribute('width'))).toBeCloseTo(graph.width * zoom);
      expect(Number(overlay.getAttribute('height'))).toBeCloseTo(graph.height * zoom);
      return Array.from(container.querySelectorAll('.matn-highlight-markers')).map((stack) => {
        expect(stack.closest('svg')).toBe(overlay);
        const transform = stack.getAttribute('transform')!;
        expect(transform).toMatch(/^translate\([^)]+\)$/);
        const position = transform.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
        const node = graph.nodes.find((candidate) => candidate.id === stack.getAttribute('data-matn-node-id'))!;
        expect(node).toBeDefined();
        expect(position[0]).toBeCloseTo(node.x * zoom);
        expect(position[1]).toBeCloseTo((node.y + MATN_NODE_HEADER_HEIGHT / 2) * zoom);
        let ancestor: Element | null = stack.parentElement;
        while (ancestor && ancestor !== overlay) {
          expect(ancestor).not.toHaveAttribute('transform');
          ancestor = ancestor.parentElement;
        }
        const markers = Array.from(stack.querySelectorAll('rect'));
        return markers.map((marker, index) => ({
          color: marker.getAttribute('fill'),
          width: Number(marker.getAttribute('width')),
          height: Number(marker.getAttribute('height')),
          radius: Number(marker.getAttribute('rx')),
          gap: index > 0
            ? Number(marker.getAttribute('y')) - Number(markers[index - 1].getAttribute('y')) - Number(markers[index - 1].getAttribute('height')) : 0,
        }));
      });
    }

    const original = screenMarkerGeometry(0.3);
    expect(original.map((stack) => stack.length)).toEqual([3, 1]);
    expect(original[0].map((marker) => marker.color)).toEqual(['#ffcc00', '#10b981', '#6366f1']);
    original.flat().forEach((marker) => {
      expect(marker.width).toBeCloseTo(16);
      expect(marker.height).toBeGreaterThanOrEqual(12);
    });
    for (const zoom of [0.2, 0.1, 0.05, 0.005, 0.3]) {
      rerender(canvas(graph, { zoom }));
      const current = screenMarkerGeometry(zoom);
      expect(container.querySelector('.matn-node-text')).not.toBeInTheDocument();
      expect(current.map((stack) => stack.length)).toEqual([3, 1]);
      current.forEach((stack, stackIndex) => stack.forEach((marker, markerIndex) => {
        const initial = original[stackIndex][markerIndex];
        expect(marker.color).toBe(initial.color);
        expect(marker.width).toBeCloseTo(initial.width);
        expect(marker.height).toBeCloseTo(initial.height);
        expect(marker.radius).toBeCloseTo(initial.radius);
        expect(marker.gap).toBeCloseTo(initial.gap);
      }));
    }

    rerender(canvas(graph, { zoom: 0.31 }));
    expect(container.querySelector('.matn-highlight-markers')).not.toBeInTheDocument();
    expect(container.querySelector('.matn-marker-overlay')).not.toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Plain body')).toBeInTheDocument();
  });

  it('keeps a short matn marker readable even when its scaled card is smaller than the marker', () => {
    const graph = buildRenderableGraph([makeReport('short', ['Collector'], 'Short.')]);
    const matn = graph.nodes.find((node) => node.type === 'matn')!;
    const { container } = render(canvas(graph, { zoom: 0.3 }));
    const marker = container.querySelector('.matn-highlight-marker-generic')!;
    const stackPosition = marker.closest('.matn-highlight-markers')!.getAttribute('transform')!
      .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    expect(Number(marker.getAttribute('width'))).toBe(16);
    expect(Number(marker.getAttribute('height'))).toBeGreaterThanOrEqual(12);
    expect(stackPosition[0]).toBeCloseTo(matn.x * 0.3);
    expect(stackPosition[1]).toBeCloseTo((matn.y + MATN_NODE_HEADER_HEIGHT / 2) * 0.3);
  });

  it('shows one edge count instead of raw numbers and follows edge selection styling', () => {
    const graph = makeGraph({ edges: [{
      id: 'parent->shared', source: 'parent', target: 'shared',
      path: 'M 100 50 C 100 100 200 100 200 150', label: '#1, #3',
      reports: [{ id: 'r1', number: 1 }, { id: 'r3', number: 3 }], labelX: 150, labelY: 100,
    }] });
    const { container, rerender } = render(canvas(graph));
    const label = () => container.querySelector('.edge-label')!;
    expect(label().querySelector('.report-count-badge')).toHaveAttribute('data-report-count', '2');
    expect(screen.queryByText('#1, #3')).not.toBeInTheDocument();
    expect(label()).not.toHaveClass('selected');
    rerender(canvas(graph, { selectedEdgeSet: new Set(['parent->shared']) }));
    expect(label()).toHaveClass('selected');
    rerender(canvas(graph));
    expect(label()).not.toHaveClass('selected');
  });
});
