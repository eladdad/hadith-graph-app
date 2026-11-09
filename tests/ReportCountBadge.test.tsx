import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReportCountBadge } from '../src/components/ReportCountBadge';

const reports = [
  { id: 'first', number: 7 },
  { id: 'second', number: 21 },
  { id: 'first', number: 7 },
];

describe('report count badges', () => {
  it('counts distinct reports and reveals their original numbers only when opened', async () => {
    const user = userEvent.setup();
    const onSelectReport = vi.fn();
    render(<svg><ReportCountBadge reports={reports} x={100} y={100} label="Test edge" onSelectReport={onSelectReport} selectedReportId="first" /></svg>);
    const badge = screen.getByRole('button', { name: 'Show 2 reports: Test edge' });
    expect(badge).toHaveAttribute('data-report-count', '2');
    expect(screen.queryByRole('button', { name: 'Select report #7' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(badge);
    const popup = screen.getByRole('dialog', { name: 'Reports: Test edge' });
    expect(within(popup).getAllByRole('button', { name: /Select report/ })).toHaveLength(2);
    expect(within(popup).getByRole('button', { name: 'Select report #7' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(popup).getByRole('button', { name: 'Select report #21' }));
    expect(onSelectReport).toHaveBeenCalledExactlyOnceWith('second');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(badge).toHaveFocus();
  });

  it('supports keyboard activation, Escape, outside dismissal and layout changes', async () => {
    const user = userEvent.setup();
    const onSelectReport = vi.fn();
    const view = (revision: number) => <svg><ReportCountBadge reports={reports} x={100} y={100} label="Test edge" onSelectReport={onSelectReport} revision={revision} /></svg>;
    const { rerender } = render(view(1));
    const badge = screen.getByRole('button', { name: 'Show 2 reports: Test edge' });
    badge.focus();
    fireEvent.keyDown(badge, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(badge).toHaveFocus();
    fireEvent.keyDown(badge, { key: ' ' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(badge);
    rerender(view(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSelectReport).not.toHaveBeenCalled();
  });

  it('does not start a node drag or canvas selection while preserving right-button panning', () => {
    const onPointerDown = vi.fn();
    render(<svg onPointerDown={onPointerDown}><ReportCountBadge reports={reports} x={100} y={100} label="Test edge" /></svg>);
    const badge = screen.getByRole('button', { name: 'Show 2 reports: Test edge' });
    fireEvent.pointerDown(badge, { button: 0 });
    expect(onPointerDown).not.toHaveBeenCalled();
    fireEvent.pointerDown(badge, { button: 2 });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('ignores queued scroll events after opening but closes when its SVG anchor actually moves', () => {
    const onSelectReport = vi.fn();
    render(<div data-testid="graph-scroll"><svg>
      <ReportCountBadge reports={reports} x={100} y={100} label="Test edge" onSelectReport={onSelectReport} />
    </svg></div>);
    const badge = screen.getByRole('button', { name: 'Show 2 reports: Test edge' });
    let anchorLeft = 100;
    vi.spyOn(badge, 'getBoundingClientRect').mockImplementation(() => new DOMRect(anchorLeft, 120, 28, 28));
    fireEvent.click(badge);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Browsers can deliver a queued scrollIntoView event after pointer
    // activation. The unchanged anchor means the popup is still positioned.
    fireEvent.scroll(window);
    fireEvent.scroll(screen.getByTestId('graph-scroll'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    anchorLeft += 100;
    fireEvent.scroll(screen.getByTestId('graph-scroll'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSelectReport).not.toHaveBeenCalled();
  });
});
