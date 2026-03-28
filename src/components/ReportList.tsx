import type { HadithReport, HighlightLegendItem } from '../types';
import { HighlightedMatn } from './HighlightedMatn';

interface ReportListProps {
  reports: HadithReport[];
  editingReportId: string | null;
  highlightLegend: HighlightLegendItem[];
  onStartNewReport: () => void;
  onSelectReport: (report: HadithReport) => void;
  onUseReportAsTemplate: (report: HadithReport) => void;
}

export function ReportList({
  reports,
  editingReportId,
  highlightLegend,
  onStartNewReport,
  onSelectReport,
  onUseReportAsTemplate,
}: ReportListProps) {
  return (
    <section className="panel sidebar-panel reports-panel">
      <div className="list-header">
        <h3>Reports ({reports.length})</h3>
        <button type="button" onClick={onStartNewReport}>New</button>
      </div>
      <ol className="report-list">
        {reports.map((report, index) => {
          const selected = editingReportId === report.id;

          return (
            <li key={report.id}>
              <div className={selected ? 'report-card selected' : 'report-card'}>
                <button
                  type="button"
                  className="report-card-main"
                  onClick={() => onSelectReport(report)}
                >
                  <div className="report-chain" dir="auto">{report.isnad.join(' -> ')}</div>
                  <HighlightedMatn
                    className="report-matn"
                    text={report.matn}
                    highlights={report.matnHighlights}
                    legend={highlightLegend}
                    dir="auto"
                  />
                  <div className="report-meta">#{index + 1}</div>
                </button>
                <div className="report-card-actions">
                  <button type="button" onClick={() => onSelectReport(report)}>Edit</button>
                  <button type="button" onClick={() => onUseReportAsTemplate(report)}>Use As Template</button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
