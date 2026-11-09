import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { bundleToJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import { getGraphNode, importJson, makeBundle, makeReport } from './helpers';

function position(container: HTMLElement, id: string): { x: number; y: number } {
  const transform = getGraphNode(container, id).getAttribute('transform');
  const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) throw new Error(`Missing position for ${id}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function positions(graph: ReturnType<typeof buildRenderableGraph>): Record<string, { x: number; y: number }> {
  return Object.fromEntries(graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}

describe('merged report paths in the direct Graphviz experiment', () => {
  // A merged union graph has no record of which incoming path continues to
  // which outgoing report. These remain product objectives, not guarantees
  // of dot's unmodified node positions.
  it.todo('orders matns by their incoming branch after two report paths reconverge');
  it.todo('preserves incoming branch groups in the Complete reports focus view');
  it.todo('keeps the bundled Ahnaf and Hasan report groups in branch order after they rejoin');

  it('retains identical automatic positions when only the provenance through a merged graph changes', () => {
    const original = [
      makeReport('a', ['n0', 'n8', 'Collector A'], 'First wording.'),
      makeReport('b', ['n0', 'n6', 'n8', 'Collector B'], 'Second wording.'),
    ];
    const swapped = [
      { ...original[0], isnad: ['n0', 'n6', 'n8', 'Collector A'] },
      { ...original[1], isnad: ['n0', 'n8', 'Collector B'] },
    ];
    const first = buildRenderableGraph(original);
    const second = buildRenderableGraph(swapped);

    expect(second.edges.map((edge) => edge.id).sort()).toEqual(first.edges.map((edge) => edge.id).sort());
    expect(positions(second)).toEqual(positions(first));
    for (const graph of [first, second]) {
      expect(graph.nodes.filter((node) => node.type === 'matn').map((node) => node.id).sort())
        .toEqual(['m:a', 'm:b']);
      for (const matn of graph.nodes.filter((node) => node.type === 'matn')) {
        expect(matn.y).toBeGreaterThan(graph.nodes.find((node) => node.id === 'n:n8')!.y);
      }
    }
    expect(positions(buildRenderableGraph(original))).toEqual(positions(first));
  });

  it('uses the fresh automatic graph in Complete reports without reusing full-graph saved positions', async () => {
    const user = userEvent.setup();
    const reports = [
      makeReport('m1', ['n0', 'n8', 'Collector A'], 'Direct wording one.'),
      makeReport('m2', ['n0', 'n8', 'Collector B'], 'Direct wording two.'),
      makeReport('m3', ['n0', 'n6', 'n8', 'Collector C'], 'Left-branch wording one.'),
      makeReport('m4', ['n0', 'n6', 'n8', 'Collector D'], 'Left-branch wording two.'),
      makeReport('outside', ['Other authority', 'Other collector'], 'Outside the focus.'),
    ];
    const bundle = makeBundle(reports, {
      nodePositions: { 'n:n0': { x: 3000, y: 900 }, 'c:m1': { x: 2800, y: 1200 } },
    });
    const { container } = render(<App />);
    await importJson(container, bundleToJson(bundle));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Focus narrator' }), 'n0');
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));

    expect(container.querySelector('[data-node-id="m:outside"]')).toBeNull();
    expect(position(container, 'n:n0')).not.toEqual(bundle.nodePositions['n:n0']);
    const expected = buildRenderableGraph(reports.slice(0, 4), {}, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend);
    for (const node of expected.nodes) {
      expect(position(container, node.id)).toEqual({ x: node.x, y: node.y });
    }
  });
});
