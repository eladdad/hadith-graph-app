import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { bundleToJson } from '../src/bundle';
import type { HadithBundle } from '../src/types';
import { getGraphEdge, getGraphNode, importJson, makeBundle, makeReport } from './helpers';

const reports = [
  makeReport('indirect-a', ['Authority A', 'Teacher A', 'Focus', 'Student A', 'Collector A'], 'Through teacher A.'),
  makeReport('indirect-b', ['Authority B', 'Teacher B', 'Focus', 'Student B', 'Collector B'], 'Through teacher B.'),
  makeReport('direct-a', ['Focus', 'Student A', 'Collector C'], 'Attributed to the focused narrator.'),
  makeReport('indirect-c', ['Authority C', 'Teacher C', 'Focus', 'Student C', 'Collector D'], 'Through teacher C.'),
  makeReport('outside', ['Teacher B', 'Another student', 'Collector E'], 'Outside this narrator focus.'),
];

afterEach(() => vi.restoreAllMocks());

async function renderReports() {
  const bundle = makeBundle(reports);
  const result = render(<App />);
  await importJson(result.container, bundleToJson(bundle));
  await waitFor(() => expect(result.container.querySelector('[data-node-id="m:outside"]')).not.toBeNull());
  return { ...result, bundle };
}

function selectedNodes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.node-group.selected'))
    .map((node) => node.getAttribute('data-node-id')!).sort();
}

function selectedEdges(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('path.graph-edge.selected'))
    .map((edge) => edge.getAttribute('data-edge-id')!).sort();
}

function attributionBadge(container: HTMLElement): Element {
  const badge = getGraphNode(container, 'focus:center:Focus').querySelector('.authority-report-links .report-count-badge');
  if (!badge) throw new Error('The focused narrator attribution badge is missing.');
  return badge;
}

async function selectReport(user: ReturnType<typeof userEvent.setup>, container: HTMLElement, source: string, number: number) {
  const scope = container.querySelector(`g[data-edge-id="focus:source:${source}->focus:center:Focus"]`);
  if (!scope) throw new Error(`Missing edge for ${source}`);
  await user.click(within(scope as HTMLElement).getByRole('button'));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: `Select report #${number}` }));
}

function nodeY(container: HTMLElement, id: string): number {
  const transform = getGraphNode(container, id).getAttribute('transform');
  const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) throw new Error(`Invalid node position ${id}`);
  return Number(match[2]);
}

function options(select: HTMLElement): Array<{ name: string; count: number }> {
  return Array.from((select as HTMLSelectElement).options)
    .filter((option) => option.value)
    .map((option) => ({ name: option.value, count: Number(option.textContent?.match(/\((\d+)\)$/)?.[1]) }));
}

