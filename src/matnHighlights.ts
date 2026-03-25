import type { HighlightLegendItem, MatnHighlight } from './types';

export interface MatnTextSegment {
  text: string;
  color?: string;
  label?: string;
  legendId?: string;
  highlightId?: string;
}

export interface HighlightColorOption {
  name: string;
  color: string;
}

export const HIGHLIGHT_COLOR_OPTIONS: HighlightColorOption[] = [
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Rose', color: '#f43f5e' },
  { name: 'Violet', color: '#8b5cf6' },
  { name: 'Sky', color: '#0ea5e9' },
  { name: 'Emerald', color: '#10b981' },
  { name: 'Slate', color: '#64748b' },
];

const FALLBACK_HIGHLIGHT_COLOR = HIGHLIGHT_COLOR_OPTIONS[0]?.color ?? '#f59e0b';

function sanitizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function sanitizeHighlightColor(value: string): string {
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : FALLBACK_HIGHLIGHT_COLOR;
}

export function sanitizeHighlightLegend(entries: HighlightLegendItem[] | undefined): HighlightLegendItem[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const label = sanitizeLabel(entry.label);
    const id = typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id : '';
    if (!id || label.length === 0 || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [{
      id,
      label,
      color: sanitizeHighlightColor(entry.color),
    }];
  });
}

export function sanitizeMatnHighlights(
  highlights: MatnHighlight[] | undefined,
  matn: string,
  validLegendIds: Set<string>,
): MatnHighlight[] {
  if (!Array.isArray(highlights) || matn.length === 0 || validLegendIds.size === 0) {
    return [];
  }

  const sanitized = highlights
    .flatMap((highlight) => {
      const id = typeof highlight.id === 'string' && highlight.id.trim().length > 0 ? highlight.id : '';
      const legendId = typeof highlight.legendId === 'string' ? highlight.legendId : '';
      const rawStart = typeof highlight.start === 'number' && Number.isFinite(highlight.start)
        ? Math.round(highlight.start)
        : -1;
      const rawEnd = typeof highlight.end === 'number' && Number.isFinite(highlight.end)
        ? Math.round(highlight.end)
        : -1;
      const start = Math.max(0, Math.min(matn.length, rawStart));
      const end = Math.max(0, Math.min(matn.length, rawEnd));

      if (!id || !validLegendIds.has(legendId) || end <= start) {
        return [];
      }

      return [{
        id,
        legendId,
        start,
        end,
      }];
    })
    .sort((left, right) => (left.start - right.start) || (left.end - right.end) || left.id.localeCompare(right.id));

  const result: MatnHighlight[] = [];
  let latestEnd = -1;
  for (const highlight of sanitized) {
    if (highlight.start < latestEnd) {
      continue;
    }
    result.push(highlight);
    latestEnd = highlight.end;
  }
  return result;
}

export function buildMatnTextSegments(
  text: string,
  highlights: MatnHighlight[],
  legendById: Map<string, HighlightLegendItem>,
): MatnTextSegment[] {
  if (text.length === 0) {
    return [{ text: '' }];
  }

  const segments: MatnTextSegment[] = [];
  let cursor = 0;

  for (const highlight of highlights) {
    if (highlight.start > cursor) {
      segments.push({ text: text.slice(cursor, highlight.start) });
    }

    const legend = legendById.get(highlight.legendId);
    segments.push({
      text: text.slice(highlight.start, highlight.end),
      color: legend?.color,
      label: legend?.label,
      legendId: highlight.legendId,
      highlightId: highlight.id,
    });
    cursor = highlight.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

export function getHighlightExcerpt(text: string, highlight: MatnHighlight): string {
  return text.slice(highlight.start, highlight.end);
}

export function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = sanitizeHighlightColor(hex).slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
