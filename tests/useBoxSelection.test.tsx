import { act, fireEvent, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useBoxSelection } from '../src/hooks/useBoxSelection';
import type { GraphNode } from '../src/types';

const svgNamespace = 'http://www.w3.org/2000/svg';

function makeNode(id: string, x: number, y: number): GraphNode {
  return {
    id,
    label: id,
    labelLines: [id],
    type: 'narrator',
    x,
    y,
    width: 20,
    height: 20,
  };
}

function makeCanvasPointerEvent(options: {
  button?: number;
  clientX?: number;
  clientY?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  sameTarget?: boolean;
}) {
  const currentTarget = document.createElementNS(svgNamespace, 'svg');
  const target = options.sameTarget === false
    ? document.createElementNS(svgNamespace, 'g')
    : currentTarget;

  return {
    button: options.button ?? 0,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    target,
    currentTarget,
    preventDefault: vi.fn(),
  };
}

describe('useBoxSelection', () => {
  it('starts a box selection, clears non-additive selection, and deselects on click without movement', () => {
    const nodes = [makeNode('a', 20, 20)];
    const { result } = renderHook(() => {
      const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(['a']);
      const hook = useBoxSelection({
        nodes,
        selectedNodeIds,
        setSelectedNodeIds,
        isDragging: false,
        isResizing: false,
        clientPointToSvg: (clientX, clientY) => ({ x: clientX, y: clientY }),
      });

      return {
        ...hook,
        selectedNodeIds,
      };
    });

    const event = makeCanvasPointerEvent({ clientX: 10, clientY: 12 });
    act(() => {
      result.current.handleCanvasPointerDown(event as never);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(result.current.isBoxSelecting).toBe(true);
    expect(result.current.selectionBox).toEqual({ x: 10, y: 12, width: 0, height: 0 });
    expect(result.current.selectedNodeIds).toEqual([]);

    act(() => {
      fireEvent.pointerUp(window);
    });

    expect(result.current.isBoxSelecting).toBe(false);
    expect(result.current.selectionBox).toBeNull();
    expect(result.current.selectedNodeIds).toEqual([]);
  });

  it('merges additive selection with nodes hit by the selection box', () => {
    const nodes = [makeNode('a', 20, 20), makeNode('b', 80, 80)];
    const { result } = renderHook(() => {
      const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(['a']);
      const hook = useBoxSelection({
        nodes,
        selectedNodeIds,
        setSelectedNodeIds,
        isDragging: false,
        isResizing: false,
        clientPointToSvg: (clientX, clientY) => ({ x: clientX, y: clientY }),
      });

      return {
        ...hook,
        selectedNodeIds,
      };
    });

    act(() => {
      result.current.handleCanvasPointerDown(makeCanvasPointerEvent({
        clientX: 0,
        clientY: 0,
        shiftKey: true,
      }) as never);
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 90, clientY: 90 });
    });

    expect(result.current.selectionBox).toEqual({ x: 0, y: 0, width: 90, height: 90 });
    expect(result.current.selectedNodeIds).toEqual(['a', 'b']);

    act(() => {
      fireEvent.pointerUp(window);
    });

    expect(result.current.isBoxSelecting).toBe(false);
    expect(result.current.selectionBox).toBeNull();
    expect(result.current.selectedNodeIds).toEqual(['a', 'b']);
  });

  it('ignores invalid pointer starts and supports resetting selection state', () => {
    const { result } = renderHook(() => {
      const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(['a']);
      const hook = useBoxSelection({
        nodes: [makeNode('a', 20, 20)],
        selectedNodeIds,
        setSelectedNodeIds,
        isDragging: false,
        isResizing: false,
        clientPointToSvg: (clientX, clientY) => ({ x: clientX, y: clientY }),
      });

      return {
        ...hook,
        selectedNodeIds,
      };
    });

    act(() => {
      result.current.handleCanvasPointerDown(makeCanvasPointerEvent({
        button: 1,
        clientX: 5,
        clientY: 5,
      }) as never);
    });
    expect(result.current.isBoxSelecting).toBe(false);
    expect(result.current.selectedNodeIds).toEqual(['a']);

    act(() => {
      result.current.handleCanvasPointerDown(makeCanvasPointerEvent({
        clientX: 5,
        clientY: 5,
        sameTarget: false,
      }) as never);
    });
    expect(result.current.isBoxSelecting).toBe(false);

    act(() => {
      result.current.handleCanvasPointerDown(makeCanvasPointerEvent({
        clientX: 5,
        clientY: 5,
      }) as never);
    });
    expect(result.current.isBoxSelecting).toBe(true);

    act(() => {
      result.current.resetBoxSelection();
    });

    expect(result.current.isBoxSelecting).toBe(false);
    expect(result.current.selectionBox).toBeNull();
  });
});
