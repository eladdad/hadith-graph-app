import { describe, expect, it } from 'vitest';
import sample from '../examples/moon-splitting-ibn-masud-anas.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import type { GraphNode, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

const MIN_MATN_GAP = 40;
const EPSILON = 1e-6;

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing graph node ${id}`).toBeDefined();
  return found!;
}

function expectMatnRow(graph: RenderableGraph, commonTop = true): void {
  const matns = graph.nodes.filter((candidate) => candidate.type === 'matn').sort((a, b) => a.x - b.x);
  expect(matns.length).toBeGreaterThan(0);
  const top = matns[0].y - matns[0].height / 2;
  const narratorBottom = Math.max(...graph.nodes
    .filter((candidate) => candidate.type === 'narrator')
    .map((narrator) => narrator.y + narrator.height / 2));
  expect(top).toBeGreaterThan(narratorBottom);

  for (const matn of matns) {
    if (commonTop) {
      expect(matn.y - matn.height / 2, `${matn.id} should share the matn row's top`).toBeCloseTo(top, 6);
    }
    expect(matn.x - matn.width / 2).toBeGreaterThanOrEqual(-EPSILON);
    expect(matn.x + matn.width / 2).toBeLessThanOrEqual(graph.width + EPSILON);
    expect(matn.y + matn.height / 2).toBeLessThanOrEqual(graph.height + EPSILON);
  }

  for (let i = 0; i < matns.length; i += 1) {
    for (const right of matns.slice(i + 1)) {
      const left = matns[i];
      const horizontalGap = right.x - right.width / 2 - (left.x + left.width / 2);
      const verticalGap = Math.abs(right.y - left.y) - (left.height + right.height) / 2;
      expect(Math.max(horizontalGap, commonTop ? -Infinity : verticalGap),
        `${left.id} and ${right.id} should have space between their text cards`)
        .toBeGreaterThanOrEqual(MIN_MATN_GAP - EPSILON);
    }
  }
}

function expectSameMatnPositions(left: RenderableGraph, right: RenderableGraph): void {
  for (const matn of left.nodes.filter((candidate) => candidate.type === 'matn')) {
    const other = node(right, matn.id);
    expect(other.x - (right.shiftX ?? 0)).toBeCloseTo(matn.x - (left.shiftX ?? 0), 6);
    expect(other.y - (right.shiftY ?? 0)).toBeCloseTo(matn.y - (left.shiftY ?? 0), 6);
    expect(other.width).toBe(matn.width);
    expect(other.height).toBe(matn.height);
  }
}

