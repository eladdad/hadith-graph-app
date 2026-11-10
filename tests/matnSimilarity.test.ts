import { describe, expect, it } from 'vitest';
import { orderMatnsBySimilarity } from '../src/matnSimilarity';
import type { HadithReport, HighlightLegendItem } from '../src/types';
import { makeReport } from './helpers';

const legend: HighlightLegendItem[] = [
  { id: 'a', label: 'Theme A', color: '#f59e0b' },
  { id: 'b', label: 'Theme B', color: '#f59e0b' },
  { id: 'c', label: 'Theme C', color: '#10b981' },
];

function highlightedReport(id: string, coverage: [string, number][], length = 100): HadithReport {
  let start = 0;
  return {
    ...makeReport(id, ['Authority', `Collector ${id}`], 'x'.repeat(length)),
    matnHighlights: coverage.map(([legendId, count], index) => {
      const highlight = { id: `${id}-${index}`, legendId, start, end: start + count };
      start += count;
      return highlight;
    }),
  };
}

function orderedIds(reports: HadithReport[], entries = legend): string[] {
  return orderMatnsBySimilarity(reports, entries).map((report) => report.id);
}

describe('matn highlight similarity reading order', () => {
  it('places matching highlight profiles together even when unrelated reports separate them', () => {
    const reports = [
      highlightedReport('a-first', [['a', 40]]),
      highlightedReport('b-first', [['b', 40]]),
      highlightedReport('a-second', [['a', 40]]),
      highlightedReport('b-second', [['b', 40]]),
    ];
    expect(orderedIds(reports)).toEqual(['a-first', 'a-second', 'b-first', 'b-second']);
  });

  it('compares legend identity rather than identical colors or text', () => {
    const reports = [
      highlightedReport('first', [['a', 30]]),
      highlightedReport('same-color', [['b', 30]]),
      { ...highlightedReport('same-label', [['a', 30]]), matn: 'y'.repeat(100) },
    ];
    expect(orderedIds(reports)).toEqual(['first', 'same-label', 'same-color']);
    expect(orderedIds(reports, [...legend].reverse().map((entry) => ({ ...entry, color: '#000000' }))))
      .toEqual(['first', 'same-label', 'same-color']);
  });

  it('compares proportional coverage rather than absolute highlighted lengths', () => {
    const reports = [
      highlightedReport('first', [['a', 20]]),
      highlightedReport('different-coverage', [['a', 80]]),
      highlightedReport('same-proportion', [['a', 40]], 200),
    ];
    expect(orderedIds(reports)).toEqual(['first', 'same-proportion', 'different-coverage']);
  });

  it('uses the distribution of coverage across shared labels', () => {
    const reports = [
      highlightedReport('first', [['a', 30], ['b', 10]]),
      highlightedReport('inverted', [['a', 10], ['b', 30]]),
      highlightedReport('close', [['a', 25], ['b', 10]]),
      highlightedReport('disjoint', [['c', 40]]),
    ];
    expect(orderedIds(reports)).toEqual(['first', 'close', 'inverted', 'disjoint']);
  });

  it('aggregates separate passages using the same label', () => {
    const reports = [
      highlightedReport('split', [['a', 20], ['b', 10], ['a', 20]]),
      highlightedReport('unrelated', [['c', 50]]),
      highlightedReport('combined', [['a', 40], ['b', 10]]),
    ];
    expect(orderedIds(reports)).toEqual(['split', 'combined', 'unrelated']);
  });

  it('appends reports with no usable highlights in original order', () => {
    const reports = [
      makeReport('plain-first', ['Collector'], 'Unhighlighted wording.'),
      highlightedReport('highlighted-first', [['b', 30]]),
      highlightedReport('unknown-label', [['missing', 30]]),
      highlightedReport('highlighted-second', [['a', 30]]),
      highlightedReport('empty-range', [['a', 0]]),
      makeReport('empty-text', ['Collector'], ''),
    ];
    expect(orderedIds(reports)).toEqual([
      'highlighted-first', 'highlighted-second', 'plain-first', 'unknown-label', 'empty-range', 'empty-text',
    ]);
  });

  it('keeps original order for ties, no legend, and wholly unhighlighted bundles', () => {
    const reports = [
      highlightedReport('z', [['a', 10]]),
      highlightedReport('y', [['b', 10]]),
      highlightedReport('x', [['c', 10]]),
    ];
    expect(orderedIds(reports)).toEqual(['z', 'y', 'x']);
    expect(orderedIds(reports, [])).toEqual(['z', 'y', 'x']);
    expect(orderedIds(reports.map((report) => ({ ...report, matnHighlights: [] })))).toEqual(['z', 'y', 'x']);
    expect(orderMatnsBySimilarity([], legend)).toEqual([]);
    expect(orderMatnsBySimilarity([reports[0]], legend)).toEqual([reports[0]]);
  });

  it('is deterministic, retains original report objects, and leaves the bundle data untouched', () => {
    const reports = [
      highlightedReport('a-first', [['a', 40]]),
      highlightedReport('b-first', [['b', 40]]),
      highlightedReport('a-second', [['a', 40]]),
      makeReport('plain', ['Collector'], 'Plain wording.'),
    ];
    const before = JSON.stringify({ reports, legend });
    Object.freeze(reports);
    for (const report of reports) {
      Object.freeze(report);
      Object.freeze(report.matnHighlights);
      report.matnHighlights.forEach(Object.freeze);
    }
    const ordered = orderMatnsBySimilarity(reports, legend);
    expect(orderMatnsBySimilarity(reports, legend)).toEqual(ordered);
    expect(JSON.stringify({ reports, legend })).toBe(before);
    expect(new Set(ordered).size).toBe(reports.length);
    reports.forEach((report) => expect(ordered).toContain(report));
    expect(ordered).not.toBe(reports);
  });
});
