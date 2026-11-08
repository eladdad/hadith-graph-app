import type { GraphReportReference } from '../types';

interface ReportNumberLinkProps {
  report: GraphReportReference;
  selectedReportId?: string | null;
  onSelectReport: (reportId: string) => void;
  children: string;
}

export function ReportNumberLink({ report, selectedReportId, onSelectReport, children }: ReportNumberLinkProps) {
  return (
    <tspan
      role="button"
      tabIndex={0}
      aria-label={`Select report #${report.number}`}
      aria-pressed={report.id === selectedReportId}
      data-report-id={report.id}
      className="report-number-link"
      onPointerDown={(event) => {
        // Let right/middle presses reach the canvas for panning, while a
        // primary press on a number must not begin a node drag or selection.
        if (event.button === 0) {
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelectReport(report.id);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onSelectReport(report.id);
        }
      }}
    >
      {children}
    </tspan>
  );
}
