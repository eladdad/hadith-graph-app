import { createRef, type ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphCanvas } from '../src/components/GraphCanvas';
import { buildRenderableGraph } from '../src/graph';
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

  it('keeps a short collapsed matn marker below its count circle and within its card', () => {
    const graph = buildRenderableGraph([makeReport('short', ['Collector'], 'Short.')]);
    const matn = graph.nodes.find((node) => node.type === 'matn')!;
    const { container } = render(canvas(graph, { zoom: 0.2 }));
    const badge = container.querySelector('.matn-report-label .report-count-badge')!;
    const coordinates = badge.getAttribute('transform')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const radius = Number(badge.querySelector('circle')!.getAttribute('r'));
    const marker = container.querySelector('.matn-highlight-marker-generic')!;
    const markerTop = Number(marker.getAttribute('y'));
    const markerBottom = markerTop + Number(marker.getAttribute('height'));

    expect(markerTop).toBeGreaterThan(coordinates[1] + radius);
    expect(markerBottom).toBeLessThan(matn.height / 2);
    expect(markerTop).toBeGreaterThan(-matn.height / 2);
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
