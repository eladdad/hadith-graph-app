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

describe('automatic layout in Complete reports', () => {
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
