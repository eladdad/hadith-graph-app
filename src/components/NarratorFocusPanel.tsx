import { Fragment, useMemo, useState } from 'react';
import { buildMatnTextSegments, colorWithAlpha } from '../matnHighlights';
import type { NarratorFocusMode, NarratorOption } from '../narratorFocus';
import type { HadithReport, HighlightLegendItem } from '../types';
import { ReportNoteCard } from './ReportNoteCard';
import '../narratorFocus.css';

interface NarratorFocusControlsProps {
  options: NarratorOption[];
  narrator: string | null;
  mode: NarratorFocusMode;
  onNarratorChange: (name: string | null) => void;
  onModeChange: (mode: NarratorFocusMode) => void;
  matchingReportCount: number;
  totalReportCount: number;
  isCollector: boolean;
  onCollectorChange: (isCollector: boolean) => void;
  collectorDisabled: boolean;
}

function searchableName(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLocaleLowerCase();
}

export function NarratorFocusControls({
  options,
  narrator,
  mode,
  onNarratorChange,
  onModeChange,
  matchingReportCount,
  totalReportCount,
  isCollector,
  onCollectorChange,
  collectorDisabled,
}: NarratorFocusControlsProps) {
  const [query, setQuery] = useState('');
  const visibleOptions = useMemo(() => {
    const search = searchableName(query.trim());
    return options.filter((option) => option.name === narrator || searchableName(option.name).includes(search));
  }, [options, narrator, query]);

  return (
    <section className="narrator-focus-controls" aria-label="Narrator focus">
      <div className="narrator-focus-picker">
        <label>
          <span>Find a narrator</span>
          <input
            type="search"
            aria-label="Search narrators"
            placeholder="Search names…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Focus narrator</span>
          <select
            aria-label="Focus narrator"
            value={narrator ?? ''}
            onChange={(event) => onNarratorChange(event.target.value || null)}
          >
            <option value="">Choose a narrator…</option>
            {visibleOptions.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name} ({option.reportCount})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="narrator-focus-actions">
        <div className="narrator-focus-modes" role="group" aria-label="Narrator focus mode">
          <button
            type="button"
            disabled={!narrator}
            aria-pressed={Boolean(narrator) && mode === 'local'}
            onClick={() => onModeChange('local')}
          >
            Sources &amp; students
          </button>
          <button
            type="button"
            disabled={!narrator}
            aria-pressed={Boolean(narrator) && mode === 'reports'}
            onClick={() => onModeChange('reports')}
          >
            Complete reports
          </button>
        </div>
        <button type="button" disabled={!narrator} onClick={() => {
          setQuery('');
          onNarratorChange(null);
        }}>
          All reports
        </button>
      </div>
      {narrator ? (
        <div className="narrator-collector-setting">
          <label>
            <input
              type="checkbox"
              checked={isCollector}
              onChange={(event) => onCollectorChange(event.target.checked)}
              disabled={collectorDisabled}
              aria-describedby="narrator-collector-help"
            />
            Collector
          </label>
          <p id="narrator-collector-help">
            In Merged, collectors have a separate node for each report. Turn off to merge this narrator across reports.
            {' '}This setting applies to the whole bundle; Trie keeps its prefix-based layout.
          </p>
        </div>
      ) : null}
      <p className="narrator-focus-summary" aria-live="polite">
        {narrator
          ? <><bdi>{narrator}</bdi> appears in {matchingReportCount} of {totalReportCount} reports. Report numbers keep their original bundle numbering.</>
          : 'Choose a narrator, or double-click one in the graph, to explore their reports across all authorities.'}
      </p>
    </section>
  );
}

interface NarratorFocusReportProps {
  report: HadithReport | null;
  reportNumber: number;
  highlightLegend: HighlightLegendItem[];
  matnFontSize: number;
  onEditNote: () => void;
}

export function NarratorFocusReport({ report, reportNumber, highlightLegend, matnFontSize, onEditNote }: NarratorFocusReportProps) {
  const segments = useMemo(() => report ? buildMatnTextSegments(
    report.matn,
    report.matnHighlights,
    new Map(highlightLegend.map((item) => [item.id, item])),
  ) : [], [report, highlightLegend]);

  if (!report) {
    return <p className="narrator-focus-report-empty">Open a report-count badge, then choose a report number to read its wording and source notes.</p>;
  }

  return (
    <section className="narrator-focus-report" aria-label={`Report #${reportNumber} details`}>
      <div className="narrator-focus-section-heading">
        <h3>Report #{reportNumber} wording</h3>
        <p className="focus-report-chain" dir="ltr">
          {report.isnad.map((name, index) => (
            <Fragment key={`${name}-${index}`}>
              {index > 0 ? ' → ' : null}<bdi>{name}</bdi>
            </Fragment>
          ))}
        </p>
      </div>
      <p className="focus-report-matn" dir="auto" style={{ fontSize: `${matnFontSize}px` }}>
        {segments.map((segment, index) => segment.color ? (
          <mark
            key={segment.highlightId ?? index}
            title={segment.label}
            style={{ backgroundColor: colorWithAlpha(segment.color, 0.24), color: 'inherit' }}
          >
            {segment.text}
          </mark>
        ) : <span key={index}>{segment.text}</span>)}
      </p>
      <ReportNoteCard
        className="report-note-card focus-report-note"
        report={report}
        reportLabel={`Report #${reportNumber}`}
        onEdit={onEditNote}
      />
    </section>
  );
}
