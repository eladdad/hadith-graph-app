import {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { GraphNode, HadithBundle } from '../types';

const MIN_NODE_MARGIN = 8;
const POSITION_PRECISION = 100;
const DRAG_START_THRESHOLD_PX = 4;

interface DragNodeState {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
}

interface DragState {
  nodeIds: string[];
  pointerStartClientX: number;
  pointerStartClientY: number;
  pointerStartX: number;
  pointerStartY: number;
  initialNodes: Record<string, DragNodeState>;
  currentNodes: Record<string, DragNodeState>;
  moved: boolean;
}

interface AnchorCounts {
  vertical: Map<number, number>;
  horizontal: Map<number, number>;
}

interface UseNodeDragParams {
  graphNodes: GraphNode[];
  selectedNodeIds: string[];
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  clientPointToSvg: (clientX: number, clientY: number) => { x: number; y: number } | null;
  setBundle: Dispatch<SetStateAction<HadithBundle>>;
  onDragCommitted: (movedCount: number, snapped: boolean) => void;
}

interface UseNodeDragResult {
  isDragging: boolean;
  handleNodePointerDown: (event: ReactPointerEvent<SVGGElement>, nodeId: string) => void;
}

function roundPosition(value: number): number {
  return Math.round(value * POSITION_PRECISION) / POSITION_PRECISION;
}

function clampNodeCenter(value: number, halfSize: number): number {
  return Math.max(halfSize + MIN_NODE_MARGIN, roundPosition(value));
}

function createAnchorCounts(): AnchorCounts {
  return {
    vertical: new Map<number, number>(),
    horizontal: new Map<number, number>(),
  };
}

function incrementAnchorCount(anchorCounts: Map<number, number>, value: number): void {
  anchorCounts.set(value, (anchorCounts.get(value) ?? 0) + 1);
}

function decrementAnchorCount(anchorCounts: Map<number, number>, value: number): void {
  const nextCount = (anchorCounts.get(value) ?? 0) - 1;
  if (nextCount > 0) {
    anchorCounts.set(value, nextCount);
    return;
  }

  anchorCounts.delete(value);
}

function buildAnchorCounts(nodes: GraphNode[]): AnchorCounts {
  const counts = createAnchorCounts();
  nodes.forEach((node) => {
    incrementAnchorCount(counts.vertical, node.x);
    incrementAnchorCount(counts.horizontal, node.y);
  });
  return counts;
}

function cloneAnchorCounts(anchorCounts: AnchorCounts): AnchorCounts {
  return {
    vertical: new Map(anchorCounts.vertical),
    horizontal: new Map(anchorCounts.horizontal),
  };
}

function removeNodeAnchors(anchorCounts: AnchorCounts, nodes: Record<string, DragNodeState>): void {
  Object.values(nodes).forEach((node) => {
    decrementAnchorCount(anchorCounts.vertical, node.x);
    decrementAnchorCount(anchorCounts.horizontal, node.y);
  });
}

function getAxisSnapDelta(
  nodes: Record<string, DragNodeState>,
  axis: 'x' | 'y',
  anchors: Map<number, number>,
): number | null {
  let bestDelta: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  Object.values(nodes).forEach((node) => {
    const center = axis === 'x' ? node.x : node.y;
    const halfSize = axis === 'x' ? node.halfWidth : node.halfHeight;
    const minEdge = center - halfSize;
    const maxEdge = center + halfSize;

    anchors.forEach((count, anchor) => {
      if (count <= 0 || anchor < minEdge || anchor > maxEdge) {
        return;
      }

      const delta = roundPosition(anchor - center);
      const distance = Math.abs(delta);
      if (
        distance < bestDistance
        || (distance === bestDistance && bestDelta !== null && Math.abs(delta) < Math.abs(bestDelta))
      ) {
        bestDelta = delta;
        bestDistance = distance;
      }
    });
  });

  return bestDelta;
}

function applySnapDelta(
  nodes: Record<string, DragNodeState>,
  deltaX: number,
  deltaY: number,
): Record<string, DragNodeState> {
  const snappedNodes: Record<string, DragNodeState> = {};

  Object.entries(nodes).forEach(([nodeId, node]) => {
    snappedNodes[nodeId] = {
      ...node,
      x: clampNodeCenter(node.x + deltaX, node.halfWidth),
      y: clampNodeCenter(node.y + deltaY, node.halfHeight),
    };
  });

  return snappedNodes;
}

export function useNodeDrag({
  graphNodes,
  selectedNodeIds,
  setSelectedNodeIds,
  clientPointToSvg,
  setBundle,
  onDragCommitted,
}: UseNodeDragParams): UseNodeDragResult {
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const anchorCountsRef = useRef<AnchorCounts>(buildAnchorCounts(graphNodes));

  useEffect(() => {
    if (isDragging) {
      return;
    }

    anchorCountsRef.current = buildAnchorCounts(graphNodes);
  }, [graphNodes, isDragging]);

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const point = clientPointToSvg(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      const clientDeltaX = event.clientX - dragState.pointerStartClientX;
      const clientDeltaY = event.clientY - dragState.pointerStartClientY;
      if (
        !dragState.moved
        && Math.hypot(clientDeltaX, clientDeltaY) < DRAG_START_THRESHOLD_PX
      ) {
        return;
      }

      const deltaX = point.x - dragState.pointerStartX;
      const deltaY = point.y - dragState.pointerStartY;

      setBundle((previous) => {
        let changed = false;
        const nextNodePositions = { ...previous.nodePositions };

        for (const nodeId of dragState.nodeIds) {
          const start = dragState.initialNodes[nodeId];
          if (!start) {
            continue;
          }

          const nextX = clampNodeCenter(start.x + deltaX, start.halfWidth);
          const nextY = clampNodeCenter(start.y + deltaY, start.halfHeight);
          const current = previous.nodePositions[nodeId];

          if (!current || current.x !== nextX || current.y !== nextY) {
            nextNodePositions[nodeId] = { x: nextX, y: nextY };
            dragState.currentNodes[nodeId] = {
              ...start,
              x: nextX,
              y: nextY,
            };
            changed = true;
          }
        }

        if (!changed) {
          return previous;
        }

        dragState.moved = true;
        return {
          ...previous,
          nodePositions: nextNodePositions,
        };
      });
    };

    const finishDragging = (): void => {
      const dragState = dragStateRef.current;
      dragStateRef.current = null;
      setIsDragging(false);

      if (dragState?.moved) {
        const anchorCounts = cloneAnchorCounts(anchorCountsRef.current);
        removeNodeAnchors(anchorCounts, dragState.initialNodes);

        const snapDeltaX = getAxisSnapDelta(dragState.currentNodes, 'x', anchorCounts.vertical) ?? 0;
        const snapDeltaY = getAxisSnapDelta(dragState.currentNodes, 'y', anchorCounts.horizontal) ?? 0;
        const snapped = snapDeltaX !== 0 || snapDeltaY !== 0;
        const finalNodes = snapped
          ? applySnapDelta(dragState.currentNodes, snapDeltaX, snapDeltaY)
          : dragState.currentNodes;

        const nextNodePositions: HadithBundle['nodePositions'] = {};
        dragState.nodeIds.forEach((nodeId) => {
          const node = finalNodes[nodeId];
          if (!node) {
            return;
          }

          nextNodePositions[nodeId] = {
            x: node.x,
            y: node.y,
          };
        });

        setBundle((previous) => ({
          ...previous,
          nodePositions: {
            ...previous.nodePositions,
            ...nextNodePositions,
          },
          updatedAt: new Date().toISOString(),
        }));
        onDragCommitted(dragState.nodeIds.length, snapped);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDragging);
    window.addEventListener('pointercancel', finishDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDragging);
      window.removeEventListener('pointercancel', finishDragging);
    };
  }, [graphNodes, isDragging, clientPointToSvg, setBundle, onDragCommitted]);

  const handleNodePointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    nodeId: string,
  ): void => {
    if (event.button !== 0) {
      return;
    }

    const point = clientPointToSvg(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const selectedSet = new Set(selectedNodeIds);
    const additiveSelect = event.shiftKey || event.ctrlKey || event.metaKey;

    let nextSelection: string[];
    if (additiveSelect) {
      if (selectedSet.has(nodeId)) {
        nextSelection = selectedNodeIds.filter((id) => id !== nodeId);
      } else {
        nextSelection = [...selectedNodeIds, nodeId];
      }
    } else if (selectedSet.has(nodeId)) {
      nextSelection = selectedNodeIds;
    } else {
      nextSelection = [nodeId];
    }

    setSelectedNodeIds(nextSelection);
    if (nextSelection.length === 0) {
      event.stopPropagation();
      return;
    }

    const nodeMap = new Map(graphNodes.map((node) => [node.id, node]));
    const clickedNode = nodeMap.get(nodeId);
    if (!clickedNode) {
      return;
    }

    if (clickedNode.type === 'matn') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const draggableNodeIds = nextSelection.filter((selectedId) => nodeMap.get(selectedId)?.type === 'narrator');
    if (draggableNodeIds.length === 0) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const initialNodes: Record<string, DragNodeState> = {};

    for (const selectedId of draggableNodeIds) {
      const node = nodeMap.get(selectedId);
      if (!node) {
        continue;
      }
      initialNodes[selectedId] = {
        x: node.x,
        y: node.y,
        halfWidth: node.width / 2,
        halfHeight: node.height / 2,
      };
    }

    dragStateRef.current = {
      nodeIds: draggableNodeIds,
      pointerStartClientX: event.clientX,
      pointerStartClientY: event.clientY,
      pointerStartX: point.x,
      pointerStartY: point.y,
      initialNodes,
      currentNodes: { ...initialNodes },
      moved: false,
    };

    setIsDragging(true);
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    isDragging,
    handleNodePointerDown,
  };
}
