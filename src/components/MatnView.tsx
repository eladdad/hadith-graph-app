import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { orderMatnsBySimilarity } from '../matnSimilarity';
import type { HadithReport, HighlightLegendItem } from '../types';
import { HighlightedMatn } from './HighlightedMatn';
import './MatnView.css';

interface MatnViewProps {
  reports: HadithReport[];
  legend: HighlightLegendItem[];
  fontSize: number;
  selectedReportId?: string;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSelectReport: (reportId: string) => void;
}

export function MatnView({ reports, legend, fontSize, selectedReportId, isSidebarOpen, onToggleSidebar, onSelectReport }: MatnViewProps) {
  const [order, setOrder] = useState('similarity');
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [matchElements, setMatchElements] = useState('any');
  const filterDescriptionId = useId();
  // Removing a legend entry must also remove its filter. Keep unused entries
  // selectable so saved edits can correctly leave a filter with no matches.
  const selectedLegendIds = selectedElements.filter((id) => legend.some((entry) => entry.id === id));
  useEffect(() => {
    setSelectedElements((previous) => {
      const next = previous.filter((id) => legend.some((entry) => entry.id === id));
      return next.length === previous.length ? previous : next;
    });
  }, [legend]);
  const orderedReports = useMemo(
    () => order === 'similarity' ? orderMatnsBySimilarity(reports, legend) : reports,
    [reports, legend, order],
  );
  const visibleReports = orderedReports.filter((report) => {
    if (selectedLegendIds.length === 0) return true;
    const reportElements = new Set(report.matnHighlights.map((highlight) => highlight.legendId));
    return matchElements === 'all'
      ? selectedLegendIds.every((id) => reportElements.has(id))
      : selectedLegendIds.some((id) => reportElements.has(id));
  });
  const reportNumbers = useMemo(() => new Map(reports.map((report, index) => [report.id, index + 1])), [reports]);
  const elementCounts = useMemo(() => {
    const counts = new Map<string, number>();
    reports.forEach((report) => {
      new Set(report.matnHighlights.map((highlight) => highlight.legendId)).forEach((id) => {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      });
    });
    return counts;
  }, [reports]);
  const hasFilters = selectedLegendIds.length > 0;

  return (
    <section className="graph-card matn-view" aria-label="Matns and highlights">
      <div className="graph-header">
        <div className="graph-toolbar">
          <div className="graph-title-block">
            <h2>Matns &amp; highlights</h2>
            <p aria-live="polite" aria-atomic="true">{hasFilters ? `${visibleReports.length} of ` : ''}{reports.length} report{reports.length === 1 ? '' : 's'}</p>
          </div>
          <div className="graph-toolbar-actions">
            <label className="matn-order-control">
              <span>Order by</span>
              <select value={order} onChange={(event) => setOrder(event.target.value)}>
                <option value="similarity">Similar highlights</option>
                <option value="bundle">Bundle order</option>
              </select>
            </label>
            <button type="button" onClick={onToggleSidebar}>{isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}</button>
          </div>
        </div>
        <div className="matn-view-guide">
          <p>{order === 'similarity'
            ? 'Matns with shared highlight labels and similar coverage are placed next to each other. Unhighlighted reports appear last.'
            : 'Reports appear in their original bundle order.'}</p>
          {legend.length > 0 ? (
            <fieldset className="matn-element-filters">
              <legend>Filter by matn elements</legend>
              <p>Select highlight labels to show reports containing those elements.</p>
              <div className="matn-filter-actions">
                <label className="matn-order-control">
                  <span>Match elements</span>
                  <select value={matchElements} onChange={(event) => setMatchElements(event.target.value)}>
                    <option value="any">Any selected element</option>
                    <option value="all">All selected elements</option>
                  </select>
                </label>
                <button type="button" disabled={!hasFilters} onClick={() => setSelectedElements([])}>Clear filters</button>
              </div>
              <ul className="matn-view-legend" aria-label="Matn highlight legend">
                {legend.map((entry, index) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      aria-label={`Filter by ${entry.label}`}
                      aria-describedby={`${filterDescriptionId}-${index}`}
                      aria-pressed={selectedLegendIds.includes(entry.id)}
                      onClick={() => setSelectedElements((previous) => previous.includes(entry.id)
                        ? previous.filter((id) => id !== entry.id) : [...previous, entry.id])}
                    >
                      <i style={{ backgroundColor: entry.color }} aria-hidden="true" />
                      <bdi>{entry.label}</bdi>
                      <span id={`${filterDescriptionId}-${index}`} className="matn-element-count" title="Reports containing this element">
                        <span className="matn-filter-count-description">Reports containing this element: </span>{elementCounts.get(entry.id) ?? 0}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : reports.length > 0 ? <p>Add highlights in the report editor to compare patterns here.</p> : null}
        </div>
      </div>
      <div className="matn-reading-scroll">
        {reports.length === 0 ? (
          <div className="matn-view-empty">
            <p className="eyebrow">Read the wordings together</p>
            <h3>Your matns will appear here</h3>
            <p>Create a report in the sidebar, import a bundle, or load the example from Options.</p>
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="matn-view-empty">
            <h3>No matns match these elements</h3>
            <p>Change the selected elements or clear the filters to see all reports.</p>
            <button type="button" onClick={() => setSelectedElements([])}>Show all reports</button>
          </div>
        ) : (
          <ol className="matn-reading-list" aria-label="Matns">
            {visibleReports.map((report) => {
              const reportNumber = reportNumbers.get(report.id);
              const labelIds = new Set(report.matnHighlights.map((highlight) => highlight.legendId));
              const reportLegend = legend.filter((entry) => labelIds.has(entry.id));
              return (
                <li key={report.id} className={`matn-reading-card${selectedReportId === report.id ? ' selected' : ''}`} data-report-id={report.id}>
                  <div className="matn-reading-reference">
                    <button
                      type="button"
                      aria-label={`Edit report #${reportNumber}`}
                      aria-pressed={selectedReportId === report.id}
                      onClick={() => onSelectReport(report.id)}
                    >Report #{reportNumber}</button>
                    <ul className="matn-reading-labels" aria-label={`Report #${reportNumber} highlight labels`}>
                      {reportLegend.length > 0 ? reportLegend.map((entry) => (
                        <li key={entry.id}><i style={{ backgroundColor: entry.color }} aria-hidden="true" />{entry.label}</li>
                      )) : <li className="matn-reading-unhighlighted">No highlights</li>}
                    </ul>
                  </div>
                  <p className="matn-reading-isnad" dir="ltr" aria-label={`Report #${reportNumber} isnad`}>
                    <span className="matn-reading-isnad-label">Isnād: </span>
                    {report.isnad.map((name, index) => (
                      <Fragment key={`${name}-${index}`}>
                        {index > 0 ? ' → ' : null}<bdi>{name}</bdi>
                      </Fragment>
                    ))}
                  </p>
                  <HighlightedMatn
                    className="matn-reading-text"
                    text={report.matn}
                    highlights={report.matnHighlights}
                    legend={legend}
                    dir="auto"
                    style={{ fontSize: `${fontSize}px` }}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="graph-footer"><span>Report numbers follow the bundle. Select a report number to edit its text or highlights.</span></div>
    </section>
  );
}
