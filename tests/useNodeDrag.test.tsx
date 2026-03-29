import { act, fireEvent, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyBundle } from '../src/bundle';
import { useNodeDrag } from '../src/hooks/useNodeDrag';
import type { GraphNode, HadithBundle } from '../src/types';

function makeNarratorNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'n:alpha',
    label: 'Alpha',
    labelLines: ['Alpha'],
    type: 'narrator',
    x: 100,
    y: 100,
    width: 80,
    height: 40,
    ...overrides,
  };
}

function makeDragPointerEvent(button = 0, clientX = 100, clientY = 100) {
  return {
    button,
    clientX,
    clientY,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('useNodeDrag', () => {
  it('arms the drag threshold without a first-move jump, even if the svg offset shifts', () => {
    let screenOffsetX = 0;

    const { result } = renderHook(() => {
      const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
      const [bundle, setBundle] = useState<HadithBundle>({
        ...createEmptyBundle('Drag Test'),
        nodePositions: {
          'n:alpha': { x: 100, y: 100 },
        },
      });

      const hook = useNodeDrag({
        graphNodes: [makeNarratorNode()],
        selectedNodeIds,
        setSelectedNodeIds,
        clientPointToSvg: (clientX, clientY) => ({
          x: clientX - screenOffsetX,
          y: clientY,
        }),
        setBundle,
        onDragCommitted: vi.fn(),
      });

      return {
        ...hook,
        selectedNodeIds,
        bundle,
      };
    });

    const event = makeDragPointerEvent();
    act(() => {
      result.current.handleNodePointerDown(event as never, 'n:alpha');
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.isDragging).toBe(true);
    expect(result.current.selectedNodeIds).toEqual(['n:alpha']);

    screenOffsetX = 10;

    act(() => {
      fireEvent.pointerMove(window, { clientX: 106, clientY: 100 });
    });

    expect(result.current.bundle.nodePositions['n:alpha']).toEqual({ x: 100, y: 100 });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 110, clientY: 100 });
    });

    expect(result.current.bundle.nodePositions['n:alpha']).toEqual({ x: 104, y: 100 });
  });
});
