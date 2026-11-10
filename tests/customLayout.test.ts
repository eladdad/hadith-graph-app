import { describe, expect, it } from 'vitest';
import corpus from '../examples/moon-splitting-full.hadith-graph.json';
import { parseBundleJson } from '../src/bundle';
import { buildRenderableGraph, getNarratorNodeIdForReport } from '../src/graph';
import type { RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

const EPSILON = 1e-6;
const MIN_CARD_GAP = 40;

function expectCardClearance(graph: RenderableGraph): void {
  const matns = graph.nodes.filter((node) => node.type === 'matn');
  for (let index = 0; index < matns.length; index += 1) {
    const left = matns[index];
    for (const right of matns.slice(index + 1)) {
      const horizontalGap = Math.abs(right.x - left.x) - (left.width + right.width) / 2;
      const verticalGap = Math.abs(right.y - left.y) - (left.height + right.height) / 2;
      expect(Math.max(horizontalGap, verticalGap), `${left.id} and ${right.id} need card clearance`)
        .toBeGreaterThanOrEqual(MIN_CARD_GAP - EPSILON);
    }
  }
}

describe('custom automatic layout compatibility', () => {
  it('stacks separate matns below a shared trie terminal and preserves an explicit card pin', () => {
    const reports = [
      makeReport('first', ['Root', 'Student', 'Collector'], 'First wording. '.repeat(20)),
      makeReport('second', ['Root', 'Student', 'Collector'], 'Second wording.'),
      makeReport('third', ['Root', 'Student', 'Collector'], 'Third wording. '.repeat(8)),
    ];
    const widths = { 'm:first': 760, 'm:second': 220, 'm:third': 440 };
    const automatic = buildRenderableGraph(reports, {}, widths, undefined, [], { representation: 'trie' });
    const reversed = buildRenderableGraph([...reports].reverse(), {}, widths, undefined, [], { representation: 'trie' });
    const terminalId = getNarratorNodeIdForReport(reports[0], 2, 'trie');
    const terminal = automatic.nodes.find((node) => node.id === terminalId)!;
    const matns = automatic.nodes.filter((node) => node.type === 'matn');

    expect(matns).toHaveLength(3);
    for (const matn of matns) {
      expect(matn.matnAnchorId).toBe(terminalId);
      expect(matn.x).toBeCloseTo(terminal.x, 6);
      expect(matn.y - matn.height / 2).toBeGreaterThan(terminal.y + terminal.height / 2);
      const repeated = reversed.nodes.find((node) => node.id === matn.id)!;
      expect({ x: repeated.x, y: repeated.y }).toEqual({ x: matn.x, y: matn.y });
    }
    expectCardClearance(automatic);

    const saved = { 'm:second': { x: 2500, y: 1800 } };
    const pinned = buildRenderableGraph(reports, saved, widths, undefined, [], { representation: 'trie' });
    const pinnedMatn = pinned.nodes.find((node) => node.id === 'm:second')!;
    expect({ x: pinnedMatn.x - (pinned.shiftX ?? 0), y: pinnedMatn.y - (pinned.shiftY ?? 0) })
      .toEqual(saved['m:second']);
    expectCardClearance(pinned);
  });

  it.each(['merged', 'trie'] as const)('lays out all 244 reports with finite bounds and clear text cards in %s mode', (representation) => {
    const parsed = parseBundleJson(JSON.stringify(corpus));
    expect(parsed.error).toBeUndefined();
    const reports = parsed.bundle!.reports;
    expect(reports).toHaveLength(244);
    const graph = buildRenderableGraph(reports, {}, {}, undefined, [], { representation });
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const matns = graph.nodes.filter((node) => node.type === 'matn');
    expect(matns).toHaveLength(reports.length);
    expect(Number.isFinite(graph.width) && graph.width > 0).toBe(true);
    expect(Number.isFinite(graph.height) && graph.height > 0).toBe(true);
    for (const node of graph.nodes) {
      expect([node.x, node.y, node.width, node.height].every(Number.isFinite), node.id).toBe(true);
      expect(node.x - node.width / 2).toBeGreaterThanOrEqual(-EPSILON);
      expect(node.y - node.height / 2).toBeGreaterThanOrEqual(-EPSILON);
      expect(node.x + node.width / 2).toBeLessThanOrEqual(graph.width + EPSILON);
      expect(node.y + node.height / 2).toBeLessThanOrEqual(graph.height + EPSILON);
    }
    const narratorBottom = Math.max(...graph.nodes.filter((node) => node.type === 'narrator')
      .map((node) => node.y + node.height / 2));
    for (const matn of matns) {
      const anchor = nodes.get(matn.matnAnchorId!)!;
      expect(anchor, `Missing anchor for ${matn.id}`).toBeDefined();
      expect(matn.x).toBeCloseTo(anchor.x, 6);
      expect(matn.y - matn.height / 2).toBeGreaterThan(narratorBottom);
    }
    expectCardClearance(graph);
    for (const edge of graph.edges) expect(nodes.get(edge.source)!.y).toBeLessThan(nodes.get(edge.target)!.y);
  }, 30_000);
});
