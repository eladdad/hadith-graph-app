import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { bundleToJson, getEdgeIdsForReport, getNodeIdsForReport } from '../src/bundle';
import { getNarratorNodeIdForReport } from '../src/graph';
import type { GraphRepresentation, HadithBundle, HadithReport } from '../src/types';
import { getGraphNode, importJson, makeBundle, makeReport } from './helpers';

const reports = [
  makeReport('a', ['Root', 'Left', 'Shared', 'Collector'], 'First wording.'),
  makeReport('b', ['Root', 'Right', 'Shared', 'Collector'], 'Second wording.'),
  makeReport('c', ['Root', 'Left', 'Shared', 'Collector'], 'Third wording.'),
  makeReport('outside', ['Other authority', 'Other collector'], 'Outside wording.'),
];

afterEach(() => vi.restoreAllMocks());

function transforms(container: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(Array.from(container.querySelectorAll('.graph-svg [data-node-id]'))
    .map((node) => [node.getAttribute('data-node-id')!, node.getAttribute('transform')]));
}

function selectedPath(container: HTMLElement, report: HadithReport, representation: GraphRepresentation): void {
  expect(Array.from(container.querySelectorAll('.node-group.selected'))
    .map((node) => node.getAttribute('data-node-id')).sort()).toEqual(getNodeIdsForReport(report, representation).sort());
  expect(Array.from(container.querySelectorAll('path.graph-edge.selected'))
    .map((edge) => edge.getAttribute('data-edge-id')).sort()).toEqual(getEdgeIdsForReport(report, representation).sort());
}

function selectMatn(container: HTMLElement, id: string): void {
  fireEvent.pointerDown(getGraphNode(container, 'm:' + id), { button: 0, clientX: 100, clientY: 100 });
}

