import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getReportCountBadgeRadius } from '../edgeGeometry';
import type { GraphReportReference } from '../types';
import '../reportCountBadge.css';

interface ReportCountBadgeProps {
  reports: GraphReportReference[];
  x: number;
  y: number;
  label: string;
  selectedReportId?: string | null;
  onSelectReport?: (reportId: string) => void;
  revision?: unknown;
  className?: string;
}

const OPEN_EVENT = 'hadith-report-count-open';

export function ReportCountBadge({
  reports,
  x,
  y,
  label,
  selectedReportId,
  onSelectReport,
  revision,
  className,
}: ReportCountBadgeProps) {
  const references = useMemo(() => [...new Map(reports.map((report) => [report.id, report])).values()], [reports]);
  const reportKey = references.map((report) => `${report.id}:${report.number}`).join('|');
  const count = references.length;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<SVGGElement>(null);
  const anchorPositionRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const selected = references.some((report) => report.id === selectedReportId);

  const close = useCallback((restoreFocus = false): void => {
    setOpen(false);
    setPosition(null);
    anchorPositionRef.current = null;
    if (restoreFocus && anchorRef.current?.isConnected) {
      anchorRef.current.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    close();
  }, [close, revision, reportKey]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !popupRef.current) {
      return;
    }
    const anchor = anchorRef.current.getBoundingClientRect();
    anchorPositionRef.current = { left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height };
    const popup = popupRef.current.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const width = popup.width || Math.min(340, window.innerWidth - margin * 2);
    const height = popup.height || 160;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.left + anchor.width / 2 - width / 2));
    const below = window.innerHeight - anchor.bottom - margin - gap;
    const above = anchor.top - margin - gap;
    const proposedTop = height > below && above > below ? anchor.top - height - gap : anchor.bottom + gap;
    const top = Math.max(margin, Math.min(window.innerHeight - height - margin, proposedTop));
    setPosition({ left, top });
  }, [open, reportKey, label]);

  useLayoutEffect(() => {
    if (!open || !position || !popupRef.current) {
      return;
    }
    // Positioning first reveals the portal. Focusing while visibility is
    // hidden is ignored by browsers, so wait for that visible DOM commit.
    const firstButton = popupRef.current.querySelector<HTMLButtonElement>('[data-report-id]:not(:disabled)')
      ?? popupRef.current.querySelector<HTMLButtonElement>('button');
    firstButton?.focus({ preventScroll: true });
  }, [open, position]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const outside = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !anchorRef.current?.contains(target)) {
        close();
      }
    };
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    const moved = (event: Event): void => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) {
        return;
      }
      // A queued scrollIntoView event can arrive after the badge was opened.
      // Only actual movement of its anchor invalidates the fixed popup;
      // scrolling another panel or the popup itself should leave it open.
      const before = anchorPositionRef.current;
      const now = anchorRef.current?.getBoundingClientRect();
      if (!before || !now || Math.abs(before.left - now.left) > 0.5
        || Math.abs(before.top - now.top) > 0.5
        || Math.abs(before.width - now.width) > 0.5
        || Math.abs(before.height - now.height) > 0.5) {
        close();
      }
    };
    const resized = (): void => close();
    const anotherOpened = (event: Event): void => {
      if ((event as CustomEvent<string>).detail !== popupId) {
        close();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener(OPEN_EVENT, anotherOpened);
    window.addEventListener('scroll', moved, true);
    window.addEventListener('resize', resized);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener(OPEN_EVENT, anotherOpened);
      window.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', resized);
    };
  }, [close, open, popupId]);

  const toggle = (): void => {
    if (open) {
      close(true);
    } else {
      document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: popupId }));
      setOpen(true);
    }
  };

  if (count === 0) {
    return null;
  }

  const noun = count === 1 ? 'report' : 'reports';
  return (
    <>
      <g
        ref={anchorRef}
        transform={`translate(${x}, ${y})`}
        className={['report-count-badge', selected ? 'selected' : '', className ?? ''].filter(Boolean).join(' ')}
        data-report-count={count}
        role="button"
        tabIndex={0}
        aria-label={`Show ${count} ${noun}: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onPointerDown={(event) => {
          if (event.button === 0) event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            toggle();
          }
        }}
      >
        <title>{`${count} ${noun} — click to see report numbers`}</title>
        <circle r={getReportCountBadgeRadius(count)} aria-hidden="true" />
        <text textAnchor="middle" dominantBaseline="central" aria-hidden="true">{count}</text>
      </g>
      {open && createPortal(
        <div
          ref={popupRef}
          id={popupId}
          className="report-count-popover"
          role="dialog"
          aria-label={`Reports: ${label}`}
          style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="report-count-popover-header">
            <div>
              <h3>{count} {noun}</h3>
              <p>{label}</p>
            </div>
            <button type="button" aria-label="Close report list" onClick={() => close(true)}>×</button>
          </div>
          <div className="report-count-popover-list">
            {references.map((report) => (
              <button
                key={report.id}
                type="button"
                data-report-id={report.id}
                className="report-count-option"
                aria-label={`Select report #${report.number}`}
                aria-pressed={report.id === selectedReportId}
                disabled={!onSelectReport}
                onClick={() => {
                  onSelectReport?.(report.id);
                  close(true);
                }}
              >
                #{report.number}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
