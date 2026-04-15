# Hadith Graph App

https://www.hadith-graph.com

A browser-only app for building hadith report graphs as a directed acyclic graph (DAG), editing report text and highlights, and saving everything in a versioned JSON bundle.

## Features

- Create a new in-memory bundle, load the bundled example graph, and import/export `.hadith-graph.json` files.
- Add, edit, delete, and duplicate reports with an isnad chain plus matn text.
- Keep shared narrator nodes merged across reports while the final narrator/collector stays report-specific.
- Automatically rebuild the graph after every report change.
- Prevent narrator cycles during report edits and bundle import.
- Drag nodes to refine layout and snap them to nearby horizontal or vertical anchor lines.
- Resize matn nodes horizontally and persist custom widths in the bundle.
- Highlight normalized matn text with a shared legend of reusable labels and colors.
- Remove legend entries globally and automatically clear matching highlights from reports.
- Show full wrapped matn text when zoomed in and compact highlight markers when zoomed far out.
- Select a report from the graph or the right sidebar and keep its graph nodes, list card, and edges highlighted together.
- Add per-report notes from selected matn nodes and keep URLs clickable in note view.
- Adjust narrator and matn font sizes independently.
- Toggle light and dark theme.

## Graph Controls

- Multi-select with box drag on empty canvas.
- Add to the selection with `Ctrl`/`Cmd`/`Shift` + left click.
- Add to the selection with `Ctrl`/`Cmd`/`Shift` + box drag on empty canvas.
- Drag any selected node to move the full selection together.
- Zoom in or out with `Ctrl` + mouse wheel.
- Scroll the canvas with the mouse wheel.
- Pan by holding the right mouse button. Middle mouse button panning is also supported.
- Click a matn node to select the whole report in the graph, highlight its edges, and open it in the editor.
- Click a report in the right sidebar to select all nodes for that report in the graph and highlight its edges.
- Click the selected matn node's note card to add or edit notes for that report.
- Drag the left or right resize handles on a selected matn node to change its width.

## Bundle Format

The app imports and exports a versioned JSON bundle. The `format` and `version` fields identify the schema, while older optional fields are still accepted and normalized on import.

```json
{
  "format": "hadith-graph-bundle",
  "version": 1,
  "title": "My Hadith Bundle",
  "createdAt": "2026-03-24T18:00:00.000Z",
  "updatedAt": "2026-03-24T18:10:00.000Z",
  "reports": [
    {
      "id": "report-uuid",
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
      "note": "Primary source: https://sunnah.com/bukhari:1",
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
    "c:report-uuid": { "x": 120, "y": 340 },
    "m:report-uuid": { "x": 680, "y": 520 }
  },
  "nodeWidths": {
    "m:report-uuid": 420
  },
  "fontSizes": {
    "narrator": 13,
    "matn": 12
  }
}
```

Bundle rules:

- `reports[].isnad` must contain at least one non-empty narrator string after trimming.
- `reports[].matn` is normalized on import and cannot be empty.
- `reports[].note` is optional; missing notes default to an empty string and note whitespace is normalized.
- `reports[].matnHighlights` reference `highlightLegend[].id` values through `legendId`.
- Highlight ranges are sanitized on import: invalid, unknown, empty, or overlapping ranges are dropped.
- `nodePositions` keys use `n:<narrator name>` for shared narrator nodes, `c:<report id>` for the final collector node in each report, and `m:<report id>` for matn nodes.
- `nodeWidths` currently applies to matn nodes. Width values are clamped to the app's supported range.
- `fontSizes.narrator` and `fontSizes.matn` are clamped to the supported range of `10` to `24`. The defaults are `13` and `12`.
- Bundles that would introduce a narrator cycle are rejected during import.

Compatibility notes:

- Older bundles that omit `highlightLegend`, `matnHighlights`, `note`, `nodePositions`, `nodeWidths`, or `fontSizes` still load.
- Missing `title`, `createdAt`, `updatedAt`, report `id`, and report `createdAt` values are regenerated or defaulted during import.
- Invalid legend colors fall back to a safe default color.
- Older saved collector positions that used `n:<name>` instead of `c:<report id>` still load.
- Older saved matn node keys that used `r:<report id>` still load, but current exports always use `m:<report id>`.

## draw.io Conversion

The repository includes a helper script that converts a saved bundle into a `.drawio` file for diagrams.net:

```bash
python3 drawio_graph_conversion/bundle_to_drawio.py my-bundle.hadith-graph.json -o my-bundle.drawio
```

The converter reads the same bundle schema and carries over saved node positions, matn widths, font sizes, and matn highlight colors.

## Run Locally

```bash
cd hadith-graph-app
npm install
npm run dev
```

Then open the local Vite URL shown in your terminal.

## Test

```bash
npm run test:run
```

## Notes

- Bundles are stored by explicit import/export only; there is no built-in filesystem persistence layer.
- The right sidebar includes quick actions for starting a fresh report, editing a report, and using an existing report as a template for a new one.
