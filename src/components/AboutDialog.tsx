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
            The app lets you model isnad relationships as a directed acyclic graph, highlight matn passages, and export these graphs to a JSON file. In modern hadith studies in Western academia, building hadith graphs is usually done as part of ICMA (Isnād-cum-matn analysis), a process that seeks to determine when a certain tradition went into circulation.
          </p>
          <div className="about-dialog-section">
            <p className="about-dialog-section-title">Graph controls</p>
            <ul>
              <li>Scroll to pan across the graph, or hold Ctrl while scrolling to zoom in and out around the pointer.</li>
              <li>Drag with the middle or right mouse button to pan the canvas.</li>
              <li>Click a node to select it. Use Shift, Ctrl, or Cmd to add to the selection, or drag on empty space to box-select multiple nodes.</li>
              <li>Click a matn node to select the whole report, load it into the editor, and show its report note card.</li>
              <li>Attribution authorities have a distinct colour. Circular badges show report counts beside authorities, on labelled edges, and above matns. Click a badge to reveal the individual report numbers, then choose one to select that report.</li>
              <li>Search for a narrator or double-click their node to focus. Sources &amp; students places sources above the narrator and students below, with report-count badges on curved edges. Complete reports shows every full chain and matn containing that narrator, across authorities. All reports restores the full graph.</li>
              <li>In Sources &amp; students, click a student to highlight the sources used in their reports. The focused narrator's attribution badge highlights when those reports end at that narrator. Click the student again or use Clear student highlight to reset.</li>
              <li>Options includes Vertical spacing for automatic narrator levels in every view. Export saves this setting; manually positioned narrators keep their saved coordinates.</li>
              <li>Focus views retain the original report numbers. Their node arrangements are separate from the saved full graph layout; exporting JSON always includes the whole bundle.</li>
            </ul>
          </div>
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
