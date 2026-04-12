import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SidebarControls } from '../src/components/SidebarControls';
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
        note: '',
        createdAt: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 'report-2',
        isnad: ['C'],
        matn: 'Text two',
        matnHighlights: [],
        note: '',
        createdAt: '2026-03-28T00:00:00.000Z',
      },
    ],
  };
}

describe('SidebarControls', () => {
  it('renders the title area and reveals controls when options are expanded', async () => {
    const user = userEvent.setup();

    render(
      <SidebarControls
        bundle={createBundle()}
        theme="light"
        highlightUsageCounts={new Map([['legend-1', 1]])}
        fileInputRef={createRef<HTMLInputElement>()}
        onNewBundle={vi.fn()}
        onLoadExample={vi.fn()}
        onOpenImport={vi.fn()}
        onExport={vi.fn()}
        onOpenAbout={vi.fn()}
        onToggleTheme={vi.fn()}
        onFontSizeChange={vi.fn()}
        onImport={vi.fn()}
        onRemoveHighlightLegend={vi.fn()}
      />,
    );

    expect(screen.getByText('Bundle: Sample Bundle')).toBeInTheDocument();
    expect(screen.queryByText('Actor')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Options/ }));

    expect(screen.getByRole('button', { name: 'New Bundle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Example Graph' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark Theme' })).toBeInTheDocument();
    expect(screen.getByText('Actor')).toBeInTheDocument();
  });

  it('shows shared legend entries when expanded', async () => {
    const user = userEvent.setup();
    const onRemoveHighlightLegend = vi.fn();

    render(
      <SidebarControls
        bundle={createBundle()}
        theme="dark"
        highlightUsageCounts={new Map([['legend-1', 3]])}
        fileInputRef={createRef<HTMLInputElement>()}
        onNewBundle={vi.fn()}
        onLoadExample={vi.fn()}
        onOpenImport={vi.fn()}
        onExport={vi.fn()}
        onOpenAbout={vi.fn()}
        onToggleTheme={vi.fn()}
        onFontSizeChange={vi.fn()}
        onImport={vi.fn()}
        onRemoveHighlightLegend={onRemoveHighlightLegend}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Options/ }));

    expect(screen.getByText('Actor')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('calls the remove handler for a shared legend entry', async () => {
    const user = userEvent.setup();
    const onRemoveHighlightLegend = vi.fn();

    render(
      <SidebarControls
        bundle={createBundle()}
        theme="dark"
        highlightUsageCounts={new Map([['legend-1', 3]])}
        fileInputRef={createRef<HTMLInputElement>()}
        onNewBundle={vi.fn()}
        onLoadExample={vi.fn()}
        onOpenImport={vi.fn()}
        onExport={vi.fn()}
        onOpenAbout={vi.fn()}
        onToggleTheme={vi.fn()}
        onFontSizeChange={vi.fn()}
        onImport={vi.fn()}
        onRemoveHighlightLegend={onRemoveHighlightLegend}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Options/ }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemoveHighlightLegend).toHaveBeenCalledWith('legend-1');
  });

  it('calls the about handler from the title area', async () => {
    const user = userEvent.setup();
    const onOpenAbout = vi.fn();

    render(
      <SidebarControls
        bundle={createBundle()}
        theme="light"
        highlightUsageCounts={new Map([['legend-1', 1]])}
        fileInputRef={createRef<HTMLInputElement>()}
        onNewBundle={vi.fn()}
        onLoadExample={vi.fn()}
        onOpenImport={vi.fn()}
        onExport={vi.fn()}
        onOpenAbout={onOpenAbout}
        onToggleTheme={vi.fn()}
        onFontSizeChange={vi.fn()}
        onImport={vi.fn()}
        onRemoveHighlightLegend={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'About Hadith Graph Builder' }));
    expect(onOpenAbout).toHaveBeenCalledTimes(1);
  });
});
