import { describe, expect, it } from 'vitest';
import fullMoonSplittingExample from '../examples/moon-splitting-full.hadith-graph.json';
import { getCollectorNarrators } from '../src/collectors';
import { buildRenderableGraph, getNarratorNodeIdForReport } from '../src/graph';
import { makeReport } from './helpers';

const reports = [
  makeReport('first', ['Authority', 'Student', 'Collector'], 'First wording.'),
  makeReport('second', ['Authority', 'Student', 'Collector'], 'Second wording.'),
];

describe('collector narrator graph nodes', () => {
  it('keeps an authority shared when a standalone attribution also names it as the only narrator', () => {
    const standalone = makeReport('standalone', ['Authority'], 'Attributed directly to the authority.');
    const mixed = [standalone, ...reports];
    const graph = buildRenderableGraph(mixed);

    expect([...getCollectorNarrators(mixed)]).toEqual(['Collector']);
    expect(getNarratorNodeIdForReport(standalone, 0)).toBe('n:Authority');
    expect(graph.nodes.filter((node) => node.label === 'Authority').map((node) => node.id)).toEqual(['n:Authority']);
    expect(graph.nodes.find((node) => node.id === 'n:Authority')?.attributedReports).toEqual([
      { id: 'standalone', number: 1 }, { id: 'first', number: 2 }, { id: 'second', number: 3 },
    ]);
    expect(graph.nodes.find((node) => node.id === 'm:standalone')?.matnAnchorId).toBe('n:Authority');

    const optedIn = getCollectorNarrators(mixed, { Authority: true });
    const split = buildRenderableGraph(mixed, {}, {}, undefined, [], { collectorNarrators: optedIn });
    const authorityIds = mixed.map((report) => getNarratorNodeIdForReport(report, 0, 'merged', optedIn));
    expect(new Set(authorityIds).size).toBe(3);
    expect(split.nodes.filter((node) => node.label === 'Authority').map((node) => node.id)).toEqual(authorityIds);
    expect(split.nodes.find((node) => node.id === 'm:standalone')?.matnAnchorId).toBe('c:standalone');
  });

  it('keeps the full moon-splitting example authorities out of collector defaults despite standalone attributions', () => {
    const exampleReports = fullMoonSplittingExample.reports;
    expect(exampleReports.some((report) => report.isnad.length === 1)).toBe(true);
    const collectors = getCollectorNarrators(exampleReports);
    const authorities = new Set(exampleReports.map((report) => report.isnad[0]));
    const terminalCollectors = new Set(exampleReports.filter((report) => report.isnad.length > 1)
      .map((report) => report.isnad.at(-1)!));

    expect([...authorities].filter((name) => collectors.has(name))).toEqual([]);
    expect([...terminalCollectors].filter((name) => !collectors.has(name))).toEqual([]);
    expect(collectors.has('عبد الله بن مسعود')).toBe(false);
    expect(collectors.has('عبد الله بن عباس')).toBe(false);
  });

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
