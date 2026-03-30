import type { CSSProperties } from 'react';
import type { HadithReport } from '../types';
import { LinkifiedText } from './LinkifiedText';

interface ReportNoteCardProps {
  report: HadithReport;
  reportLabel: string;
  onEdit: () => void;
  style?: CSSProperties;
  className?: string;
}

export function ReportNoteCard({
  report,
  reportLabel,
  onEdit,
  style,
  className,
}: ReportNoteCardProps) {
  const hasNote = report.note.length > 0;

  return (
    <section className={className} style={style}>
      <div className="report-note-header">
        <div>
          <h3>{reportLabel} Note</h3>
          <p className="subtitle">
            {hasNote
              ? 'Collection links stay clickable when you view this note.'
              : 'Keep links, collection references, or evaluation notes here.'}
          </p>
        </div>
        <button type="button" onClick={onEdit}>
          {hasNote ? 'Edit Note' : 'Add Note'}
        </button>
      </div>

      {hasNote ? (
        <LinkifiedText className="report-note-body" text={report.note} />
      ) : (
        <p className="report-note-empty">No note yet for this report.</p>
      )}
    </section>
  );
}
