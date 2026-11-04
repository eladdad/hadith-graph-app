# Graph component options

Research checked on 4 November 2026 against the projects' official repositories and npm package documentation. This is a source-based comparison, not a benchmark or an integration test. No graph dependency was added for the visual revamp.

## Recommendation

Keep the current SVG renderer for this visual change. If we decide to replace it in a separate project, prototype **React Flow (`@xyflow/react`) first**, with **ELK (`elkjs`) only if we also want a different automatic layout**.

This app is an editor with substantial text inside its graph, not just a network of small points. Custom React nodes are a good fit for Arabic matn, inline highlights, note cards, and width controls. React Flow supplies interaction infrastructure that the app currently maintains itself. Its custom-node example and `NodeResizer` implementation demonstrate these extension points. Automatic DAG layout is a separate concern; changing the rendering component alone does not choose better narrator positions.

The attached `moon_split_explorer.html` says it uses Graphviz for transmission layers and explicitly aligns the text-card row. Its spacious page styling can be adopted independently of that layout engine. The revamp does exactly that; it does not copy the explorer's data, view modes, or interactions.

## What we have now

[`GraphCanvas.tsx`](../src/components/GraphCanvas.tsx) renders SVG nodes, edges, measured highlight bands, and resize handles. [`graph.ts`](../src/graph.ts) builds the graph and its text layout; the hooks implement drag, anchor snapping, resizing, selection, and the viewport. [`bundle.ts`](../src/bundle.ts) owns import/export and validation.

The existing bundled example contains 24 reports and renders 101 nodes. This is a useful regression fixture, but is not enough evidence to establish a performance limit or justify a GPU renderer.

| Option | Best fit | Main tradeoff for this app | License |
| --- | --- | --- | --- |
| Current custom SVG | Exact control over the existing text rendering, highlight geometry, and interaction rules | We maintain the viewport, selection, dragging, resizing, and layout code ourselves | Existing project code |
| [React Flow](https://github.com/xyflow/xyflow) | A React graph editor with custom content, selection, dragging, controls, and resizable nodes | Best candidate. Needs a presentation adapter and careful parity work for report selection, snapping, text highlights, saved coordinates, and mouse gestures. Layout remains separate. | MIT core; paid Pro offerings are separate |
| [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) | Network exploration and graph-theory analysis with its own graph model and renderer | Strong candidate if traversal and analysis become central. Wrapped labels are supported, but the current independently colored text spans and editable text cards need additional rendering work. Less natural than React nodes for this text-heavy editor. | MIT |
| [Sigma.js + Graphology](https://github.com/jacomyal/sigma.js) | Large network overviews; Sigma targets thousands of nodes and edges using WebGL | Better for a future overview mode than the primary editor. Rich, resizable matn cards and per-span highlights would require custom programs or synchronized overlays. Any speed benefit with our text-heavy data remains unmeasured. | MIT for Sigma; review companion packages when choosing them |
| [Graphviz via Viz.js](https://github.com/mdaines/viz-js) (`@viz-js/viz`) | Directed transmission diagrams and generated research figures, close to the attached explorer's approach | Worth considering for automatic layout or a generated SVG view. It does not replace the app's drag, resize, selection, and editing layer; rerunning a layout also needs a policy for preserving manual positions. | MIT wrapper; bundled Graphviz has its own notices |

## ELK is a layout engine, not a graph component

[ELK.js](https://github.com/kieler/elkjs) computes positions and edge routes; it does not render or provide interactions. Its layered algorithm targets directed diagrams with ports. It could work with the current SVG or React Flow, so adopting it does not require changing the renderer. Its documented worker support can keep layout computation off the UI thread. License: EPL-2.0.

## What a future prototype must preserve

Use the existing bundle and graph model as the source of truth. Keep renderer-specific state out of exported `.hadith-graph.json` files. The first prototype should prove:

- Shared narrators, report-specific collectors, and cycle rejection behave identically.
- Old bundles import, and positions, widths, font sizes, highlights, and notes survive an export/import round trip.
- Arabic, mixed-direction text, long matn, and individually colored spans render correctly. Text remains consistent with the measured wrapping and resize behavior.
- Report selection still selects the matching nodes and edges; selection, anchor snapping, multi-node drag, and horizontal matn resizing retain their behavior.
- Wheel scrolling, Ctrl + wheel zooming, right/middle-button panning, and the current low-zoom highlight markers retain their behavior.
- Coordinate conversion is explicit: the current model stores node centers; a replacement must either use that origin or adapt to and from it without shifting saved layouts.
- Representative large bundles are profiled on actual target devices before claiming a performance improvement. Measure long-text rendering and interaction latency as well as node count.

A component switch is a separate behavior-sensitive implementation, even when the intended end-user behavior stays the same. This revamp changes CSS and presentation markup only; it leaves `GraphCanvas`, graph construction, bundle validation, and the interaction hooks untouched.

## Sources consulted

Documentation sites were blocked by the environment's domain policy, so research used official upstream files through the allowed GitHub route and npm metadata. Upstream branches can change; these links describe the sources checked, not pinned dependency choices.

- React Flow: [project README and MIT license](https://github.com/xyflow/xyflow#readme), [custom-node example](https://github.com/xyflow/xyflow/blob/main/examples/react/src/examples/CustomNode/index.tsx), [NodeResizer source and API example](https://github.com/xyflow/xyflow/blob/main/packages/react/src/additional-components/NodeResizer/NodeResizer.tsx).
- Cytoscape.js: [project README](https://github.com/cytoscape/cytoscape.js/blob/unstable/README.md), [label wrapping and text styling](https://github.com/cytoscape/cytoscape.js/blob/unstable/documentation/md/style.md), [viewport and initialization options](https://github.com/cytoscape/cytoscape.js/blob/unstable/documentation/md/core/init.md).
- Sigma.js: [WebGL, Graphology, and companion packages](https://github.com/jacomyal/sigma.js#readme), [MIT license](https://github.com/jacomyal/sigma.js/blob/main/LICENSE.txt).
- ELK.js: [layout-only scope, layered layout, and workers](https://github.com/kieler/elkjs#readme), [EPL-2.0 license](https://github.com/kieler/elkjs/blob/master/LICENSE.md).
- Viz.js: [official package README](https://www.npmjs.com/package/@viz-js/viz), retrieved with `npm view @viz-js/viz readme repository.url license version --json` (reported version 3.31.0). The package describes its Graphviz/Emscripten wrapper for Node and the web.
