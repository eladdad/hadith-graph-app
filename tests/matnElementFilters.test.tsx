import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MatnView } from '../src/components/MatnView';
import type { HadithReport } from '../src/types';
import { makeReport } from './helpers';

const legend = [
  { id: 'mercy', label: 'Mercy', color: '#f59e0b' },
  { id: 'justice', label: 'Justice', color: '#10b981' },
  { id: 'unused', label: 'Unused element', color: '#a855f7' },
];

const reports: HadithReport[] = [
  {
    ...makeReport('mercy-first', ['Authority', 'Collector A'], 'Mercy mercy in the first wording.'),
    matnHighlights: [
      { id: 'mercy-first-1', legendId: 'mercy', start: 0, end: 5 },
      { id: 'mercy-first-2', legendId: 'mercy', start: 6, end: 11 },
    ],
  },
  {
    ...makeReport('justice', ['Authority', 'Collector B'], 'Justice in another wording.'),
    matnHighlights: [{ id: 'justice-1', legendId: 'justice', start: 0, end: 7 }],
  },
  {
    ...makeReport('mercy-second', ['Authority', 'Collector C'], 'Mercy in a later wording.'),
    matnHighlights: [{ id: 'mercy-second-1', legendId: 'mercy', start: 0, end: 5 }],
  },
  {
    ...makeReport('both', ['Authority', 'Collector D'], 'Mercy justice in a combined wording.'),
    matnHighlights: [
      { id: 'both-mercy', legendId: 'mercy', start: 0, end: 5 },
      { id: 'both-justice', legendId: 'justice', start: 6, end: 13 },
    ],
  },
  makeReport('plain', ['Authority', 'Collector E'], 'A wording without any highlights.'),
];

function props(overrides: Partial<ComponentProps<typeof MatnView>> = {}): ComponentProps<typeof MatnView> {
  return {
    reports,
    legend,
    fontSize: 16,
    isSidebarOpen: true,
    onToggleSidebar: vi.fn(),
    onSelectReport: vi.fn(),
    ...overrides,
  };
}

function readingIds(): string[] {
  return Array.from(screen.getByRole('region', { name: 'Matns and highlights' })
    .querySelectorAll<HTMLElement>('.matn-reading-card'))
    .map((card) => card.dataset.reportId!);
}

function filter(label: string): HTMLElement {
  return screen.getByRole('button', { name: `Filter by ${label}`, exact: true });
}

describe('matn element filters', () => {
  it('matches any selected element, keeps original report numbers, and clears back to every report', async () => {
    const user = userEvent.setup();
    const onSelectReport = vi.fn();
    render(<MatnView {...props({ onSelectReport })} />);
    const originalOrder = readingIds();

    expect(originalOrder).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Clear filters', exact: true })).toBeDisabled();
    await user.click(filter('Mercy'));
    expect(filter('Mercy')).toHaveAttribute('aria-pressed', 'true');
    expect(readingIds()).toEqual(originalOrder.filter((id) => ['mercy-first', 'mercy-second', 'both'].includes(id)));
    expect(screen.getByText('3 of 5 reports')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit report #2' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit report #4' }));
    expect(onSelectReport).toHaveBeenCalledWith('both');

    await user.click(filter('Justice'));
    expect(readingIds()).toEqual(originalOrder.filter((id) => id !== 'plain'));
    expect(screen.getByText('4 of 5 reports')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters', exact: true }));
    expect(readingIds()).toEqual(originalOrder);
    expect(filter('Mercy')).toHaveAttribute('aria-pressed', 'false');
    expect(filter('Justice')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('5 reports')).toBeInTheDocument();
  });

  it('requires every selected element in all mode and restores reports as elements are deselected', async () => {
    const user = userEvent.setup();
    render(<MatnView {...props()} />);
    await user.click(filter('Mercy'));
    await user.click(filter('Justice'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Match elements' }), 'all');

    expect(readingIds()).toEqual(['both']);
    expect(screen.getByText('1 of 5 reports')).toBeInTheDocument();
    await user.click(filter('Justice'));
    expect(new Set(readingIds())).toEqual(new Set(['mercy-first', 'mercy-second', 'both']));
    await user.click(filter('Mercy'));
    expect(readingIds()).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Clear filters', exact: true })).toBeDisabled();
  });

  it('counts each report once per element and lets a zero-match filter be cleared', async () => {
    const user = userEvent.setup();
    render(<MatnView {...props()} />);

    expect(within(filter('Mercy')).getByText('3')).toBeInTheDocument();
    expect(within(filter('Justice')).getByText('2')).toBeInTheDocument();
    expect(within(filter('Unused element')).getByText('0')).toBeInTheDocument();
    await user.click(filter('Unused element'));

    expect(readingIds()).toEqual([]);
    expect(screen.getByText('0 of 5 reports')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No matns match these elements' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters', exact: true }));
    expect(readingIds()).toHaveLength(5);
    expect(screen.queryByRole('heading', { name: 'No matns match these elements' })).not.toBeInTheDocument();
  });

  it('preserves the chosen reading order when filtering and never renumbers matching reports', async () => {
    const user = userEvent.setup();
    render(<MatnView {...props()} />);
    const similarityOrder = readingIds();
    await user.click(filter('Mercy'));
    expect(readingIds()).toEqual(similarityOrder.filter((id) => ['mercy-first', 'mercy-second', 'both'].includes(id)));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Order by' }), 'bundle');
    expect(readingIds()).toEqual(['mercy-first', 'mercy-second', 'both']);
    expect(screen.getByRole('button', { name: 'Edit report #1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit report #3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit report #4' })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Order by' }), 'similarity');
    expect(readingIds()).toEqual(similarityOrder.filter((id) => ['mercy-first', 'mercy-second', 'both'].includes(id)));
  });

  it('updates matches after saved highlights change and removes a deleted legend entry from the filter', async () => {
    const user = userEvent.setup();
    const originalProps = props();
    const { rerender } = render(<MatnView {...originalProps} />);
    await user.click(filter('Mercy'));

    const editedReports = reports.map((report) => ({
      ...report,
      matnHighlights: report.matnHighlights.filter((highlight) => highlight.legendId !== 'mercy'),
    }));
    rerender(<MatnView {...originalProps} reports={editedReports} />);
    expect(filter('Mercy')).toHaveAttribute('aria-pressed', 'true');
    expect(within(filter('Mercy')).getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No matns match these elements' })).toBeInTheDocument();

    rerender(<MatnView {...originalProps} reports={editedReports} legend={legend.filter((entry) => entry.id !== 'mercy')} />);
    expect(screen.queryByRole('button', { name: 'Filter by Mercy' })).not.toBeInTheDocument();
    expect(readingIds()).toHaveLength(5);
    expect(screen.getByText('5 reports')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters', exact: true })).toBeDisabled();
  });

  it('keeps reports without elements readable and distinguishes an empty bundle from no matches', () => {
    const { rerender } = render(<MatnView {...props({
      reports: reports.map((report) => ({ ...report, matnHighlights: [] })),
      legend: [],
    })} />);
    expect(readingIds()).toEqual(reports.map((report) => report.id));
    expect(screen.getByText('Add highlights in the report editor to compare patterns here.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No matns match these elements' })).not.toBeInTheDocument();

    rerender(<MatnView {...props({ reports: [], legend: [] })} />);
    expect(screen.getByRole('heading', { name: 'Your matns will appear here' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Matns', exact: true })).not.toBeInTheDocument();
  });
});
