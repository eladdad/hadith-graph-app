import { act, fireEvent, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyBundle } from '../src/bundle';
import { useNodeResize } from '../src/hooks/useNodeResize';
import type { GraphNode, HadithBundle } from '../src/types';

function makeMatnNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'm:r1',
    label: 'Matn 1',
    labelLines: ['Matn 1'],
    type: 'matn',
    x: 200,
    y: 100,
    width: 240,
    height: 80,
    ...overrides,
  };
}

function makeResizePointerEvent(button = 0) {
  return {
    button,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('useNodeResize', () => {
  it('starts resizing a matn node, updates width, clears saved position, and commits on pointer up', () => {
    const onResizeCommitted = vi.fn();
    const initialBundle: HadithBundle = {
      ...createEmptyBundle('Resize Test'),
      nodeWidths: { 'm:r1': 240 },
      nodePositions: { 'm:r1': { x: 123, y: 100 } },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const { result } = renderHook(() => {
      const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
      const [bundle, setBundle] = useState(initialBundle);
      const hook = useNodeResize({
        clientPointToSvg: (clientX, clientY) => ({ x: clientX, y: clientY }),
        setSelectedNodeIds,
        setBundle,
        onResizeCommitted,
      });

      return {
        ...hook,
        selectedNodeIds,
        bundle,
      };
    });

    const event = makeResizePointerEvent();
    act(() => {
      result.current.handleResizePointerDown(event as never, makeMatnNode(), 'right');
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.isResizing).toBe(true);
    expect(result.current.selectedNodeIds).toEqual(['m:r1']);

    act(() => {
      fireEvent.pointerMove(window, { clientX: 400, clientY: 100 });
    });

    expect(result.current.bundle.nodeWidths['m:r1']).toBe(320);
    expect(result.current.bundle.nodePositions['m:r1']).toBeUndefined();

    act(() => {
      fireEvent.pointerUp(window);
    });

    expect(result.current.isResizing).toBe(false);
    expect(onResizeCommitted).toHaveBeenCalledTimes(1);
    expect(result.current.bundle.updatedAt).not.toBe(initialBundle.updatedAt);
  });

  it('clamps left-edge resizing to the matn minimum width', () => {
    const { result } = renderHook(() => {
      const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
      const [bundle, setBundle] = useState<HadithBundle>({
        ...createEmptyBundle('Clamp Test'),
        nodeWidths: { 'm:r1': 240 },
      });

      const hook = useNodeResize({
        clientPointToSvg: (clientX, clientY) => ({ x: clientX, y: clientY }),
        setSelectedNodeIds,
        setBundle,
        onResizeCommitted: vi.fn(),
      });

      return {
        ...hook,
        selectedNodeIds,
        bundle,
      };
    });

    act(() => {
      result.current.handleResizePointerDown(makeResizePointerEvent() as never, makeMatnNode(), 'left');
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 300, clientY: 100 });
    });

    expect(result.current.bundle.nodeWidths['m:r1']).toBe(220);
  });

  it('ignores invalid resize starts and does not commit when nothing moved', () => {
    const onResizeCommitted = vi.fn();
    const narratorNode: GraphNode = {
      ...makeMatnNode({ id: 'n:alpha', type: 'narrator' }),
    };

    const { result } = renderHook(() => {
      const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
      const [bundle, setBundle] = useState(createEmptyBundle('Ignore Resize'));
      const hook = useNodeResize({
        clientPointToSvg: (clientX, clientY) => ({ x: clientX, y: clientY }),
        setSelectedNodeIds,
        setBundle,
        onResizeCommitted,
      });

      return {
        ...hook,
        selectedNodeIds,
        bundle,
      };
    });

    act(() => {
      result.current.handleResizePointerDown(makeResizePointerEvent(1) as never, makeMatnNode(), 'right');
    });
    expect(result.current.isResizing).toBe(false);

    act(() => {
      result.current.handleResizePointerDown(makeResizePointerEvent() as never, narratorNode, 'right');
    });
    expect(result.current.isResizing).toBe(false);

    act(() => {
      result.current.handleResizePointerDown(makeResizePointerEvent() as never, makeMatnNode(), 'right');
    });
    expect(result.current.isResizing).toBe(true);

    act(() => {
      fireEvent.pointerUp(window);
    });

    expect(onResizeCommitted).not.toHaveBeenCalled();
  });
});
