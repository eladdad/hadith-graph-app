import {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { clampMatnNodeWidth } from '../graph';
import type { GraphNode, HadithBundle } from '../types';

interface ResizeState {
  nodeId: string;
  edge: 'left' | 'right';
  initialCenterX: number;
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

      if (resizeState.edge === 'right') {
        nextWidth = clampMatnNodeWidth(point.x - initialLeft);
      } else {
        nextWidth = clampMatnNodeWidth(initialRight - point.x);
      }

      setBundle((previous) => {
        const currentWidth = previous.nodeWidths[resizeState.nodeId];
        if (currentWidth === nextWidth) {
          return previous;
        }

        const nextNodePositions = { ...previous.nodePositions };
        delete nextNodePositions[resizeState.nodeId];

        resizeState.moved = true;
        return {
          ...previous,
          nodeWidths: {
            ...previous.nodeWidths,
            [resizeState.nodeId]: nextWidth,
          },
          nodePositions: nextNodePositions,
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
    if (event.button !== 0 || node.type !== 'matn') {
      return;
    }

    resizeStateRef.current = {
      nodeId: node.id,
      edge,
      initialCenterX: node.x,
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
