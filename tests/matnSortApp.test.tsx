import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { bundleToJson, getEdgeIdsForReport, getNodeIdsForReport } from '../src/bundle';
import { orderMatnsBySimilarity } from '../src/matnSimilarity';
import type { GraphRepresentation, HadithBundle } from '../src/types';
import { getGraphNode, importJson, makeBundle, makeReport } from './helpers';

const legend = [
  { id: 'mercy', label: 'Mercy', color: '#f59e0b' },
  { id: 'justice', label: 'Justice', color: '#10b981' },
];

const reports = [
  { ...makeReport('a', ['Root', 'Left', 'Shared', 'Collector A'], 'Mercy in the first wording.'),
    matnHighlights: [{ id: 'h-a', legendId: 'mercy', start: 0, end: 5 }] },
  { ...makeReport('b', ['Root', 'Right', 'Shared', 'Collector B'], 'Justice in a separate wording.'),
    matnHighlights: [{ id: 'h-b', legendId: 'justice', start: 0, end: 7 }] },
  { ...makeReport('c', ['Root', 'Left', 'Shared', 'Collector C'], 'Mercy in the third wording.'),
    matnHighlights: [{ id: 'h-c', legendId: 'mercy', start: 0, end: 5 }] },
  makeReport('plain', ['Root', 'Left', 'Shared', 'Collector D'], 'A wording without highlights.'),
  { ...makeReport('outside', ['Other authority', 'Other collector'], 'Justice outside this focus.'),
    matnHighlights: [{ id: 'h-outside', legendId: 'justice', start: 0, end: 7 }] },
];

function pinnedBundle(): HadithBundle {
  return makeBundle(reports, {
    highlightLegend: legend,
    nodePositions: {
      'n:Shared': { x: 1800, y: 600 },
      'm:a': { x: 2400, y: 1200 }, 'm:b': { x: 1600, y: 1200 },
      'm:c': { x: 800, y: 1200 }, 'm:plain': { x: 250, y: 1200 },
      'm:outside': { x: 3200, y: 1200 },
    },
    trieNodePositions: {
      'm:a': { x: 1500, y: 1400 }, 'm:b': { x: 2500, y: 1400 },
      'm:c': { x: 1000, y: 1400 }, 'm:plain': { x: 3500, y: 1400 },
      'm:outside': { x: 500, y: 1400 },
    },
    nodeWidths: { 'm:a': 440, 'm:c': 260 },
  });
}

afterEach(() => vi.restoreAllMocks());

function sortMenu(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Matn order' });
}

function transforms(container: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(Array.from(container.querySelectorAll('.graph-svg [data-node-id]'))
    .map((node) => [node.getAttribute('data-node-id')!, node.getAttribute('transform')]));
}

function position(container: HTMLElement, id: string): number[] {
  const transform = getGraphNode(container, id).getAttribute('transform');
  const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) throw new Error(`No position for ${id}`);
  return [Number(match[1]), Number(match[2])];
}

function matnOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<SVGGElement>('.graph-svg [data-node-type="matn"]'))
    .sort((left, right) => position(container, left.dataset.nodeId!)[0] - position(container, right.dataset.nodeId!)[0])
    .map((node) => node.dataset.nodeId!.slice(2));
}

function selectMatn(container: HTMLElement, id: string): void {
  fireEvent.pointerDown(getGraphNode(container, 'm:' + id), { button: 0, clientX: 100, clientY: 100 });
}

