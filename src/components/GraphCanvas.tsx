import { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { REPORT_SIDE_PADDING } from '../graph';
import type { SelectionBox } from '../hooks/useBoxSelection';
import type { GraphNode, RenderableGraph } from '../types';

interface GraphCanvasProps {
  graph: RenderableGraph;
  zoom: number;
  svgRef: RefObject<SVGSVGElement | null>;
  narratorFontSize: number;
  matnFontSize: number;
  isBoxSelecting: boolean;
  selectionBox: SelectionBox | null;
  selectedSet: Set<string>;
  isDragging: boolean;
  isResizing: boolean;
  onCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onNodePointerDown: (event: ReactPointerEvent<SVGGElement>, nodeId: string) => void;
  onResizePointerDown: (event: ReactPointerEvent<SVGRectElement>, node: GraphNode, edge: 'left' | 'right') => void;
}

export function GraphCanvas({
  graph,
  zoom,
  svgRef,
  narratorFontSize,
  matnFontSize,
  isBoxSelecting,
  selectionBox,
  selectedSet,
  isDragging,
  isResizing,
  onCanvasPointerDown,
  onNodePointerDown,
  onResizePointerDown,
}: GraphCanvasProps) {
  return (
    <svg
      ref={svgRef}
      width={Math.round(graph.width * zoom)}
      height={Math.round(graph.height * zoom)}
      viewBox={`0 0 ${graph.width} ${graph.height}`}
      className={isBoxSelecting ? 'graph-svg selecting' : 'graph-svg'}
      onPointerDown={onCanvasPointerDown}
    >
      <defs>
        <marker
          id="arrow"
          markerWidth="10"
          markerHeight="8"
          refX="9"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 4 L 0 8 z" fill="#4f6f98" />
        </marker>
      </defs>

      {graph.edges.map((edge) => (
        <g key={edge.id}>
          <path d={edge.path} className="graph-edge" markerEnd="url(#arrow)" />
          {edge.label ? (
            <text x={edge.labelX} y={edge.labelY} className="edge-label">{edge.label}</text>
          ) : null}
        </g>
      ))}

      {selectionBox ? (
        <rect
          x={selectionBox.x}
          y={selectionBox.y}
          width={selectionBox.width}
          height={selectionBox.height}
          className="selection-box"
        />
      ) : null}

      {graph.nodes.map((node) => {
        const selected = selectedSet.has(node.id);
        const className = [
          'node-group',
          selected ? 'selected' : '',
          isDragging && selected ? 'dragging' : '',
          isResizing && selected ? 'resizing' : '',
        ]
          .filter((value) => value.length > 0)
          .join(' ');

        const narratorLineStep = narratorFontSize + 4;
        const matnLineStep = matnFontSize + 4;
        const labelStartDy = -((node.labelLines.length - 1) * narratorLineStep) / 2;
        const reportTitleY = -node.height / 2 + 18;
        const reportDividerY = -node.height / 2 + 28;
        const reportMatnStartY = reportDividerY + 15;
        const reportTextX = node.width / 2 - REPORT_SIDE_PADDING;
        const handleHeight = Math.max(24, node.height - 18);
        const handleY = -handleHeight / 2;

        return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            className={className}
            onPointerDown={(event) => onNodePointerDown(event, node.id)}
          >
            <rect
              x={-node.width / 2}
              y={-node.height / 2}
              width={node.width}
              height={node.height}
              rx={14}
              className={node.type === 'narrator' ? 'node-narrator' : 'node-report'}
            />

            {node.type === 'report' ? (
              <>
                {selected ? (
                  <>
                    <rect
                      x={-node.width / 2 - 6}
                      y={handleY}
                      width={12}
                      height={handleHeight}
                      className="resize-handle resize-handle-left"
                      onPointerDown={(event) => onResizePointerDown(event, node, 'left')}
                    />
                    <rect
                      x={node.width / 2 - 6}
                      y={handleY}
                      width={12}
                      height={handleHeight}
                      className="resize-handle resize-handle-right"
                      onPointerDown={(event) => onResizePointerDown(event, node, 'right')}
                    />
                  </>
                ) : null}
                <text textAnchor="end" className="node-label report-title" x={reportTextX} y={reportTitleY}>
                  {node.label}
                </text>
                <line
                  x1={-node.width / 2 + 10}
                  y1={reportDividerY}
                  x2={node.width / 2 - 10}
                  y2={reportDividerY}
                  className="report-divider"
                />
                <text
                  textAnchor="end"
                  className="node-matn"
                  x={reportTextX}
                  y={reportMatnStartY}
                  style={{ fontSize: `${matnFontSize}px` }}
                >
                  {(node.matnLines ?? ['']).map((line, index) => (
                    <tspan key={`${node.id}-matn-${index}`} x={reportTextX} dy={index === 0 ? 0 : matnLineStep}>
                      {line.length > 0 ? line : '\u00a0'}
                    </tspan>
                  ))}
                </text>
              </>
            ) : (
              <text textAnchor="middle" className="node-label" style={{ fontSize: `${narratorFontSize}px` }}>
                {node.labelLines.map((line, index) => (
                  <tspan key={`${node.id}-label-${index}`} x="0" dy={index === 0 ? labelStartDy : narratorLineStep}>
                    {line}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
