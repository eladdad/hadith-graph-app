import { describe, expect, it } from 'vitest';
import sample from '../examples/moon-splitting-ibn-masud-anas.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { AUTHORITY_REPORT_GAP, buildRenderableGraph, getAuthorityReportMetrics } from '../src/graph';
import type { GraphNode, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing graph node ${id}`).toBeDefined();
  return found!;
}

function occupiedRight(narrator: GraphNode): number {
  const annotation = getAuthorityReportMetrics(narrator.attributedReports);
  return narrator.x + narrator.width / 2 + (annotation.width > 0 ? AUTHORITY_REPORT_GAP + annotation.width : 0);
}

describe('attribution authorities', () => {
  it('records only reports starting at each narrator, including an existing narrator with a parent', () => {
    const reports = [
      makeReport('through', ['Elder', 'Shared narrator', 'Collector A'], 'Attributed to the elder.'),
      makeReport('own', ['Shared narrator', 'Collector B'], 'Attributed to the shared narrator.'),
      makeReport('another-own', ['Shared narrator', 'Collector C'], 'Another direct attribution.'),
    ];
    const before = JSON.stringify(reports);
    const graph = buildRenderableGraph(reports);

    expect(node(graph, 'n:Elder').attributedReports).toEqual([{ id: 'through', number: 1 }]);
    expect(node(graph, 'n:Shared narrator').attributedReports).toEqual([
      { id: 'own', number: 2 },
      { id: 'another-own', number: 3 },
    ]);
    expect(graph.edges.some((edge) => edge.target === 'n:Shared narrator')).toBe(true);
    expect(node(graph, 'c:through').attributedReports).toBeUndefined();
    expect(node(graph, 'm:through').report).toEqual({ id: 'through', number: 1 });
    expect(JSON.stringify(reports)).toBe(before);
  });

  it('supports a single-name authority and a report without an isnad', () => {
    const graph = buildRenderableGraph([
      makeReport('one', ['Sole narrator'], 'A single-name report.'),
      makeReport('empty', [], 'A report without an attribution.'),
    ]);

    expect(node(graph, 'c:one').attributedReports).toEqual([{ id: 'one', number: 1 }]);
    expect(node(graph, 'm:one').report).toEqual({ id: 'one', number: 1 });
    expect(node(graph, 'm:empty').report).toEqual({ id: 'empty', number: 2 });
    expect(graph.nodes.filter((candidate) => candidate.attributedReports?.length)).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  it('preserves report identity while renumbering authority, edge and matn references together', () => {
    const first = makeReport('first', ['Authority', 'Shared student', 'Collector A'], 'First wording.');
    const second = makeReport('second', ['Other authority', 'Shared student', 'Collector B'], 'Second wording.');
    const third = makeReport('third', ['Authority', 'Shared student', 'Collector C'], 'Third wording.');
    const graph = buildRenderableGraph([second, third, first]);
    const sharedEdge = graph.edges.find((edge) => edge.id === 'n:Authority->n:Shared student')!;

    expect(node(graph, 'n:Authority').attributedReports).toEqual([
      { id: 'third', number: 2 },
      { id: 'first', number: 3 },
    ]);
    expect(sharedEdge.reports).toEqual([
      { id: 'third', number: 2 },
      { id: 'first', number: 3 },
    ]);
    expect(node(graph, 'm:first').report).toEqual({ id: 'first', number: 3 });
    expect(node(graph, 'm:third').report).toEqual({ id: 'third', number: 2 });

    const removed = buildRenderableGraph([first]);
    expect(node(removed, 'n:Authority').attributedReports).toEqual([{ id: 'first', number: 1 }]);
    expect(removed.edges.find((edge) => edge.id === 'n:Authority->n:Shared student')?.reports)
      .toEqual([{ id: 'first', number: 1 }]);
    expect(node(removed, 'm:first').report).toEqual({ id: 'first', number: 1 });
  });

  it('groups the sample reports under Ibn Masud and Anas rather than their students', () => {
    const parsed = parseBundleJson(JSON.stringify(sample));
    expect(parsed.error).toBeUndefined();
    const reports = parsed.bundle!.reports;
    const graph = buildRenderableGraph(reports);
    const authorities = graph.nodes.filter((candidate) => candidate.attributedReports?.length);

    expect(authorities).toHaveLength(2);
    expect(node(graph, 'n:عبد الله بن مسعود').attributedReports)
      .toEqual(reports.slice(0, 5).map((report, index) => ({ id: report.id, number: index + 1 })));
    expect(node(graph, 'n:أنس بن مالك').attributedReports)
      .toEqual(reports.slice(5).map((report, index) => ({ id: report.id, number: index + 6 })));
    expect(node(graph, 'n:شعبة بن الحجاج').attributedReports).toBeUndefined();
  });

  it('reserves compact count badges without overlapping neighboring nodes or detaching matns', () => {
    const reports = Array.from({ length: 20 }, (_, index) => makeReport(
      `r${index}`,
      [index < 17 ? 'Authority A' : 'Authority B', `Student ${index}`, `Collector ${index}`],
      `Wording ${index}.`,
    ));
    const graph = buildRenderableGraph(reports);
    const a = node(graph, 'n:Authority A');
    const b = node(graph, 'n:Authority B');
    const [left, right] = [a, b].sort((one, another) => one.x - another.x);

    expect(getAuthorityReportMetrics(a.attributedReports).rows).toBe(1);
    expect(getAuthorityReportMetrics(a.attributedReports).width)
      .toBe(getAuthorityReportMetrics(b.attributedReports).width);
    expect(a.height).toBe(b.height);
    expect(a.height).toBeGreaterThanOrEqual(getAuthorityReportMetrics(a.attributedReports).height);
    expect(occupiedRight(left)).toBeLessThan(right.x - right.width / 2);
    for (const narrator of graph.nodes.filter((candidate) => candidate.type === 'narrator')) {
      expect(occupiedRight(narrator)).toBeLessThan(graph.width);
    }
    for (const report of reports) {
      const collector = node(graph, `c:${report.id}`);
      const matn = node(graph, `m:${report.id}`);
      const student = node(graph, `n:${report.isnad[1]}`);
      expect(matn.x).toBeCloseTo(collector.x, 6);
      expect(student.y - student.height / 2).toBeGreaterThan(a.y + a.height / 2);
    }
  });

  it('includes authority numbers in the graph bounds after a manual move', () => {
    const reports = ['a', 'b', 'c', 'd', 'e'].map((id) => makeReport(
      id, ['Authority', `Collector ${id}`], `Wording ${id}.`,
    ));
    const graph = buildRenderableGraph(reports, { 'n:Authority': { x: 6000, y: 100 } });
    const authority = node(graph, 'n:Authority');

    expect(authority.x - (graph.shiftX ?? 0)).toBe(6000);
    expect(occupiedRight(authority)).toBeGreaterThan(authority.x + authority.width / 2);
    expect(graph.width).toBeGreaterThan(occupiedRight(authority));
  });
});
