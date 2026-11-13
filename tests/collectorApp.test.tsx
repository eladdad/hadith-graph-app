import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { bundleToJson, getEdgeIdsForReport, getNodeIdsForReport } from '../src/bundle';
import { getCollectorNarrators } from '../src/collectors';
import { getNarratorNodeIdForReport } from '../src/graph';
import type { GraphRepresentation, HadithBundle, HadithReport } from '../src/types';
import { getGraphNode, importJson, makeBundle, makeReport } from './helpers';

const reports = [
  makeReport('a', ['Root', 'Left', 'Shared', 'Collector'], 'First wording.'),
  makeReport('b', ['Root', 'Right', 'Shared', 'Collector'], 'Second wording.'),
  makeReport('outside', ['Other root', 'Other collector'], 'Outside wording.'),
];

afterEach(() => vi.restoreAllMocks());

async function renderBundle(bundle = makeBundle(reports)) {
  const result = render(<App />);
  await importJson(result.container, bundleToJson(bundle));
  await waitFor(() => expect(result.container.querySelector('[data-node-id="m:a"]')).not.toBeNull());
  return result;
}

function selectMatn(container: HTMLElement, id: string): void {
  fireEvent.pointerDown(getGraphNode(container, 'm:' + id), { button: 0, clientX: 100, clientY: 100 });
}

function selectedPath(container: HTMLElement, report: HadithReport, collectors: ReadonlySet<string>, representation: GraphRepresentation = 'merged'): void {
  expect(Array.from(container.querySelectorAll('.node-group.selected'))
    .map((node) => node.getAttribute('data-node-id')).sort())
    .toEqual(getNodeIdsForReport(report, representation, collectors).sort());
  expect(Array.from(container.querySelectorAll('path.graph-edge.selected'))
    .map((edge) => edge.getAttribute('data-edge-id')).sort())
    .toEqual(getEdgeIdsForReport(report, representation, collectors).sort());
}

