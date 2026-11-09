import { Fragment, useMemo, useState } from 'react';
import { buildMatnTextSegments, colorWithAlpha } from '../matnHighlights';
import type { NarratorFocus, NarratorFocusMode, NarratorOption } from '../narratorFocus';
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
      <p className="narrator-focus-summary" aria-live="polite">
        {narrator
          ? <><bdi>{narrator}</bdi> appears in {matchingReportCount} of {totalReportCount} reports. Report numbers keep their original bundle numbering.</>
          : 'Choose a narrator, or double-click one in the graph, to explore their reports across all authorities.'}
      </p>
    </section>
  );
}

interface NarratorFocusTableProps {
  focus: NarratorFocus;
  selectedReportId?: string | null;
  onSelectReport: (reportId: string) => void;
}

function pairKey(source: string | null, student: string | null): string {
  return JSON.stringify([source, student]);
}

export function NarratorFocusTable({ focus, selectedReportId, onSelectReport }: NarratorFocusTableProps) {
  const sources: Array<string | null> = focus.sources.map((source) => source.name);
  const students: Array<string | null> = focus.students.map((student) => student.name);
  if (focus.cells.some((cell) => cell.source === null)) sources.unshift(null);
  if (focus.cells.some((cell) => cell.student === null)) students.push(null);
  const cells = new Map(focus.cells.map((cell) => [pairKey(cell.source, cell.student), cell.reports]));

  return (
    <section className="narrator-focus-matrix" aria-label="Source and student report table">
      <div className="narrator-focus-section-heading">
        <h3>Reports by source and student</h3>
        <p>Each number identifies a report with that source–student pairing. An empty cell has no report in this bundle.</p>
      </div>
      <div className="narrator-focus-table-scroll" role="region" aria-label="Scrollable source and student table" tabIndex={0}>
        <table>
          <caption className="focus-visually-hidden">Sources and students of {focus.name}</caption>
          <thead>
            <tr>
              <th scope="col">Source ↓ / Student →</th>
              {students.map((student) => (
                <th scope="col" key={student ?? 'recording-source'}>
                  {student ? <bdi>{student}</bdi> : <>Recording source<small>No later named student</small></>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source ?? 'attribution-authority'}>
                <th scope="row">
                  {source ? <bdi>{source}</bdi> : <>Attribution authority<small>No earlier named source</small></>}
                </th>
                {students.map((student) => {
                  const reports = cells.get(pairKey(source, student)) ?? [];
                  return (
                    <td key={student ?? 'recording-source'}>
                      {reports.length > 0 ? (
                        <div className="focus-report-number-list">
                          {reports.map((report) => (
                            <button
                              key={report.id}
                              type="button"
                              className="focus-report-number"
                              aria-label={`Select report #${report.number}`}
                              aria-pressed={report.id === selectedReportId}
                              onClick={() => onSelectReport(report.id)}
                            >
                              #{report.number}
                            </button>
                          ))}
                        </div>
                      ) : <span className="focus-empty-cell" aria-label="No reports">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    return <p className="narrator-focus-report-empty">Choose a report number to read its wording and source notes.</p>;
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
