import {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { GraphNode } from '../types';

interface BoxSelectionState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  moved: boolean;
  startSelection: string[];
}

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseBoxSelectionParams {
  nodes: GraphNode[];
  selectedNodeIds: string[];
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  isDragging: boolean;
  isResizing: boolean;
  clientPointToSvg: (clientX: number, clientY: number) => { x: number; y: number } | null;
}

interface UseBoxSelectionResult {
  isBoxSelecting: boolean;
  selectionBox: SelectionBox | null;
  handleCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  resetBoxSelection: () => void;
}

function uniqueMerge(left: string[], right: string[]): string[] {
  const merged = [...left];
  const seen = new Set(left);
  for (const item of right) {
    if (!seen.has(item)) {
      merged.push(item);
      seen.add(item);
    }
  }
  return merged;
}

function selectionBoxFromPoints(startX: number, startY: number, endX: number, endY: number): SelectionBox {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function nodeIntersectsSelectionBox(node: GraphNode, box: SelectionBox): boolean {
  const halfWidth = node.width / 2;
  const halfHeight = node.height / 2;

  const left = node.x - halfWidth;
  const right = node.x + halfWidth;
  const top = node.y - halfHeight;
  const bottom = node.y + halfHeight;

  const boxRight = box.x + box.width;
  const boxBottom = box.y + box.height;

  return left <= boxRight && right >= box.x && top <= boxBottom && bottom >= box.y;
}

export function useBoxSelection({
  nodes,
  selectedNodeIds,
  setSelectedNodeIds,
  isDragging,
  isResizing,
  clientPointToSvg,
}: UseBoxSelectionParams): UseBoxSelectionResult {
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const boxSelectionRef = useRef<BoxSelectionState | null>(null);

  useEffect(() => {
    if (!isBoxSelecting) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const boxState = boxSelectionRef.current;
      if (!boxState) {
        return;
      }

      const point = clientPointToSvg(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      boxState.currentX = point.x;
      boxState.currentY = point.y;

      const nextBox = selectionBoxFromPoints(boxState.startX, boxState.startY, boxState.currentX, boxState.currentY);
      if (nextBox.width > 2 || nextBox.height > 2) {
        boxState.moved = true;
      }

      setSelectionBox(nextBox);

      const hitNodeIds = nodes
        .filter((node) => nodeIntersectsSelectionBox(node, nextBox))
        .map((node) => node.id);

      if (boxState.additive) {
        setSelectedNodeIds(uniqueMerge(boxState.startSelection, hitNodeIds));
      } else {
        setSelectedNodeIds(hitNodeIds);
      }
    };

    const finishBoxSelection = (): void => {
      const boxState = boxSelectionRef.current;
      boxSelectionRef.current = null;
      setIsBoxSelecting(false);
      setSelectionBox(null);

      if (!boxState) {
        return;
      }

      if (!boxState.moved && !boxState.additive) {
        setSelectedNodeIds([]);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishBoxSelection);
    window.addEventListener('pointercancel', finishBoxSelection);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishBoxSelection);
      window.removeEventListener('pointercancel', finishBoxSelection);
    };
  }, [nodes, isBoxSelecting, setSelectedNodeIds, clientPointToSvg]);

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0 || isDragging || isResizing) {
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    const point = clientPointToSvg(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const additiveSelect = event.shiftKey || event.ctrlKey || event.metaKey;
    const startSelection = additiveSelect ? selectedNodeIds : [];

    if (!additiveSelect) {
      setSelectedNodeIds([]);
    }

    boxSelectionRef.current = {
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      additive: additiveSelect,
      moved: false,
      startSelection,
    };

    setSelectionBox({ x: point.x, y: point.y, width: 0, height: 0 });
    setIsBoxSelecting(true);
    event.preventDefault();
  };

  const resetBoxSelection = (): void => {
    boxSelectionRef.current = null;
    setIsBoxSelecting(false);
    setSelectionBox(null);
  };

  return {
    isBoxSelecting,
    selectionBox,
    handleCanvasPointerDown,
    resetBoxSelection,
  };
}
