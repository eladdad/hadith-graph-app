import { ForwardedRef, HTMLAttributes, forwardRef } from 'react';
import { buildMatnTextSegments, colorWithAlpha } from '../matnHighlights';
import type { HighlightLegendItem, MatnHighlight } from '../types';

interface HighlightedMatnProps extends HTMLAttributes<HTMLDivElement> {
  text: string;
  highlights: MatnHighlight[];
  legend: HighlightLegendItem[];
  activeHighlightId?: string | null;
}

export const HighlightedMatn = forwardRef(function HighlightedMatn(
  { text, highlights, legend, activeHighlightId = null, className, ...props }: HighlightedMatnProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const legendById = new Map(legend.map((entry) => [entry.id, entry]));
  const segments = buildMatnTextSegments(text, highlights, legendById);

  return (
    <div ref={ref} className={className} {...props}>
      {segments.map((segment, index) => {
        if (!segment.highlightId || !segment.color) {
          return <span key={`matn-segment-${index}`}>{segment.text}</span>;
        }

        const isActive = segment.highlightId === activeHighlightId;
        return (
          <span
            key={`matn-segment-${index}`}
            data-highlight-id={segment.highlightId}
            className={isActive ? 'matn-highlight active' : 'matn-highlight'}
            title={segment.label ?? undefined}
            style={{
              color: segment.color,
              backgroundColor: colorWithAlpha(segment.color, 0.18),
              boxShadow: isActive ? `0 0 0 1px ${segment.color}` : undefined,
            }}
          >
            {segment.text}
          </span>
        );
      })}
    </div>
  );
});
