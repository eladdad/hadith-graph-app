import { describe, expect, it } from 'vitest';
import { getEdgeIdsForReport, getNodeIdsForReport } from '../src/bundle';
import { getCollectorNarrators } from '../src/collectors';
import { buildRenderableGraph, getNarratorNodeIdForReport } from '../src/graph';
import { getNarratorFocus } from '../src/narratorFocus';
import type { GraphNode, HadithReport, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

type Representation = 'merged' | 'trie';

function graphFor(reports: HadithReport[], representation: Representation = 'trie'): RenderableGraph {
  return buildRenderableGraph(reports, {}, {}, undefined, [], { representation });
}

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing node ${id}`).toBeDefined();
  return found!;
}

function narratorId(report: HadithReport, index: number): string {
  return getNarratorNodeIdForReport(report, index, 'trie');
}

function reportIds(graph: RenderableGraph, source: string, target: string): string[] {
  const edge = graph.edges.find((candidate) => candidate.source === source && candidate.target === target);
  expect(edge, `Missing transmission ${source} -> ${target}`).toBeDefined();
  return (edge!.reports ?? []).map((report) => report.id).sort();
}

describe('merged and prefix-trie graph representations', () => {
  it('keeps collectors with the same name separate per report in the default merged graph', () => {
    const reports = [
      makeReport('first', ['Root', 'Student', 'Same collector'], 'First wording.'),
      makeReport('second', ['Root', 'Student', 'Same collector'], 'Second wording.'),
    ];
    const graph = buildRenderableGraph(reports);
    const collectors = graph.nodes.filter((candidate) => candidate.label === 'Same collector');

    expect(collectors.map((collector) => collector.id).sort()).toEqual(['c:first', 'c:second']);
    expect(graph.nodes.filter((candidate) => candidate.label === 'Student')).toHaveLength(1);
    expect(node(graph, 'm:first').matnAnchorId).toBe('c:first');
    expect(node(graph, 'm:second').matnAnchorId).toBe('c:second');
    expect(reportIds(graph, 'n:Root', 'n:Student')).toEqual(['first', 'second']);
    expect(reportIds(graph, 'n:Student', 'c:first')).toEqual(['first']);
    expect(reportIds(graph, 'n:Student', 'c:second')).toEqual(['second']);
    expect(graphFor(reports, 'merged')).toEqual(graph);
  });

  it('shares an identical prefix but duplicates later narrators after paths diverge and rejoin by name', () => {
    const reports = [
      makeReport('left', ['Root', 'Left', 'Shared', 'Same collector'], 'Left wording.'),
      makeReport('right', ['Root', 'Right', 'Shared', 'Same collector'], 'Right wording.'),
    ];
    const graph = graphFor(reports);
    const root = narratorId(reports[0], 0);

    expect(root).toBe(narratorId(reports[1], 0));
    expect(graph.nodes.filter((candidate) => candidate.label === 'Root')).toHaveLength(1);
    expect(graph.nodes.filter((candidate) => candidate.label === 'Shared')).toHaveLength(2);
    expect(graphFor(reports, 'merged').nodes.filter((candidate) => candidate.label === 'Shared')).toHaveLength(1);
    expect(narratorId(reports[0], 2)).not.toBe(narratorId(reports[1], 2));
    expect(narratorId(reports[0], 3)).not.toBe(narratorId(reports[1], 3));
    expect(reportIds(graph, root, narratorId(reports[0], 1))).toEqual(['left']);
    expect(reportIds(graph, root, narratorId(reports[1], 1))).toEqual(['right']);

    for (const narrator of graph.nodes.filter((candidate) => candidate.type === 'narrator')) {
      expect(narrator.id.startsWith('t:')).toBe(true);
      expect(graph.edges.filter((edge) => edge.target === narrator.id).length).toBeLessThanOrEqual(1);
    }
    for (const report of reports) {
      expect(node(graph, `m:${report.id}`).matnAnchorId).toBe(narratorId(report, 3));
    }
  });

  it('shares the entire narrator path and terminal collector for identical chains, keeping separate matns', () => {
    const reports = [
      makeReport('first', ['Root', 'Student', 'Same collector'], 'First wording.'),
      makeReport('second', ['Root', 'Student', 'Same collector'], 'Second wording.'),
    ];
    const graph = graphFor(reports);
    const terminal = narratorId(reports[0], 2);

    expect(terminal).toBe(narratorId(reports[1], 2));
    expect(graph.nodes.filter((candidate) => candidate.type === 'narrator')).toHaveLength(3);
    expect(graph.nodes.filter((candidate) => candidate.type === 'matn').map((candidate) => candidate.id).sort())
      .toEqual(['m:first', 'm:second']);
    expect(graph.nodes.some((candidate) => candidate.id === 'c:first' || candidate.id === 'c:second')).toBe(false);
    for (const report of reports) {
      const matn = node(graph, `m:${report.id}`);
      expect(matn.matnAnchorId).toBe(terminal);
      expect(matn.report?.id).toBe(report.id);
    }
    expect(reportIds(graph, narratorId(reports[0], 1), terminal)).toEqual(['first', 'second']);
    expect(node(graph, narratorId(reports[0], 0)).attributedReports?.map((report) => report.id).sort())
      .toEqual(['first', 'second']);
  });

  it.each([
    { short: ['Root'], long: ['Root', 'Student'] },
    { short: ['Root', 'Student'], long: ['Root', 'Student', 'Collector'] },
  ])('shares a terminal prefix with a longer continuation: $short', ({ short, long }) => {
    const reports = [makeReport('short', short, 'Short wording.'), makeReport('long', long, 'Long wording.')];
    for (const input of [reports, [...reports].reverse()]) {
      const graph = graphFor(input);
      const terminal = narratorId(reports[0], short.length - 1);
      const continuation = narratorId(reports[1], short.length);

      expect(terminal).toBe(narratorId(reports[1], short.length - 1));
      expect(graph.nodes.filter((candidate) => candidate.type === 'narrator')).toHaveLength(long.length);
      expect(node(graph, `m:short`).matnAnchorId).toBe(terminal);
      expect(node(graph, `m:long`).matnAnchorId).toBe(continuation);
      expect(reportIds(graph, terminal, continuation)).toEqual(['long']);
      if (short.length > 1) {
        expect(reportIds(graph, narratorId(reports[0], 0), terminal)).toEqual(['long', 'short']);
      }
    }
  });

  it('keeps prefix identities stable when reports are reordered or filtered into narrator focus', () => {
    const reports = [
      makeReport('left', ['Root', 'Left', 'Shared', 'Collector A'], 'Left wording.'),
      makeReport('right', ['Root', 'Right', 'Shared', 'Collector B'], 'Right wording.'),
      makeReport('other', ['Other root', 'Shared', 'Collector C'], 'Another wording.'),
      makeReport('outside', ['Outside root', 'Outside collector'], 'Outside the focus.'),
    ];
    const original = graphFor(reports);
    const reversed = graphFor([...reports].reverse());
    const points = (graph: RenderableGraph) => Object.fromEntries(graph.nodes.map((candidate) => [candidate.id, {
      x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height,
    }]));
    expect(points(reversed)).toEqual(points(original));
    const focus = getNarratorFocus(reports, 'Shared');
    const reportNumbers = new Map(reports.map((report, index) => [report.id, index + 1]));
    const focused = buildRenderableGraph(focus.reports, {}, {}, undefined, [], { representation: 'trie', reportNumbers });

    expect(focus.reports.map((report) => report.id)).toEqual(['left', 'right', 'other']);
    expect(focused.nodes.filter((candidate) => candidate.label === 'Shared')).toHaveLength(3);
    for (const candidate of focused.nodes) expect(original.nodes.some((before) => before.id === candidate.id)).toBe(true);
    for (const edge of focused.edges) expect(original.edges.some((before) => before.id === edge.id)).toBe(true);
    for (const report of focus.reports) {
      expect(node(focused, `m:${report.id}`).report?.number).toBe(reportNumbers.get(report.id));
    }
  });

  it.each(['merged', 'trie'] as const)('selects only the actual report path and its own matn in %s mode', (representation) => {
    const reports = [
      makeReport('short', ['Root', 'Student'], 'Short wording.'),
      makeReport('left', ['Root', 'Student', 'Left', 'Shared', 'Collector'], 'Left wording.'),
      makeReport('right', ['Root', 'Student', 'Right', 'Shared', 'Collector'], 'Right wording.'),
    ];
    const graph = graphFor(reports, representation);
    const collectorNarrators = getCollectorNarrators(reports);
    for (const report of reports) {
      const ids = getNodeIdsForReport(report, representation, collectorNarrators);
      const pathIds = report.isnad.map((_, index) => getNarratorNodeIdForReport(report, index, representation, collectorNarrators));
      expect(new Set(ids)).toEqual(new Set([...pathIds, `m:${report.id}`]));
      for (const id of ids) expect(graph.nodes.some((candidate) => candidate.id === id)).toBe(true);
      const selectedMatns = graph.nodes.filter((candidate) => candidate.type === 'matn' && ids.includes(candidate.id));
      expect(selectedMatns.map((candidate) => candidate.id)).toEqual([`m:${report.id}`]);
      const actualEdges = graph.edges.filter((edge) => edge.reports?.some((reference) => reference.id === report.id));
      expect(getEdgeIdsForReport(report, representation, collectorNarrators).sort()).toEqual(actualEdges.map((edge) => edge.id).sort());
    }
  });
});
