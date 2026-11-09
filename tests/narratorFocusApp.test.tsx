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

function reportButton(number: number): HTMLElement {
  return within(screen.getByRole('table')).getByRole('button', { name: `Select report #${number}` });
}

function expectSelectedReport(number: number): void {
  expect(screen.getByRole('heading', { name: `Edit Report #${number}` })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('The report statement')).toHaveValue(reports[number - 1].matn);
}

describe('narrator focus views', () => {
  it('shows source/student report pairings across authorities and switches to complete chains without renumbering', async () => {
    const user = userEvent.setup();
    const { container } = await renderReports();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Shared narrator');

    expect(screen.getByRole('button', { name: 'Sources & students', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Source A')).toBeInTheDocument();
    expect(within(table).getByText('Source B')).toBeInTheDocument();
    expect(within(table).getByText('Student A')).toBeInTheDocument();
    expect(within(table).getByText('Student B')).toBeInTheDocument();
    expect(within(table).getAllByRole('button')).toHaveLength(2);
    expect(within(table).queryByRole('button', { name: 'Select report #2' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('.graph-svg [data-node-type="matn"]')).toHaveLength(0);
    expect(container.querySelectorAll('.graph-svg [data-node-id]')).toHaveLength(5);

    const sourceARow = within(table).getByText('Source A').closest('tr')!;
    const sourceBRow = within(table).getByText('Source B').closest('tr')!;
    expect(within(sourceARow).getByRole('button', { name: 'Select report #1' })).toBeInTheDocument();
    expect(within(sourceARow).queryByRole('button', { name: 'Select report #3' })).not.toBeInTheDocument();
    expect(within(sourceBRow).getByRole('button', { name: 'Select report #3' })).toBeInTheDocument();
    expect(within(sourceBRow).queryByRole('button', { name: 'Select report #1' })).not.toBeInTheDocument();

    await user.click(reportButton(3));
    expectSelectedReport(3);
    const wording = screen.getByRole('region', { name: 'Report #3 details' });
    expect(within(wording).getByText('Third wording.')).toBeInTheDocument();
    expect(within(wording).getByText('Third source note.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));

    expectSelectedReport(3);
    expect(container.querySelectorAll('.graph-svg [data-node-type="matn"]')).toHaveLength(2);
    expect(container.querySelector('[data-node-id="m:outside"]')).not.toBeInTheDocument();
    expect(getGraphNode(container, 'm:first')).toHaveTextContent('Report #1');
    expect(getGraphNode(container, 'm:third')).toHaveTextContent('Report #3');
    for (const report of [reports[0], reports[2]]) {
      for (const nodeId of getNodeIdsForReport(report)) expect(getGraphNode(container, nodeId)).toBeInTheDocument();
      for (const edgeId of getEdgeIdsForReport(report)) expect(getGraphEdge(container, edgeId)).toBeInTheDocument();
    }
    for (const nodeId of getNodeIdsForReport(reports[2])) expect(getGraphNode(container, nodeId)).toHaveClass('selected');

    await user.click(screen.getByRole('button', { name: 'Sources & students', exact: true }));
    expectSelectedReport(3);
    expect(reportButton(3)).toHaveAttribute('aria-pressed', 'true');
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
    expect(screen.getByRole('table', { name: 'Sources and students of Shared narrator' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(nodeTransforms(container)).toEqual(originalPositions);
    expect(narrator).toHaveValue('');
    await user.type(screen.getByRole('searchbox', { name: 'Search narrators' }), 'source b');
    expect(within(narrator).getByRole('option', { name: 'Source B (1)' })).toBeInTheDocument();
    expect(within(narrator).queryByRole('option', { name: 'Source A (1)' })).not.toBeInTheDocument();
    await user.selectOptions(narrator, 'Source B');
    expect(screen.getByRole('table', { name: 'Sources and students of Source B' })).toBeInTheDocument();
    await user.click(reportButton(3));
    expectSelectedReport(3);

    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(nodeTransforms(container)).toEqual(originalPositions);
    expectSelectedReport(3);
    expect(getGraphNode(container, 'm:third')).toHaveClass('selected');
  });

  it('honors unsaved edits when a different narrator would exclude the selected report', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderReports();
    const narrator = screen.getByRole('combobox', { name: 'Focus narrator' });
    await user.selectOptions(narrator, 'Shared narrator');
    await user.click(reportButton(3));
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
    expect(reportButton(3)).toHaveAttribute('aria-pressed', 'true');

    confirm.mockReturnValue(true);
    await user.selectOptions(narrator, 'Outside authority');
    expect(narrator).toHaveValue('Outside authority');
    expect(screen.queryByRole('heading', { name: 'Edit Report #3' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(1);
    await user.click(reportButton(2));
    expectSelectedReport(2);
  });
});
