import { PointerEvent as ReactPointerEvent, RefObject, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AUTHORITY_REPORT_GAP,
  getAuthorityReportMetrics,
  MATN_NODE_HEADER_HEIGHT,
  MATN_NODE_SIDE_PADDING,
} from '../graph';
import type { SelectionBox } from '../hooks/useBoxSelection';
import type { GraphNode, RenderableGraph } from '../types';
import { ReportCountBadge } from './ReportCountBadge';
import { buildVerticalCurve, REPORT_COUNT_BADGE_RADIUS } from '../edgeGeometry';

const MARKER_HIGHLIGHT_ZOOM_THRESHOLD = 0.3;
const COMPACT_MARKER_WIDTH = 16;
const MIN_COMPACT_MARKER_HEIGHT = 12;

interface GraphCanvasProps {
  graph: RenderableGraph;
  zoom: number;
  svgRef: RefObject<SVGSVGElement | null>;
  narratorFontSize: number;
  matnFontSize: number;
  isBoxSelecting: boolean;
  selectionBox: SelectionBox | null;
  selectedSet: Set<string>;
  selectedEdgeSet: Set<string>;
  selectedReportId?: string | null;
  highlightedReportIds?: ReadonlySet<string>;
  isDragging: boolean;
  isResizing: boolean;
  onCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onNodePointerDown: (event: ReactPointerEvent<SVGGElement>, nodeId: string) => void;
  onResizePointerDown: (event: ReactPointerEvent<SVGRectElement>, node: GraphNode, edge: 'left' | 'right') => void;
  onSelectReport?: (reportId: string) => void;
  onFocusNarrator?: (name: string) => void;
  focusedNarrator?: string | null;
  selectedStudent?: string | null;
  onSelectStudent?: (name: string) => void;
}

