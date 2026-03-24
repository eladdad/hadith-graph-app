import {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { clampReportWidth } from '../graph';
import type { GraphNode, HadithBundle } from '../types';

interface ResizeState {
  nodeId: string;
  edge: 'left' | 'right';
  initialCenterX: number;
  initialCenterY: number;
  initialWidth: number;
  moved: boolean;
}

interface UseNodeResizeParams {
  clientPointToSvg: (clientX: number, clientY: number) => { x: number; y: number } | null;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  setBundle: Dispatch<SetStateAction<HadithBundle>>;
  onResizeCommitted: () => void;
}

interface UseNodeResizeResult {
  isResizing: boolean;
  handleResizePointerDown: (
    event: ReactPointerEvent<SVGRectElement>,
    node: GraphNode,
    edge: 'left' | 'right',
  ) => void;
}

export function useNodeResize({
  clientPointToSvg,
  setSelectedNodeIds,
  setBundle,
  onResizeCommitted,
}: UseNodeResizeParams): UseNodeResizeResult {
  const [isResizing, setIsResizing] = useState(false);
  const resizeStateRef = useRef<ResizeState | null>(null);

  useEffect(() => {
    if (!isResizing) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const point = clientPointToSvg(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      const initialLeft = resizeState.initialCenterX - resizeState.initialWidth / 2;
      const initialRight = resizeState.initialCenterX + resizeState.initialWidth / 2;

      let nextWidth = resizeState.initialWidth;
      let nextX = resizeState.initialCenterX;

      if (resizeState.edge === 'right') {
        nextWidth = clampReportWidth(point.x - initialLeft);
        nextX = initialLeft + nextWidth / 2;
      } else {
        nextWidth = clampReportWidth(initialRight - point.x);
        nextX = initialRight - nextWidth / 2;
      }

      const minCenterX = nextWidth / 2 + 8;
      if (nextX < minCenterX) {
        nextX = minCenterX;
      }

      const nextY = Math.max(16, Math.round(resizeState.initialCenterY));

      setBundle((previous) => {
        const currentWidth = previous.nodeWidths[resizeState.nodeId];
        const currentPosition = previous.nodePositions[resizeState.nodeId];

        if (
          currentWidth === nextWidth
          && currentPosition
          && currentPosition.x === Math.round(nextX)
          && currentPosition.y === nextY
        ) {
          return previous;
        }

        resizeState.moved = true;
        return {
          ...previous,
          nodeWidths: {
            ...previous.nodeWidths,
            [resizeState.nodeId]: nextWidth,
          },
          nodePositions: {
            ...previous.nodePositions,
            [resizeState.nodeId]: { x: Math.round(nextX), y: nextY },
          },
        };
      });
    };

    const finishResizing = (): void => {
      const resizeState = resizeStateRef.current;
      resizeStateRef.current = null;
      setIsResizing(false);

      if (resizeState?.moved) {
        setBundle((previous) => ({
          ...previous,
          updatedAt: new Date().toISOString(),
        }));
        onResizeCommitted();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResizing);
    window.addEventListener('pointercancel', finishResizing);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResizing);
      window.removeEventListener('pointercancel', finishResizing);
    };
  }, [isResizing, clientPointToSvg, setBundle, onResizeCommitted]);

  const handleResizePointerDown = (
    event: ReactPointerEvent<SVGRectElement>,
    node: GraphNode,
    edge: 'left' | 'right',
  ): void => {
    if (event.button !== 0 || node.type !== 'report') {
      return;
    }

    resizeStateRef.current = {
      nodeId: node.id,
      edge,
      initialCenterX: node.x,
      initialCenterY: node.y,
      initialWidth: node.width,
      moved: false,
    };

    setSelectedNodeIds([node.id]);
    setIsResizing(true);
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    isResizing,
    handleResizePointerDown,
  };
}
