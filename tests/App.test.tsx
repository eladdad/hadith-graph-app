import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { bundleToJson } from '../src/bundle';
import { buildRenderableGraph } from '../src/graph';
import { makeBundle, makeReport, getGraphEdge, getGraphNode, importJson } from './helpers';

function parseTranslate(transform: string | null): { x: number; y: number } {
  const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) {
    throw new Error(`Could not parse transform "${transform ?? 'null'}".`);
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  };
}

describe('App', () => {
  it('adds, edits, and deletes a report while keeping the graph updated', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { container } = render(<App />);

    await user.type(screen.getByPlaceholderText('Narrator 1'), 'Narrator A');
    await user.click(screen.getByRole('button', { name: 'Add Narrator' }));
    await user.type(screen.getByPlaceholderText('Narrator 2'), 'Narrator B');
    await user.type(screen.getByPlaceholderText('The report statement'), 'Original matn');
    await user.click(screen.getByRole('button', { name: 'Add Report' }));

    expect(screen.getByText('Reports (1)')).toBeInTheDocument();
    expect(screen.getByText('Narrator A -> Narrator B')).toBeInTheDocument();
    expect(within(getGraphNode(container, 'n:Narrator A')).getByText('Narrator A')).toBeInTheDocument();
    expect(screen.getAllByText('Original matn').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const narratorTwo = screen.getByDisplayValue('Narrator B');
    await user.clear(narratorTwo);
    await user.type(narratorTwo, 'Narrator C');
    const matnField = screen.getByDisplayValue('Original matn');
    await user.clear(matnField);
    await user.type(matnField, 'Updated matn');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(screen.getAllByText('Narrator A -> Narrator C').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Narrator A -> Narrator B')).not.toBeInTheDocument();
    expect(within(getGraphNode(container, 'n:Narrator A')).getByText('Narrator A')).toBeInTheDocument();
    expect(screen.getAllByText('Updated matn').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Delete Report' }));

    await waitFor(() => {
      expect(screen.getByText('Reports (0)')).toBeInTheDocument();
    });
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(0);
    expect(screen.queryByText('Updated matn')).not.toBeInTheDocument();
  });

  it('imports valid json into the list and graph and reports invalid json errors', async () => {
    const bundle = makeBundle([
      makeReport('r1', ['Alpha', 'Beta'], 'Imported matn one'),
      makeReport('r2', ['Gamma', 'Delta'], 'Imported matn two'),
    ]);

    const { container } = render(<App />);

    await importJson(container, bundleToJson(bundle), 'bundle.hadith-graph.json');

    await waitFor(() => {
      expect(screen.getByText('Reports (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('Alpha -> Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma -> Delta')).toBeInTheDocument();
    expect(getGraphNode(container, 'n:Alpha')).toBeInTheDocument();
    expect(getGraphNode(container, 'n:Gamma')).toBeInTheDocument();

    await importJson(container, '{not json}', 'broken.json');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Invalid JSON file.');
    });
  });

  it('removes a shared highlight legend category from the sidebar', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const bundle = makeBundle(
      [
        {
          ...makeReport('r1', ['Alpha', 'Beta'], 'Highlighted matn'),
          matnHighlights: [
            { id: 'h1', legendId: 'legend-1', start: 0, end: 11 },
          ],
        },
      ],
      {
        highlightLegend: [
          { id: 'legend-1', label: 'Actor', color: '#f59e0b' },
        ],
      },
    );

    const { container } = render(<App />);

    await importJson(container, bundleToJson(bundle), 'bundle.hadith-graph.json');
    await waitFor(() => {
      expect(screen.getByText('Reports (1)')).toBeInTheDocument();
    });

    const sidebar = screen.getByRole('complementary');
    await user.click(within(sidebar).getByRole('button', { name: /Highlight Legend/ }));

    const removeButton = within(sidebar)
      .getAllByRole('button', { name: 'Remove' })
      .find((button) => !button.hasAttribute('disabled'));
    if (!removeButton) {
      throw new Error('Shared legend remove button not found.');
    }

    await user.click(removeButton);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText('Actor')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Removed "Actor" and cleared 1 matching highlight(s).');
  });

  it('selecting a matn node selects the whole report in graph, edges, and list', async () => {
    const bundle = makeBundle([
      makeReport('r1', ['Alpha', 'Beta'], 'Matn selection target'),
    ]);
    const { container } = render(<App />);

    await importJson(container, bundleToJson(bundle));
    await waitFor(() => {
      expect(container.querySelector('[data-node-id="m:r1"]')).not.toBeNull();
    });

    fireEvent.pointerDown(getGraphNode(container, 'm:r1'), {
      button: 0,
      clientX: 300,
      clientY: 250,
    });

    await waitFor(() => {
      expect(container.querySelectorAll('.report-card.selected')).toHaveLength(1);
    });
    expect(getGraphNode(container, 'm:r1')).toHaveClass('selected');
    expect(getGraphNode(container, 'n:Alpha')).toHaveClass('selected');
    expect(getGraphNode(container, 'c:r1')).toHaveClass('selected');
    expect(getGraphEdge(container, 'n:Alpha->c:r1')).toHaveClass('selected');
  });

  it('keeps the selected report active while right-click panning', async () => {
    const bundle = makeBundle([
      makeReport('r1', ['Alpha', 'Beta'], 'Pan target matn'),
    ]);
    const { container } = render(<App />);

    await importJson(container, bundleToJson(bundle));
    await waitFor(() => {
      expect(container.querySelector('[data-node-id="m:r1"]')).not.toBeNull();
    });

    fireEvent.pointerDown(getGraphNode(container, 'm:r1'), {
      button: 0,
      clientX: 300,
      clientY: 250,
    });

    const graphScroll = container.querySelector('.graph-scroll');
    if (!(graphScroll instanceof HTMLDivElement)) {
      throw new Error('Graph scroll container not found.');
    }

    fireEvent.pointerDown(graphScroll, {
      button: 2,
      clientX: 100,
      clientY: 100,
    });

    expect(container.querySelectorAll('.report-card.selected')).toHaveLength(1);
    expect(getGraphNode(container, 'm:r1')).toHaveClass('selected');
    expect(getGraphEdge(container, 'n:Alpha->c:r1')).toHaveClass('selected');
  });

  it('drags a narrator node, snaps it to nearby anchors, and exports the updated layout', async () => {
    const bundle = makeBundle(
      [
        makeReport('r1', ['Alpha', 'Beta'], 'First matn'),
        makeReport('r2', ['Gamma', 'Delta'], 'Second matn'),
      ],
      {
        nodePositions: {
          'n:Alpha': { x: 100, y: 100 },
          'c:r1': { x: 220, y: 100 },
          'n:Gamma': { x: 300, y: 200 },
          'c:r2': { x: 420, y: 200 },
        },
      },
    );

    const { container } = render(<App />);

    await importJson(container, bundleToJson(bundle));
    await waitFor(() => {
      expect(container.querySelector('[data-node-id="n:Alpha"]')).not.toBeNull();
    });

    const initialPosition = parseTranslate(getGraphNode(container, 'n:Alpha').getAttribute('transform'));

    fireEvent.pointerDown(getGraphNode(container, 'n:Alpha'), {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      clientX: 250,
      clientY: 180,
    });
    fireEvent.pointerMove(window, {
      clientX: 260,
      clientY: 188,
    });
    fireEvent.pointerUp(window, {
      clientX: 260,
      clientY: 188,
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('aligned them to nearby anchor lines');
    });

    const finalPosition = parseTranslate(getGraphNode(container, 'n:Alpha').getAttribute('transform'));
    const otherAnchorPositionsAfterDrag = Array.from(container.querySelectorAll('[data-node-id]'))
      .filter((node) => node.getAttribute('data-node-id') !== 'n:Alpha')
      .map((node) => parseTranslate(node.getAttribute('transform')));

    expect(finalPosition).not.toEqual(initialPosition);
    expect(otherAnchorPositionsAfterDrag.map((position) => position.y)).toContain(finalPosition.y);

    let exportedBlob: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value: Blob | MediaSource) => {
      if (value instanceof Blob) {
        exportedBlob = value;
      }
      return 'blob:export';
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

    expect(exportedBlob).not.toBeNull();
    const exportedJson = JSON.parse(await exportedBlob!.text());
    const exportedGraph = buildRenderableGraph(
      exportedJson.reports,
      exportedJson.nodePositions,
      exportedJson.nodeWidths,
      exportedJson.fontSizes,
      exportedJson.highlightLegend,
    );
    const exportedAlpha = exportedGraph.nodes.find((node) => node.id === 'n:Alpha');
    expect(exportedAlpha).toMatchObject(finalPosition);
  });
});
