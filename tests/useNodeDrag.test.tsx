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

function buildNodePositions(nodes: GraphNode[]): HadithBundle['nodePositions'] {
  return Object.fromEntries(
    nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  );
}

function renderNodeDragHook(options: {
  graphNodes: GraphNode[];
  initialSelectedNodeIds?: string[];
  initialBundle?: HadithBundle;
  clientPointToSvg?: (clientX: number, clientY: number) => { x: number; y: number } | null;
  onDragCommitted?: (movedCount: number, snapped: boolean) => void;
  syncGraphNodesToBundle?: boolean;
}) {
  const onDragCommitted = options.onDragCommitted ?? vi.fn();
  const initialBundle = options.initialBundle ?? {
    ...createEmptyBundle('Drag Test'),
    nodePositions: buildNodePositions(options.graphNodes),
  };

  const { result } = renderHook(() => {
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(
      options.initialSelectedNodeIds ?? [],
    );
    const [bundle, setBundle] = useState<HadithBundle>(initialBundle);
    const graphNodes = options.syncGraphNodesToBundle
      ? options.graphNodes.map((node) => ({
        ...node,
        x: bundle.nodePositions[node.id]?.x ?? node.x,
        y: bundle.nodePositions[node.id]?.y ?? node.y,
      }))
      : options.graphNodes;

    const hook = useNodeDrag({
      graphNodes,
      selectedNodeIds,
      setSelectedNodeIds,
      clientPointToSvg: options.clientPointToSvg ?? ((clientX, clientY) => ({ x: clientX, y: clientY })),
      setBundle,
      onDragCommitted,
    });

    return {
      ...hook,
      selectedNodeIds,
      bundle,
    };
  });

  return {
    result,
    onDragCommitted,
  };
}

describe('useNodeDrag', () => {
  it('arms the drag threshold without a first-move jump, even if the svg offset shifts', () => {
    let screenOffsetX = 0;

    const { result } = renderNodeDragHook({
      graphNodes: [makeNarratorNode()],
      clientPointToSvg: (clientX, clientY) => ({
        x: clientX - screenOffsetX,
        y: clientY,
      }),
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

  it('snaps a dragged narrator to nearby external anchor lines on pointer up', () => {
    const onDragCommitted = vi.fn();
    const graphNodes = [
      makeNarratorNode(),
      makeNarratorNode({
        id: 'n:beta',
        label: 'Beta',
        labelLines: ['Beta'],
        x: 160,
        y: 130,
      }),
    ];
    const initialBundle: HadithBundle = {
      ...createEmptyBundle('Snap Test'),
      nodePositions: buildNodePositions(graphNodes),
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { result } = renderNodeDragHook({
      graphNodes,
      initialBundle,
      onDragCommitted,
    });

    act(() => {
      result.current.handleNodePointerDown(makeDragPointerEvent() as never, 'n:alpha');
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 105, clientY: 105 });
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 155, clientY: 123 });
    });

    expect(result.current.bundle.nodePositions['n:alpha']).toEqual({ x: 150, y: 118 });

    act(() => {
      fireEvent.pointerUp(window);
    });

    expect(result.current.isDragging).toBe(false);
    expect(result.current.bundle.nodePositions['n:alpha']).toEqual({ x: 160, y: 130 });
    expect(result.current.bundle.updatedAt).not.toBe(initialBundle.updatedAt);
    expect(onDragCommitted).toHaveBeenCalledWith(1, true);
  });

  it('does not count other dragged nodes as snap anchors when a multi-selection moves', () => {
    const onDragCommitted = vi.fn();
    const graphNodes = [
      makeNarratorNode(),
      makeNarratorNode({
        id: 'n:beta',
        label: 'Beta',
        labelLines: ['Beta'],
        x: 200,
        y: 180,
      }),
      makeNarratorNode({
        id: 'n:gamma',
        label: 'Gamma',
        labelLines: ['Gamma'],
        x: 420,
        y: 420,
      }),
    ];
    const initialBundle: HadithBundle = {
      ...createEmptyBundle('Multi Drag Test'),
      nodePositions: buildNodePositions(graphNodes),
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { result } = renderNodeDragHook({
      graphNodes,
      initialSelectedNodeIds: ['n:alpha', 'n:beta'],
      initialBundle,
      onDragCommitted,
    });

    act(() => {
      result.current.handleNodePointerDown(makeDragPointerEvent() as never, 'n:alpha');
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 105, clientY: 105 });
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 115, clientY: 115 });
    });

    expect(result.current.bundle.nodePositions['n:alpha']).toEqual({ x: 110, y: 110 });
    expect(result.current.bundle.nodePositions['n:beta']).toEqual({ x: 210, y: 190 });

    act(() => {
      fireEvent.pointerUp(window);
    });

    expect(result.current.bundle.nodePositions['n:alpha']).toEqual({ x: 110, y: 110 });
    expect(result.current.bundle.nodePositions['n:beta']).toEqual({ x: 210, y: 190 });
    expect(result.current.bundle.updatedAt).not.toBe(initialBundle.updatedAt);
    expect(onDragCommitted).toHaveBeenCalledWith(2, false);
  });

  it('drops abandoned alignment lines after a narrator moves off them', () => {
    const onDragCommitted = vi.fn();
    const graphNodes = [
      makeNarratorNode(),
      makeNarratorNode({
        id: 'n:beta',
        label: 'Beta',
        labelLines: ['Beta'],
        x: 220,
        y: 220,
      }),
      makeNarratorNode({
        id: 'n:gamma',
        label: 'Gamma',
        labelLines: ['Gamma'],
        x: 320,
        y: 320,
      }),
    ];
    const { result } = renderNodeDragHook({
      graphNodes,
      initialBundle: {
        ...createEmptyBundle('Alignment Cleanup Test'),
        nodePositions: buildNodePositions(graphNodes),
      },
      onDragCommitted,
      syncGraphNodesToBundle: true,
    });

    act(() => {
      result.current.handleNodePointerDown(makeDragPointerEvent(0, 100, 100) as never, 'n:alpha');
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 105, clientY: 105 });
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 155, clientY: 155 });
    });

    act(() => {
      fireEvent.pointerUp(window);
    });

    expect(result.current.bundle.nodePositions['n:alpha']).toEqual({ x: 150, y: 150 });

    act(() => {
      result.current.handleNodePointerDown(makeDragPointerEvent(0, 220, 220) as never, 'n:beta');
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 225, clientY: 225 });
    });

    act(() => {
      fireEvent.pointerMove(window, { clientX: 110, clientY: 108 });
    });

    expect(result.current.bundle.nodePositions['n:beta']).toEqual({ x: 105, y: 103 });

    act(() => {
      fireEvent.pointerUp(window);
    });

    expect(result.current.bundle.nodePositions['n:beta']).toEqual({ x: 105, y: 103 });
    expect(onDragCommitted).toHaveBeenNthCalledWith(1, 1, false);
    expect(onDragCommitted).toHaveBeenNthCalledWith(2, 1, false);
  });
});
