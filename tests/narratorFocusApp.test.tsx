import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { bundleToJson, getEdgeIdsForReport, getNodeIdsForReport } from '../src/bundle';
import type { HadithBundle } from '../src/types';
import { getGraphEdge, getGraphNode, importJson, makeBundle, makeReport } from './helpers';

const reports = [
  {
    ...makeReport('first', ['Authority A', 'Source A', 'Shared narrator', 'Student A', 'Collector A'], 'First wording.'),
    note: 'First source note.',
  },
  {
    ...makeReport('outside', ['Outside authority', 'Outside student', 'Outside collector'], 'Unrelated wording.'),
    note: 'A report outside the focus.',
  },
  {
    ...makeReport('third', ['Authority B', 'Source B', 'Shared narrator', 'Student B', 'Collector B'], 'Third wording.'),
    note: 'Third source note.',
  },
];

afterEach(() => vi.restoreAllMocks());

async function renderReports(overrides: Partial<HadithBundle> = {}) {
  const bundle = makeBundle(reports, overrides);
  const result = render(<App />);
  await importJson(result.container, bundleToJson(bundle));
  await waitFor(() => expect(result.container.querySelector('[data-node-id="m:third"]')).not.toBeNull());
  return { ...result, bundle };
}

function nodeTransforms(container: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(Array.from(container.querySelectorAll('.graph-svg [data-node-id]'))
    .map((node) => [node.getAttribute('data-node-id')!, node.getAttribute('transform')]));
}

function reportBadge(number: number): HTMLElement {
  const narrator = (screen.getByRole('combobox', { name: 'Focus narrator' }) as HTMLSelectElement).value;
  const route = reports[number - 1].isnad;
  const index = route.indexOf(narrator);
  const id = index > 0 ? `focus:source:${route[index - 1]}->focus:center:${narrator}`
    : `focus:center:${narrator}->focus:student:${route[index + 1]}`;
  const edge = document.querySelector(`g[data-edge-id="${id}"]`);
  if (!edge) throw new Error(`Report edge not found: ${id}`);
  return within(edge as unknown as HTMLElement).getByRole('button');
}

async function selectNumber(user: ReturnType<typeof userEvent.setup>, number: number, scope?: Element): Promise<void> {
  await user.click(scope ? within(scope as HTMLElement).getByRole('button') : reportBadge(number));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: `Select report #${number}` }));
}

async function expectActiveNumber(user: ReturnType<typeof userEvent.setup>, number: number): Promise<void> {
  await user.click(reportBadge(number));
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: `Select report #${number}` }))
    .toHaveAttribute('aria-pressed', 'true');
  await user.keyboard('{Escape}');
}

function edgeNumberScope(container: HTMLElement, source: string, target: string): HTMLElement {
  const scope = container.querySelector(`g[data-edge-id="focus:source:${source}->focus:center:${target}"] .edge-label`);
  if (!scope) throw new Error(`Source edge ${source} → ${target} not found.`);
  return scope as unknown as HTMLElement;
}

function outgoingNumberScope(container: HTMLElement, source: string, target: string): HTMLElement {
  const scope = container.querySelector(`g[data-edge-id="focus:center:${source}->focus:student:${target}"] .edge-label`);
  if (!scope) throw new Error(`Student edge ${source} → ${target} not found.`);
  return scope as unknown as HTMLElement;
}

function nodeY(container: HTMLElement, id: string): number {
  const transform = getGraphNode(container, id).getAttribute('transform');
  const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) throw new Error(`Invalid node position ${id}`);
  return Number(match[2]);
}

function expectSelectedReport(number: number): void {
  expect(screen.getByRole('heading', { name: `Edit Report #${number}` })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('The report statement')).toHaveValue(reports[number - 1].matn);
}

