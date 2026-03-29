import { ChangeEvent, RefObject } from 'react';
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from '../graph';
import type { HadithBundle, HadithReport } from '../types';
import { ReportList } from './ReportList';

type ThemeMode = 'light' | 'dark';

interface RightSidebarProps {
  bundle: HadithBundle;
  theme: ThemeMode;
  isSharedLegendOpen: boolean;
  highlightUsageCounts: Map<string, number>;
  editingReportId: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onNewBundle: () => void;
  onLoadExample: () => void;
  onOpenImport: () => void;
  onExport: () => void;
  onToggleTheme: () => void;
  onToggleSharedLegend: () => void;
  onFontSizeChange: (key: 'narrator' | 'matn', rawValue: string) => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onRemoveHighlightLegend: (legendId: string) => void;
  onStartNewReport: () => void;
  onSelectReport: (report: HadithReport) => void;
  onUseReportAsTemplate: (report: HadithReport) => void;
}

export function RightSidebar({
  bundle,
  theme,
  isSharedLegendOpen,
  highlightUsageCounts,
  editingReportId,
  fileInputRef,
  onNewBundle,
  onLoadExample,
  onOpenImport,
  onExport,
  onToggleTheme,
  onToggleSharedLegend,
  onFontSizeChange,
  onImport,
  onRemoveHighlightLegend,
  onStartNewReport,
  onSelectReport,
  onUseReportAsTemplate,
}: RightSidebarProps) {
  return (
    <aside className="sidebar">
      <section className="panel sidebar-panel">
        <div>
          <h1>Hadith Graph Builder</h1>
          <p className="subtitle">Bundle: {bundle.title}</p>
        </div>
        <div className="actions">
          <button type="button" onClick={onNewBundle}>New Bundle</button>
          <button type="button" onClick={onLoadExample}>Load Example Graph</button>
          <button type="button" onClick={onOpenImport}>Import JSON</button>
          <button type="button" onClick={onExport}>Export JSON</button>
          <button type="button" onClick={onToggleTheme}>
            {theme === 'light' ? 'Dark Theme' : 'Light Theme'}
          </button>
        </div>
        <div className="font-controls">
          <label className="font-control">
            <span>Narrator Font {bundle.fontSizes.narrator}px</span>
            <input
              type="range"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              step={1}
              value={bundle.fontSizes.narrator}
              onChange={(event) => onFontSizeChange('narrator', event.target.value)}
            />
          </label>
          <label className="font-control">
            <span>Matn Font {bundle.fontSizes.matn}px</span>
            <input
              type="range"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              step={1}
              value={bundle.fontSizes.matn}
              onChange={(event) => onFontSizeChange('matn', event.target.value)}
            />
          </label>
        </div>
        <div className="shared-legend">
          <button
            type="button"
            className="shared-legend-toggle"
            onClick={onToggleSharedLegend}
          >
            <span>Highlight Legend</span>
            <span>{isSharedLegendOpen ? 'Hide' : `Show (${bundle.highlightLegend.length})`}</span>
          </button>
          {isSharedLegendOpen ? (
            bundle.highlightLegend.length > 0 ? (
              <div className="shared-legend-list">
                {bundle.highlightLegend.map((entry) => (
                  <div key={entry.id} className="shared-legend-item">
                    <span className="legend-swatch" style={{ backgroundColor: entry.color }} />
                    <span className="shared-legend-label">{entry.label}</span>
                    <span className="shared-legend-count">{highlightUsageCounts.get(entry.id) ?? 0}</span>
                    <button
                      type="button"
                      className="danger-button shared-legend-remove"
                      onClick={() => onRemoveHighlightLegend(entry.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="subtitle">Add highlights from the matn preview to build a shared legend.</p>
            )
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.hadith-graph.json"
          hidden
          onChange={onImport}
        />
      </section>

      <ReportList
        reports={bundle.reports}
        editingReportId={editingReportId}
        highlightLegend={bundle.highlightLegend}
        onStartNewReport={onStartNewReport}
        onSelectReport={onSelectReport}
        onUseReportAsTemplate={onUseReportAsTemplate}
      />
    </aside>
  );
}
