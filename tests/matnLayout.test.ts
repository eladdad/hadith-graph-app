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

function expectMatnRow(graph: RenderableGraph): void {
  const matns = graph.nodes.filter((candidate) => candidate.type === 'matn').sort((a, b) => a.x - b.x);
  expect(matns.length).toBeGreaterThan(0);
  const top = matns[0].y - matns[0].height / 2;
  const narratorBottom = Math.max(...graph.nodes
    .filter((candidate) => candidate.type === 'narrator')
    .map((narrator) => narrator.y + narrator.height / 2));
  expect(top).toBeGreaterThan(narratorBottom);

  for (const matn of matns) {
    expect(matn.y - matn.height / 2, `${matn.id} should share the matn row's top`).toBeCloseTo(top, 6);
    expect(matn.x - matn.width / 2).toBeGreaterThanOrEqual(-EPSILON);
    expect(matn.x + matn.width / 2).toBeLessThanOrEqual(graph.width + EPSILON);
    expect(matn.y + matn.height / 2).toBeLessThanOrEqual(graph.height + EPSILON);
  }

  for (let index = 1; index < matns.length; index += 1) {
    const left = matns[index - 1];
    const right = matns[index];
    const gap = right.x - right.width / 2 - (left.x + left.width / 2);
    expect(gap, `${left.id} and ${right.id} should have space between their text cards`)
      .toBeGreaterThanOrEqual(MIN_MATN_GAP - EPSILON);
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

  it('separates text cards even when collectors on different ranks occupy the same column', () => {
    const positions = {
      'c:short': { x: 600, y: 300 },
      'c:long': { x: 600, y: 600 },
    };
    const graph = buildRenderableGraph([
      makeReport('short', ['Root A', 'Short collector'], 'A short route.'),
      makeReport('long', ['Root B', 'Intermediate', 'Long collector'], 'A longer route.'),
    ], positions);

    expectMatnRow(graph);
    for (const [id, position] of Object.entries(positions)) {
      const collector = node(graph, id);
      expect(collector.x - (graph.shiftX ?? 0)).toBeCloseTo(position.x, 6);
      expect(collector.y - (graph.shiftY ?? 0)).toBeCloseTo(position.y, 6);
    }
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

  it('preserves collector order and narrator positions when widening reverses preferred card centers', () => {
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

    // Right-edge alignment puts the wide right card's preferred center to the
    // left of the narrow card's. Their collectors still determine row order.
    const preferredLeft = leftCollector.x + leftCollector.width / 2 - leftMatn.width / 2;
    const preferredRight = rightCollector.x + rightCollector.width / 2 - rightMatn.width / 2;
    expect(preferredRight).toBeLessThan(preferredLeft);
    expect(node(initial, 'm:left').x).toBeLessThan(node(initial, 'm:right').x);
    expect(leftMatn.x).toBeLessThan(rightMatn.x);
    expectMatnRow(initial);
    expectMatnRow(widened);

    for (const narrator of initial.nodes.filter((candidate) => candidate.type === 'narrator')) {
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

    expectMatnRow(original);
    expectSameMatnPositions(original, repeated);
    expectSameMatnPositions(original, reversed);
  });

  it('preserves the collector right-edge anchor when a lone card needs no extra space', () => {
    const graph = buildRenderableGraph([
      makeReport('only', ['Root', 'Collector'], 'The only report.'),
    ], {}, { 'm:only': 440 });
    const collector = node(graph, 'c:only');
    const matn = node(graph, 'm:only');

    expect(matn.x + matn.width / 2).toBeCloseTo(collector.x + collector.width / 2, 6);
    expectMatnRow(graph);
  });
});
