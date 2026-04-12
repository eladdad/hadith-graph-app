import { HIGHLIGHT_COLOR_OPTIONS, getHighlightExcerpt } from '../matnHighlights';
import type { ReportEditorController } from '../hooks/useReportEditor';
import type { HighlightLegendItem } from '../types';
import { HighlightedMatn } from './HighlightedMatn';

interface ReportEditorPanelProps {
  controller: ReportEditorController;
  highlightLegend: HighlightLegendItem[];
  message: string;
}

export function ReportEditorPanel({
  controller,
  highlightLegend,
  message,
}: ReportEditorPanelProps) {
  const selectedPreviewText = controller.previewSelection
    ? controller.normalizedDraftMatn.slice(controller.previewSelection.start, controller.previewSelection.end)
    : '';

  return (
    <section className="panel">
      <div className="editor-header">
        <div>
          <h2>{controller.editingReport ? `Edit Report #${controller.editingReportIndex + 1}` : 'Create Report'}</h2>
          <p className="subtitle">
            {controller.editingReport
              ? 'Update the chain and matn, then save to refresh the graph.'
              : 'Build a chain one narrator at a time, then add the report.'}
          </p>
        </div>
      </div>

      <form className="form" onSubmit={controller.saveReport}>
        <div className="field-group">
          <div className="field-label-row">
            <span className="field-label">Chain</span>
            <button type="button" onClick={controller.addNarrator}>Add Narrator</button>
          </div>

          <div className="chain-editor">
            {controller.editorNarrators.map((narrator, index) => (
              <div className="chain-row" key={`narrator-${index}`}>
                <div className="chain-index">{index + 1}</div>
                <input
                  type="text"
                  dir="auto"
                  value={narrator}
                  onChange={(event) => controller.changeNarrator(index, event.target.value)}
                  placeholder={`Narrator ${index + 1}`}
                />
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => controller.removeNarrator(index)}
                  disabled={controller.editorNarrators.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="chain-preview" dir="auto">{controller.chainPreview}</div>
        </div>

        <label>
          Matn
          <textarea
            dir="auto"
            value={controller.editorMatn}
            onChange={(event) => controller.setMatn(event.target.value)}
            placeholder="The report statement"
            rows={6}
          />
        </label>

        <div className="field-group">
          <div className="field-label-row">
            <span className="field-label">Highlights</span>
            <span className="highlight-selection-note" dir="auto">
              {controller.previewSelection
                ? `"${selectedPreviewText}"`
                : 'Select text in the normalized preview to tag it.'}
            </span>
          </div>

          {highlightLegend.length > 0 ? (
            <div className="highlight-actions">
              {highlightLegend.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="legend-apply-button"
                  onClick={() => controller.applyExistingLegend(entry.id)}
                  disabled={!controller.previewSelection}
                >
                  <span className="legend-swatch" style={{ backgroundColor: entry.color }} />
                  <span>{entry.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="highlight-create">
            <input
              type="text"
              value={controller.newLegendLabel}
              onChange={(event) => controller.setNewLegendLabel(event.target.value)}
              placeholder="New highlight label"
            />
            <div className="color-picker-row">
              <label className="color-picker-field">
                <span>Custom color</span>
                <input
                  type="color"
                  value={controller.newLegendColor}
                  onChange={(event) => controller.setNewLegendColor(event.target.value)}
                  aria-label="Choose custom highlight color"
                />
              </label>
              <span className="color-code">{controller.newLegendColor}</span>
            </div>
            <div className="highlight-color-row">
              {HIGHLIGHT_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.color}
                  type="button"
                  className={controller.newLegendColor === option.color ? 'color-swatch-button selected' : 'color-swatch-button'}
                  onClick={() => controller.setNewLegendColor(option.color)}
                  aria-label={`Use ${option.name}`}
                  title={option.name}
                >
                  <span className="color-swatch-dot" style={{ backgroundColor: option.color }} />
                </button>
              ))}
            </div>
            <button type="button" onClick={controller.createLegendAndApply} disabled={!controller.previewSelection}>
              Create & Apply
            </button>
          </div>

          <HighlightedMatn
            ref={controller.matnPreviewRef}
            className="matn-preview"
            text={controller.normalizedDraftMatn}
            highlights={controller.editorHighlights}
            legend={highlightLegend}
            activeHighlightId={controller.activeHighlightId}
            dir="auto"
            tabIndex={0}
            onMouseUp={controller.capturePreviewSelection}
            onKeyUp={controller.capturePreviewSelection}
          />

          {controller.editorHighlights.length > 0 ? (
            <div className="highlight-chip-list">
              {controller.editorHighlights.map((highlight) => {
                const legend = controller.highlightLegendById.get(highlight.legendId);
                const excerpt = getHighlightExcerpt(controller.normalizedDraftMatn, highlight);
                if (!legend) {
                  return null;
                }

                return (
                  <div key={highlight.id} className={controller.activeHighlightId === highlight.id ? 'highlight-chip active' : 'highlight-chip'}>
                    <button type="button" className="highlight-chip-main" onClick={() => controller.focusHighlight(highlight)}>
                      <span className="legend-swatch" style={{ backgroundColor: legend.color }} />
                      <span className="highlight-chip-label">{legend.label}</span>
                      <span className="highlight-chip-text" dir="auto">{excerpt}</span>
                    </button>
                    <button type="button" className="highlight-chip-remove" onClick={() => controller.removeHighlight(highlight.id)}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="editor-actions">
          <button type="submit" className="primary">
            {controller.editingReport ? 'Save Changes' : 'Add Report'}
          </button>
          {controller.editingReport ? (
            <button type="button" onClick={() => controller.useReportAsTemplate(controller.editingReport!)}>
              Copy To New
            </button>
          ) : null}
          {controller.editingReport ? (
            <button type="button" onClick={controller.startNewReport}>Cancel</button>
          ) : null}
          {controller.editingReport ? (
            <button type="button" className="danger-button" onClick={controller.deleteReport}>
              Delete Report
            </button>
          ) : null}
        </div>
      </form>

      <div className="status" role="status">{message}</div>
    </section>
  );
}
