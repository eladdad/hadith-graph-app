interface LayoutNode {
  id: string;
  width: number;
  visibleWidth?: number;
  height: number;
}

export interface LayoutLayer {
  y: number;
  nodes: LayoutNode[];
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface LayoutFootprint {
  anchor: string;
  width: number;
}

export interface Point {
  x: number;
  y: number;
}
