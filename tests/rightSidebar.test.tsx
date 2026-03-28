import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RightSidebar } from '../src/components/RightSidebar';
import type { HadithBundle } from '../src/types';

function createBundle(): HadithBundle {
  return {
    format: 'hadith-graph-bundle',
    version: 1,
    title: 'Sample Bundle',
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
    fontSizes: {
      narrator: 18,
      matn: 20,
    },
    highlightLegend: [
      {
        id: 'legend-1',
        label: 'Actor',
        color: '#f59e0b',
      },
    ],
    nodePositions: {},
    nodeWidths: {},
    reports: [
      {
        id: 'report-1',
        isnad: ['A', 'B'],
        matn: 'Text one',
        matnHighlights: [
          {
            id: 'highlight-1',
            legendId: 'legend-1',
            start: 0,
            end: 4,
          },
        ],
        createdAt: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 'report-2',
        isnad: ['C'],
        matn: 'Text two',
        matnHighlights: [],
        createdAt: '2026-03-28T00:00:00.000Z',
      },
    ],
  };
}

describe('RightSidebar', () => {
  it('renders controls and report list content', async () => {
    const user = userEvent.setup();
    const onSelectReport = vi.fn();
    const onUseReportAsTemplate = vi.fn();

    render(
      <RightSidebar
        bundle={createBundle()}
        theme="light"
        isSharedLegendOpen={false}
        highlightUsageCounts={new Map([['legend-1', 1]])}
        editingReportId="report-1"
        fileInputRef={createRef<HTMLInputElement>()}
        onNewBundle={vi.fn()}
        onLoadExample={vi.fn()}
        onOpenImport={vi.fn()}
        onExport={vi.fn()}
        onToggleTheme={vi.fn()}
        onToggleSharedLegend={vi.fn()}
        onFontSizeChange={vi.fn()}
        onImport={vi.fn()}
        onStartNewReport={vi.fn()}
        onSelectReport={onSelectReport}
        onUseReportAsTemplate={onUseReportAsTemplate}
      />,
    );

    expect(screen.getByText('Bundle: Sample Bundle')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reports (2)' })).toBeInTheDocument();
    expect(screen.getByText('A -> B')).toBeInTheDocument();

    const firstReportCard = screen.getAllByRole('listitem')[0];
    if (!firstReportCard) {
      throw new Error('First report card not found.');
    }

    await user.click(within(firstReportCard).getByRole('button', { name: 'Edit' }));
    expect(onSelectReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'report-1' }));

    await user.click(within(firstReportCard).getByRole('button', { name: 'Use As Template' }));
    expect(onUseReportAsTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'report-1' }));
  });

  it('shows shared legend entries when expanded', () => {
    render(
      <RightSidebar
        bundle={createBundle()}
        theme="dark"
        isSharedLegendOpen
        highlightUsageCounts={new Map([['legend-1', 3]])}
        editingReportId={null}
        fileInputRef={createRef<HTMLInputElement>()}
        onNewBundle={vi.fn()}
        onLoadExample={vi.fn()}
        onOpenImport={vi.fn()}
        onExport={vi.fn()}
        onToggleTheme={vi.fn()}
        onToggleSharedLegend={vi.fn()}
        onFontSizeChange={vi.fn()}
        onImport={vi.fn()}
        onStartNewReport={vi.fn()}
        onSelectReport={vi.fn()}
        onUseReportAsTemplate={vi.fn()}
      />,
    );

    expect(screen.getByText('Actor')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light Theme' })).toBeInTheDocument();
  });
});
