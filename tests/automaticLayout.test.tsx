import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { bundleToJson } from '../src/bundle';
import type { HadithBundle } from '../src/types';
import { getGraphNode, importJson, makeBundle, makeReport } from './helpers';

afterEach(() => vi.restoreAllMocks());

function pinnedBundle(): HadithBundle {
  const reports = [
    { ...makeReport('a1', ['n1', 'n2', 'n3', 'Collector A1'], 'First wording.'), note: 'A source note.',
      matnHighlights: [{ id: 'mark', legendId: 'theme', start: 0, end: 5 }] },
    makeReport('a2', ['n1', 'n2', 'n3', 'Collector A2'], 'Second wording.'),
    makeReport('b1', ['n4', 'n5', 'n6', 'Collector B1'], 'Third wording.'),
    makeReport('b2', ['n4', 'n5', 'n6', 'Collector B2'], 'Fourth wording.'),
  ];
  return makeBundle(reports, {
    nodePositions: {
      'n:n1': { x: 600, y: 100 }, 'n:n2': { x: 600, y: 340 }, 'n:n3': { x: 600, y: 580 },
      'n:n4': { x: 1800, y: 100 }, 'n:n5': { x: 1800, y: 340 }, 'n:n6': { x: 1800, y: 580 },
      'c:a1': { x: 1800, y: 820 }, 'c:a2': { x: 2400, y: 820 },
      'c:b1': { x: 600, y: 820 }, 'c:b2': { x: 1200, y: 820 },
      'm:a1': { x: 1800, y: 1200 }, 'm:a2': { x: 2400, y: 1200 },
      'm:b1': { x: 600, y: 1200 }, 'm:b2': { x: 1200, y: 1200 },
    },
    nodeWidths: { 'm:a1': 440, 'm:a2': 220 },
    fontSizes: { narrator: 15, matn: 14 },
    verticalSpacing: 230,
    highlightLegend: [{ id: 'theme', label: 'Theme', color: '#ffcc00' }],
  });
}

function transforms(container: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(Array.from(container.querySelectorAll('.graph-svg [data-node-id]'))
    .map((node) => [node.getAttribute('data-node-id')!, node.getAttribute('transform')]));
}

function nodeX(container: HTMLElement, id: string): number {
  const transform = getGraphNode(container, id).getAttribute('transform');
  const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) throw new Error(`Invalid position for ${id}`);
  return Number(match[1]);
}

