import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphCanvas } from '../src/components/GraphCanvas';
import type { GraphNode } from '../src/types';
import { makeGraph } from './helpers';

function makeMatnNode(segments: GraphNode['matnLineSegments']): GraphNode {
  return {
    id: 'm:r1',
    label: 'Matn 1',
    labelLines: ['Matn 1'],
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
        onNodePointerDown={vi.fn()}
        onResizePointerDown={vi.fn()}
      />,
    );

    expect(getByText('Matn body')).toBeInTheDocument();
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
        onNodePointerDown={vi.fn()}
        onResizePointerDown={vi.fn()}
      />,
    );

    expect(container.querySelector('.matn-node-text')).not.toBeInTheDocument();
    expect(container.querySelector('.matn-highlight-marker-generic')).toBeInTheDocument();
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
});