describe('student source highlighting and graph options', () => {
  it('highlights only a clicked student’s actual sources, including an attribution ending at the focus', async () => {
    const user = userEvent.setup();
    const { container } = await renderReports();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Focus');

    await user.click(getGraphNode(container, 'focus:student:Student A'));
    expect(selectedNodes(container)).toEqual(['focus:center:Focus', 'focus:source:Teacher A', 'focus:student:Student A']);
    expect(selectedEdges(container)).toEqual([
      'focus:center:Focus->focus:student:Student A',
      'focus:source:Teacher A->focus:center:Focus',
    ]);
    expect(attributionBadge(container)).toHaveAttribute('data-report-count', '1');
    expect(attributionBadge(container)).toHaveClass('selected');
    expect(screen.queryByRole('heading', { name: /Edit Report/ })).not.toBeInTheDocument();

    await user.click(getGraphNode(container, 'focus:student:Student B'));
    expect(selectedNodes(container)).toEqual(['focus:center:Focus', 'focus:source:Teacher B', 'focus:student:Student B']);
    expect(selectedEdges(container)).toEqual([
      'focus:center:Focus->focus:student:Student B',
      'focus:source:Teacher B->focus:center:Focus',
    ]);
    expect(attributionBadge(container)).not.toHaveClass('selected');
    expect(getGraphEdge(container, 'focus:source:Teacher A->focus:center:Focus')).not.toHaveClass('selected');
    expect(getGraphNode(container, 'focus:source:Teacher C')).not.toHaveClass('selected');

    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Sources & students', exact: true }));
    expect(selectedNodes(container)).toEqual([]);
    expect(selectedEdges(container)).toEqual([]);
  });

  it('keeps student highlighting separate from an unsaved report and switches back to exact report selection', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = await renderReports();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Focus');
    await selectReport(user, container, 'Teacher B', 2);
    await user.type(screen.getByPlaceholderText('The report statement'), ' Unsaved draft.');

    await user.click(getGraphNode(container, 'focus:student:Student A'));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Edit Report #2' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('Through teacher B. Unsaved draft.');
    expect(getGraphNode(container, 'focus:source:Teacher A')).toHaveClass('selected');
    expect(getGraphNode(container, 'focus:source:Teacher B')).not.toHaveClass('selected');
    expect(container.querySelector('g[data-edge-id="focus:source:Teacher B->focus:center:Focus"] .report-count-badge'))
      .not.toHaveClass('selected');
    expect(attributionBadge(container)).toHaveClass('selected');

    // Returning from the student comparison to the already edited report must
    // restore that report's highlight without replacing its unsaved wording.
    await selectReport(user, container, 'Teacher B', 2);
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Edit Report #2' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('Through teacher B. Unsaved draft.');
    expect(getGraphNode(container, 'focus:source:Teacher B')).toHaveClass('selected');
    expect(getGraphNode(container, 'focus:source:Teacher A')).not.toHaveClass('selected');
    expect(attributionBadge(container)).not.toHaveClass('selected');

    await user.click(getGraphNode(container, 'focus:student:Student A'));
    expect(confirm).not.toHaveBeenCalled();
    expect(attributionBadge(container)).toHaveClass('selected');

    confirm.mockReturnValue(false);
    await selectReport(user, container, 'Teacher A', 1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Edit Report #2' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('Through teacher B. Unsaved draft.');
    expect(getGraphNode(container, 'focus:source:Teacher A')).toHaveClass('selected');
    expect(getGraphNode(container, 'focus:source:Teacher B')).not.toHaveClass('selected');
    expect(attributionBadge(container)).toHaveClass('selected');

    confirm.mockReturnValue(true);
    await selectReport(user, container, 'Teacher A', 1);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledWith('Discard unsaved report changes?');
    expect(screen.getByRole('heading', { name: 'Edit Report #1' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('Through teacher A.');
    expect(attributionBadge(container)).not.toHaveClass('selected');
    expect(selectedEdges(container)).toEqual([
      'focus:center:Focus->focus:student:Student A',
      'focus:source:Teacher A->focus:center:Focus',
    ]);
  });

  it('adjusts level spacing in every view and preserves the setting with the complete bundle on export and import', async () => {
    const user = userEvent.setup();
    const { container, bundle } = await renderReports();
    await user.click(screen.getByRole('button', { name: /Options/ }));
    const spacing = screen.getByRole('slider', { name: 'Vertical spacing' });
    expect(spacing).toHaveValue('180');
    const globalGap = () => nodeY(container, 'n:Teacher A') - nodeY(container, 'n:Authority A');
    const initialGlobalGap = globalGap();
    fireEvent.change(spacing, { target: { value: '300' } });
    expect(globalGap()).toBeGreaterThan(initialGlobalGap);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Focus');
    const localGap = () => nodeY(container, 'focus:center:Focus') - nodeY(container, 'focus:source:Teacher A');
    const widerLocalGap = localGap();
    fireEvent.change(spacing, { target: { value: '100' } });
    expect(localGap()).toBeLessThan(widerLocalGap);

    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    const narrowCompleteGap = globalGap();
    fireEvent.change(spacing, { target: { value: '260' } });
    expect(globalGap()).toBeGreaterThan(narrowCompleteGap);

    let exportedBlob: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value: Blob | MediaSource) => {
      if (value instanceof Blob) exportedBlob = value;
      return 'blob:student-spacing-export';
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: 'Export JSON', exact: true }));
    expect(exportedBlob).not.toBeNull();
    const exported = JSON.parse(await exportedBlob!.text()) as HadithBundle;
    expect(exported.verticalSpacing).toBe(260);
    expect(exported.reports).toEqual(bundle.reports);
    expect(exported.nodePositions).toEqual(bundle.nodePositions);
    await importJson(container, JSON.stringify(exported));
    await waitFor(() => expect(container.querySelectorAll('[data-node-type="matn"]')).toHaveLength(5));
    expect(screen.getByRole('slider', { name: 'Vertical spacing' })).toHaveValue('260');
  });

  it('orders narrator choices by descending report count and preserves that order when searching', async () => {
    const user = userEvent.setup();
    await renderReports();
    const selector = screen.getByRole('combobox', { name: 'Focus narrator' });
    const all = options(selector);
    expect(all.slice(0, 3).map((option) => option.name)).toEqual(['Focus', 'Student A', 'Teacher B']);
    for (let index = 1; index < all.length; index += 1) {
      expect(all[index - 1].count).toBeGreaterThanOrEqual(all[index].count);
    }
    await user.type(screen.getByRole('searchbox', { name: 'Search narrators' }), 'Teacher');
    expect(options(selector)).toEqual([
      { name: 'Teacher B', count: 2 },
      { name: 'Teacher A', count: 1 },
      { name: 'Teacher C', count: 1 },
    ]);
  });
});