function drag(container: HTMLElement, id: string): void {
  fireEvent.pointerDown(getGraphNode(container, id), { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(window, { clientX: 200, clientY: 180 });
  fireEvent.pointerMove(window, { clientX: 260, clientY: 230 });
  fireEvent.pointerUp(window, { clientX: 260, clientY: 230 });
}

function captureExports(): Blob[] {
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((value: Blob | MediaSource) => {
    if (value instanceof Blob) blobs.push(value);
    return 'blob:matn-sort-export';
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return blobs;
}

async function exported(user: ReturnType<typeof userEvent.setup>, blobs: Blob[]): Promise<HadithBundle> {
  if (!screen.queryByRole('button', { name: 'Export JSON' })) {
    await user.click(screen.getByRole('button', { name: /Options/ }));
  }
  const previousCount = blobs.length;
  await user.click(screen.getByRole('button', { name: 'Export JSON' }));
  expect(blobs).toHaveLength(previousCount + 1);
  return JSON.parse(await blobs.at(-1)!.text()) as HadithBundle;
}

async function renderBundle(bundle = pinnedBundle()) {
  const result = render(<App />);
  await importJson(result.container, bundleToJson(bundle));
  await waitFor(() => expect(result.container.querySelector('[data-node-id="m:a"]')).not.toBeNull());
  return { ...result, bundle };
}

describe('graph matn ordering', () => {
  it.each<GraphRepresentation>(['merged', 'trie'])('matches Matns similarity order in %s while preserving drafts, numbering, exports, and the default layout', async (representation) => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const blobs = captureExports();
    const { container, bundle } = await renderBundle();
    if (representation === 'trie') await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    const original = transforms(container);
    const originalOrder = matnOrder(container);
    expect(sortMenu()).toHaveValue('default');
    expect(within(sortMenu()).getByRole('option', { name: 'Default', exact: true })).toBeInTheDocument();
    expect(within(sortMenu()).getByRole('option', { name: 'By elements/highlights' })).toBeInTheDocument();
    selectMatn(container, 'b');
    await user.type(screen.getByPlaceholderText('The report statement'), ' Unsaved detail.');

    await user.selectOptions(sortMenu(), 'highlights');
    const expected = orderMatnsBySimilarity(bundle.reports, bundle.highlightLegend).map((report) => report.id);
    expect(matnOrder(container)).toEqual(expected);
    expect(matnOrder(container)).not.toEqual(originalOrder);
    expect(screen.getByRole('heading', { name: 'Edit Report #2' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue(`${reports[1].matn} Unsaved detail.`);
    expect(Array.from(container.querySelectorAll('.node-group.selected')).map((node) => node.getAttribute('data-node-id')).sort())
      .toEqual(getNodeIdsForReport(reports[1], representation).sort());
    expect(Array.from(container.querySelectorAll('path.graph-edge.selected')).map((edge) => edge.getAttribute('data-edge-id')).sort())
      .toEqual(getEdgeIdsForReport(reports[1], representation).sort());

    await user.click(screen.getByRole('button', { name: 'Matns', exact: true }));
    expect(Array.from(screen.getByRole('region', { name: 'Matns and highlights' }).querySelectorAll('.matn-reading-card'))
      .map((card) => card.getAttribute('data-report-id'))).toEqual(expected);
    await user.click(screen.getByRole('button', { name: 'Transmission graph', exact: true }));
    expect(sortMenu()).toHaveValue('highlights');
    const saved = await exported(user, blobs);
    for (const key of ['reports', 'highlightLegend', 'nodePositions', 'trieNodePositions', 'nodeWidths'] as const) {
      expect(saved[key]).toEqual(bundle[key]);
    }
    await user.selectOptions(sortMenu(), 'default');
    expect(transforms(container)).toEqual(original);
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue(`${reports[1].matn} Unsaved detail.`);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('isolates dragging and automatic-layout restoration by sort, representation, and narrator focus', async () => {
    const user = userEvent.setup();
    const blobs = captureExports();
    const { container, bundle } = await renderBundle();
    const defaultLayout = transforms(container);
    await user.selectOptions(sortMenu(), 'highlights');
    const automatic = transforms(container);
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    drag(container, 'n:Shared');
    const manual = transforms(container);
    expect(manual).not.toEqual(automatic);
    await user.click(screen.getByRole('button', { name: 'Auto-arrange' }));
    expect(transforms(container)).toEqual(automatic);
    await user.selectOptions(sortMenu(), 'default');
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
    expect(transforms(container)).toEqual(defaultLayout);
    await user.selectOptions(sortMenu(), 'highlights');
    await user.click(screen.getByRole('button', { name: 'Restore saved layout' }));
    expect(transforms(container)).toEqual(manual);

    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Merged', exact: true }));
    expect(transforms(container)).toEqual(manual);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Shared');
    expect(screen.queryByRole('combobox', { name: 'Matn order' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    expect(sortMenu()).toHaveValue('highlights');
    expect(matnOrder(container)).toEqual(orderMatnsBySimilarity(reports.slice(0, 4), legend).map((report) => report.id));
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    drag(container, 'n:Shared');
    const focusManual = transforms(container);
    await user.selectOptions(sortMenu(), 'default');
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    await user.selectOptions(sortMenu(), 'highlights');
    expect(transforms(container)).toEqual(focusManual);
    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(transforms(container)).toEqual(manual);
    const saved = await exported(user, blobs);
    expect(saved.nodePositions).toEqual(bundle.nodePositions);
    expect(saved.trieNodePositions).toEqual(bundle.trieNodePositions);
  });

  it('recomputes highlight ordering after saved annotation edits and drops manual sort pins', async () => {
    const user = userEvent.setup();
    const { container, bundle } = await renderBundle();
    await user.selectOptions(sortMenu(), 'highlights');
    drag(container, 'n:Shared');
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeEnabled();
    selectMatn(container, 'a');
    const chips = screen.getByRole('complementary').querySelector('.highlight-chip-list')!;
    await user.click(within(chips as HTMLElement).getByRole('button', { name: 'Remove' }));
    const beforeSave = matnOrder(container);
    expect(beforeSave[0]).toBe('a');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const changedReports = bundle.reports.map((report) => report.id === 'a' ? { ...report, matnHighlights: [] } : report);
    expect(matnOrder(container)).toEqual(orderMatnsBySimilarity(changedReports, legend).map((report) => report.id));
    expect(matnOrder(container)).not.toEqual(beforeSave);
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Edit Report #1' })).toBeInTheDocument();
  });

  it('shares resized matn widths without overwriting default merged or trie positions', async () => {
    const user = userEvent.setup();
    const blobs = captureExports();
    const { container, bundle } = await renderBundle();
    await user.selectOptions(sortMenu(), 'highlights');
    selectMatn(container, 'a');
    const matn = getGraphNode(container, 'm:a');
    const [x, y] = position(container, 'm:a');
    fireEvent.pointerDown(matn.querySelector('.resize-handle-right')!, { button: 0, clientX: x + 220, clientY: y });
    expect(sortMenu()).toBeDisabled();
    fireEvent.pointerMove(window, { clientX: x + 340, clientY: y });
    fireEvent.pointerUp(window);
    const saved = await exported(user, blobs);
    expect(saved.nodeWidths['m:a']).toBe(560);
    expect(saved.nodePositions).toEqual(bundle.nodePositions);
    expect(saved.trieNodePositions).toEqual(bundle.trieNodePositions);
    await user.selectOptions(sortMenu(), 'default');
    expect(getGraphNode(container, 'm:a').querySelector('.node-matn-hitbox')).toHaveAttribute('width', '560');
  });

  it('clears highlight-view positions when another bundle is imported, including reused report IDs', async () => {
    const user = userEvent.setup();
    const { container, bundle } = await renderBundle();
    await user.selectOptions(sortMenu(), 'highlights');
    const automatic = transforms(container);
    drag(container, 'n:Shared');
    expect(transforms(container)).not.toEqual(automatic);
    await importJson(container, bundleToJson({ ...bundle, title: 'Replacement bundle' }));
    await waitFor(() => expect(screen.getByText('Bundle: Replacement bundle')).toBeInTheDocument());
    expect(sortMenu()).toHaveValue('highlights');
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    expect(transforms(container)).toEqual(automatic);
  });
});
