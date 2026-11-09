import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import example from '../drawio_graph_conversion/khosrow_daughter.hadith-graph.json';
import { bundleToJson, parseBundleJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import { getNarratorFocus } from '../src/narratorFocus';
import { getGraphNode, importJson, makeBundle, makeReport } from './helpers';

function position(container: HTMLElement, id: string): { x: number; y: number } {
  const transform = getGraphNode(container, id).getAttribute('transform');
  const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) throw new Error(`Missing position for ${id}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe('matn ordering after narrator paths merge', () => {
  it('preserves the incoming branch of each report after reconvergence', () => {
    const reports = [
      makeReport('direct', ['n0', 'n8', 'Collector A'], 'Direct route.'),
      makeReport('via', ['n0', 'n6', 'n8', 'Collector B'], 'Route through the left branch.'),
    ];
    for (const input of [reports, [...reports].reverse()]) {
      const graph = buildRenderableGraph(input);
      const node = (id: string) => graph.nodes.find((candidate) => candidate.id === id)!;
      const direction = Math.sign(node('n:n8').x - node('n:n6').x);
      expect(direction).not.toBe(0);
      expect((node('m:direct').x - node('m:via').x) * direction).toBeGreaterThan(0);
      expect(node('m:direct').x).toBe(node('c:direct').x);
      expect(node('m:via').x).toBe(node('c:via').x);
    }
  });

  it('updates cached ordering when report paths change while the visible graph stays the same', () => {
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

    for (const [graph, viaId, directId] of [[first, 'b', 'a'], [second, 'a', 'b']] as const) {
      const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
      const direction = Math.sign(nodes.get('n:n8')!.x - nodes.get('n:n6')!.x);
      expect((nodes.get(`m:${directId}`)!.x - nodes.get(`m:${viaId}`)!.x) * direction).toBeGreaterThan(0);
    }
    expect(buildRenderableGraph(original).nodes).toEqual(first.nodes);
  });

  it('keeps report groups in branch order in a narrator focus Complete reports view', async () => {
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
    const direction = Math.sign(position(container, 'n:n8').x - position(container, 'n:n6').x);
    expect(direction).not.toBe(0);
    for (const left of ['m3', 'm4']) {
      for (const right of ['m1', 'm2']) {
        expect((position(container, `m:${right}`).x - position(container, `m:${left}`).x) * direction)
          .toBeGreaterThan(0);
      }
    }
    for (const report of reports.slice(0, 4)) {
      expect(position(container, `m:${report.id}`).x).toBe(position(container, `c:${report.id}`).x);
    }
  });

  it('keeps the bundled example in branch order after the Ahnaf and Hasan paths rejoin', () => {
    const bundle = parseBundleJson(JSON.stringify(example)).bundle!;
    const focus = getNarratorFocus(bundle.reports, 'نفيع بن مسروح');
    const graph = buildRenderableGraph(focus.reports, {}, bundle.nodeWidths, bundle.fontSizes, bundle.highlightLegend);
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const direction = Math.sign(nodes.get('n:الأحنف بن قيس')!.x - nodes.get('n:الحسن البصري')!.x);
    expect(direction).not.toBe(0);
    for (const report of focus.reports.filter((report) => report.isnad[2] === 'الحسن البصري')) {
      expect((nodes.get('m:khosrow-daughter-24')!.x - nodes.get(`m:${report.id}`)!.x) * direction,
        `${report.id} should remain on its branch's side of report 24`).toBeGreaterThan(0);
    }
  });
});
