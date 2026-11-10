import { describe, expect, it } from 'vitest';
import { buildRenderableGraph } from '../src/graph';
import { layoutGraphvizGraph, type GraphvizLayoutNode } from '../src/graphvizLayout';
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
  it.each(['merged', 'trie'] as const)('enforces highlight order in the %s graph while dot keeps variable-size cards clear', (representation) => {
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

  it('keeps the default layout unchanged and isolates sorted layouts in the Graphviz cache', () => {
    const nodes: GraphvizLayoutNode[] = [
      { id: 'n:root', width: 190, height: 56, type: 'narrator' },
      ...['one', 'two', 'three'].map((id, index): GraphvizLayoutNode => ({
        id: `m:${id}`, width: 220 + index * 110, height: 80 + index * 60, type: 'matn', anchorId: 'n:root',
      })),
    ];
    const original = layoutGraphvizGraph(nodes, [], 70, 180);
    const desired = ['m:three', 'm:one', 'm:two'];
    const sorted = layoutGraphvizGraph(nodes, [], 70, 180, desired);
    expect([...sorted].filter(([id]) => id.startsWith('m:')).sort((a, b) => a[1].x - b[1].x).map(([id]) => id)).toEqual(desired);
    expect(layoutGraphvizGraph(nodes, [], 70, 180)).toEqual(original);
    expect(layoutGraphvizGraph(nodes, [], 70, 180, desired)).toEqual(sorted);
    expect(buildRenderableGraph(reports, {}, {}, undefined, legend, { matnSort: 'default' }))
      .toEqual(buildRenderableGraph(reports, {}, {}, undefined, legend));
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

  it('normalizes incomplete direct constraints without allowing arbitrary IDs into DOT', () => {
    const nodes: GraphvizLayoutNode[] = ['a', 'b', 'c'].map((id) => ({ id: `m:${id}`, width: 240, height: 100, type: 'matn' }));
    const positions = layoutGraphvizGraph(nodes, [], 70, 180, ['m:c', 'not a node; }', 'm:c']);
    expect([...positions].sort((a, b) => a[1].x - b[1].x).map(([id]) => id)).toEqual(['m:c', 'm:a', 'm:b']);
    expect(layoutGraphvizGraph(nodes, [], 70, 180, ['not a node']))
      .toEqual(layoutGraphvizGraph(nodes, [], 70, 180));
  });
});
