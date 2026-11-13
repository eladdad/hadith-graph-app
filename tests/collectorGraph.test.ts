import { describe, expect, it } from 'vitest';
import { getCollectorNarrators } from '../src/collectors';
import { buildRenderableGraph, getNarratorNodeIdForReport } from '../src/graph';
import { makeReport } from './helpers';

const reports = [
  makeReport('first', ['Authority', 'Student', 'Collector'], 'First wording.'),
  makeReport('second', ['Authority', 'Student', 'Collector'], 'Second wording.'),
];

describe('collector narrator graph nodes', () => {
  it('defaults final narrator names to collector mode across all their occurrences', () => {
    const mixed = [...reports, makeReport('third', ['Authority', 'Collector', 'Later collector'], 'Third wording.')];
    const collectors = getCollectorNarrators(mixed);
    const graph = buildRenderableGraph(mixed);

    expect([...collectors].sort()).toEqual(['Collector', 'Later collector']);
    const occurrences = graph.nodes.filter((node) => node.label === 'Collector');
    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((node) => node.id)).toContain(getNarratorNodeIdForReport(mixed[2], 1, 'merged', collectors));
    expect(graph.nodes.filter((node) => node.label === 'Authority')).toHaveLength(1);
    expect(graph.hasCycle).toBe(false);
  });

  it('merges a final narrator when collector mode is reversed, preserving matn anchors and report references', () => {
    const collectorNarrators = getCollectorNarrators(reports, { Collector: false });
    const graph = buildRenderableGraph(reports, {}, {}, undefined, [], { collectorNarrators });

    expect(graph.nodes.filter((node) => node.label === 'Collector').map((node) => node.id)).toEqual(['n:Collector']);
    expect(graph.nodes.filter((node) => node.type === 'matn').map((node) => node.matnAnchorId))
      .toEqual(['n:Collector', 'n:Collector']);
    expect(graph.edges.find((edge) => edge.source === 'n:Student' && edge.target === 'n:Collector')?.reports)
      .toEqual([{ id: 'first', number: 1 }, { id: 'second', number: 2 }]);
    expect(graph.nodes.find((node) => node.id === 'n:Authority')?.attributedReports)
      .toEqual([{ id: 'first', number: 1 }, { id: 'second', number: 2 }]);
  });

  it('splits a collector in the middle of each report and restores sharing when reversed', () => {
    const collectorNarrators = getCollectorNarrators(reports, { Student: true });
    const graph = buildRenderableGraph(reports, {}, {}, undefined, [], { collectorNarrators });
    const studentIds = reports.map((report) => getNarratorNodeIdForReport(report, 1, 'merged', collectorNarrators));

    expect(new Set(studentIds).size).toBe(2);
    expect(graph.nodes.filter((node) => node.label === 'Student').map((node) => node.id)).toEqual(studentIds);
    for (const [index, report] of reports.entries()) {
      const path = report.isnad.map((_, narratorIndex) => getNarratorNodeIdForReport(report, narratorIndex, 'merged', collectorNarrators));
      expect(graph.edges.filter((edge) => edge.reports?.some((reference) => reference.id === report.id)).map((edge) => edge.id))
        .toEqual(path.slice(0, -1).map((id, narratorIndex) => `${id}->${path[narratorIndex + 1]}`));
      expect(graph.edges.find((edge) => edge.target === studentIds[index])?.reports).toEqual([{ id: report.id, number: index + 1 }]);
    }

    const shared = buildRenderableGraph(reports, {}, {}, undefined, [], {
      collectorNarrators: getCollectorNarrators(reports, { Student: false }),
    });
    expect(shared.nodes.filter((node) => node.label === 'Student').map((node) => node.id)).toEqual(['n:Student']);
  });

  it('keeps collector occurrence IDs distinct from legacy final IDs and preserves saved shared positions', () => {
    const withSpecialIds = [
      makeReport('first:1', ['Student', 'Collector'], 'First.'),
      makeReport('first', ['Root', 'Student', 'Collector'], 'Second.'),
    ];
    const collectorNarrators = getCollectorNarrators(withSpecialIds, { Student: true });
    const graph = buildRenderableGraph(withSpecialIds, { 'n:Student': { x: 5000, y: 5000 } }, {}, undefined, [], { collectorNarrators });
    const students = graph.nodes.filter((node) => node.label === 'Student');

    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length);
    expect(students).toHaveLength(2);
    for (const student of students) expect({
      x: student.x - (graph.shiftX ?? 0),
      y: student.y - (graph.shiftY ?? 0),
    }).toEqual({ x: 5000, y: 5000 });
  });

  it('handles explicit choices for prototype-like narrator names safely', () => {
    const special = [makeReport('special', ['constructor', '__proto__'], 'Special names.')];
    const overrides = JSON.parse('{"__proto__":false,"constructor":true}') as Record<string, boolean>;
    expect([...getCollectorNarrators(special, overrides)]).toEqual(['constructor']);
    expect(Object.prototype.hasOwnProperty.call({}, '__proto__')).toBe(false);
  });

  it('preserves prefix sharing in Trie regardless of collector choices', () => {
    const graph = buildRenderableGraph(reports, {}, {}, undefined, [], {
      representation: 'trie',
      collectorNarrators: getCollectorNarrators(reports, { Student: true, Collector: false }),
    });
    const expected = buildRenderableGraph(reports, {}, {}, undefined, [], { representation: 'trie' });

    expect(graph).toEqual(expected);
    expect(graph.nodes.filter((node) => node.label === 'Student')).toHaveLength(1);
    expect(graph.nodes.filter((node) => node.label === 'Collector')).toHaveLength(1);
  });
});
