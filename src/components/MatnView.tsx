import { useMemo, useState } from 'react';
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
  const orderedReports = useMemo(
    () => order === 'similarity' ? orderMatnsBySimilarity(reports, legend) : reports,
    [reports, legend, order],
  );
  const reportNumbers = useMemo(() => new Map(reports.map((report, index) => [report.id, index + 1])), [reports]);
  const usedLabels = useMemo(() => new Set(reports.flatMap((report) => report.matnHighlights.map((highlight) => highlight.legendId))), [reports]);
  const activeLegend = legend.filter((entry) => usedLabels.has(entry.id));

  return (
    <section className="graph-card matn-view" aria-label="Matns and highlights">
      <div className="graph-header">
        <div className="graph-toolbar">
          <div className="graph-title-block">
            <h2>Matns &amp; highlights</h2>
            <p>{reports.length} report{reports.length === 1 ? '' : 's'}</p>
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
          {activeLegend.length > 0 ? (
            <ul className="matn-view-legend" aria-label="Matn highlight legend">
              {activeLegend.map((entry) => (
                <li key={entry.id}><i style={{ backgroundColor: entry.color }} aria-hidden="true" />{entry.label}</li>
              ))}
            </ul>
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
        ) : (
          <ol className="matn-reading-list" aria-label="Matns">
            {orderedReports.map((report) => {
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
