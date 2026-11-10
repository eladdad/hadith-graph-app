import { describe, expect, it } from 'vitest';
import { buildRenderableGraph } from '../src/graph';
import type { HadithReport, HighlightLegendItem, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

const legend: HighlightLegendItem[] = [
  { id: 'mercy', label: 'Mercy', color: '#f59e0b' },
  { id: 'justice', label: 'Justice', color: '#10b981' },
];

function highlighted(id: string, isnad: string[], text: string, legendId: string): HadithReport {
  return { ...makeReport(id, isnad, text), matnHighlights: [{ id: `${id}:highlight`, legendId, start: 0, end: 5 }] };
}

const reports = [
  highlighted('z"first', ['Authority', 'Branch A', 'Shared narrator', 'Collector A'], 'Mercy in the first wording. '.repeat(15), 'mercy'),
  highlighted('a\\second', ['Authority', 'Branch B', 'Shared narrator', 'Collector B'], 'Justice in another wording.', 'justice'),
  highlighted('mid\nthird', ['Other authority', 'Collector C'], 'Mercy in a third wording.', 'mercy'),
  makeReport('plain:fourth', ['Authority', 'Collector D'], 'A wording without annotations.'),
];

function matnIds(graph: RenderableGraph): string[] {
  return graph.nodes.filter((node) => node.type === 'matn').sort((a, b) => a.x - b.x).map((node) => node.id);
}

describe('matn graph sorting', () => {
  it.each(['merged', 'trie'] as const)('enforces highlight order in the %s graph and keeps variable-size cards clear', (representation) => {
    const before = JSON.stringify({ reports, legend });
    const options = { representation, reportNumbers: new Map(reports.map((report, index) => [report.id, 10 + index * 7])) };
    const widths = { 'm:z"first': 700, 'm:a\\second': 220, 'm:mid\nthird': 400 };
    const automatic = buildRenderableGraph(reports, {}, widths, undefined, legend, options);
    const sorted = buildRenderableGraph(reports, {}, widths, undefined, legend, { ...options, matnSort: 'highlights' });

    expect(matnIds(sorted)).toEqual(['m:z"first', 'm:mid\nthird', 'm:a\\second', 'm:plain:fourth']);
    const matns = sorted.nodes.filter((node) => node.type === 'matn').sort((a, b) => a.x - b.x);
    expect(new Set(matns.map((node) => node.height)).size).toBeGreaterThan(1);
    expect(new Set(matns.map((node) => node.y)).size).toBe(1);
    for (let index = 1; index < matns.length; index += 1) {
      expect(matns[index].x - matns[index].width / 2 - (matns[index - 1].x + matns[index - 1].width / 2)).toBeGreaterThanOrEqual(40);
    }
    expect(sorted.edges.map((edge) => ({ id: edge.id, reports: edge.reports })))
      .toEqual(automatic.edges.map((edge) => ({ id: edge.id, reports: edge.reports })));
    for (const node of sorted.nodes) {
      const original = automatic.nodes.find((candidate) => candidate.id === node.id)!;
      expect({ ...node, x: 0, y: 0 }).toEqual({ ...original, x: 0, y: 0 });
    }
    expect(JSON.stringify({ reports, legend })).toBe(before);
  });

  it.each(['merged', 'trie'] as const)('keeps default and highlight layouts reproducible and separate in the %s graph', (representation) => {
    const original = buildRenderableGraph(reports, {}, {}, undefined, legend, { representation });
    const sorted = buildRenderableGraph(reports, {}, {}, undefined, legend, { representation, matnSort: 'highlights' });
    expect(matnIds(sorted)).toEqual(['m:z"first', 'm:mid\nthird', 'm:a\\second', 'm:plain:fourth']);
    expect(buildRenderableGraph(reports, {}, {}, undefined, legend, { representation }))
      .toEqual(original);
    expect(buildRenderableGraph(reports, {}, {}, undefined, legend, { representation, matnSort: 'default' }))
      .toEqual(original);
    expect(buildRenderableGraph(reports, {}, {}, undefined, legend, { representation, matnSort: 'highlights' }))
      .toEqual(sorted);
  });

  it('matches the matn reading view fallback for unhighlighted and unknown-only annotations', () => {
    const unhighlighted = [
      makeReport('z-last-lexically', ['Collector'], 'The first wording.'),
      highlighted('a-first-lexically', ['Collector'], 'An unknown-only annotation.', 'unknown'),
      makeReport('m-middle', ['Collector'], 'The third wording.'),
    ];
    const graph = buildRenderableGraph(unhighlighted, {}, {}, undefined, legend, { matnSort: 'highlights' });
    expect(matnIds(graph)).toEqual(unhighlighted.map((report) => `m:${report.id}`));
    expect(buildRenderableGraph([], {}, {}, undefined, legend, { matnSort: 'highlights' }).nodes).toEqual([]);
  });
});
