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

function expectAlignedMatnRow(graph: RenderableGraph, reports: HadithReport[]): void {
  const matns = reports.map((report) => node(graph, `m:${report.id}`)).sort((a, b) => a.x - b.x);
  const top = matns[0].y - matns[0].height / 2;
  const narratorBottom = Math.max(...graph.nodes
    .filter((candidate) => candidate.type === 'narrator')
    .map((narrator) => narrator.y + narrator.height / 2));

  expect(top).toBeGreaterThan(narratorBottom);
  for (const report of reports) {
    const collector = node(graph, `c:${report.id}`);
    const matn = node(graph, `m:${report.id}`);
    expect(matn.x, `${matn.id} should be centered directly under ${collector.id}`)
      .toBeCloseTo(collector.x, 6);
    expect(matn.y - matn.height / 2, `${matn.id} should share the matn row's top`)
      .toBeCloseTo(top, 6);
  }

  for (let index = 1; index < matns.length; index += 1) {
    const left = matns[index - 1];
    const right = matns[index];
    const gap = right.x - right.width / 2 - (left.x + left.width / 2);
    expect(gap, `${left.id} and ${right.id} should have space between their text cards`)
      .toBeGreaterThanOrEqual(MIN_MATN_GAP - EPSILON);
  }
}

function expectVerticalChain(graph: RenderableGraph, ids: string[]): void {
  const anchor = node(graph, ids[0]);
  for (const id of ids.slice(1)) {
    expect(node(graph, id).x, `${id} should remain under its unbranched parent`)
      .toBeCloseTo(anchor.x, 6);
  }
}

function unshiftedX(graph: RenderableGraph, id: string): number {
  return node(graph, id).x - (graph.shiftX ?? 0);
}

describe('collector and matn alignment', () => {
  it('centers all nine moon-splitting matns below their collectors without overlapping', () => {
    const parsed = parseBundleJson(JSON.stringify(sample));
    expect(parsed.error).toBeUndefined();
    const reports = parsed.bundle!.reports;
    const graph = buildRenderableGraph(reports);

    expect(reports).toHaveLength(9);
    expectAlignedMatnRow(graph, reports);
  });

  it('reserves variable card widths upstream while keeping independent chains vertical', () => {
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

    expectAlignedMatnRow(graph, reports);
    expect(node(graph, 'm:a').width).toBe(760);
    expect(node(graph, 'm:b').width).toBe(220);
    expect(node(graph, 'm:c').width).toBe(440);
    for (const report of reports) {
      expectVerticalChain(graph, [`n:Root ${report.id}`, `n:Student ${report.id}`, `c:${report.id}`]);
    }
  });

  it('separates collectors on different ranks when their matns need the same bottom row', () => {
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

    expect(new Set(reports.map((report) => node(graph, `c:${report.id}`).y)).size).toBe(3);
    expectAlignedMatnRow(graph, reports);
    expectVerticalChain(graph, ['n:Root A', 'c:short']);
    expectVerticalChain(graph, ['n:Root B', 'n:Student B', 'c:middle']);
    expectVerticalChain(graph, ['n:Root C', 'n:Student C', 'n:Later student C', 'c:long']);
  });

  it('moves collectors and their chains apart when a card is widened', () => {
    const reports = ['a', 'b'].map((id) => makeReport(
      id,
      [`Root ${id}`, `Student ${id}`, `Collector ${id}`],
      `Report ${id}.`,
    ));
    const narrow = buildRenderableGraph(reports, {}, { 'm:a': 220, 'm:b': 220 });
    const widened = buildRenderableGraph(reports, {}, { 'm:a': 760, 'm:b': 220 });
    const collectorDistance = (graph: RenderableGraph) => Math.abs(node(graph, 'c:a').x - node(graph, 'c:b').x);

    expectAlignedMatnRow(narrow, reports);
    expectAlignedMatnRow(widened, reports);
    expect(collectorDistance(widened)).toBeGreaterThan(collectorDistance(narrow));
    expect(collectorDistance(widened)).toBeGreaterThanOrEqual((760 + 220) / 2 + MIN_MATN_GAP - EPSILON);
    expect(reports.some((report) => Math.abs(
      unshiftedX(widened, `c:${report.id}`) - unshiftedX(narrow, `c:${report.id}`),
    ) > EPSILON)).toBe(true);
    for (const report of reports) {
      expectVerticalChain(widened, [`n:Root ${report.id}`, `n:Student ${report.id}`, `c:${report.id}`]);
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

    expectAlignedMatnRow(original, reports);
    expectAlignedMatnRow(reversed, reports);
    for (const before of original.nodes) {
      const after = node(reversed, before.id);
      expect(after.x - (reversed.shiftX ?? 0), `${before.id} should have deterministic x`)
        .toBeCloseTo(before.x - (original.shiftX ?? 0), 6);
      expect(after.y - (reversed.shiftY ?? 0), `${before.id} should have deterministic y`)
        .toBeCloseTo(before.y - (original.shiftY ?? 0), 6);
    }
  });
});
