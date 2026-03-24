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

This app uses a versioned JSON format:

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
      "createdAt": "2026-03-24T18:05:00.000Z"
    }
  ],
  "nodePositions": {
    "n:Narrator A": { "x": 120, "y": 100 },
    "r:uuid": { "x": 680, "y": 220 }
  },
  "nodeWidths": {
    "r:uuid": 420
  }
}
```

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
- Existing bundles without `nodePositions` or `nodeWidths` are still supported and load with automatic defaults.
