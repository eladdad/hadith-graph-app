import { describe, expect, it } from 'vitest';
import sample from '../examples/moon-splitting-ibn-masud-anas.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import type { GraphNode, HadithReport, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

const EPSILON = 1e-6;
const MIN_MATN_GAP = 40;

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing graph node ${id}`).toBeDefined();
  return found!;
}

function expectBottomMatnRank(graph: RenderableGraph, reports: HadithReport[]): void {
  const matns = reports.map((report) => node(graph, `m:${report.id}`)).sort((a, b) => a.x - b.x);
  const center = matns[0].y;
  const top = Math.min(...matns.map((matn) => matn.y - matn.height / 2));
  const narratorBottom = Math.max(...graph.nodes
    .filter((candidate) => candidate.type === 'narrator')
    .map((narrator) => narrator.y + narrator.height / 2));

  expect(top).toBeGreaterThan(narratorBottom);
  for (const report of reports) {
    const collector = node(graph, `c:${report.id}`);
    const matn = node(graph, `m:${report.id}`);
    expect(matn.matnAnchorId).toBe(collector.id);
    expect(matn.report?.id).toBe(report.id);
    expect(matn.y).toBeGreaterThan(collector.y);
    expect(matn.y, `${matn.id} should share the bottom rank center`)
      .toBeCloseTo(center, 6);
  }

  for (let index = 1; index < matns.length; index += 1) {
    const left = matns[index - 1];
    const right = matns[index];
    const gap = right.x - right.width / 2 - (left.x + left.width / 2);
    expect(gap, `${left.id} and ${right.id} should have space between their text cards`)
      .toBeGreaterThanOrEqual(MIN_MATN_GAP - EPSILON);
  }
}

function expectDownwardChain(graph: RenderableGraph, ids: string[]): void {
  for (let index = 1; index < ids.length; index += 1) {
    expect(node(graph, ids[index]).y, `${ids[index]} should remain below its source`)
      .toBeGreaterThan(node(graph, ids[index - 1]).y);
    expect(graph.edges.some((edge) => edge.source === ids[index - 1] && edge.target === ids[index])).toBe(true);
  }
}

function unshiftedX(graph: RenderableGraph, id: string): number {
  return node(graph, id).x - (graph.shiftX ?? 0);
}

describe('collector and matn layout', () => {
  it('keeps a longer route on its branch side of a shorter route in the matn row', () => {
    const reports = [
      makeReport('m1', ['n1', 'n3'], 'The short right-hand route.'),
      makeReport('m2', ['n1', 'n2', 'n4', 'n5'], 'The long left-hand route.'),
    ];
    const graph = buildRenderableGraph(reports);

    const direction = Math.sign(node(graph, 'c:m1').x - node(graph, 'n:n2').x);
    expect(direction).not.toBe(0);
    expect((node(graph, 'm:m1').x - node(graph, 'm:m2').x) * direction).toBeGreaterThan(0);
    expectDownwardChain(graph, ['n:n2', 'n:n4', 'c:m2']);
    expectBottomMatnRank(graph, reports);
  });

  it.each(['n2', 'n3'])('keeps all matns of the forked branch through %s together', (branchName) => {
    const reports = [
      makeReport('short', ['n1', branchName === 'n2' ? 'n3' : 'n2'], 'The short route.'),
      ...Array.from({ length: 4 }, (_, index) => makeReport(
        `long-${index}`,
        ['n1', branchName, 'n4', `Collector ${index}`],
        `Long route ${index}.`,
      )),
    ];
    const widths = { 'm:short': 440, 'm:long-0': 220, 'm:long-1': 760, 'm:long-2': 320 };
    const original = buildRenderableGraph(reports, {}, widths);
    const reversed = buildRenderableGraph([...reports].reverse(), {}, widths);

    for (const graph of [original, reversed]) {
      const short = node(graph, 'c:short');
      const branch = node(graph, `n:${branchName}`);
      const direction = Math.sign(short.x - branch.x);
      expect(direction).not.toBe(0);
      for (let index = 0; index < 4; index += 1) {
        const matn = node(graph, `m:long-${index}`);
        expect((node(graph, 'm:short').x - matn.x) * direction,
          `${matn.id} should stay on the same side of the short route as its branch`).toBeGreaterThan(0);
      }
      expectBottomMatnRank(graph, reports);
    }
    for (const before of original.nodes) {
      expect(unshiftedX(reversed, before.id)).toBeCloseTo(unshiftedX(original, before.id), 6);
    }
  });

  it('keeps nested branches together when their collectors finish at different depths', () => {
    const reports = [
      makeReport('r0', ['Root', 'H0', 'B3', 'Collector 5'], 'First wording.'),
      makeReport('r1', ['Root', 'H0', 'B3', 'S6', 'Collector 7'], 'Second wording.'),
      makeReport('r2', ['Root', 'H0', 'B3', 'J8', 'Collector 9'], 'Third wording.'),
      makeReport('r4', ['Root', 'H13', 'Collector 14'], 'Short neighboring route.'),
    ];
    const graph = buildRenderableGraph(reports);

    const direction = Math.sign(node(graph, 'n:H13').x - node(graph, 'n:H0').x);
    expect(direction).not.toBe(0);
    for (const id of ['r0', 'r1', 'r2']) {
      expect((node(graph, 'm:r4').x - node(graph, `m:${id}`).x) * direction).toBeGreaterThan(0);
    }
    expectBottomMatnRank(graph, reports);
  });

  it('places all nine moon-splitting matns below their collectors without overlapping', () => {
    const parsed = parseBundleJson(JSON.stringify(sample));
    expect(parsed.error).toBeUndefined();
    const reports = parsed.bundle!.reports;
    const graph = buildRenderableGraph(reports);

    expect(reports).toHaveLength(9);
    expectBottomMatnRank(graph, reports);
  });

  it('reserves variable card widths while retaining independent downward chains', () => {
    const reports = ['a', 'b', 'c'].map((id) => makeReport(
      id,
      [`Root ${id}`, `Student ${id}`, `Collector ${id}`],
      'A report with enough text to wrap over several lines. '.repeat(12),
    ));
    const graph = buildRenderableGraph(reports, {}, {
      'm:a': 760,
      'm:b': 220,
      'm:c': 440,
    });

    expectBottomMatnRank(graph, reports);
    expect(node(graph, 'm:a').width).toBe(760);
    expect(node(graph, 'm:b').width).toBe(220);
    expect(node(graph, 'm:c').width).toBe(440);
    for (const report of reports) {
      expectDownwardChain(graph, [`n:Root ${report.id}`, `n:Student ${report.id}`, `c:${report.id}`]);
    }
  });

  it('places differing chain lengths above a common bottom matn rank', () => {
    const reports = [
      makeReport('short', ['Root A', 'Short collector'], 'A short route.'),
      makeReport('middle', ['Root B', 'Student B', 'Middle collector'], 'A medium route.'),
      makeReport('long', ['Root C', 'Student C', 'Later student C', 'Long collector'], 'A long route.'),
    ];
    const graph = buildRenderableGraph(reports, {}, {
      'm:short': 760,
      'm:middle': 760,
      'm:long': 760,
    });

    expectBottomMatnRank(graph, reports);
    expectDownwardChain(graph, ['n:Root A', 'c:short']);
    expectDownwardChain(graph, ['n:Root B', 'n:Student B', 'c:middle']);
    expectDownwardChain(graph, ['n:Root C', 'n:Student C', 'n:Later student C', 'c:long']);
  });

  it('makes room in the bottom rank when a card is widened', () => {
    const reports = ['a', 'b'].map((id) => makeReport(
      id,
      [`Root ${id}`, `Student ${id}`, `Collector ${id}`],
      `Report ${id}.`,
    ));
    const narrow = buildRenderableGraph(reports, {}, { 'm:a': 220, 'm:b': 220 });
    const widened = buildRenderableGraph(reports, {}, { 'm:a': 760, 'm:b': 220 });
    const cardDistance = (graph: RenderableGraph) => Math.abs(node(graph, 'm:a').x - node(graph, 'm:b').x);

    expectBottomMatnRank(narrow, reports);
    expectBottomMatnRank(widened, reports);
    expect(cardDistance(widened)).toBeGreaterThan(cardDistance(narrow));
    expect(cardDistance(widened)).toBeGreaterThanOrEqual((760 + 220) / 2 + MIN_MATN_GAP - EPSILON);
    expect(reports.some((report) => Math.abs(
      unshiftedX(widened, `m:${report.id}`) - unshiftedX(narrow, `m:${report.id}`),
    ) > EPSILON)).toBe(true);
    for (const report of reports) {
      expectDownwardChain(widened, [`n:Root ${report.id}`, `n:Student ${report.id}`, `c:${report.id}`]);
    }
  });

  it('keeps automatic collector and card positions deterministic under report reordering', () => {
    const reports = ['c', 'a', 'b'].map((id) => makeReport(
      id,
      ['Shared root', `Student ${id}`, `Collector ${id}`],
      `Report ${id}.`,
    ));
    const widths = { 'm:a': 220, 'm:b': 760, 'm:c': 440 };
    const original = buildRenderableGraph(reports, {}, widths);
    const reversed = buildRenderableGraph([...reports].reverse(), {}, widths);

    expectBottomMatnRank(original, reports);
    expectBottomMatnRank(reversed, reports);
    for (const before of original.nodes) {
      const after = node(reversed, before.id);
      expect(after.x - (reversed.shiftX ?? 0), `${before.id} should have deterministic x`)
        .toBeCloseTo(before.x - (original.shiftX ?? 0), 6);
      expect(after.y - (reversed.shiftY ?? 0), `${before.id} should have deterministic y`)
        .toBeCloseTo(before.y - (original.shiftY ?? 0), 6);
    }
  });
});
