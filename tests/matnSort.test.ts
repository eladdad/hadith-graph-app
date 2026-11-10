import { describe, expect, it } from 'vitest';
import { buildRenderableGraph, getNarratorNodeIdForReport } from '../src/graph';
import type { GraphNode, HadithReport, HighlightLegendItem, RenderableGraph } from '../src/types';
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

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing node ${id}`).toBeDefined();
  return found!;
}

describe('matn graph sorting', () => {
  it.each(['merged', 'trie'] as const)('arranges private narrator chains around the highlight-ordered matns in %s mode', (representation) => {
    for (const paths of [
      [['Z Root', 'Z Student', 'Z Collector'], ['A Root', 'A Student', 'A Collector']],
      [['Z Root', 'Z Student', 'Z Later student', 'Z Collector'], ['A Root', 'A Collector']],
    ]) {
      // Similarity ties retain this Z-before-A bundle order, opposing the
      // narrator labels' alphabetical order in the ordinary layout.
      const independent = [
        highlighted('z', paths[0], 'Mercy wording. '.repeat(20), 'mercy'),
        highlighted('a', paths[1], 'Mercy wording.', 'mercy'),
      ];
      const widths = { 'm:z': 700, 'm:a': 220 };
      const original = buildRenderableGraph(independent, {}, widths, undefined, legend, { representation });
      const sorted = buildRenderableGraph(independent, {}, widths, undefined, legend, { representation, matnSort: 'highlights' });

      expect(matnIds(sorted)).toEqual(['m:z', 'm:a']);
      for (const report of independent) {
        const matn = node(sorted, `m:${report.id}`);
        const chain = report.isnad.map((_, index) => node(sorted, getNarratorNodeIdForReport(report, index, representation)));
        for (const narrator of chain) {
          expect(narrator.x, `${narrator.id} should follow its matn column for route lengths ${paths.map((path) => path.length).join('/')}`)
            .toBeCloseTo(matn.x, 6);
        }
        for (let index = 1; index < chain.length; index += 1) {
          expect(chain[index].y).toBeGreaterThan(chain[index - 1].y);
        }
        expect(matn.y - matn.height / 2).toBeGreaterThan(chain.at(-1)!.y + chain.at(-1)!.height / 2);
      }

      const left = node(sorted, 'm:z');
      const right = node(sorted, 'm:a');
      const leftAnchor = node(sorted, left.matnAnchorId!);
      const rightAnchor = node(sorted, right.matnAnchorId!);
      expect((rightAnchor.x - leftAnchor.x) * (right.x - left.x), 'Collector attachments must not reverse the card order')
        .toBeGreaterThan(0);
      expect(right.x - right.width / 2 - (left.x + left.width / 2)).toBeGreaterThanOrEqual(40);
      expect(buildRenderableGraph(independent, {}, widths, undefined, legend, { representation })).toEqual(original);
    }
  });

  it('fans highlight-ordered cards out beneath a shared trie terminal without overlapping', () => {
    const shared = ['Root', 'Student', 'Collector'];
    const repeated = ['first', 'second', 'third'].map((id) => (
      highlighted(id, shared, 'Mercy wording. '.repeat(10), 'mercy')
    ));
    const graph = buildRenderableGraph(repeated, {}, { 'm:first': 760, 'm:second': 220, 'm:third': 440 },
      undefined, legend, { representation: 'trie', matnSort: 'highlights' });
    const terminalId = getNarratorNodeIdForReport(repeated[0], 2, 'trie');
    const terminal = node(graph, terminalId);
    const matns = ['first', 'second', 'third'].map((id) => node(graph, `m:${id}`));

    expect(graph.nodes.filter((candidate) => candidate.type === 'narrator')).toHaveLength(shared.length);
    expect(matnIds(graph)).toEqual(['m:first', 'm:second', 'm:third']);
    expect(terminal.x).toBeGreaterThanOrEqual(matns[0].x);
    expect(terminal.x).toBeLessThanOrEqual(matns.at(-1)!.x);
    for (const matn of matns) {
      expect(matn.matnAnchorId).toBe(terminalId);
      expect(matn.y - matn.height / 2).toBeGreaterThan(terminal.y + terminal.height / 2);
    }
    for (let index = 1; index < matns.length; index += 1) {
      const left = matns[index - 1];
      const right = matns[index];
      expect(right.x - right.width / 2 - (left.x + left.width / 2)).toBeGreaterThanOrEqual(40);
    }
  });

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