function captureExports(): Blob[] {
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((value: Blob | MediaSource) => {
    if (value instanceof Blob) blobs.push(value);
    return 'blob:collector-export';
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return blobs;
}

async function exported(user: ReturnType<typeof userEvent.setup>, blobs: Blob[]): Promise<HadithBundle> {
  if (!screen.queryByRole('button', { name: 'Export JSON' })) {
    await user.click(screen.getByRole('button', { name: /Options/ }));
  }
  await user.click(screen.getByRole('button', { name: 'Export JSON' }));
  return JSON.parse(await blobs.at(-1)!.text()) as HadithBundle;
}

describe('narrator collector controls', () => {
  it('uses collector defaults from the full bundle when a focus excludes the report ending with that narrator', async () => {
    const user = userEvent.setup();
    const mixedReports = [
      makeReport('a', ['Root', 'Collector'], 'Terminal collector.'),
      makeReport('b', ['Root', 'Collector', 'Student', 'Other collector'], 'Collector also transmits to a student.'),
    ];
    const { container } = await renderBundle(makeBundle(mixedReports));
    const intermediateId = getNarratorNodeIdForReport(mixedReports[1], 1, 'merged', getCollectorNarrators(mixedReports));
    expect(getGraphNode(container, intermediateId)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Student');
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));

    expect(container.querySelector('[data-node-id="m:a"]')).not.toBeInTheDocument();
    expect(getGraphNode(container, intermediateId)).toBeInTheDocument();
    expect(container.querySelector('[data-node-id="n:Collector"]')).not.toBeInTheDocument();
    selectMatn(container, 'b');
    selectedPath(container, mixedReports[1], getCollectorNarrators(mixedReports));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Collector');
    expect(screen.getByRole('checkbox', { name: 'Collector', exact: true })).toBeChecked();
  });

  it('defaults final narrators to collectors, reverses the setting globally, and preserves it through export and import', async () => {
    const user = userEvent.setup();
    const blobs = captureExports();
    const { container } = await renderBundle();
    expect(getGraphNode(container, 'c:a')).toBeInTheDocument();
    expect(getGraphNode(container, 'c:b')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Collector');
    expect(screen.getByRole('checkbox', { name: 'Collector', exact: true })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    selectMatn(container, 'a');
    await user.click(screen.getByRole('checkbox', { name: 'Collector', exact: true }));

    expect(screen.getByRole('checkbox', { name: 'Collector', exact: true })).not.toBeChecked();
    expect(getGraphNode(container, 'n:Collector')).toBeInTheDocument();
    expect(container.querySelector('[data-node-id="c:a"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-node-id="c:b"]')).not.toBeInTheDocument();
    selectedPath(container, reports[0], getCollectorNarrators(reports, { Collector: false }));
    expect(screen.getByRole('heading', { name: 'Edit Report #1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(getGraphNode(container, 'n:Collector')).toBeInTheDocument();
    expect(getGraphNode(container, 'm:outside')).toBeInTheDocument();
    const saved = await exported(user, blobs);
    expect(saved.collectorOverrides).toEqual({ Collector: false });
    expect(saved.reports).toEqual(reports);
    await importJson(container, bundleToJson(saved));
    await waitFor(() => expect(getGraphNode(container, 'n:Collector')).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Collector');
    expect(screen.getByRole('checkbox', { name: 'Collector', exact: true })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Collector', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    expect(getGraphNode(container, 'c:a')).toBeInTheDocument();
    expect(getGraphNode(container, 'c:b')).toBeInTheDocument();
    expect(container.querySelector('[data-node-id="n:Collector"]')).not.toBeInTheDocument();
  });

  it('splits an intermediate narrator across reports and keeps the selected draft and saved edits aligned with its new nodes', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = await renderBundle();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Shared');
    expect(screen.getByRole('checkbox', { name: 'Collector', exact: true })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    selectMatn(container, 'b');
    await user.type(screen.getByPlaceholderText('The report statement'), ' Updated.');
    await user.click(screen.getByRole('checkbox', { name: 'Collector', exact: true }));

    const collectors = getCollectorNarrators(reports, { Shared: true });
    const firstShared = getNarratorNodeIdForReport(reports[0], 2, 'merged', collectors);
    const secondShared = getNarratorNodeIdForReport(reports[1], 2, 'merged', collectors);
    expect(firstShared).not.toEqual(secondShared);
    expect(getGraphNode(container, firstShared)).toBeInTheDocument();
    expect(getGraphNode(container, secondShared)).toHaveClass('selected');
    expect(getGraphNode(container, firstShared)).not.toHaveClass('selected');
    expect(container.querySelector('[data-node-id="n:Shared"]')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('Second wording. Updated.');
    selectedPath(container, reports[1], collectors);
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Narrator 2'), { target: { value: 'Revised right' } });
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    const changed = { ...reports[1], isnad: ['Root', 'Revised right', 'Shared', 'Collector'], matn: 'Second wording. Updated.' };
    selectedPath(container, changed, collectors);
    expect(getGraphNode(container, 'n:Revised right')).toHaveClass('selected');
    expect(screen.getByRole('checkbox', { name: 'Collector', exact: true })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Collector', exact: true }));
    expect(getGraphNode(container, 'n:Shared')).toHaveClass('selected');
    expect(container.querySelector('[data-node-id="' + firstShared + '"]')).not.toBeInTheDocument();
    selectedPath(container, changed, getCollectorNarrators(reports, { Shared: false }));
  });

  it('retains prefix-tree paths while the collector setting is changed and applies it when returning to Merged', async () => {
    const user = userEvent.setup();
    const { container } = await renderBundle();
    await user.click(screen.getByRole('button', { name: 'Trie', exact: true }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'Shared');
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    selectMatn(container, 'b');
    const before = Array.from(container.querySelectorAll('.graph-svg [data-node-id]'))
      .map((node) => [node.getAttribute('data-node-id'), node.getAttribute('transform')]);
    await user.click(screen.getByRole('checkbox', { name: 'Collector', exact: true }));
    const after = Array.from(container.querySelectorAll('.graph-svg [data-node-id]'))
      .map((node) => [node.getAttribute('data-node-id'), node.getAttribute('transform')]);
    expect(after).toEqual(before);
    const collectors = getCollectorNarrators(reports, { Shared: true });
    selectedPath(container, reports[1], collectors, 'trie');
    await user.click(screen.getByRole('button', { name: 'Merged', exact: true }));
    expect(container.querySelector('[data-node-id="n:Shared"]')).not.toBeInTheDocument();
    selectedPath(container, reports[1], collectors);
    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(getGraphNode(container, getNarratorNodeIdForReport(reports[0], 2, 'merged', collectors))).toBeInTheDocument();
    expect(getGraphNode(container, getNarratorNodeIdForReport(reports[1], 2, 'merged', collectors))).toHaveClass('selected');
  });
});
