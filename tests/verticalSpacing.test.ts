import { describe, expect, it } from 'vitest';
import { bundleToJson, createEmptyBundle, parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import { DEFAULT_VERTICAL_SPACING, MAX_VERTICAL_SPACING, MIN_VERTICAL_SPACING } from '../src/layoutSettings';
import type { GraphNode, RenderableGraph } from '../src/types';
import { makeBundle, makeReport } from './helpers';

function node(graph: RenderableGraph, id: string): GraphNode {
  const found = graph.nodes.find((candidate) => candidate.id === id);
  expect(found, `Missing ${id}`).toBeDefined();
  return found!;
}

function gap(graph: RenderableGraph, sourceId: string, targetId: string): number {
  const source = node(graph, sourceId);
  const target = node(graph, targetId);
  return target.y - target.height / 2 - (source.y + source.height / 2);
}

describe('vertical level spacing', () => {
  it('loads old bundles with the increased default and preserves explicit spacing through export/import', () => {
    const legacy = makeBundle([makeReport('r1', ['Authority', 'Student', 'Collector'], 'Wording.')], {
      nodePositions: { 'n:Authority': { x: 400, y: 100 } },
    });
    expect(legacy.verticalSpacing).toBeUndefined();
    const imported = parseBundleJson(bundleToJson(legacy)).bundle!;
    expect(imported.verticalSpacing).toBe(DEFAULT_VERTICAL_SPACING);
    expect(createEmptyBundle().verticalSpacing).toBe(DEFAULT_VERTICAL_SPACING);

    const customized = { ...imported, verticalSpacing: 290 };
    const restored = parseBundleJson(bundleToJson(customized)).bundle!;
    expect(restored.verticalSpacing).toBe(290);
    expect(restored.reports).toEqual(legacy.reports);
    expect(restored.nodePositions).toEqual(legacy.nodePositions);
  });

  it('bounds imported spacing and falls back for invalid values', () => {
    const bundle = makeBundle([makeReport('r1', ['Authority'], 'Wording.')]);
    const imported = (verticalSpacing: unknown) => parseBundleJson(JSON.stringify({ ...bundle, verticalSpacing })).bundle!;
    expect(imported(-25).verticalSpacing).toBe(MIN_VERTICAL_SPACING);
    expect(imported(2000).verticalSpacing).toBe(MAX_VERTICAL_SPACING);
    expect(imported('250').verticalSpacing).toBe(DEFAULT_VERTICAL_SPACING);
    expect(imported(null).verticalSpacing).toBe(DEFAULT_VERTICAL_SPACING);
  });

  it('passes spacing to dot while preserving the directed chain and real matn node', () => {
    const reports = [makeReport('r1', ['Authority', 'Student', 'Collector'], 'Wording.')];
    const narrow = buildRenderableGraph(reports, {}, {}, undefined, [], { verticalSpacing: 80 });
    const spacious = buildRenderableGraph(reports, {}, {}, undefined, [], { verticalSpacing: 320 });

    for (const [source, target] of [['n:Authority', 'n:Student'], ['n:Student', 'c:r1'], ['c:r1', 'm:r1']]) {
      expect(gap(narrow, source, target)).toBeGreaterThanOrEqual(79);
      expect(gap(spacious, source, target)).toBeGreaterThanOrEqual(319);
      expect(gap(spacious, source, target)).toBeGreaterThan(gap(narrow, source, target));
    }
    expect(spacious.edges.map((edge) => [edge.id, edge.reports])).toEqual(narrow.edges.map((edge) => [edge.id, edge.reports]));
    expect(spacious.nodes.map((candidate) => candidate.id).sort()).toEqual(narrow.nodes.map((candidate) => candidate.id).sort());
    expect(spacious.height).toBeGreaterThan(narrow.height);
  });

  it('preserves explicit narrator positions while unpinned matns keep using dot spacing', () => {
    const reports = [makeReport('r1', ['Authority', 'Student', 'Collector'], 'Wording.')];
    const positions = {
      'n:Authority': { x: 400, y: 110 },
      'n:Student': { x: 420, y: 280 },
      'c:r1': { x: 420, y: 450 },
    };
    const before = JSON.stringify(positions);
    const narrow = buildRenderableGraph(reports, positions, {}, undefined, [], { verticalSpacing: 80 });
    const spacious = buildRenderableGraph(reports, positions, {}, undefined, [], { verticalSpacing: 320 });

    for (const [id, position] of Object.entries(positions)) {
      for (const graph of [narrow, spacious]) {
        expect({ x: node(graph, id).x - (graph.shiftX ?? 0), y: node(graph, id).y - (graph.shiftY ?? 0) }).toEqual(position);
      }
    }
    expect(node(spacious, 'm:r1').y - (spacious.shiftY ?? 0))
      .toBeGreaterThan(node(narrow, 'm:r1').y - (narrow.shiftY ?? 0));
    expect(JSON.stringify(positions)).toBe(before);
  });
});