describe('narrator focus views', () => {
  it('keeps a standalone attribution selectable when its focus has no edges', async () => {
    const user = userEvent.setup();
    const standalone = { ...makeReport('standalone', ['Sole authority'], 'Standalone wording.'), note: 'No continuous chain supplied.' };
    const { container } = render(<App />);
    await importJson(container, bundleToJson(makeBundle([reports[1], standalone])));
    await waitFor(() => expect(container.querySelector('[data-node-id="m:standalone"]')).not.toBeNull());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Sole authority');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.graph-svg [data-node-id]')).toHaveLength(1);
    expect(container.querySelectorAll('.graph-svg path.graph-edge')).toHaveLength(0);
    const badge = within(getGraphNode(container, 'focus:center:Sole authority')).getByRole('button');
    expect(badge).toHaveAttribute('data-report-count', '1');
    await user.click(badge);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Select report #2' }));
    expect(screen.getByRole('heading', { name: 'Edit Report #2' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('Standalone wording.');
    const details = screen.getByRole('region', { name: 'Report #2 details' });
    expect(within(details).getByText('Standalone wording.')).toBeInTheDocument();
    expect(within(details).getByText('No continuous chain supplied.')).toBeInTheDocument();
  });
  it('shows clickable report numbers on top-to-bottom source/student edges and switches to complete chains without renumbering', async () => {
    const user = userEvent.setup();
    const { container } = await renderReports();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Shared narrator');

    expect(screen.getByRole('button', { name: 'Sources & students', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.graph-svg [data-node-type="matn"]')).toHaveLength(0);
    expect(container.querySelectorAll('.graph-svg [data-node-id]')).toHaveLength(5);
    const centerY = nodeY(container, 'focus:center:Shared narrator');
    expect(nodeY(container, 'focus:source:Source A')).toBeLessThan(centerY);
    expect(nodeY(container, 'focus:source:Source B')).toBeLessThan(centerY);
    expect(nodeY(container, 'focus:student:Student A')).toBeGreaterThan(centerY);
    expect(nodeY(container, 'focus:student:Student B')).toBeGreaterThan(centerY);

    const sourceA = edgeNumberScope(container, 'Source A', 'Shared narrator');
    const sourceB = edgeNumberScope(container, 'Source B', 'Shared narrator');
    expect(within(sourceA).getByRole('button')).toHaveAttribute('data-report-count', '1');
    expect(within(sourceB).getByRole('button')).toHaveAttribute('data-report-count', '1');
    expect(container.querySelector('.graph-svg .report-number-link')).not.toBeInTheDocument();

    await user.click(within(sourceA).getByRole('button'));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Select report #1' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Select report #3' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Select report #1' }));
    expectSelectedReport(1);
    await selectNumber(user, 3, outgoingNumberScope(container, 'Shared narrator', 'Student B'));
    expectSelectedReport(3);
    const wording = screen.getByRole('region', { name: 'Report #3 details' });
    expect(within(wording).getByText('Third wording.')).toBeInTheDocument();
    expect(within(wording).getByText('Third source note.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));

    expectSelectedReport(3);
    expect(container.querySelectorAll('.graph-svg [data-node-type="matn"]')).toHaveLength(2);
    expect(container.querySelector('[data-node-id="m:outside"]')).not.toBeInTheDocument();
    expect(getGraphNode(container, 'm:first').querySelector('.matn-report-label .report-count-badge'))
      .toHaveAttribute('data-report-count', '1');
    await selectNumber(user, 3, getGraphNode(container, 'm:third').querySelector('.matn-report-label')!);
    expectSelectedReport(3);
    for (const report of [reports[0], reports[2]]) {
      for (const nodeId of getNodeIdsForReport(report)) expect(getGraphNode(container, nodeId)).toBeInTheDocument();
      for (const edgeId of getEdgeIdsForReport(report)) expect(getGraphEdge(container, edgeId)).toBeInTheDocument();
    }
    for (const nodeId of getNodeIdsForReport(reports[2])) expect(getGraphNode(container, nodeId)).toHaveClass('selected');

    await user.click(screen.getByRole('button', { name: 'Sources & students', exact: true }));
    expectSelectedReport(3);
    await expectActiveNumber(user, 3);
  });

  it('keeps the entire bundle and saved layout when exporting or leaving a focused layout', async () => {
    const user = userEvent.setup();
    const { container, bundle } = await renderReports({
      nodePositions: {
        'n:Authority A': { x: 200, y: 100 },
        'n:Shared narrator': { x: 900, y: 600 },
        'c:first': { x: 1000, y: 1200 },
        'n:Outside authority': { x: 1600, y: 100 },
      },
      nodeWidths: { 'm:first': 420 },
    });
    const originalPositions = nodeTransforms(container);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Shared narrator');
    const localNode = container.querySelector('.graph-svg [data-node-id]')!;
    fireEvent.pointerDown(localNode, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 180, clientY: 170 });
    fireEvent.pointerUp(window, { clientX: 180, clientY: 170 });
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    fireEvent.pointerDown(getGraphNode(container, 'n:Shared narrator'), { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 190 });
    fireEvent.pointerMove(window, { clientX: 260, clientY: 230 });
    fireEvent.pointerUp(window, { clientX: 260, clientY: 230 });

    let exportedBlob: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value: Blob | MediaSource) => {
      if (value instanceof Blob) exportedBlob = value;
      return 'blob:focus-export';
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: /Options/ }));
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(exportedBlob).not.toBeNull();
    const exported = JSON.parse(await exportedBlob!.text()) as HadithBundle;
    expect(exported.reports).toEqual(bundle.reports);
    expect(exported.nodePositions).toEqual(bundle.nodePositions);
    expect(exported.nodeWidths).toEqual(bundle.nodeWidths);

    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(container.querySelectorAll('.graph-svg [data-node-type="matn"]')).toHaveLength(3);
    expect(nodeTransforms(container)).toEqual(originalPositions);
  });

  it('enters focus by double-click and finds a different narrator through the searchable picker', async () => {
    const user = userEvent.setup();
    const { container } = await renderReports();
    const originalPositions = nodeTransforms(container);
    fireEvent.doubleClick(getGraphNode(container, 'n:Shared narrator'));
    const narrator = screen.getByRole('combobox', { name: 'Focus narrator' });
    expect(narrator).toHaveValue('Shared narrator');
    expect(getGraphNode(container, 'focus:center:Shared narrator')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(nodeTransforms(container)).toEqual(originalPositions);
    expect(narrator).toHaveValue('');
    await user.type(screen.getByRole('searchbox', { name: 'Search narrators' }), 'source b');
    expect(within(narrator).getByRole('option', { name: 'Source B (1)' })).toBeInTheDocument();
    expect(within(narrator).queryByRole('option', { name: 'Source A (1)' })).not.toBeInTheDocument();
    await user.selectOptions(narrator, 'Source B');
    expect(getGraphNode(container, 'focus:center:Source B')).toBeInTheDocument();
    await selectNumber(user, 3);
    expectSelectedReport(3);

    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(nodeTransforms(container)).toEqual(originalPositions);
    expectSelectedReport(3);
    expect(getGraphNode(container, 'm:third')).toHaveClass('selected');
  });

  it('honors unsaved edits when a different narrator would exclude the selected report', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = await renderReports();
    const narrator = screen.getByRole('combobox', { name: 'Focus narrator' });
    await user.selectOptions(narrator, 'Shared narrator');
    await selectNumber(user, 3);
    await user.type(screen.getByPlaceholderText('The report statement'), ' Unsaved text.');

    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('Third wording. Unsaved text.');
    await user.click(screen.getByRole('button', { name: 'Sources & students', exact: true }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('Third wording. Unsaved text.');

    await user.selectOptions(narrator, 'Outside authority');
    expect(confirm).toHaveBeenCalledWith('Discard unsaved report changes?');
    expect(narrator).toHaveValue('Shared narrator');
    expect(screen.getByRole('heading', { name: 'Edit Report #3' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('Third wording. Unsaved text.');
    await expectActiveNumber(user, 3);

    confirm.mockReturnValue(true);
    await user.selectOptions(narrator, 'Outside authority');
    expect(narrator).toHaveValue('Outside authority');
    expect(screen.queryByRole('heading', { name: 'Edit Report #3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.graph-svg .report-count-badge')).toHaveLength(2);
    expect(getGraphNode(container, 'focus:center:Outside authority').querySelector('.authority-report-links .report-count-badge'))
      .toHaveAttribute('data-report-count', '1');
    await selectNumber(user, 2);
    expectSelectedReport(2);
  });
});
