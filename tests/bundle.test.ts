import { describe, expect, it } from 'vitest';
import {
  addReportToBundleFromFields,
  bundleToJson,
  createEmptyBundle,
  deleteReportFromBundle,
  parseBundleJson,
  removeHighlightLegendItemFromBundle,
  updateReportInBundle,
} from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import { makeBundle, makeReport } from './helpers';

describe('bundle helpers', () => {
  it('adds, updates, and deletes reports while keeping the graph in sync', () => {
    const emptyBundle = createEmptyBundle('Bundle Under Test');
    const added = addReportToBundleFromFields(emptyBundle, ['Narrator A', 'Narrator B'], 'Original matn');

    expect(added.bundle).toBeDefined();
    expect(added.addedNodeIds).toHaveLength(3);

    const addedBundle = added.bundle!;
    const addedGraph = buildRenderableGraph(
      addedBundle.reports,
      addedBundle.nodePositions,
      addedBundle.nodeWidths,
      addedBundle.fontSizes,
      addedBundle.highlightLegend,
    );

    expect(addedGraph.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(['Narrator A', 'Narrator B', 'Matn 1']),
    );
    expect(addedGraph.nodes.find((node) => node.type === 'matn')?.matnLines?.join('')).toContain('Original matn');
    expect(addedGraph.edges).toHaveLength(1);

    const reportId = addedBundle.reports[0]?.id;
    expect(reportId).toBeTruthy();

    const updated = updateReportInBundle(addedBundle, reportId!, ['Narrator A', 'Narrator C'], 'Updated matn');
    expect(updated.bundle).toBeDefined();
    expect(updated.updatedNodeIds).toHaveLength(3);

    const updatedBundle = updated.bundle!;
    const updatedGraph = buildRenderableGraph(
      updatedBundle.reports,
      updatedBundle.nodePositions,
      updatedBundle.nodeWidths,
      updatedBundle.fontSizes,
      updatedBundle.highlightLegend,
    );

    expect(updatedGraph.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(['Narrator A', 'Narrator C', 'Matn 1']),
    );
    expect(updatedGraph.nodes.map((node) => node.label)).not.toContain('Narrator B');
    expect(updatedGraph.nodes.find((node) => node.type === 'matn')?.matnLines?.join('')).toContain('Updated matn');

    const deleted = deleteReportFromBundle(updatedBundle, reportId!);
    expect(deleted.bundle).toBeDefined();

    const deletedGraph = buildRenderableGraph(
      deleted.bundle!.reports,
      deleted.bundle!.nodePositions,
      deleted.bundle!.nodeWidths,
      deleted.bundle!.fontSizes,
      deleted.bundle!.highlightLegend,
    );

    expect(deleted.bundle?.reports).toHaveLength(0);
    expect(deletedGraph.nodes).toHaveLength(0);
    expect(deletedGraph.edges).toHaveLength(0);
  });

  it('roundtrips bundle json and rejects invalid input', () => {
    const bundle = makeBundle(
      [makeReport('r1', ['Alpha', 'Beta'], 'Roundtrip matn')],
      {
        nodePositions: {
          'n:Alpha': { x: 100, y: 110 },
          'c:r1': { x: 220, y: 110 },
        },
      },
    );

    const serialized = bundleToJson(bundle);
    const parsed = parseBundleJson(serialized);
    expect(parsed.bundle).toMatchObject(bundle);

    expect(parseBundleJson('not valid json')).toEqual({
      error: 'Invalid JSON file.',
    });

    expect(parseBundleJson(JSON.stringify({})).error).toContain('Unsupported format');
  });

  it('removes a highlight legend item and clears attached highlights from reports', () => {
    const bundle = makeBundle(
      [
        {
          ...makeReport('r1', ['Alpha'], 'Matn with highlights'),
          matnHighlights: [
            { id: 'h1', legendId: 'legend-1', start: 0, end: 4 },
            { id: 'h2', legendId: 'legend-2', start: 5, end: 9 },
          ],
        },
      ],
      {
        highlightLegend: [
          { id: 'legend-1', label: 'Actor', color: '#f59e0b' },
          { id: 'legend-2', label: 'Place', color: '#0ea5e9' },
        ],
      },
    );

    const result = removeHighlightLegendItemFromBundle(bundle, 'legend-1');

    expect(result.bundle).toBeDefined();
    expect(result.removedHighlights).toBe(1);
    expect(result.bundle?.highlightLegend).toEqual([
      { id: 'legend-2', label: 'Place', color: '#0ea5e9' },
    ]);
    expect(result.bundle?.reports[0]?.matnHighlights).toEqual([
      { id: 'h2', legendId: 'legend-2', start: 5, end: 9 },
    ]);
  });
});