function captureExports(): Blob[] {
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((value: Blob | MediaSource) => {
    if (value instanceof Blob) blobs.push(value);
    return 'blob:trie-export';
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return blobs;
}

async function exported(user: ReturnType<typeof userEvent.setup>, blobs: Blob[]): Promise<HadithBundle> {
  if (!screen.queryByRole('button', { name: 'Export JSON' })) {
    await user.click(screen.getByRole('button', { name: /Options/ }));
  }
  const count = blobs.length;
  await user.click(screen.getByRole('button', { name: 'Export JSON' }));
  expect(blobs).toHaveLength(count + 1);
  return JSON.parse(await blobs.at(-1)!.text()) as HadithBundle;
}

async function renderBundle(bundle = makeBundle(reports)) {
  const result = render(<App />);
  await importJson(result.container, bundleToJson(bundle));
  await waitFor(() => expect(result.container.querySelector('[data-node-id="m:a"]')).not.toBeNull());
  return result;
}

function drag(container: HTMLElement, id: string): void {
  fireEvent.pointerDown(getGraphNode(container, id), { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(window, { clientX: 200, clientY: 180 });
  fireEvent.pointerMove(window, { clientX: 260, clientY: 230 });
  fireEvent.pointerUp(window, { clientX: 260, clientY: 230 });
}

describe('merged and trie views', () => {
  it('preserves imported merged coordinates and the selected report draft while switching paths', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const bundle = makeBundle(reports, { nodePositions: { 'n:Shared': { x: 1800, y: 600 } } });
    const { container } = await renderBundle(bundle);
    const original = transforms(container);
    expect(screen.getByRole('button', { name: 'Merged', exact: true })).toHaveAttribute('aria-pressed', 'true');
    selectMatn(container, 'a');
    selectedPath(container, reports[0], 'merged');
    await user.type(screen.getByPlaceholderText('The report statement'), ' Unsaved draft.');

    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    expect(screen.getByRole('button', { name: 'Trie', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-node-id="n:Shared"]')).not.toBeInTheDocument();
    const left = getNarratorNodeIdForReport(reports[0], 2, 'trie');
    const right = getNarratorNodeIdForReport(reports[1], 2, 'trie');
    expect(left).not.toBe(right);
    expect(getGraphNode(container, left)).toBeInTheDocument();
    expect(getGraphNode(container, right)).toBeInTheDocument();
    expect(getNarratorNodeIdForReport(reports[2], 2, 'trie')).toBe(left);
    selectedPath(container, reports[0], 'trie');
    expect(getGraphNode(container, right)).not.toHaveClass('selected');
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('First wording. Unsaved draft.');
    expect(confirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Merged', exact: true }));
    expect(transforms(container)).toEqual(original);
    selectedPath(container, reports[0], 'merged');
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('First wording. Unsaved draft.');
  });

  it('selects exact trie paths from badges and keeps editing, copying, adding and deleting functional', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const blobs = captureExports();
    const { container } = await renderBundle();
    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    const root = getGraphNode(container, getNarratorNodeIdForReport(reports[0], 0, 'trie'));
    const authorityBadge = root.querySelector('.authority-report-links')!;
    await user.click(within(authorityBadge as HTMLElement).getByRole('button'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Select report #2' }));
    selectedPath(container, reports[1], 'trie');
    const oldBranch = getNarratorNodeIdForReport(reports[1], 2, 'trie');
    fireEvent.change(screen.getByPlaceholderText('Narrator 2'), { target: { value: 'Revised right' } });
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    const changed = { ...reports[1], isnad: ['Root', 'Revised right', 'Shared', 'Collector'] };
    selectedPath(container, changed, 'trie');
    expect(container.querySelector('[data-node-id="' + oldBranch + '"]')).not.toBeInTheDocument();
    expect(getGraphNode(container, getNarratorNodeIdForReport(reports[0], 2, 'trie'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy To New' }));
    expect(screen.getByRole('heading', { name: 'Create Report' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Narrator 4'), { target: { value: 'New collector' } });
    fireEvent.change(screen.getByPlaceholderText('The report statement'), { target: { value: 'New wording.' } });
    await user.click(screen.getByRole('button', { name: 'Add Report' }));
    const afterAdd = await exported(user, blobs);
    const added = afterAdd.reports.find((report) => report.matn === 'New wording.')!;
    expect(afterAdd.reports).toHaveLength(5);
    expect(Array.from(container.querySelectorAll('.node-group.selected'))
      .map((node) => node.getAttribute('data-node-id')).sort()).toEqual(getNodeIdsForReport(added, 'trie').sort());
    const newTerminal = getNarratorNodeIdForReport(added, added.isnad.length - 1, 'trie');
    selectMatn(container, added.id);
    selectedPath(container, added, 'trie');
    await user.click(screen.getByRole('button', { name: 'Delete Report' }));
    expect((await exported(user, blobs)).reports).toHaveLength(4);
    expect(container.querySelector('[data-node-id="m:' + added.id + '"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-node-id="' + newTerminal + '"]')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trie', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }, 10_000);

  it('keeps Sources and students unchanged and remembers the representation in complete focus views', async () => {
    const user = userEvent.setup();
    const { container } = await renderBundle();
    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Shared');
    expect(screen.queryByRole('button', { name: 'Merged', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trie', exact: true })).not.toBeInTheDocument();
    expect(getGraphNode(container, 'focus:center:Shared')).toBeInTheDocument();
    const local = transforms(container);

    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    expect(screen.getByRole('button', { name: 'Trie', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-node-id="m:outside"]')).not.toBeInTheDocument();
    selectMatn(container, 'b');
    selectedPath(container, reports[1], 'trie');
    expect(screen.getByRole('heading', { name: 'Edit Report #2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Merged', exact: true }));
    selectedPath(container, reports[1], 'merged');
    await user.click(screen.getByRole('button', { name: 'Sources & students', exact: true }));
    expect(screen.queryByRole('button', { name: 'Merged', exact: true })).not.toBeInTheDocument();
    expect(transforms(container)).toEqual(local);
    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(screen.getByRole('button', { name: 'Merged', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps merged and trie pins, exports and automatic-layout restoration separate', async () => {
    const user = userEvent.setup();
    const blobs = captureExports();
    const trieShared = getNarratorNodeIdForReport(reports[0], 2, 'trie');
    const bundle = makeBundle(reports, {
      nodePositions: { 'n:Shared': { x: 1800, y: 600 }, 'm:a': { x: 2000, y: 1200 } },
      trieNodePositions: { [trieShared]: { x: 900, y: 600 }, 'm:a': { x: 1300, y: 1400 } },
    });
    const { container } = await renderBundle(bundle);
    const merged = transforms(container);
    await user.click(screen.getByRole('button', { name: 'Auto-arrange' }));
    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Merged', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Restore saved layout' }));
    expect(transforms(container)).toEqual(merged);

    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    drag(container, trieShared);
    const changed = await exported(user, blobs);
    expect(changed.nodePositions).toEqual(bundle.nodePositions);
    expect(changed.trieNodePositions![trieShared]).not.toEqual(bundle.trieNodePositions![trieShared]);
    const trie = transforms(container);
    await user.click(screen.getByRole('button', { name: 'Auto-arrange' }));
    const automatic = await exported(user, blobs);
    expect(automatic.nodePositions).toEqual(bundle.nodePositions);
    expect(automatic.trieNodePositions).toEqual({});
    await user.click(screen.getByRole('button', { name: 'Merged', exact: true }));
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
    expect(transforms(container)).toEqual(merged);
    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Restore saved layout' }));
    expect(transforms(container)).toEqual(trie);
    const restored = await exported(user, blobs);
    expect(restored.nodePositions).toEqual(bundle.nodePositions);
    expect(restored.trieNodePositions).toEqual(changed.trieNodePositions);
  });

  it('resizes shared matn widths while clearing only the active representation pin', async () => {
    const user = userEvent.setup();
    const blobs = captureExports();
    const bundle = makeBundle(reports, {
      nodePositions: { 'm:a': { x: 1600, y: 1200 } },
      trieNodePositions: { 'm:a': { x: 1900, y: 1400 } },
      nodeWidths: { 'm:a': 320 },
    });
    const { container } = await renderBundle(bundle);
    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    selectMatn(container, 'a');
    const matn = getGraphNode(container, 'm:a');
    const handle = matn.querySelector('.resize-handle-right')!;
    const position = matn.getAttribute('transform')!.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/)!;
    fireEvent.pointerDown(handle, { button: 0, clientX: Number(position[1]) + 160, clientY: Number(position[2]) });
    expect(screen.getByRole('button', { name: 'Merged', exact: true })).toBeDisabled();
    fireEvent.pointerMove(window, { clientX: Number(position[1]) + 280, clientY: Number(position[2]) });
    fireEvent.pointerUp(window);
    const resized = await exported(user, blobs);
    expect(resized.nodePositions).toEqual(bundle.nodePositions);
    expect(resized.trieNodePositions?.['m:a']).toBeUndefined();
    expect(resized.nodeWidths['m:a']).toBe(440);
    await user.click(screen.getByRole('button', { name: 'Merged', exact: true }));
    expect(getGraphNode(container, 'm:a').querySelector('.node-matn-hitbox')).toHaveAttribute('width', '440');
  });

  it('isolates dragged complete-focus layouts and restoration by narrator and representation', async () => {
    const user = userEvent.setup();
    const blobs = captureExports();
    const bundle = makeBundle(reports, {
      nodePositions: { 'n:Shared': { x: 1600, y: 700 } },
      trieNodePositions: { 'm:a': { x: 1900, y: 1400 } },
    });
    const { container } = await renderBundle(bundle);
    const fullMerged = transforms(container);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Shared');
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    const mergedFocus = transforms(container);
    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    drag(container, getNarratorNodeIdForReport(reports[0], 2, 'trie'));
    const trieFocus = transforms(container);
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Merged', exact: true }));
    expect(transforms(container)).toEqual(mergedFocus);
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    expect(transforms(container)).toEqual(trieFocus);
    await user.click(screen.getByRole('button', { name: 'Auto-arrange' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Left');
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Shared');
    await user.click(screen.getByRole('button', { name: 'Restore saved layout' }));
    expect(transforms(container)).toEqual(trieFocus);
    const saved = await exported(user, blobs);
    expect(saved.nodePositions).toEqual(bundle.nodePositions);
    expect(saved.trieNodePositions).toEqual(bundle.trieNodePositions);
    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Merged', exact: true }));
    expect(transforms(container)).toEqual(fullMerged);
  });
});
