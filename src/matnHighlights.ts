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

export interface TextRange {
  start: number;
  end: number;
}

export interface MatnTextChange {
  start: number;
  removedLength: number;
  insertedLength: number;
}

export const HIGHLIGHT_COLOR_OPTIONS: HighlightColorOption[] = [
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Rose', color: '#f43f5e' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'Violet', color: '#8b5cf6' },
  { name: 'Indigo', color: '#6366f1' },
  { name: 'Sky', color: '#0ea5e9' },
  { name: 'Cyan', color: '#06b6d4' },
  { name: 'Teal', color: '#14b8a6' },
  { name: 'Emerald', color: '#10b981' },
  { name: 'Lime', color: '#84cc16' },
  { name: 'Slate', color: '#64748b' },
  { name: 'Stone', color: '#78716c' },
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

export function getMatnTextChange(previousText: string, nextText: string): MatnTextChange | null {
  if (previousText === nextText) {
    return null;
  }

  const maxPrefixLength = Math.min(previousText.length, nextText.length);
  let start = 0;
  while (start < maxPrefixLength && previousText[start] === nextText[start]) {
    start += 1;
  }

  let previousSuffixStart = previousText.length;
  let nextSuffixStart = nextText.length;
  while (
    previousSuffixStart > start
    && nextSuffixStart > start
    && previousText[previousSuffixStart - 1] === nextText[nextSuffixStart - 1]
  ) {
    previousSuffixStart -= 1;
    nextSuffixStart -= 1;
  }

  return {
    start,
    removedLength: previousSuffixStart - start,
    insertedLength: nextSuffixStart - start,
  };
}

export function adjustTextRangeForChange<TRange extends TextRange>(
  range: TRange,
  change: MatnTextChange,
): TRange | null {
  const changeStart = change.start;
  const removedEnd = change.start + change.removedLength;
  const insertedEnd = change.start + change.insertedLength;
  const delta = change.insertedLength - change.removedLength;

  if (change.removedLength === 0) {
    if (changeStart < range.start) {
      return {
        ...range,
        start: range.start + delta,
        end: range.end + delta,
      };
    }

    if (changeStart <= range.end) {
      return {
        ...range,
        end: range.end + delta,
      };
    }

    return range;
  }

  if (removedEnd <= range.start) {
    return {
      ...range,
      start: range.start + delta,
      end: range.end + delta,
    };
  }

  if (changeStart >= range.end) {
    return range;
  }

  const nextStart = changeStart < range.start ? insertedEnd : range.start;
  const nextEnd = removedEnd < range.end ? range.end + delta : insertedEnd;
  if (nextEnd <= nextStart) {
    return null;
  }

  return {
    ...range,
    start: nextStart,
    end: nextEnd,
  };
}

export function adjustMatnHighlightsForTextChange(
  highlights: MatnHighlight[],
  previousText: string,
  nextText: string,
  validLegendIds: Set<string>,
): MatnHighlight[] {
  const change = getMatnTextChange(previousText, nextText);
  if (!change) {
    return sanitizeMatnHighlights(highlights, nextText, validLegendIds);
  }

  return sanitizeMatnHighlights(
    highlights.flatMap((highlight) => {
      const nextHighlight = adjustTextRangeForChange(highlight, change);
      return nextHighlight ? [nextHighlight] : [];
    }),
    nextText,
    validLegendIds,
  );
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
