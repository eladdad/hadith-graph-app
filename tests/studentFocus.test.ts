import { describe, expect, it } from 'vitest';
import { buildNarratorFocusGraph, getNarratorFocus, getNarratorOptions, getStudentFocus } from '../src/narratorFocus';
import { makeReport } from './helpers';

const reports = [
  makeReport('outside', ['Other authority', 'Other collector'], 'Unrelated.'),
  makeReport('via-a', ['Source A', 'Focused narrator', 'Student A', 'Collector A'], 'First route.'),
  makeReport('via-b-other-student', ['Source B', 'Focused narrator', 'Student B', 'Collector B'], 'Second route.'),
  makeReport('terminal-a', ['Focused narrator', 'Student A', 'Collector C'], 'Attribution ends here.'),
  makeReport('via-b', ['Source B', 'Focused narrator', 'Student A', 'Collector D'], 'Another source for Student A.'),
  makeReport('standalone', ['Focused narrator'], 'Standalone attribution.'),
  makeReport('via-c', ['Source C', 'Focused narrator', 'Student C', 'Collector E'], 'Separate source.'),
];

describe('student source highlighting', () => {
  it('uses only the selected student’s observed pairings and preserves report numbers and source data', () => {
    const before = JSON.stringify(reports);
    const focus = getNarratorFocus(reports, 'Focused narrator');

    expect(getStudentFocus(focus, 'Student A')).toEqual({
      student: 'Student A',
      reports: [
        { id: 'via-a', number: 2 },
        { id: 'terminal-a', number: 4 },
        { id: 'via-b', number: 5 },
      ],
      sources: ['Source A', 'Source B'],
      includesFocusedAuthority: true,
    });
    expect(getStudentFocus(focus, 'Student B')).toEqual({
      student: 'Student B',
      reports: [{ id: 'via-b-other-student', number: 3 }],
      sources: ['Source B'],
      includesFocusedAuthority: false,
    });
    expect(getStudentFocus(focus, 'Unknown student')).toEqual({
      student: 'Unknown student', reports: [], sources: [], includesFocusedAuthority: false,
    });
    expect(JSON.stringify(reports)).toBe(before);
  });

  it('keeps terminal attributions on the focused authority without creating self-transmission edges', () => {
    const graph = buildNarratorFocusGraph(getNarratorFocus(reports, 'Focused narrator'));
    const center = graph.nodes.find((node) => node.id === 'focus:center:Focused narrator')!;

    expect(center.isAuthority).toBe(true);
    expect(center.attributedReports).toEqual([
      { id: 'terminal-a', number: 4 }, { id: 'standalone', number: 6 },
    ]);
    expect(graph.nodes.filter((node) => node.label === 'Focused narrator')).toHaveLength(1);
    expect(graph.edges.some((edge) => edge.source === edge.target)).toBe(false);
    expect(graph.edges.find((edge) => edge.target === 'focus:student:Student A')?.reports)
      .toEqual([{ id: 'via-a', number: 2 }, { id: 'terminal-a', number: 4 }, { id: 'via-b', number: 5 }]);
  });

  it('sorts narrator choices by descending distinct-report count, with stable Arabic-name ties', () => {
    const choices = getNarratorOptions([
      makeReport('first', ['جابر', 'Shared', 'Collector A'], 'One.'),
      makeReport('second', ['أنس', 'Shared', 'Collector B'], 'Two.'),
      makeReport('third', ['بكر', 'Shared', 'Collector C'], 'Three.'),
    ]);
    expect(choices[0]).toEqual({ name: 'Shared', reportCount: 3 });
    for (let index = 1; index < choices.length; index += 1) {
      expect(choices[index - 1].reportCount).toBeGreaterThanOrEqual(choices[index].reportCount);
    }
    expect(getNarratorOptions([
      makeReport('b', ['بكر'], 'One.'), makeReport('a', ['أنس'], 'Two.'),
    ]).map((choice) => choice.name)).toEqual(['أنس', 'بكر']);
    expect(getNarratorOptions([
      makeReport('a', ['أنس'], 'Two.'), makeReport('b', ['بكر'], 'One.'),
    ]).map((choice) => choice.name)).toEqual(['أنس', 'بكر']);
  });

  it('applies the vertical spacing setting to both local level gaps without changing relationships', () => {
    const focus = getNarratorFocus(reports, 'Focused narrator');
    const compact = buildNarratorFocusGraph(focus, undefined, { verticalSpacing: 80 });
    const spacious = buildNarratorFocusGraph(focus, undefined, { verticalSpacing: 320 });
    const center = spacious.nodes.find((node) => node.id.startsWith('focus:center:'))!;
    for (const source of spacious.nodes.filter((node) => node.id.startsWith('focus:source:'))) {
      expect(center.y - center.height / 2 - (source.y + source.height / 2)).toBe(320);
    }
    for (const student of spacious.nodes.filter((node) => node.id.startsWith('focus:student:'))) {
      expect(student.y - student.height / 2 - (center.y + center.height / 2)).toBe(320);
    }
    expect(spacious.height).toBeGreaterThan(compact.height);
    expect(spacious.edges.map((edge) => [edge.source, edge.target, edge.reports]))
      .toEqual(compact.edges.map((edge) => [edge.source, edge.target, edge.reports]));
    expect(spacious.nodes.map((node) => [node.id, node.x])).toEqual(compact.nodes.map((node) => [node.id, node.x]));
  });
});
