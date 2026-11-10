import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { bundleToJson } from '../src/bundle';
import type { HadithBundle } from '../src/types';
import { importJson, makeBundle, makeReport } from './helpers';

const reports = [
  {
    ...makeReport('first', ['Authority', 'Collector A'], 'Mercy in the first complete wording.'),
    matnHighlights: [{ id: 'first-highlight', legendId: 'mercy', start: 0, end: 5 }],
  },
  {
    ...makeReport('second', ['Authority', 'Collector B'], 'Justice in a separate complete wording.'),
    matnHighlights: [{ id: 'second-highlight', legendId: 'justice', start: 0, end: 7 }],
  },
  {
    ...makeReport('third', ['Authority', 'Collector C'], 'Mercy in the third complete wording.'),
    matnHighlights: [{ id: 'third-highlight', legendId: 'mercy', start: 0, end: 5 }],
  },
  makeReport('plain', ['Authority', 'Collector D'], 'نص كامل بلا تمييز لوني.'),
];

const highlightLegend = [
  { id: 'mercy', label: 'Mercy', color: '#f59e0b' },
  { id: 'justice', label: 'Justice', color: '#10b981' },
];

afterEach(() => vi.restoreAllMocks());

async function renderBundle(overrides: Partial<HadithBundle> = {}) {
  const bundle = makeBundle(reports, { highlightLegend, ...overrides });
  const result = render(<App />);
  await importJson(result.container, bundleToJson(bundle));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`with ${bundle.reports.length} report(s).`));
  return { ...result, bundle };
}

function matnView(): HTMLElement {
  return screen.getByRole('region', { name: 'Matns and highlights' });
}

function card(id: string): HTMLElement {
  const element = matnView().querySelector<HTMLElement>(`[data-report-id="${id}"]`);
  if (!element) throw new Error(`Matn card ${id} was not found.`);
  return element;
}

function readingOrder(): (string | null)[] {
  return Array.from(matnView().querySelectorAll('.matn-reading-card')).map((element) => element.getAttribute('data-report-id'));
}

function nodePositions(container: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(Array.from(container.querySelectorAll('.graph-svg [data-node-id]')).map((node) => [
    node.getAttribute('data-node-id')!, node.getAttribute('transform'),
  ]));
}

