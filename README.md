# Hadith Graph App (MVP)

A browser-only starter app for plotting hadith report graphs as a directed acyclic graph (DAG).

## Features

- Create a new in-memory bundle
- Add report (`isnad` + `matn`)
- Automatic graph update after each report
- Report (matn) nodes show full wrapped text (no truncation)
- Resize report node width by dragging the node's left/right edge
- DAG guard: rejects reports that introduce narrator cycles
- Drag nodes to manually arrange graph layout
- Multi-select nodes with box/lasso drag on empty canvas
- Multi-select nodes with `Shift/Ctrl/Cmd` + click and drag selected nodes together
- Auto-select newly added report nodes after insertion
- Import from JSON bundle
- Export to JSON bundle

## Bundle format

This app imports and exports a versioned JSON bundle. The `format` and `version`
fields identify the schema, while older optional fields are still accepted and
filled in with safe defaults during import.

```json
{
  "format": "hadith-graph-bundle",
  "version": 1,
  "title": "My Hadith Bundle",
  "createdAt": "2026-03-24T18:00:00.000Z",
  "updatedAt": "2026-03-24T18:10:00.000Z",
  "reports": [
    {
      "id": "uuid",
      "isnad": ["Narrator A", "Narrator B", "Narrator C"],
      "matn": "The report statement",
      "matnHighlights": [
        {
          "id": "highlight-1",
          "legendId": "theme-mercy",
          "start": 4,
          "end": 10
        }
      ],
      "createdAt": "2026-03-24T18:05:00.000Z"
    }
  ],
  "highlightLegend": [
    {
      "id": "theme-mercy",
      "label": "Mercy",
      "color": "#f59e0b"
    }
  ],
  "nodePositions": {
    "n:Narrator A": { "x": 120, "y": 100 },
    "n:Narrator B": { "x": 120, "y": 220 },
    "c:uuid": { "x": 120, "y": 340 },
    "r:uuid": { "x": 680, "y": 220 }
  },
  "nodeWidths": {
    "r:uuid": 420
  },
  "fontSizes": {
    "narrator": 13,
    "matn": 12
  }
}
```

Bundle rules:

- `reports[].isnad` must contain at least one narrator string after trimming.
- `reports[].matn` is normalized on import and cannot be empty.
- `reports[].matnHighlights` reference `highlightLegend[].id` values by `legendId`.
- Highlight ranges are sanitized on import: invalid, unknown, empty, or overlapping ranges are dropped.
- Node IDs in `nodePositions` and `nodeWidths` use `n:<narrator name>` for shared narrator nodes, `c:<report id>` for the final collector node in each report, and `r:<report id>` for report nodes.
- `fontSizes.narrator` and `fontSizes.matn` are clamped to the app's supported range. The current defaults are `13` and `12`.
- Bundles that would introduce a narrator cycle are rejected during import.

Compatibility notes:

- Older bundles that omit `highlightLegend`, `matnHighlights`, `nodePositions`, `nodeWidths`, or `fontSizes` still load.
- Missing `title`, `createdAt`, `updatedAt`, report `id`, and report `createdAt` values are regenerated or defaulted during import.
- Invalid legend colors fall back to a safe default color.
- Older saved `nodePositions` that keyed the final collector as `n:<name>` still load, but future exports should use `c:<report id>`.

## Run locally

```bash
cd hadith-graph-app
npm install
npm run dev
```

Then open the local Vite URL shown in your terminal.

## Notes

- This MVP stores bundles by explicit Import/Export only (no File Picker API dependence).
- Graph nodes include narrators and report nodes.
- Repeated narrator-to-narrator edges are aggregated and shown with edge labels (for example, `x3`).
- Existing bundles with older optional fields missing are still supported and load with automatic defaults.
