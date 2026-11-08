import { createRef } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphCanvas } from '../src/components/GraphCanvas';
import { buildRenderableGraph } from '../src/graph';
import type { GraphNode } from '../src/types';
import { makeGraph, makeReport } from './helpers';

function makeMatnNode(segments: GraphNode['matnLineSegments']): GraphNode {
  return {
    id: 'm:r1',
    label: 'Report #1',
    labelLines: ['Report #1'],
    matnLines: ['Matn body'],
    matnLineSegments: segments,
    type: 'matn',
    x: 150,
    y: 120,
    width: 240,
    height: 90,
  };
}

describe('GraphCanvas', () => {
  it('renders matn text when zoomed in and a generic marker when zoomed out', () => {
    const onNodePointerDown = vi.fn();
    const graph = makeGraph({
      nodes: [
        makeMatnNode([
          {
            width: 80,
            segments: [{ text: 'Matn body', width: 80 }],
          },
        ]),
      ],
    });

    const { container, getByText, rerender } = render(
      <GraphCanvas
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
        onNodePointerDown={onNodePointerDown}
        onResizePointerDown={vi.fn()}
      />,
    );

    expect(getByText('Matn body')).toBeInTheDocument();
    expect(getByText('Report #1')).toHaveClass('matn-report-label');
    fireEvent.pointerDown(getByText('Report #1'));
    expect(onNodePointerDown).toHaveBeenLastCalledWith(expect.anything(), 'm:r1');
    expect(container.querySelector('.matn-highlight-marker-generic')).not.toBeInTheDocument();

    rerender(
      <GraphCanvas
        graph={graph}
        zoom={0.2}
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
        onNodePointerDown={onNodePointerDown}
        onResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelector('.matn-node-text')).not.toBeInTheDocument();
    expect(container.querySelector('.matn-highlight-marker-generic')).toBeInTheDocument();
    expect(getByText('Report #1')).toBeInTheDocument();
    fireEvent.pointerDown(getByText('Report #1'));
    expect(onNodePointerDown).toHaveBeenCalledTimes(2);
  });

  it('keeps highlight markers when collapsed matn has highlights', () => {
    const graph = makeGraph({
      nodes: [
        makeMatnNode([
          {
            width: 80,
            segments: [{
              text: 'Highlighted',
              width: 80,
              color: '#ffcc00',
              highlightId: 'h1',
              label: 'Theme',
            }],
          },
        ]),
      ],
    });

    const { container } = render(
      <GraphCanvas
        graph={graph}
        zoom={0.2}
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
      />,
    );

    expect(container.querySelector('.matn-highlight-marker')).toBeInTheDocument();
    expect(container.querySelector('.matn-highlight-marker-generic')).not.toBeInTheDocument();
  });

  it('keeps a short collapsed matn marker below its number and within its card', () => {
    const graph = buildRenderableGraph([makeReport('short', ['Collector'], 'Short.')]);
    const matn = graph.nodes.find((node) => node.type === 'matn')!;
    const { container, getByText } = render(
      <GraphCanvas
        graph={graph}
        zoom={0.2}
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
      />,
    );
    const heading = getByText('Report #1');
    const marker = container.querySelector('.matn-highlight-marker-generic')!;
    const markerTop = Number(marker.getAttribute('y'));
    const markerBottom = markerTop + Number(marker.getAttribute('height'));

    expect(markerTop).toBeGreaterThan(Number(heading.getAttribute('y')) + 4);
    expect(markerBottom).toBeLessThan(matn.height / 2);
    expect(markerTop).toBeGreaterThan(-matn.height / 2);
  });

  it('shows report membership labels and follows their edge selection state', () => {
    const graph = makeGraph({ edges: [{
      id: 'parent->shared',
      source: 'parent',
      target: 'shared',
      path: 'M 100 50 L 200 150',
      label: '#1, #3',
      labelX: 150,
      labelY: 90,
    }] });
    const canvas = (selected: boolean) => (
      <GraphCanvas
        graph={graph}
        zoom={1}
        svgRef={createRef<SVGSVGElement>()}
        narratorFontSize={13}
        matnFontSize={12}
        isBoxSelecting={false}
        selectionBox={null}
        selectedSet={new Set()}
        selectedEdgeSet={new Set(selected ? ['parent->shared'] : [])}
        isDragging={false}
        isResizing={false}
        onCanvasPointerDown={vi.fn()}
        onNodePointerDown={vi.fn()}
        onResizePointerDown={vi.fn()}
      />
    );
    const { getByText, rerender } = render(canvas(false));
    expect(getByText('#1, #3')).toHaveClass('edge-label');
    expect(getByText('#1, #3')).not.toHaveClass('selected');
    rerender(canvas(true));
    expect(getByText('#1, #3')).toHaveClass('selected');
    rerender(canvas(false));
    expect(getByText('#1, #3')).not.toHaveClass('selected');
  });
});
