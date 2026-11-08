import { describe, expect, it } from 'vitest';
import sample from '../examples/moon-splitting-ibn-masud-anas.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import type { RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

function edge(graph: RenderableGraph, source: string, target: string) {
  const found = graph.edges.find((candidate) => candidate.source === source && candidate.target === target);
  expect(found, `Missing edge ${source} -> ${target}`).toBeDefined();
  return found!;
}

function matnLabels(graph: RenderableGraph): Record<string, string> {
  return Object.fromEntries(graph.nodes
    .filter((node) => node.type === 'matn')
    .map((node) => [node.id, node.label]));
}

const convergingReports = () => [
  makeReport('first', ['Parent A', 'Shared student', 'Collector 1'], 'First wording.'),
  makeReport('second', ['Parent B', 'Shared student', 'Collector 2'], 'Second wording.'),
  makeReport('third', ['Parent A', 'Shared student', 'Collector 3'], 'Third wording.'),
];

describe('report numbers in the graph', () => {
  it('identifies reports on both sides of a narrator with multiple parents', () => {
    const reports = convergingReports();
    const originalReports = JSON.stringify(reports);
    const graph = buildRenderableGraph(reports);

    // The shared edge remains one edge, with both of its reports identified.
    expect(graph.edges.filter((candidate) => candidate.target === 'n:Shared student')).toHaveLength(2);
    expect(edge(graph, 'n:Parent A', 'n:Shared student').label).toBe('#1, #3');
    expect(edge(graph, 'n:Parent B', 'n:Shared student').label).toBe('#2');
    for (const [index, report] of reports.entries()) {
      expect(edge(graph, 'n:Shared student', `c:${report.id}`).label).toBe(`#${index + 1}`);
    }
    expect(matnLabels(graph)).toEqual({
      'm:first': 'Report #1',
      'm:second': 'Report #2',
      'm:third': 'Report #3',
    });
    expect(JSON.stringify(reports)).toBe(originalReports);
  });

  it('does not treat several reports from the same parent as multiple parents', () => {
    const graph = buildRenderableGraph([
      makeReport('one', ['Parent', 'Student', 'Collector 1'], 'First wording.'),
      makeReport('two', ['Parent', 'Student', 'Collector 2'], 'Second wording.'),
      makeReport('three', ['Parent', 'Student', 'Collector 3'], 'Third wording.'),
    ]);

    expect(graph.edges.every((candidate) => candidate.label === undefined)).toBe(true);
    expect(Object.values(matnLabels(graph))).toEqual(['Report #1', 'Report #2', 'Report #3']);
  });

  it('keeps edge and matn numbers in sync after report reordering or removal', () => {
    const [first, second, third] = convergingReports();
    const reordered = buildRenderableGraph([second, third, first]);

    expect(edge(reordered, 'n:Parent A', 'n:Shared student').label).toBe('#2, #3');
    expect(edge(reordered, 'n:Parent B', 'n:Shared student').label).toBe('#1');
    expect(matnLabels(reordered)).toEqual({
      'm:second': 'Report #1',
      'm:third': 'Report #2',
      'm:first': 'Report #3',
    });

    const removedAlternativeParent = buildRenderableGraph([third, first]);
    expect(edge(removedAlternativeParent, 'n:Parent A', 'n:Shared student').label).toBeUndefined();
    expect(matnLabels(removedAlternativeParent)).toEqual({
      'm:third': 'Report #1',
      'm:first': 'Report #2',
    });
  });

  it('distinguishes the Ibn Masud and Anas routes through Shuba in the imported sample', () => {
    const parsed = parseBundleJson(JSON.stringify(sample));
    expect(parsed.error).toBeUndefined();
    const reports = parsed.bundle!.reports;
    const graph = buildRenderableGraph(reports);
    const shuba = 'n:شعبة بن الحجاج';
    const yahya = 'n:يحيى بن سعيد القطان';

    expect(edge(graph, 'n:سليمان بن مهران الأعمش', shuba).label).toBe('#3, #5');
    expect(edge(graph, 'n:قتادة بن دعامة', shuba).label).toBe('#7');
    expect(edge(graph, shuba, 'n:معاذ بن معاذ العنبري').label).toBe('#5');
    expect(edge(graph, shuba, yahya).label).toBe('#3, #7');
    expect(edge(graph, 'n:سفيان (عن الأعمش؛ رواية يحيى؛ تعيينه مختلف فيه)', yahya).label).toBe('#4');
    expect(matnLabels(graph)).toEqual(Object.fromEntries(reports.map((report, index) => [
      `m:${report.id}`, `Report #${index + 1}`,
    ])));
  });
});