describe('matn reading view', () => {
  it('shows complete wordings and their highlights together while preserving original report numbers', async () => {
    const user = userEvent.setup();
    await renderBundle({ fontSizes: { matn: 18, narrator: 13 } });
    await user.click(screen.getByRole('button', { name: 'Matns', exact: true }));

    expect(screen.getByRole('button', { name: 'Matns', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(readingOrder()).toEqual(['first', 'third', 'second', 'plain']);
    reports.forEach((report, index) => {
      expect(card(report.id).querySelector('.matn-reading-text')?.textContent).toBe(report.matn);
      expect(card(report.id).querySelector('.matn-reading-text')).toHaveStyle({ fontSize: '18px' });
      expect(within(card(report.id)).getByRole('button', { name: `Edit report #${index + 1}` })).toBeInTheDocument();
    });
    expect(within(card('first')).getByTitle('Mercy')).toHaveTextContent('Mercy');
    expect(within(card('first')).getByTitle('Mercy')).toHaveStyle({ color: '#f59e0b' });
    expect(within(card('second')).getByTitle('Justice')).toHaveTextContent('Justice');
    expect(within(card('plain')).getByText('No highlights')).toBeInTheDocument();
    expect(card('plain').querySelector('.matn-reading-text')).toHaveAttribute('dir', 'auto');
    expect(within(matnView()).getByRole('list', { name: 'Matn highlight legend' })).toHaveTextContent('MercyJustice');
    expect(screen.queryByRole('region', { name: 'Transmission graph' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Focus narrator' })).not.toBeInTheDocument();
  });

  it('supports bundle order and returns to the same graph layout without changing exported data', async () => {
    const user = userEvent.setup();
    const { container, bundle } = await renderBundle({
      nodePositions: { 'n:Authority': { x: 250, y: 120 }, 'm:first': { x: 900, y: 650 } },
      trieNodePositions: { 'm:first': { x: 1000, y: 750 } },
      nodeWidths: { 'm:first': 540 },
    });
    const graph = screen.getByRole('region', { name: 'Transmission graph' });
    const originalPositions = nodePositions(container);
    const scroll = container.querySelector('.graph-scroll') as HTMLElement;
    scroll.scrollLeft = 230;
    scroll.scrollTop = 170;

    await user.click(screen.getByRole('button', { name: 'Matns', exact: true }));
    expect(graph).not.toBeVisible();
    await user.selectOptions(within(matnView()).getByRole('combobox', { name: 'Order by' }), 'bundle');
    expect(readingOrder()).toEqual(['first', 'second', 'third', 'plain']);
    await user.selectOptions(within(matnView()).getByRole('combobox', { name: 'Order by' }), 'similarity');
    expect(readingOrder()).toEqual(['first', 'third', 'second', 'plain']);

    let exportedBlob: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value: Blob | MediaSource) => {
      if (value instanceof Blob) exportedBlob = value;
      return 'blob:matn-view-export';
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: /Options/ }));
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(exportedBlob).not.toBeNull();
    const exported = JSON.parse(await exportedBlob!.text()) as HadithBundle;
    expect(exported.reports).toEqual(bundle.reports);
    expect(exported.highlightLegend).toEqual(bundle.highlightLegend);
    expect(exported.nodePositions).toEqual(bundle.nodePositions);
    expect(exported.trieNodePositions).toEqual(bundle.trieNodePositions);
    expect(exported.nodeWidths).toEqual(bundle.nodeWidths);

    await user.click(screen.getByRole('button', { name: 'Transmission graph', exact: true }));
    expect(screen.getByRole('region', { name: 'Transmission graph' })).toBe(graph);
    expect(graph).toBeVisible();
    expect(nodePositions(container)).toEqual(originalPositions);
    expect(scroll.scrollLeft).toBe(230);
    expect(scroll.scrollTop).toBe(170);
    expect(screen.queryByRole('region', { name: 'Matns and highlights' })).not.toBeInTheDocument();
  });

  it('opens the editor from report numbers and honors unsaved edits when selecting another report', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderBundle();
    await user.click(screen.getByRole('button', { name: 'Matns', exact: true }));
    await user.click(within(matnView()).getByRole('button', { name: 'Hide Sidebar' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await user.click(within(card('third')).getByRole('button', { name: 'Edit report #3' }));

    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit Report #3' })).toBeInTheDocument();
    expect(within(card('third')).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByPlaceholderText('The report statement'), ' Unsaved detail.');
    await user.click(screen.getByRole('button', { name: 'Transmission graph', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Matns', exact: true }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue(`${reports[2].matn} Unsaved detail.`);

    await user.click(within(card('second')).getByRole('button', { name: 'Edit report #2' }));
    expect(confirm).toHaveBeenCalledWith('Discard unsaved report changes?');
    expect(screen.getByRole('heading', { name: 'Edit Report #3' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue(`${reports[2].matn} Unsaved detail.`);
    expect(within(card('third')).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(within(card('second')).getByRole('button')).toHaveAttribute('aria-pressed', 'false');

    confirm.mockReturnValue(true);
    await user.click(within(card('second')).getByRole('button', { name: 'Edit report #2' }));
    expect(screen.getByRole('heading', { name: 'Edit Report #2' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue(reports[1].matn);
  });

  it('updates the complete wording, highlights, and similarity order after saving edits', async () => {
    const user = userEvent.setup();
    await renderBundle();
    await user.click(screen.getByRole('button', { name: 'Matns', exact: true }));
    await user.click(within(card('first')).getByRole('button', { name: 'Edit report #1' }));
    const chipList = screen.getByRole('complementary').querySelector('.highlight-chip-list');
    if (!chipList) throw new Error('Expected a saved highlight in the report editor.');
    await user.click(within(chipList as HTMLElement).getByRole('button', { name: 'Remove' }));
    await user.type(screen.getByPlaceholderText('The report statement'), ' Added detail.');

    // Draft edits must not alter the saved reading view before Save Changes.
    expect(card('first').querySelector('.matn-reading-text')?.textContent).toBe(reports[0].matn);
    expect(within(card('first')).getByTitle('Mercy')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(card('first').querySelector('.matn-reading-text')?.textContent).toBe(`${reports[0].matn} Added detail.`);
    expect(within(card('first')).queryByTitle('Mercy')).not.toBeInTheDocument();
    expect(within(card('first')).getByText('No highlights')).toBeInTheDocument();
    expect(readingOrder()).toEqual(['second', 'third', 'first', 'plain']);
    expect(within(card('first')).getByRole('button', { name: 'Edit report #1' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card('third')).getByTitle('Mercy')).toBeInTheDocument();
  });

  it('shows reports without highlights in original order and explains how to add highlights', async () => {
    const user = userEvent.setup();
    await renderBundle({ reports: reports.map((report) => ({ ...report, matnHighlights: [] })), highlightLegend: [] });
    await user.click(screen.getByRole('button', { name: 'Matns', exact: true }));

    expect(readingOrder()).toEqual(['first', 'second', 'third', 'plain']);
    expect(within(matnView()).getByText('Add highlights in the report editor to compare patterns here.')).toBeInTheDocument();
    expect(within(matnView()).getAllByText('No highlights')).toHaveLength(4);
    expect(within(matnView()).queryByRole('list', { name: 'Matn highlight legend' })).not.toBeInTheDocument();
  });

  it('provides an empty state and updates it when the first report is created', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Matns', exact: true }));
    expect(within(matnView()).getByRole('heading', { name: 'Your matns will appear here' })).toBeInTheDocument();
    expect(within(matnView()).queryByRole('list', { name: 'Matns' })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Narrator 1'), 'Single authority');
    await user.type(screen.getByPlaceholderText('The report statement'), 'The first complete wording.');
    await user.click(screen.getByRole('button', { name: 'Add Report' }));

    expect(within(matnView()).queryByRole('heading', { name: 'Your matns will appear here' })).not.toBeInTheDocument();
    expect(within(matnView()).getByText('The first complete wording.')).toBeInTheDocument();
    expect(within(matnView()).getByRole('button', { name: 'Edit report #1' })).toBeInTheDocument();
  });
});
