import {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { GraphEdge, GraphNode, HadithBundle } from '../types';

interface DragNodeState {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
}

interface DragState {
  nodeIds: string[];
  pointerStartX: number;
  pointerStartY: number;
  initialNodes: Record<string, DragNodeState>;
  currentNodes: Record<string, DragNodeState>;
  moved: boolean;
}

interface UseNodeDragParams {
  graphEdges: GraphEdge[];
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

export function useNodeDrag({
  graphEdges,
  graphNodes,
  selectedNodeIds,
  setSelectedNodeIds,
  clientPointToSvg,
  setBundle,
  onDragCommitted,
}: UseNodeDragParams): UseNodeDragResult {
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);

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

          const nextX = Math.max(start.halfWidth + 8, Math.round(start.x + deltaX));
          const nextY = Math.max(start.halfHeight + 8, Math.round(start.y + deltaY));
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
        const nodeById = new Map(graphNodes.map((node) => [node.id, node]));
        let snapped = false;
        let snappedNodeId: string | null = null;
        let snappedParentId: string | null = null;
        let snappedY = 0;

        if (dragState.nodeIds.length === 1) {
          const nodeId = dragState.nodeIds[0];
          const node = nodeById.get(nodeId);

          if (node?.type === 'narrator') {
            const parentIds = graphEdges
              .filter((edge) => edge.target === nodeId)
              .map((edge) => edge.source);

            if (parentIds.length === 1) {
              const parent = nodeById.get(parentIds[0]);
              const currentPosition = dragState.currentNodes[nodeId] ?? dragState.initialNodes[nodeId];

              if (parent && currentPosition) {
                const parentLeft = parent.x - parent.width / 2;
                const parentRight = parent.x + parent.width / 2;

                if (currentPosition.x >= parentLeft && currentPosition.x <= parentRight && currentPosition.x !== parent.x) {
                  snapped = true;
                  snappedNodeId = nodeId;
                  snappedParentId = parent.id;
                  snappedY = currentPosition.y;
                }
              }
            }
          }
        }

        setBundle((previous) => ({
          ...previous,
          nodePositions: snapped && snappedNodeId
            ? {
              ...previous.nodePositions,
              [snappedNodeId]: {
                x: Math.round(snappedParentId
                  ? previous.nodePositions[snappedParentId]?.x ?? nodeById.get(snappedParentId)?.x ?? 0
                  : 0),
                y: snappedY,
              },
            }
            : previous.nodePositions,
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
  }, [graphEdges, graphNodes, isDragging, clientPointToSvg, setBundle, onDragCommitted]);

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
