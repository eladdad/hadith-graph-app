import { describe, expect, it } from 'vitest';
import corpus from '../examples/moon-splitting-full.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import { buildNarratorFocusGraph, getNarratorFocus, getNarratorOptions } from '../src/narratorFocus';
import type { RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

function reports() {
  return [
    makeReport('unrelated', ['Other authority', 'Other student', 'Other collector'], 'Unrelated wording.'),
    makeReport('a', ['Authority A', 'Teacher A', 'Shared narrator', 'Student A', 'Collector A'], 'First wording.'),
    makeReport('b', ['Authority B', 'Teacher B', 'Shared narrator', 'Student B', 'Collector B'], 'Second wording.'),
    makeReport('c', ['Authority C', 'Teacher A', 'Shared narrator', 'Student B', 'Collector C'], 'Third wording.'),
    makeReport('d', ['Authority D', 'Teacher A', 'Shared narrator', 'Student A', 'Collector D'], 'Fourth wording.'),
  ];
}

function edgeReports(graph: RenderableGraph, sourceName: string, targetName: string) {
  const source = graph.nodes.find((node) => node.label === sourceName)!;
  const target = graph.nodes.find((node) => node.label === targetName)!;
  const edge = graph.edges.find((candidate) => candidate.source === source.id && candidate.target === target.id);
  expect(edge, `Missing local edge ${sourceName} → ${targetName}`).toBeDefined();
  return edge!.reports;
}

describe('narrator focus', () => {
  it('includes complete matching reports across authorities without changing their contents or numbering', () => {
    const allReports = reports();
    const before = JSON.stringify(allReports);
    const focus = getNarratorFocus(allReports, 'Shared narrator');

    expect(focus.name).toBe('Shared narrator');
    expect(focus.reports).toEqual(allReports.slice(1));
    expect(focus.reportReferences).toEqual([
      { id: 'a', number: 2 }, { id: 'b', number: 3 },
      { id: 'c', number: 4 }, { id: 'd', number: 5 },
    ]);
    expect(focus.reports.map((report) => report.isnad[0]))
      .toEqual(['Authority A', 'Authority B', 'Authority C', 'Authority D']);
    expect(focus.reports.map((report) => report.isnad.at(-1)))
      .toEqual(['Collector A', 'Collector B', 'Collector C', 'Collector D']);
    expect(JSON.stringify(allReports)).toBe(before);
  });

  it('records observed source–student pairs rather than inventing combinations at a shared narrator', () => {
    const focus = getNarratorFocus(reports(), 'Shared narrator');
    const cell = (source: string, student: string) => focus.cells
      .find((candidate) => candidate.source === source && candidate.student === student);

    expect(focus.sources.find((source) => source.name === 'Teacher A')?.reports)
      .toEqual([{ id: 'a', number: 2 }, { id: 'c', number: 4 }, { id: 'd', number: 5 }]);
    expect(focus.students.find((student) => student.name === 'Student B')?.reports)
      .toEqual([{ id: 'b', number: 3 }, { id: 'c', number: 4 }]);
    expect(cell('Teacher A', 'Student A')?.reports)
      .toEqual([{ id: 'a', number: 2 }, { id: 'd', number: 5 }]);
    expect(cell('Teacher A', 'Student B')?.reports).toEqual([{ id: 'c', number: 4 }]);
    expect(cell('Teacher B', 'Student B')?.reports).toEqual([{ id: 'b', number: 3 }]);
    expect(cell('Teacher B', 'Student A')).toBeUndefined();
  });

  it('keeps authority and recording-source boundaries explicit without adding missing narrators', () => {
    const focus = getNarratorFocus([
      makeReport('first', ['Shared narrator', 'Student', 'Collector'], 'Starts at the focused narrator.'),
      makeReport('last', ['Authority', 'Teacher', 'Shared narrator'], 'Ends at the focused narrator.'),
      makeReport('only', ['Shared narrator'], 'Standalone attribution.'),
    ], 'Shared narrator');

    expect(focus.cells).toEqual(expect.arrayContaining([
      { source: null, student: 'Student', reports: [{ id: 'first', number: 1 }] },
      { source: 'Teacher', student: null, reports: [{ id: 'last', number: 2 }] },
      { source: null, student: null, reports: [{ id: 'only', number: 3 }] },
    ]));
    const graph = buildNarratorFocusGraph(focus);
    expect(graph.nodes.map((node) => node.label).sort()).toEqual(['Shared narrator', 'Student', 'Teacher']);
    expect(graph.nodes.find((node) => node.label === 'Shared narrator')?.isAuthority).toBe(true);
    expect(graph.nodes.find((node) => node.label === 'Teacher')?.isAuthority).toBe(false);
    expect(graph.nodes.find((node) => node.label === 'Shared narrator')?.attributedReports)
      .toEqual([{ id: 'first', number: 1 }, { id: 'only', number: 3 }]);
    expect(graph.nodes.filter((node) => node.label !== 'Shared narrator')
      .every((node) => node.attributedReports === undefined)).toBe(true);
    expect(graph.edges).toHaveLength(2);
    expect(edgeReports(graph, 'Teacher', 'Shared narrator')).toEqual([{ id: 'last', number: 2 }]);
    expect(edgeReports(graph, 'Shared narrator', 'Student')).toEqual([{ id: 'first', number: 1 }]);
  });

  it('lays out only immediate sources and students and retains exact edge memberships', () => {
    const graph = buildNarratorFocusGraph(getNarratorFocus(reports(), 'Shared narrator'));
    const center = graph.nodes.find((node) => node.label === 'Shared narrator')!;

    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges).toHaveLength(4);
    expect(graph.nodes.every((node) => node.type === 'narrator')).toBe(true);
    for (const label of ['Teacher A', 'Teacher B']) {
      const source = graph.nodes.find((node) => node.label === label)!;
      expect(source.y + source.height / 2).toBeLessThan(center.y - center.height / 2);
    }
    for (const label of ['Student A', 'Student B']) {
      const student = graph.nodes.find((node) => node.label === label)!;
      expect(student.y - student.height / 2).toBeGreaterThan(center.y + center.height / 2);
    }
    expect(edgeReports(graph, 'Teacher A', 'Shared narrator'))
      .toEqual([{ id: 'a', number: 2 }, { id: 'c', number: 4 }, { id: 'd', number: 5 }]);
    expect(edgeReports(graph, 'Shared narrator', 'Student B'))
      .toEqual([{ id: 'b', number: 3 }, { id: 'c', number: 4 }]);
    for (const edge of graph.edges) {
      expect(edge.label).toBe(edge.reports!.map((report) => `#${report.number}`).join(', '));
      expect(edge.path).toMatch(/^M .* C /);
      expect(edge).not.toHaveProperty('reportLines');
    }
    expect(graph.hasCycle).toBe(false);
    expect(graph.nodes.every((node) => [node.x, node.y, node.width, node.height].every(Number.isFinite))).toBe(true);
  });

  it('preserves bundle report numbers on complete filtered graphs, including matns and authorities', () => {
    const allReports = reports();
    const focus = getNarratorFocus(allReports, 'Shared narrator');
    const reportNumbers = new Map(allReports.map((report, index) => [report.id, index + 1]));
    const graph = buildRenderableGraph(focus.reports, {}, {}, undefined, [], { reportNumbers });

    expect(graph.nodes.some((node) => node.label === 'Other authority')).toBe(false);
    for (const [index, report] of allReports.slice(1).entries()) {
      const number = index + 2;
      const matn = graph.nodes.find((node) => node.id === `m:${report.id}`)!;
      expect(matn.label).toBe(`Report #${number}`);
      expect(matn.report).toEqual({ id: report.id, number });
      const authority = graph.nodes.find((node) => node.label === report.isnad[0])!;
      expect(authority.attributedReports).toEqual([{ id: report.id, number }]);
      expect(graph.nodes.some((node) => node.id === `c:${report.id}`)).toBe(true);
    }
    expect(graph.edges.find((edge) => edge.id === 'n:Teacher A->n:Shared narrator')?.label)
      .toBe('#2, #4, #5');
    expect(graph.edges.find((edge) => edge.id === 'n:Teacher B->n:Shared narrator')?.reports)
      .toEqual([{ id: 'b', number: 3 }]);
  });

  it('offers unique narrator choices and finds all 51 Shuʿba chain entries in the full corpus', () => {
    const parsed = parseBundleJson(JSON.stringify(corpus));
    expect(parsed.error).toBeUndefined();
    const allReports = parsed.bundle!.reports;
    const before = JSON.stringify(allReports);
    const name = 'شعبة بن الحجاج';
    const options = getNarratorOptions(allReports);
    expect(new Set(options.map((option) => option.name)).size).toBe(options.length);
    expect(options.find((option) => option.name === name)?.reportCount).toBe(51);

    const focus = getNarratorFocus(allReports, name);
    const expected = allReports.flatMap((report, index) => report.isnad.includes(name)
      ? [{ id: report.id, number: index + 1 }] : []);
    expect(focus.reports).toHaveLength(51);
    expect(focus.reportReferences).toEqual(expected);
    expect(focus.reports.some((report) => report.isnad[0] === 'عبد الله بن مسعود')).toBe(true);
    expect(focus.reports.some((report) => report.isnad[0] === 'أنس بن مالك')).toBe(true);
    const localGraph = buildNarratorFocusGraph(focus);
    expect(localGraph.nodes.length).toBeLessThan(51);
    expect(localGraph.nodes.some((node) => node.type === 'matn')).toBe(false);
    const visibleReports = new Set(localGraph.edges.flatMap((edge) => edge.reports!.map((report) => report.id)));
    expect(visibleReports).toEqual(new Set(expected.map((report) => report.id)));
    expect(localGraph.edges.some((edge) => edge.reports!.length > 1)).toBe(true);
    for (const edge of localGraph.edges) {
      expect(edge.label).toBe(edge.reports!.map((report) => `#${report.number}`).join(', '));
      expect(edge.path).toMatch(/^M .* C /);
      expect(edge).not.toHaveProperty('reportLines');
    }
    expect(JSON.stringify(allReports)).toBe(before);
  });
});