function captureExports(): Blob[] {
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((value: Blob | MediaSource) => {
    if (value instanceof Blob) blobs.push(value);
    return 'blob:automatic-layout';
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return blobs;
}

async function exportBundle(user: ReturnType<typeof userEvent.setup>, blobs: Blob[]): Promise<HadithBundle> {
  if (!screen.queryByRole('button', { name: 'Export JSON' })) {
    await user.click(screen.getByRole('button', { name: /Options/ }));
  }
  const count = blobs.length;
  await user.click(screen.getByRole('button', { name: 'Export JSON' }));
  expect(blobs).toHaveLength(count + 1);
  return JSON.parse(await blobs.at(-1)!.text()) as HadithBundle;
}

function expectContentPreserved(actual: HadithBundle, expected: HadithBundle): void {
  for (const key of ['reports', 'nodeWidths', 'fontSizes', 'verticalSpacing', 'highlightLegend', 'title', 'createdAt'] as const) {
    expect(actual[key], `${key} should survive layout changes`).toEqual(expected[key]);
  }
}

describe('automatic layout controls', () => {
  it('opens the bundled example with automatic centering instead of its saved diagram positions', async () => {
    const user = userEvent.setup();
    const blobs = captureExports();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: /Options/ }));
    await user.click(screen.getByRole('button', { name: 'Load Example Graph' }));

    const parentId = 'n:عبد الرحمن بن جوشن';
    const studentIds = ['n:عيينة بن عبد الرحمن الغطفاني', 'n:علي بن زيد القرشي'];
    await waitFor(() => expect(container.querySelector(`[data-node-id="${parentId}"]`)).not.toBeNull());
    expect(screen.getByText('Automatic layout')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    expect(nodeX(container, parentId)).toBeCloseTo(
      (nodeX(container, studentIds[0]) + nodeX(container, studentIds[1])) / 2, 5,
    );
    const exported = await exportBundle(user, blobs);
    expect(exported.reports).toHaveLength(24);
    expect(exported.nodePositions).toEqual({});
  });

  it('preserves imported positions until requested, arranges branches, and restores the exact saved layout', async () => {
    const user = userEvent.setup();
    const bundle = pinnedBundle();
    const blobs = captureExports();
    const { container } = render(<App />);
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    await importJson(container, bundleToJson(bundle));
    await waitFor(() => expect(container.querySelector('[data-node-id="m:a1"]')).not.toBeNull());
    const saved = transforms(container);
    expect(nodeX(container, 'n:n1')).toBeLessThan(nodeX(container, 'n:n4'));
    expect(nodeX(container, 'm:a1')).toBeGreaterThan(nodeX(container, 'm:b1'));
    expect((await exportBundle(user, blobs)).nodePositions).toEqual(bundle.nodePositions);

    fireEvent.pointerDown(getGraphNode(container, 'm:a1'), { button: 0, clientX: 100, clientY: 100 });
    const selected = Array.from(container.querySelectorAll('[data-node-id].selected'))
      .map((node) => node.getAttribute('data-node-id'));
    await user.click(screen.getByRole('button', { name: 'Auto-arrange' }));

    const direction = Math.sign(nodeX(container, 'n:n4') - nodeX(container, 'n:n1'));
    expect(direction).not.toBe(0);
    for (const left of ['a1', 'a2']) {
      for (const right of ['b1', 'b2']) {
        expect((nodeX(container, `m:${right}`) - nodeX(container, `m:${left}`)) * direction).toBeGreaterThan(0);
      }
    }
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore saved layout' })).toBeEnabled();
    expect(Array.from(container.querySelectorAll('[data-node-id].selected'))
      .map((node) => node.getAttribute('data-node-id'))).toEqual(selected);
    expect(screen.getByRole('heading', { name: 'Edit Report #1' })).toBeInTheDocument();
    const automatic = await exportBundle(user, blobs);
    expect(automatic.nodePositions).toEqual({});
    expectContentPreserved(automatic, bundle);

    await user.click(screen.getByRole('button', { name: 'Restore saved layout' }));
    expect(transforms(container)).toEqual(saved);
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeEnabled();
    const restored = await exportBundle(user, blobs);
    expect(restored.nodePositions).toEqual(bundle.nodePositions);
    expectContentPreserved(restored, bundle);
  });

  it('keeps full-graph restoration out of focus views and discards it when another bundle is imported', async () => {
    const user = userEvent.setup();
    const blobs = captureExports();
    const { container } = render(<App />);
    await importJson(container, bundleToJson(pinnedBundle()));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Auto-arrange' }));
    expect(screen.getByRole('button', { name: 'Restore saved layout' })).toBeEnabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'n3');
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(screen.getByRole('button', { name: 'Restore saved layout' })).toBeEnabled();

    const replacement = makeBundle([makeReport('replacement', ['Other authority', 'Other collector'], 'Other wording.')], {
      nodePositions: { 'n:Other authority': { x: 500, y: 100 }, 'c:replacement': { x: 800, y: 500 } },
    });
    await importJson(container, bundleToJson(replacement));
    await waitFor(() => expect(container.querySelector('[data-node-id="m:replacement"]')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeEnabled();
    expect((await exportBundle(user, blobs)).nodePositions).toEqual(replacement.nodePositions);
  });

  it('keeps complete-report focus layouts separate and disables arrangement in sources and students', async () => {
    const user = userEvent.setup();
    const bundle = pinnedBundle();
    const blobs = captureExports();
    const { container } = render(<App />);
    await importJson(container, bundleToJson(bundle));
    await waitFor(() => expect(container.querySelector('[data-node-id="m:a1"]')).not.toBeNull());
    const fullSaved = transforms(container);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'n3');
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();

    fireEvent.pointerDown(getGraphNode(container, 'c:a1'), { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 190 });
    fireEvent.pointerMove(window, { clientX: 260, clientY: 230 });
    fireEvent.pointerUp(window, { clientX: 260, clientY: 230 });
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeEnabled();
    const focusSaved = transforms(container);
    await user.click(screen.getByRole('button', { name: 'Auto-arrange' }));
    expect(screen.getByRole('button', { name: 'Restore saved layout' })).toBeEnabled();
    expect((await exportBundle(user, blobs)).nodePositions).toEqual(bundle.nodePositions);

    await user.click(screen.getByRole('button', { name: 'Sources & students', exact: true }));
    expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore saved layout' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'All reports', exact: true }));
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
    expect(transforms(container)).toEqual(fullSaved);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Focus narrator' }), 'n3');
    await user.click(screen.getByRole('button', { name: 'Complete reports', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Restore saved layout' }));
    expect(transforms(container)).toEqual(focusSaved);
    expect((await exportBundle(user, blobs)).nodePositions).toEqual(bundle.nodePositions);
  });

  it('invalidates restoration when report contents change', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await importJson(container, bundleToJson(pinnedBundle()));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Auto-arrange' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Auto-arrange' }));
    fireEvent.pointerDown(getGraphNode(container, 'm:a1'), { button: 0, clientX: 100, clientY: 100 });
    await user.type(screen.getByPlaceholderText('The report statement'), ' Updated.');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.queryByRole('button', { name: 'Restore saved layout' })).not.toBeInTheDocument();
  });
});
