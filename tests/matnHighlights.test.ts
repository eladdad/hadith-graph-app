import { describe, expect, it } from 'vitest';
import {
  adjustMatnHighlightsForTextChange,
  adjustTextRangeForChange,
  getMatnTextChange,
} from '../src/matnHighlights';

describe('matn highlight range adjustments', () => {
  it('moves both start and end when text is inserted before the highlight', () => {
    expect(adjustTextRangeForChange(
      { start: 10, end: 20 },
      { start: 4, removedLength: 0, insertedLength: 3 },
    )).toEqual({ start: 13, end: 23 });
  });

  it('moves only the end when text is deleted inside the highlight', () => {
    expect(adjustTextRangeForChange(
      { start: 10, end: 20 },
      { start: 14, removedLength: 2, insertedLength: 0 },
    )).toEqual({ start: 10, end: 18 });
  });

  it('extends the highlight when text is inserted exactly at its end', () => {
    expect(adjustTextRangeForChange(
      { start: 10, end: 20 },
      { start: 20, removedLength: 0, insertedLength: 2 },
    )).toEqual({ start: 10, end: 22 });
  });

  it('leaves the highlight unchanged when text changes after its end', () => {
    expect(adjustTextRangeForChange(
      { start: 10, end: 20 },
      { start: 21, removedLength: 0, insertedLength: 4 },
    )).toEqual({ start: 10, end: 20 });
  });

  it('moves the start to the replacement boundary when deletion overlaps the highlight start', () => {
    expect(adjustTextRangeForChange(
      { start: 10, end: 20 },
      { start: 5, removedLength: 7, insertedLength: 0 },
    )).toEqual({ start: 5, end: 13 });
  });

  it('computes a single contiguous text diff and applies it to every highlight', () => {
    expect(getMatnTextChange('abc def ghi', 'abc XY def ghi')).toEqual({
      start: 4,
      removedLength: 0,
      insertedLength: 3,
    });

    expect(adjustMatnHighlightsForTextChange(
      [
        { id: 'h1', legendId: 'legend-1', start: 4, end: 7 },
        { id: 'h2', legendId: 'legend-1', start: 12, end: 15 },
      ],
      'aaa bbb ccc ddd',
      'bbb ccc ddd',
      new Set(['legend-1']),
    )).toEqual([
      { id: 'h1', legendId: 'legend-1', start: 0, end: 3 },
      { id: 'h2', legendId: 'legend-1', start: 8, end: 11 },
    ]);
  });
});