describe('matn card layout', () => {
  it('gives all nine moon-splitting reports their own space below the narrator graph', () => {
    const parsed = parseBundleJson(JSON.stringify(sample));
    expect(parsed.error).toBeUndefined();
    const bundle = parsed.bundle!;
    const graph = buildRenderableGraph(
      bundle.reports, bundle.nodePositions, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend,
    );

    expect(graph.nodes.filter((candidate) => candidate.type === 'matn')).toHaveLength(9);
    expectMatnRow(graph);
  });

  it('stacks cards beneath pinned collectors when manual positions leave no horizontal room', () => {
    const positions = {
      'c:short': { x: 600, y: 300 },
      'c:long': { x: 600, y: 600 },
    };
    const graph = buildRenderableGraph([
      makeReport('short', ['Root A', 'Short collector'], 'A short route.'),
      makeReport('long', ['Root B', 'Intermediate', 'Long collector'], 'A longer route.'),
    ], positions);

    expectMatnRow(graph, false);
    for (const [id, position] of Object.entries(positions)) {
      const collector = node(graph, id);
      expect(collector.x - (graph.shiftX ?? 0)).toBeCloseTo(position.x, 6);
      expect(collector.y - (graph.shiftY ?? 0)).toBeCloseTo(position.y, 6);
    }
    expect(node(graph, 'm:short').x).toBe(node(graph, 'c:short').x);
    expect(node(graph, 'm:long').x).toBe(node(graph, 'c:long').x);
    expect(node(graph, 'm:short').y).not.toBe(node(graph, 'm:long').y);
  });

  it('uses saved widths and keeps long text within the graph at large font sizes', () => {
    const longText = 'عن عبد الله بن مسعود قال انشق القمر على عهد رسول الله صلى الله عليه وسلم فرقتين. '.repeat(18);
    const graph = buildRenderableGraph([
      makeReport('narrow', ['A', 'Narrow collector'], longText),
      makeReport('maximum', ['B', 'Middle B', 'Wide collector'], longText),
      makeReport('medium', ['C', 'Medium collector'], 'A brief report.'),
    ], {}, {
      'm:narrow': 220,
      'm:maximum': 760,
      'm:medium': 440,
    }, { narrator: 24, matn: 24 });

    expect(node(graph, 'm:narrow').width).toBe(220);
    expect(node(graph, 'm:maximum').width).toBe(760);
    expect(node(graph, 'm:medium').width).toBe(440);
    expect(node(graph, 'm:narrow').height).toBeGreaterThan(node(graph, 'm:maximum').height);
    expect(node(graph, 'm:maximum').height).toBeGreaterThan(node(graph, 'm:medium').height);
    expectMatnRow(graph);
  });

  it('recomputes the row after a text card is widened or its font is enlarged', () => {
    const reports = ['a', 'b', 'c'].map((id) => makeReport(
      id,
      ['Shared parent', `Collector ${id}`],
      'A report with enough words to wrap over several lines. '.repeat(10),
    ));
    const initial = buildRenderableGraph(reports);
    const widened = buildRenderableGraph(reports, {}, { 'm:b': 760 });
    const enlarged = buildRenderableGraph(reports, {}, { 'm:b': 760 }, { matn: 24 });

    for (const graph of [initial, widened, enlarged]) expectMatnRow(graph);
    expect(node(widened, 'm:b').width).toBeGreaterThan(node(initial, 'm:b').width);
    expect(node(enlarged, 'm:a').height).toBeGreaterThan(node(widened, 'm:a').height);
    expect(node(enlarged, 'm:b').height).toBeGreaterThan(node(widened, 'm:b').height);
  });

  it('preserves pinned collector anchors and avoids overlaps when a card is widened', () => {
    const reports = [
      makeReport('left', ['Left root', 'Left collector'], 'The left report.'),
      makeReport('right', ['Right root', 'Right collector'], 'The right report.'),
    ];
    const positions = {
      'c:left': { x: 600, y: 400 },
      'c:right': { x: 860, y: 400 },
    };
    const initial = buildRenderableGraph(reports, positions, { 'm:left': 220, 'm:right': 220 });
    const widened = buildRenderableGraph(reports, positions, { 'm:left': 220, 'm:right': 760 });
    const leftCollector = node(widened, 'c:left');
    const rightCollector = node(widened, 'c:right');
    const leftMatn = node(widened, 'm:left');
    const rightMatn = node(widened, 'm:right');

    expect(node(initial, 'm:left').x).toBeLessThan(node(initial, 'm:right').x);
    expect(leftMatn.x).toBeLessThan(rightMatn.x);
    expect(leftMatn.x).toBe(leftCollector.x);
    expect(rightMatn.x).toBe(rightCollector.x);
    expectMatnRow(initial, false);
    expectMatnRow(widened, false);

    // Automatic ancestors may move to reserve card width. Explicit placements
    // remain authoritative, even when that requires a lower text row.
    for (const narrator of initial.nodes.filter((candidate) => candidate.id in positions)) {
      const afterResize = node(widened, narrator.id);
      expect(afterResize.x - (widened.shiftX ?? 0)).toBeCloseTo(narrator.x - (initial.shiftX ?? 0), 6);
      expect(afterResize.y - (widened.shiftY ?? 0)).toBeCloseTo(narrator.y - (initial.shiftY ?? 0), 6);
    }
  });

  it('keeps positions deterministic when report order changes and collector anchors tie', () => {
    const reports = ['c', 'a', 'b'].map((id) => makeReport(id, ['Root', 'Collector'], `Report ${id}.`));
    const positions = Object.fromEntries(reports.map((report) => [`c:${report.id}`, { x: 700, y: 400 }]));
    const original = buildRenderableGraph(reports, positions);
    const repeated = buildRenderableGraph(reports, positions);
    const reversed = buildRenderableGraph([...reports].reverse(), positions);

    expectMatnRow(original, false);
    expectMatnRow(repeated, false);
    expectMatnRow(reversed, false);
    expectSameMatnPositions(original, repeated);
    expectSameMatnPositions(original, reversed);
  });

  it('centers a lone card directly below its collector', () => {
    const graph = buildRenderableGraph([
      makeReport('only', ['Root', 'Collector'], 'The only report.'),
    ], {}, { 'm:only': 440 });
    const collector = node(graph, 'c:only');
    const matn = node(graph, 'm:only');

    expect(matn.x).toBeCloseTo(collector.x, 6);
    expectMatnRow(graph);
  });

  it.each(['m:only', 'r:only'])('honors the saved matn coordinate %s without moving other automatic nodes', (savedId) => {
    const reports = [makeReport('only', ['Root', 'Collector'], 'The only report.')];
    const automatic = buildRenderableGraph(reports, {}, { 'm:only': 440 });
    const pinned = buildRenderableGraph(reports, { [savedId]: { x: 1500, y: 1200 } }, { 'm:only': 440 });

    expect(node(pinned, 'm:only').x - (pinned.shiftX ?? 0)).toBe(1500);
    expect(node(pinned, 'm:only').y - (pinned.shiftY ?? 0)).toBe(1200);
    for (const original of automatic.nodes.filter((candidate) => candidate.id !== 'm:only')) {
      const after = node(pinned, original.id);
      expect(after.x - (pinned.shiftX ?? 0)).toBeCloseTo(original.x - (automatic.shiftX ?? 0), 6);
      expect(after.y - (pinned.shiftY ?? 0)).toBeCloseTo(original.y - (automatic.shiftY ?? 0), 6);
    }
  });

  it('prefers a current matn position over its legacy alias', () => {
    const graph = buildRenderableGraph([makeReport('only', ['Root', 'Collector'], 'Wording.')], {
      'm:only': { x: 1500, y: 1200 },
      'r:only': { x: 900, y: 800 },
    });
    expect(node(graph, 'm:only').x - (graph.shiftX ?? 0)).toBe(1500);
    expect(node(graph, 'm:only').y - (graph.shiftY ?? 0)).toBe(1200);
  });
});
