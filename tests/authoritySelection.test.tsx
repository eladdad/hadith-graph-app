import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { bundleToJson, getEdgeIdsForReport, getNodeIdsForReport } from '../src/bundle';
import { getGraphEdge, getGraphNode, importJson, makeBundle, makeReport } from './helpers';

const reports = [
  makeReport('r1', ['Authority A', 'Shared student', 'Collector 1'], 'First wording.'),
  makeReport('r2', ['Authority B', 'Shared student', 'Collector 2'], 'Second wording.'),
  makeReport('r3', ['Authority A', 'Shared student', 'Collector 3'], 'Third wording.'),
];

async function renderReports() {
  const result = render(<App />);
  await importJson(result.container, bundleToJson(makeBundle(reports)));
  await waitFor(() => expect(result.container.querySelector('[data-node-id="m:r3"]')).not.toBeNull());
  return result;
}

function authorityLinks(container: HTMLElement, authority: string): SVGElement {
  const links = getGraphNode(container, `n:${authority}`).querySelector('.authority-report-links');
  if (!(links instanceof SVGElement)) {
    throw new Error(`Report numbers for ${authority} not found.`);
  }
  return links;
}

function edgeLinks(container: HTMLElement): SVGElement {
  const links = container.querySelector('g[data-edge-id="n:Authority A->n:Shared student"] .edge-label');
  if (!(links instanceof SVGElement)) {
    throw new Error('Shared edge report numbers not found.');
  }
  return links;
}

function matnHeading(container: HTMLElement, reportId: string): SVGElement {
  const heading = getGraphNode(container, `m:${reportId}`).querySelector('.matn-report-label');
  if (!(heading instanceof SVGElement)) {
    throw new Error(`Numbered heading for ${reportId} not found.`);
  }
  return heading;
}

function numberButton(scope: Element, number: number): HTMLElement {
  return within(scope as HTMLElement).getByRole('button', { name: `Select report #${number}` });
}

function expectReportSelected(container: HTMLElement, number: number): void {
  const report = reports[number - 1];
  expect(screen.getByRole('heading', { name: `Edit Report #${number}` })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('The report statement')).toHaveValue(report.matn);

  const selectedNodes = Array.from(container.querySelectorAll('.node-group.selected'))
    .map((node) => node.getAttribute('data-node-id')).sort();
  expect(selectedNodes).toEqual(getNodeIdsForReport(report).sort());
  const selectedEdges = Array.from(container.querySelectorAll('path.graph-edge.selected'))
    .map((edge) => edge.getAttribute('data-edge-id')).sort();
  expect(selectedEdges).toEqual(getEdgeIdsForReport(report).sort());
  expect(getGraphNode(container, `m:${report.id}`)).toHaveClass('selected');
  expect(getGraphEdge(container, `n:Shared student->c:${report.id}`)).toHaveClass('selected');

  for (const link of container.querySelectorAll('.report-number-link')) {
    expect(link).toHaveAttribute('aria-pressed', String(link.getAttribute('data-report-id') === report.id));
  }
}

function transforms(container: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(Array.from(container.querySelectorAll('[data-node-id]'))
    .map((node) => [node.getAttribute('data-node-id')!, node.getAttribute('transform')]));
}

describe('report number selection', () => {
  it('selects the exact report from authority, shared edge, and matn numbers without moving nodes', async () => {
    const user = userEvent.setup();
    const { container } = await renderReports();
    const initialTransforms = transforms(container);
    const authority = authorityLinks(container, 'Authority A');
    expect(within(authority as unknown as HTMLElement).getAllByRole('button')).toHaveLength(2);
    expect(within(authority as unknown as HTMLElement).queryByRole('button', { name: 'Select report #2' }))
      .not.toBeInTheDocument();

    const thirdNumber = numberButton(authority, 3);
    // A number is an action rather than a node-drag target, even if the pointer
    // moves before it is released.
    fireEvent.pointerDown(thirdNumber, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 170, clientY: 160 });
    fireEvent.pointerUp(window, { clientX: 170, clientY: 160 });
    fireEvent.click(thirdNumber);
    expectReportSelected(container, 3);

    await user.click(numberButton(edgeLinks(container), 1));
    expectReportSelected(container, 1);
    await user.click(numberButton(edgeLinks(container), 3));
    expectReportSelected(container, 3);
    await user.click(numberButton(matnHeading(container, 'r2'), 2));
    expectReportSelected(container, 2);
    expect(transforms(container)).toEqual(initialTransforms);
  });

  it('honors the existing discard confirmation when a numbered report is chosen', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = await renderReports();
    await user.click(numberButton(authorityLinks(container, 'Authority A'), 1));
    await user.type(screen.getByPlaceholderText('The report statement'), ' Unsaved draft.');

    await user.click(numberButton(authorityLinks(container, 'Authority B'), 2));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenLastCalledWith('Discard unsaved report changes?');
    expect(screen.getByRole('heading', { name: 'Edit Report #1' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('The report statement')).toHaveValue('First wording. Unsaved draft.');
    expect(getGraphNode(container, 'm:r1')).toHaveClass('selected');
    expect(getGraphNode(container, 'm:r2')).not.toHaveClass('selected');

    confirm.mockReturnValue(true);
    await user.click(numberButton(edgeLinks(container), 3));
    expect(confirm).toHaveBeenCalledTimes(2);
    expectReportSelected(container, 3);
    // Switching back reads the saved wording, confirming the abandoned draft
    // was not written into a report by its number control.
    await user.click(numberButton(matnHeading(container, 'r1'), 1));
    expectReportSelected(container, 1);
  });

  it('activates authority, edge, and matn numbers with Enter and Space', async () => {
    const { container } = await renderReports();
    const authorityNumber = numberButton(authorityLinks(container, 'Authority A'), 3);
    expect(authorityNumber).toHaveAttribute('tabindex', '0');
    authorityNumber.focus();
    fireEvent.keyDown(authorityNumber, { key: 'Enter' });
    expectReportSelected(container, 3);

    const edgeNumber = numberButton(edgeLinks(container), 1);
    edgeNumber.focus();
    fireEvent.keyDown(edgeNumber, { key: ' ' });
    expectReportSelected(container, 1);

    const matnNumber = numberButton(matnHeading(container, 'r2'), 2);
    matnNumber.focus();
    fireEvent.keyDown(matnNumber, { key: 'Enter' });
    expectReportSelected(container, 2);
  });
});
