import { ChangeEvent, RefObject, useState } from 'react';
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from '../graph';
import type { HadithBundle } from '../types';

type ThemeMode = 'light' | 'dark';

interface SidebarControlsProps {
  bundle: HadithBundle;
  theme: ThemeMode;
  highlightUsageCounts: Map<string, number>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onNewBundle: () => void;
  onLoadExample: () => void;
  onOpenImport: () => void;
  onExport: () => void;
  onOpenAbout: () => void;
  onToggleTheme: () => void;
  onFontSizeChange: (key: 'narrator' | 'matn', rawValue: string) => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onRemoveHighlightLegend: (legendId: string) => void;
}

export function SidebarControls({
  bundle,
  theme,
  highlightUsageCounts,
  fileInputRef,
  onNewBundle,
  onLoadExample,
  onOpenImport,
  onExport,
  onOpenAbout,
  onToggleTheme,
  onFontSizeChange,
  onImport,
  onRemoveHighlightLegend,
}: SidebarControlsProps) {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);

  return (
    <section className="panel sidebar-panel">
      <div className="sidebar-title-block">
        <div className="sidebar-title-row">
          <h1>Hadith Graph Builder</h1>
          <button
            type="button"
            className="about-button"
            aria-label="About Hadith Graph Builder"
            title="About Hadith Graph Builder"
            onClick={onOpenAbout}
          >
            ?
          </button>
        </div>
        <p className="subtitle">Bundle: {bundle.title}</p>
      </div>

      <div className="options-panel">
        <button
          type="button"
          className="options-toggle"
          aria-expanded={isOptionsOpen}
          onClick={() => setIsOptionsOpen((previous) => !previous)}
        >
          <span>Options</span>
          <span>{isOptionsOpen ? 'Hide' : 'Show'}</span>
        </button>

        {isOptionsOpen ? (
          <div className="options-menu">
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
              <div className="shared-legend-heading">
                <span>Highlight Legend</span>
                <span>{bundle.highlightLegend.length}</span>
              </div>

              {bundle.highlightLegend.length > 0 ? (
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
              )}
            </div>
          </div>
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
  );
}
