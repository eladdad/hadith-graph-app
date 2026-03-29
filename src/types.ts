export interface HighlightLegendItem {
  id: string;
  label: string;
  color: string;
}

export interface MatnHighlight {
  id: string;
  legendId: string;
  start: number;
  end: number;
}

export interface HadithReport {
  id: string;
  isnad: string[];
  matn: string;
  matnHighlights: MatnHighlight[];
  createdAt: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export type NodePositionMap = Record<string, NodePosition>;
export type NodeWidthMap = Record<string, number>;

export interface HadithFontSizes {
  narrator: number;
  matn: number;
}

export interface HadithBundle {
  format: 'hadith-graph-bundle';
  version: 1;
  title: string;
  createdAt: string;
  updatedAt: string;
  reports: HadithReport[];
  highlightLegend: HighlightLegendItem[];
  nodePositions: NodePositionMap;
  nodeWidths: NodeWidthMap;
  fontSizes: HadithFontSizes;
}

export type GraphNodeType = 'narrator' | 'matn';

export interface GraphTextSegment {
  text: string;
  width: number;
  color?: string;
  highlightId?: string;
  label?: string;
}

export interface GraphTextLine {
  width: number;
  segments: GraphTextSegment[];
}

export interface GraphNode {
  id: string;
  label: string;
  labelLines: string[];
  matnLines?: string[];
  matnLineSegments?: GraphTextLine[];
  type: GraphNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  path: string;
  label?: string;
  labelX: number;
  labelY: number;
}

export interface RenderableGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  hasCycle: boolean;
  shiftX?: number;
  shiftY?: number;
}