interface MeasuredMatnHighlightOverlay {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface MatnHighlightMarker {
  key: string;
  color: string;
  label: string;
  isGeneric?: boolean;
}

const GENERIC_MATN_MARKER: MatnHighlightMarker = {
  key: 'matn',
  color: 'var(--matn-marker-generic-fill)',
  label: 'Matn',
  isGeneric: true,
};

function getMatnHighlightMarkers(node: GraphNode): MatnHighlightMarker[] {
  const markers = new Map<string, MatnHighlightMarker>();

  (node.matnLineSegments ?? []).forEach((line) => {
    line.segments.forEach((segment) => {
      if (!segment.highlightId || !segment.color) {
        return;
      }

      const label = segment.label ?? 'Highlight';
      const markerKey = `${label}:${segment.color}`;
      if (!markers.has(markerKey)) {
        markers.set(markerKey, {
          key: markerKey,
          color: segment.color,
          label,
        });
      }
    });
  });

  return Array.from(markers.values());
}

function getCollapsedMatnMarkers(node: GraphNode): MatnHighlightMarker[] {
  const markers = getMatnHighlightMarkers(node);
  return markers.length > 0 ? markers : [GENERIC_MATN_MARKER];
}

function overlaysEqual(
  left: MeasuredMatnHighlightOverlay[],
  right: MeasuredMatnHighlightOverlay[],
): boolean {
  return left.length === right.length
    && left.every((overlay, index) => (
      overlay.key === right[index]?.key
      && overlay.x === right[index]?.x
      && overlay.y === right[index]?.y
      && overlay.width === right[index]?.width
      && overlay.height === right[index]?.height
      && overlay.color === right[index]?.color
    ));
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
  selectedEdgeSet,
  selectedReportId,
  highlightedReportIds,
  isDragging,
  isResizing,
  onCanvasPointerDown,
  onNodePointerDown,
  onResizePointerDown,
  onSelectReport,
  onFocusNarrator,
  focusedNarrator,
  selectedStudent,
  onSelectStudent,
}: GraphCanvasProps) {
  const showHighlightMarkers = zoom <= MARKER_HIGHLIGHT_ZOOM_THRESHOLD;
  const highlightSegmentRefs = useRef(new Map<string, SVGTSpanElement>());
  const [measuredHighlightOverlays, setMeasuredHighlightOverlays] = useState<MeasuredMatnHighlightOverlay[]>([]);

  const setHighlightSegmentRef = useCallback((key: string, element: SVGTSpanElement | null): void => {
    if (element) {
      highlightSegmentRefs.current.set(key, element);
      return;
    }

    highlightSegmentRefs.current.delete(key);
  }, []);

  useLayoutEffect(() => {
    if (showHighlightMarkers) {
      setMeasuredHighlightOverlays((previous) => (previous.length === 0 ? previous : []));
      return;
    }

    const nextOverlays: MeasuredMatnHighlightOverlay[] = [];
    graph.nodes.forEach((node) => {
      (node.matnLineSegments ?? []).forEach((line, lineIndex) => {
        line.segments.forEach((segment, segmentIndex) => {
          if (!segment.highlightId || !segment.color || segment.text.length === 0) {
            return;
          }

          const key = `${node.id}-matn-${lineIndex}-${segmentIndex}`;
          const segmentElement = highlightSegmentRefs.current.get(key);
          if (!segmentElement) {
            return;
          }

          const { x, y, width, height } = segmentElement.getBBox();
          nextOverlays.push({
            key,
            x,
            y,
            width,
            height,
            color: segment.color,
          });
        });
      });
    });

    nextOverlays.sort((left, right) => left.key.localeCompare(right.key));
    setMeasuredHighlightOverlays((previous) => (overlaysEqual(previous, nextOverlays) ? previous : nextOverlays));
  }, [graph.nodes, showHighlightMarkers, zoom]);

  const highlightOverlayByKey = useMemo(
    () => new Map(measuredHighlightOverlays.map((overlay) => [overlay.key, overlay])),
    [measuredHighlightOverlays],
  );
  const badgeRevision = useMemo(() => ({ graph, zoom }), [graph, zoom]);
  const nodeLabels = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.label])), [graph.nodes]);
  const matnAttachments = useMemo(() => {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    return graph.nodes.flatMap((matn) => {
      const anchor = nodes.get(matn.matnAnchorId ?? '');
      if (matn.type !== 'matn' || !anchor) return [];
      const direction = matn.y >= anchor.y ? 1 : -1;
      const curve = buildVerticalCurve(
        { x: anchor.x, y: anchor.y + direction * anchor.height / 2 },
        { x: matn.x, y: matn.y - direction * matn.height / 2 },
        direction,
      );
      return [{ id: matn.id, path: curve.path }];
    });
  }, [graph.nodes]);

  return (
    <>
    <svg
      ref={svgRef}
      width={graph.width * zoom}
      height={graph.height * zoom}
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
          <path d="M 0 0 L 10 4 L 0 8 z" fill="var(--edge)" />
        </marker>
        <marker
          id="arrow-selected"
          markerWidth="10"
          markerHeight="8"
          refX="9"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 4 L 0 8 z" fill="var(--edge-selected)" />
        </marker>
      </defs>

      {matnAttachments.map((attachment) => (
        <path
          key={attachment.id}
          d={attachment.path}
          data-matn-attachment={attachment.id}
          className={selectedSet.has(attachment.id) ? 'matn-attachment selected' : 'matn-attachment'}
        />
      ))}

      {graph.edges.map((edge) => (
        <g key={edge.id} data-edge-path-id={edge.id}>
          <path
            d={edge.path}
            data-edge-id={edge.id}
            className={selectedEdgeSet.has(edge.id) ? 'graph-edge selected' : 'graph-edge'}
            markerEnd={selectedEdgeSet.has(edge.id) ? 'url(#arrow-selected)' : 'url(#arrow)'}
          />
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
        const isStudent = Boolean(onSelectStudent && node.id.startsWith('focus:student:'));
        const className = [
          'node-group',
          node.isAuthority || node.attributedReports?.length ? 'authority' : '',
          node.type === 'narrator' && node.label === focusedNarrator ? 'focused-narrator' : '',
          isStudent ? 'student-node' : '',
          selected ? 'selected' : '',
          isDragging && selected ? 'dragging' : '',
          isResizing && selected ? 'resizing' : '',
        ]
          .filter((value) => value.length > 0)
          .join(' ');

        const narratorLineStep = narratorFontSize + 4;
        const matnLineStep = matnFontSize + 4;
        const labelStartDy = -((node.labelLines.length - 1) * narratorLineStep) / 2;
        const matnNodeTextStartY = -node.height / 2 + MATN_NODE_HEADER_HEIGHT + matnFontSize + 6;
        const matnNodeTextX = node.width / 2 - MATN_NODE_SIDE_PADDING;
        const handleHeight = Math.max(24, node.height - 18);
        const handleY = -handleHeight / 2;
        const authorityReports = getAuthorityReportMetrics(node.attributedReports);

        return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            data-node-id={node.id}
            data-node-type={node.type}
            className={className}
            role={isStudent ? 'button' : undefined}
            tabIndex={isStudent ? 0 : undefined}
            aria-label={isStudent ? `Highlight sources reported by ${node.label}` : undefined}
            aria-pressed={isStudent ? selectedStudent === node.label : undefined}
            onPointerDown={(event) => onNodePointerDown(event, node.id)}
            onKeyDown={(event) => {
              if (isStudent && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                event.stopPropagation();
                onSelectStudent?.(node.label);
              }
            }}
            onDoubleClick={(event) => {
              if (node.type === 'narrator' && !(event.target as Element).closest('.report-count-badge')) {
                event.preventDefault();
                event.stopPropagation();
                onFocusNarrator?.(node.label);
              }
            }}
          >
            {node.type === 'narrator' && onFocusNarrator ? <title>{node.label} — double-click to focus on this narrator</title> : null}
            {node.type === 'narrator' ? (
              <rect
                x={-node.width / 2}
                y={-node.height / 2}
                width={node.width}
                height={node.height}
                rx={14}
                className="node-narrator"
              />
            ) : (
              <rect
                x={-node.width / 2}
                y={-node.height / 2}
                width={node.width}
                height={node.height}
                rx={14}
                className="node-matn-hitbox"
              />
            )}

            {node.type === 'matn' ? (
              <>
                {node.report ? (
                  <g className="matn-report-label">
                    <ReportCountBadge
                      reports={[node.report]}
                      x={matnNodeTextX - REPORT_COUNT_BADGE_RADIUS}
                      y={-node.height / 2 + REPORT_COUNT_BADGE_RADIUS + 1}
                      label="Matn wording"
                      selectedReportId={selectedReportId}
                      highlightedReportIds={highlightedReportIds}
                      className={!highlightedReportIds && selected ? 'selected' : undefined}
                      onSelectReport={onSelectReport}
                      revision={badgeRevision}
                    />
                  </g>
                ) : null}
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
                {(node.matnLineSegments ?? []).map((line, index) => {
                  const lineY = matnNodeTextStartY + index * matnLineStep;

                  return (
                    <g key={`${node.id}-matn-line-${index}`}>
                      {!showHighlightMarkers ? (
                        <>
                          {line.segments.map((segment, segmentIndex) => {
                            const segmentKey = `${node.id}-matn-${index}-${segmentIndex}`;
                            const overlay = highlightOverlayByKey.get(segmentKey);
                            if (!overlay) {
                              return null;
                            }

                            return (
                              <g key={`${segmentKey}-overlay`}>
                                <rect
                                  x={overlay.x - 3}
                                  y={overlay.y - 1}
                                  width={overlay.width + 6}
                                  height={overlay.height + 4}
                                  rx={5}
                                  className="matn-highlight-band"
                                  fill={overlay.color}
                                />
                              </g>
                            );
                          })}
                          <text
                            x={matnNodeTextX}
                            y={lineY}
                            textAnchor="end"
                            xmlSpace="preserve"
                            className="matn-node-text"
                            style={{
                              fontSize: `${matnFontSize}px`,
                            }}
                          >
                            {line.segments.map((segment, segmentIndex) => (
                              <tspan
                                key={`${node.id}-matn-${index}-${segmentIndex}`}
                                ref={segment.highlightId && segment.color
                                  ? (element) => setHighlightSegmentRef(`${node.id}-matn-${index}-${segmentIndex}`, element)
                                  : undefined}
                                fill={segment.color ?? undefined}
                              >
                                {segment.text.length > 0 ? segment.text : '\u00a0'}
                              </tspan>
                            ))}
                          </text>
                        </>
                      ) : null}
                    </g>
                  );
                })}
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
            {node.attributedReports?.length ? (
              <g className="authority-report-links">
                <ReportCountBadge
                  reports={node.attributedReports}
                  x={node.width / 2 + AUTHORITY_REPORT_GAP + authorityReports.width / 2}
                  y={0}
                  label={`${node.label} attributions`}
                  selectedReportId={selectedReportId}
                  highlightedReportIds={highlightedReportIds}
                  className={!highlightedReportIds && !selectedReportId && selected ? 'selected' : undefined}
                  onSelectReport={onSelectReport}
                  revision={badgeRevision}
                />
              </g>
            ) : null}
          </g>
        );
      })}
      {/* Keep badges above every path and node so crossings cannot intercept clicks. */}
      {graph.edges.filter((edge) => edge.label && edge.reports?.length).map((edge) => (
        <g key={`badge:${edge.id}`} data-edge-id={edge.id}>
          <g className={selectedEdgeSet.has(edge.id) ? 'edge-label selected' : 'edge-label'}>
            <ReportCountBadge
              reports={edge.reports!}
              x={edge.labelX}
              y={edge.labelY}
              label={`${nodeLabels.get(edge.source) ?? edge.source} → ${nodeLabels.get(edge.target) ?? edge.target}`}
              selectedReportId={selectedReportId}
              highlightedReportIds={highlightedReportIds}
              className={selectedEdgeSet.has(edge.id) ? 'selected' : undefined}
              onSelectReport={onSelectReport}
              revision={badgeRevision}
            />
          </g>
        </g>
      ))}
    </svg>
    {showHighlightMarkers ? (
      // No viewBox: one unit in this overlay is one CSS pixel. Zoom only
      // changes the stack's anchor position, never its dimensions or spacing.
      <svg
        className="matn-marker-overlay"
        width={graph.width * zoom}
        height={graph.height * zoom}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        {graph.nodes.filter((node) => node.type === 'matn').map((node) => {
          const markers = getCollapsedMatnMarkers(node);
          const availableHeight = Math.max(1, node.height - MATN_NODE_HEADER_HEIGHT - 16);
          const baseGap = Math.min(10, availableHeight / (markers.length * 2));
          const baseHeight = Math.min(42, (availableHeight - baseGap * (markers.length - 1)) / markers.length);
          const markerWidth = COMPACT_MARKER_WIDTH;
          const markerHeight = Math.max(MIN_COMPACT_MARKER_HEIGHT, baseHeight * MARKER_HIGHLIGHT_ZOOM_THRESHOLD);
          const markerGap = baseGap * MARKER_HIGHLIGHT_ZOOM_THRESHOLD;
          const blockHeight = markers.length * markerHeight + (markers.length - 1) * markerGap;

          return (
            <g
              key={node.id}
              className="matn-highlight-markers"
              data-matn-node-id={node.id}
              transform={`translate(${node.x * zoom}, ${(node.y + MATN_NODE_HEADER_HEIGHT / 2) * zoom})`}
            >
              {markers.map((marker, markerIndex) => (
                <g key={marker.key}>
                  <title>{marker.label}</title>
                  <rect
                    x={-markerWidth / 2}
                    y={-blockHeight / 2 + markerIndex * (markerHeight + markerGap)}
                    width={markerWidth}
                    height={markerHeight}
                    rx={8 * MARKER_HIGHLIGHT_ZOOM_THRESHOLD}
                    className={marker.isGeneric ? 'matn-highlight-marker matn-highlight-marker-generic' : 'matn-highlight-marker'}
                    fill={marker.color}
                  />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    ) : null}
    </>
  );
}
