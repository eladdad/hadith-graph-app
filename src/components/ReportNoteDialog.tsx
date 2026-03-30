import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react';

interface ReportNoteDialogProps {
  isOpen: boolean;
  reportLabel: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function ReportNoteDialog({
  isOpen,
  reportLabel,
  value,
  onChange,
  onClose,
  onSave,
}: ReportNoteDialogProps) {
  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSave();
  };

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="dialog-backdrop" onClick={handleBackdropClick}>
      <div
        className="dialog-panel note-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-note-dialog-title"
      >
        <form className="form" onSubmit={handleSubmit}>
          <div className="editor-header">
            <div>
              <h2 id="report-note-dialog-title">{reportLabel} Note</h2>
              <p className="subtitle">Paste collection URLs or write supporting context. URLs become clickable in view mode.</p>
            </div>
          </div>

          <label>
            Note
            <textarea
              dir="auto"
              value={value}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
              placeholder="Add hadith collection links, commentary, or evaluation notes"
              rows={10}
              autoFocus
            />
          </label>

          <div className="editor-actions">
            <button type="submit" className="primary">Save Note</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
