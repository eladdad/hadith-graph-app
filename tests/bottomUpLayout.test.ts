import { describe, expect, it } from 'vitest';
import example from '../drawio_graph_conversion/khosrow_daughter.hadith-graph.json';
import { getEdgeIdsForReport, getNodeIdsForReport, parseBundleJson } from '../src/bundle';
import { getCollectorNarrators } from '../src/collectors';
import { buildRenderableGraph } from '../src/graph';
import { orderMatnsBySimilarity } from '../src/matnSimilarity';
import type { GraphNode, GraphRepresentation, HadithReport, RenderableGraph } from '../src/types';
import { makeReport } from './helpers';

const EPSILON = 1e-6;

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing node ${id}`).toBeDefined();
  return found!;
}

function expectCentered(parent: GraphNode, children: GraphNode[]): void {
  const midpoint = (Math.min(...children.map((child) => child.x - child.width / 2))
    + Math.max(...children.map((child) => child.x + child.width / 2))) / 2;
  expect(parent.x, `${parent.label} should be centered over ${children.map((child) => child.label).join(', ')}`)
    .toBeCloseTo(midpoint, 5);
}

function expectStructurePreserved(graph: RenderableGraph, reports: HadithReport[], representation: GraphRepresentation): void {
  const collectors = getCollectorNarrators(reports);
  expect(new Set(graph.nodes.map((candidate) => candidate.id)))
    .toEqual(new Set(reports.flatMap((report) => getNodeIdsForReport(report, representation, collectors))));
  expect(new Set(graph.edges.map((edge) => edge.id)))
    .toEqual(new Set(reports.flatMap((report) => getEdgeIdsForReport(report, representation, collectors))));
  for (const edge of graph.edges) {
    expect(node(graph, edge.source).y, `${edge.id} should retain the transmission direction`)
      .toBeLessThan(node(graph, edge.target).y);
  }
  expect(graph.hasCycle).toBe(false);
}

function expectClearance(graph: RenderableGraph, alignCards: boolean): void {
  const rows = new Map<number, GraphNode[]>();
  for (const narrator of graph.nodes.filter((candidate) => candidate.type === 'narrator')) {
    rows.set(narrator.y, [...(rows.get(narrator.y) ?? []), narrator]);
  }
  for (const row of rows.values()) {
    row.sort((left, right) => left.x - right.x);
    for (let index = 1; index < row.length; index += 1) {
      const left = row[index - 1];
      const right = row[index];
      expect(right.x - right.width / 2 - left.x - left.width / 2, `${left.id} and ${right.id} need narrator clearance`)
        .toBeGreaterThanOrEqual(70 - EPSILON);
    }
  }
  const matns = graph.nodes.filter((candidate) => candidate.type === 'matn');
  for (let index = 0; index < matns.length; index += 1) {
    const left = matns[index];
    if (alignCards) expect(left.x).toBeCloseTo(node(graph, left.matnAnchorId!).x, 6);
    for (const right of matns.slice(index + 1)) {
      const horizontalGap = Math.abs(right.x - left.x) - (left.width + right.width) / 2;
      const verticalGap = Math.abs(right.y - left.y) - (left.height + right.height) / 2;
      expect(Math.max(horizontalGap, verticalGap), `${left.id} and ${right.id} need text-card clearance`)
        .toBeGreaterThanOrEqual(40 - EPSILON);
    }
  }
}

function positions(graph: RenderableGraph): Record<string, { x: number; y: number }> {
  return Object.fromEntries(graph.nodes.map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]));
}

function exampleBundle() {
  const parsed = parseBundleJson(JSON.stringify(example));
  expect(parsed.error).toBeUndefined();
  return parsed.bundle!;
}

describe('bottom-up narrator layout', () => {
  it('centers the main branches without letting a redundant long edge pull their parent sideways', () => {
    const reports = [
      makeReport('via-a', ['P', 'A', 'H', 'Collector A'], 'A route through A.'),
      makeReport('via-b', ['P', 'B', 'Collector B'], 'The other main branch.'),
      makeReport('direct', ['P', 'H', 'Collector H'], 'The direct transmission to H.'),
    ];
    const widths = { 'm:via-a': 760, 'm:via-b': 220, 'm:direct': 440 };
    const graph = buildRenderableGraph(reports, {}, widths);

    expectCentered(node(graph, 'n:P'), [node(graph, 'n:A'), node(graph, 'n:B')]);
    expect(node(graph, 'n:A').x).toBeCloseTo(node(graph, 'n:H').x, 6);
    expectCentered(node(graph, 'n:H'), [node(graph, 'c:via-a'), node(graph, 'c:direct')]);
    expect(node(graph, 'n:B').x).toBeCloseTo(node(graph, 'c:via-b').x, 6);
    expect(graph.edges.some((edge) => edge.source === 'n:P' && edge.target === 'n:H')).toBe(true);
    expect(node(graph, 'n:A').y).toBe(node(graph, 'n:B').y);
    expect(node(graph, 'n:H').y).toBe(node(graph, 'c:via-b').y);
    expect(node(graph, 'c:via-a').y).toBe(node(graph, 'c:direct').y);
    expectStructurePreserved(graph, reports, 'merged');
    expectClearance(graph, true);
    expect(positions(buildRenderableGraph([...reports].reverse(), {}, widths))).toEqual(positions(graph));
  });

  it.each(['merged', 'trie'] as const)('centers the bundled example’s private branches in %s mode and keeps secondary transmissions', (representation) => {
    const bundle = exampleBundle();
    const collectors = getCollectorNarrators(bundle.reports, bundle.collectorOverrides);
    const graph = buildRenderableGraph(bundle.reports, {}, bundle.nodeWidths, bundle.fontSizes,
      bundle.highlightLegend, { representation, collectorNarrators: collectors });
    const secondarySource = 'n:نفيع بن مسروح';
    const secondaryTarget = 'n:الحسن البصري';

    // This direct transmission also has the route Nufay -> al-Ahnaf ->
    // al-Hasan. It stays visible without competing with the upper student row.
    const branchEdges = graph.edges.filter((edge) => !(edge.source === secondarySource && edge.target === secondaryTarget));
    for (const parent of graph.nodes.filter((candidate) => candidate.type === 'narrator')) {
      const childrenByLevel = new Map<number, GraphNode[]>();
      for (const edge of branchEdges.filter((candidate) => candidate.source === parent.id)) {
        const child = node(graph, edge.target);
        childrenByLevel.set(child.y, [...(childrenByLevel.get(child.y) ?? []), child]);
      }
      for (const children of childrenByLevel.values()) expectCentered(parent, children);
    }
    if (representation === 'merged') {
      expect(graph.edges.some((edge) => edge.source === secondarySource && edge.target === secondaryTarget)).toBe(true);
      const ahnaf = node(graph, 'n:الأحنف بن قيس');
      const hassan = node(graph, secondaryTarget);
      expect(node(graph, secondarySource).y).toBeLessThan(ahnaf.y);
      expect(ahnaf.y).toBeLessThan(hassan.y);
    }
    expectStructurePreserved(graph, bundle.reports, representation);
    expectClearance(graph, true);
    const reversed = buildRenderableGraph([...bundle.reports].reverse(), {}, bundle.nodeWidths, bundle.fontSizes,
      bundle.highlightLegend, { representation, collectorNarrators: collectors });
    expect(positions(reversed)).toEqual(positions(graph));
  });

  it.each(['merged', 'trie'] as const)('preserves the fixed highlight matn order in %s mode', (representation) => {
    const bundle = exampleBundle();
    const collectors = getCollectorNarrators(bundle.reports, bundle.collectorOverrides);
    const graph = buildRenderableGraph(bundle.reports, {}, bundle.nodeWidths, bundle.fontSizes,
      bundle.highlightLegend, { representation, collectorNarrators: collectors, matnSort: 'highlights' });
    const matns = graph.nodes.filter((candidate) => candidate.type === 'matn').sort((left, right) => left.x - right.x);

    expect(matns.map((matn) => matn.id))
      .toEqual(orderMatnsBySimilarity(bundle.reports, bundle.highlightLegend).map((report) => `m:${report.id}`));
    expectStructurePreserved(graph, bundle.reports, representation);
    expectClearance(graph, false);
  });
});
