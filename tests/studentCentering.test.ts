import { describe, expect, it } from 'vitest';
import { buildRenderableGraph, getNarratorNodeIdForReport } from '../src/graph';
import type { GraphNode, GraphRepresentation, HadithReport, NodeWidthMap, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

const GAP = 70;
const EPSILON = 1e-6;

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing node ${id}`).toBeDefined();
  return found!;
}

function narrator(graph: RenderableGraph, report: HadithReport, index: number, representation: GraphRepresentation): GraphNode {
  return node(graph, getNarratorNodeIdForReport(report, index, representation));
}

function expectCentered(parent: GraphNode, students: GraphNode[]): void {
  expect(students.length).toBeGreaterThan(0);
  const left = Math.min(...students.map((student) => student.x - student.width / 2));
  const right = Math.max(...students.map((student) => student.x + student.width / 2));
  expect(parent.x, `${parent.label} should be centered above its students`)
    .toBeCloseTo((left + right) / 2, 5);
  for (const student of students) expect(student.y).toBeGreaterThan(parent.y);
}

function expectSeparatedRows(graph: RenderableGraph): void {
  const rows = new Map<number, GraphNode[]>();
  for (const candidate of graph.nodes) {
    rows.set(candidate.y, [...(rows.get(candidate.y) ?? []), candidate]);
  }
  for (const row of rows.values()) {
    const ordered = [...row].sort((left, right) => left.x - right.x);
    for (let index = 1; index < ordered.length; index += 1) {
      const left = ordered[index - 1];
      const right = ordered[index];
      expect(right.x - right.width / 2 - (left.x + left.width / 2),
        `${left.id} and ${right.id} should keep their horizontal gap`).toBeGreaterThanOrEqual(GAP - EPSILON);
    }
  }
}

function expectAttachedMatns(graph: RenderableGraph): void {
  const matns = graph.nodes.filter((candidate) => candidate.type === 'matn');
  const top = matns[0].y - matns[0].height / 2;
  for (const matn of matns) {
    expect(matn.matnAnchorId).toBeDefined();
    expect(matn.x, `${matn.id} should stay below its collector`).toBeCloseTo(node(graph, matn.matnAnchorId!).x, 6);
    expect(matn.y - matn.height / 2).toBeCloseTo(top, 6);
  }
}

function positions(graph: RenderableGraph): Record<string, { x: number; y: number }> {
  return Object.fromEntries(graph.nodes.map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]));
}

function asymmetricReports(prefix = ''): HadithReport[] {
  return [
    makeReport(`${prefix}deep-left`, [`${prefix}P`, `${prefix}A`, `${prefix}C`], 'First deep report.'),
    makeReport(`${prefix}deep-right`, [`${prefix}P`, `${prefix}A`, `${prefix}D`], 'Second deep report.'),
    makeReport(`${prefix}short`, [`${prefix}P`, `${prefix}B`], 'Short neighboring report.'),
  ];
}

describe('student centering after automatic spacing', () => {
  for (const representation of ['merged', 'trie'] as const) {
    it.each([
      { name: 'equal matn widths', widths: {} },
      { name: 'unequal matn widths', widths: { 'm:deep-left': 760, 'm:deep-right': 220, 'm:short': 440 } },
    ])(`centers an asymmetric fork after reserving $name in ${representation} mode`, ({ widths }) => {
      const reports = asymmetricReports();
      const graph = buildRenderableGraph(reports, {}, widths as NodeWidthMap, undefined, [], { representation });
      const parent = narrator(graph, reports[0], 0, representation);
      const branch = narrator(graph, reports[0], 1, representation);
      const short = narrator(graph, reports[2], 1, representation);
      const leaves = [narrator(graph, reports[0], 2, representation), narrator(graph, reports[1], 2, representation)];

      // Matn spacing used to move the short collector independently, leaving
      // P off-center even though its own row contains no competing narrator.
      expectCentered(parent, [branch, short]);
      expectCentered(branch, leaves);
      expect(branch.y).toBe(short.y);
      expect(leaves[0].y).toBe(leaves[1].y);
      expect(leaves[0].y).toBeGreaterThan(branch.y);
      expect(graph.hasCycle).toBe(false);
      expectSeparatedRows(graph);
      expectAttachedMatns(graph);
      expect(positions(buildRenderableGraph([...reports].reverse(), {}, widths as NodeWidthMap, undefined, [], { representation })))
        .toEqual(positions(graph));
    });

    it(`centers neighboring asymmetric fan-outs while preserving private chains in ${representation} mode`, () => {
      const left = makeReport('left', ['A root', 'A student', 'A tail', 'A collector'], 'Left private chain.');
      const middle = asymmetricReports('B ');
      const right = [
        makeReport('right-short', ['C root', 'C student 0', 'C collector 0'], 'Right short branch.'),
        makeReport('right-long', ['C root', 'C student 1', 'C tail 1', 'C collector 1'], 'Right long branch.'),
      ];
      const reports = [left, ...middle, ...right];
      const graph = buildRenderableGraph(reports, {}, {
        'm:left': 760, 'm:B deep-left': 220, 'm:B deep-right': 760, 'm:B short': 440,
        'm:right-short': 220, 'm:right-long': 760,
      }, undefined, [], { representation });

      expectCentered(narrator(graph, middle[0], 0, representation), [
        narrator(graph, middle[0], 1, representation), narrator(graph, middle[2], 1, representation),
      ]);
      expectCentered(narrator(graph, middle[0], 1, representation), [
        narrator(graph, middle[0], 2, representation), narrator(graph, middle[1], 2, representation),
      ]);
      expectCentered(narrator(graph, right[0], 0, representation), right.map((report) => narrator(graph, report, 1, representation)));
      for (const [report, first] of [[left, 0], ...right.map((report) => [report, 1] as const)] as const) {
        const anchor = narrator(graph, report, first, representation);
        for (let index = first + 1; index < report.isnad.length; index += 1) {
          expect(narrator(graph, report, index, representation).x).toBeCloseTo(anchor.x, 6);
        }
      }
      expectSeparatedRows(graph);
      expectAttachedMatns(graph);
    });
  }

  it('centers the student boxes when one student also has authority report links', () => {
    const reports = [
      makeReport('through-a', ['P', 'A', 'C'], 'First report through the authority.'),
      makeReport('through-b', ['P', 'B', 'D'], 'Neighboring route.'),
      makeReport('from-a', ['A', 'E'], 'Another report attributed to A.'),
    ];
    const graph = buildRenderableGraph(reports);
    const parent = narrator(graph, reports[0], 0, 'merged');
    const students = reports.slice(0, 2).map((report) => narrator(graph, report, 1, 'merged'));

    expect(students[0].attributedReports).toHaveLength(1);
    expectCentered(parent, students);
    expectSeparatedRows(graph);
    expectAttachedMatns(graph);
  });

  it('keeps a shared student between separated teachers instead of forcing both teachers into one column', () => {
    const reports = [
      makeReport('left', ['Left teacher', 'Shared student', 'Left collector'], 'Left route.'),
      makeReport('right', ['Right teacher', 'Shared student', 'Right collector'], 'Right route.'),
    ];
    const graph = buildRenderableGraph(reports);
    const left = narrator(graph, reports[0], 0, 'merged');
    const right = narrator(graph, reports[1], 0, 'merged');
    const shared = narrator(graph, reports[0], 1, 'merged');

    expect(Math.abs(left.x - right.x)).toBeGreaterThanOrEqual((left.width + right.width) / 2 + GAP - EPSILON);
    expect(shared.id).toBe(getNarratorNodeIdForReport(reports[1], 1, 'merged'));
    expect(shared.x).toBeCloseTo((left.x + right.x) / 2, 6);
    expectCentered(shared, [narrator(graph, reports[0], 2, 'merged'), narrator(graph, reports[1], 2, 'merged')]);
    expectSeparatedRows(graph);
    expectAttachedMatns(graph);
  });
});
