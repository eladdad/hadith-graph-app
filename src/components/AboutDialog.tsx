import { useEffect, type MouseEvent as ReactMouseEvent } from 'react';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({
  isOpen,
  onClose,
}: AboutDialogProps) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="dialog-backdrop" onClick={handleBackdropClick}>
      <div
        className="dialog-panel about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
      >
        <div className="editor-header">
          <div>
            <h2 id="about-dialog-title">About Hadith Graph Builder</h2>
            <p className="subtitle">
              A browser-based workspace for building, annotating, and exporting hadith graphs.
            </p>
          </div>
        </div>

        <div className="about-dialog-body">
          <p>
            The app lets you model isnad relationships as a directed acyclic graph, highlight matn passages, and export these graphs to a JSON file. In modern hadith studies in Western academia, building hadith graphs is usually done as part of ICMA (Isnād-cum-matn analysis).
          </p>
          <p>
            Repository:{' '}
            <a
              href="https://github.com/eladdad/hadith-graph-app"
              target="_blank"
              rel="noreferrer"
            >
              github.com/eladdad/hadith-graph-app
            </a>
          </p>
        </div>

        <div className="editor-actions">
          <button type="button" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
