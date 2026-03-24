import {
  ChangeEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import './styles.css';
import { addReportToBundle, bundleToJson, createEmptyBundle, makeExportFilename, parseBundleJson } from './bundle';
import { GraphCanvas } from './components/GraphCanvas';
import { buildRenderableGraph } from './graph';
import { useBoxSelection } from './hooks/useBoxSelection';
import { useNodeDrag } from './hooks/useNodeDrag';
import { useNodeResize } from './hooks/useNodeResize';
import type { GraphNode, HadithBundle } from './types';

function downloadJson(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function App() {
  const [bundle, setBundle] = useState<HadithBundle>(() => createEmptyBundle('My Hadith Bundle'));
  const [isnadText, setIsnadText] = useState('');
  const [matnText, setMatnText] = useState('');
  const [message, setMessage] = useState('Ready. Create reports and drag nodes to arrange your graph.');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const graph = useMemo(
    () => buildRenderableGraph(bundle.reports, bundle.nodePositions, bundle.nodeWidths),
    [bundle.reports, bundle.nodePositions, bundle.nodeWidths],
  );

  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  useEffect(() => {
    const validNodeIds = new Set(graph.nodes.map((node) => node.id));
    setSelectedNodeIds((previous) => {
      const filtered = previous.filter((id) => validNodeIds.has(id));
      return filtered.length === previous.length ? previous : filtered;
    });
  }, [graph.nodes]);

  const clientPointToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const ctm = svg.getScreenCTM();
    if (!ctm) {
      return null;
    }

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }, []);

  const { isDragging, handleNodePointerDown: onNodePointerDownRaw } = useNodeDrag({
    graphNodes: graph.nodes,
    selectedNodeIds,
    setSelectedNodeIds,
    clientPointToSvg,
    setBundle,
    onDragCommitted: (movedCount) => {
      setMessage(`Moved ${movedCount} selected node(s). Export JSON to save this layout.`);
    },
  });

  const { isResizing, handleResizePointerDown: onResizePointerDownRaw } = useNodeResize({
    clientPointToSvg,
    setSelectedNodeIds,
    setBundle,
    onResizeCommitted: () => {
      setMessage('Report node resized. Export JSON to save width and layout.');
    },
  });

  const {
    isBoxSelecting,
    selectionBox,
    handleCanvasPointerDown,
    resetBoxSelection,
  } = useBoxSelection({
    nodes: graph.nodes,
    selectedNodeIds,
    setSelectedNodeIds,
    isDragging,
    isResizing,
    clientPointToSvg,
  });

  const handleNodePointerDown = useCallback((event: ReactPointerEvent<SVGGElement>, nodeId: string): void => {
    if (isBoxSelecting || isResizing) {
      return;
    }
    onNodePointerDownRaw(event, nodeId);
  }, [isBoxSelecting, isResizing, onNodePointerDownRaw]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<SVGRectElement>, node: GraphNode, edge: 'left' | 'right'): void => {
      if (isDragging || isBoxSelecting) {
        return;
      }
      onResizePointerDownRaw(event, node, edge);
    },
    [isDragging, isBoxSelecting, onResizePointerDownRaw],
  );

  const handleNewBundle = (): void => {
    const title = window.prompt('Bundle title', 'My Hadith Bundle');
    const nextBundle = createEmptyBundle(title ?? 'My Hadith Bundle');
    setBundle(nextBundle);
    setIsnadText('');
    setMatnText('');
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage('Started a fresh bundle in memory. Use Export to save it as a file.');
  };

  const handleExport = (): void => {
    const filename = makeExportFilename(bundle);
    downloadJson(filename, bundleToJson(bundle));
    setMessage(`Exported ${filename}`);
  };

  const handleOpenImport = (): void => {
    fileInputRef.current?.click();
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const text = await file.text();
    const parsed = parseBundleJson(text);

    if (!parsed.bundle) {
      setMessage(parsed.error ?? 'Could not import this file.');
      return;
    }

    setBundle(parsed.bundle);
    setSelectedNodeIds([]);
    resetBoxSelection();
    setMessage(`Imported ${file.name} with ${parsed.bundle.reports.length} report(s).`);
  };

  const handleAddReport = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const result = addReportToBundle(bundle, isnadText, matnText);

    if (!result.bundle) {
      setMessage(result.error ?? 'Failed to add report.');
      return;
    }

    setBundle(result.bundle);
    setIsnadText('');
    setMatnText('');

    if (result.addedNodeIds && result.addedNodeIds.length > 0) {
      setSelectedNodeIds(result.addedNodeIds);
      setMessage(`Report added and ${result.addedNodeIds.length} node(s) auto-selected.`);
      return;
    }

    setMessage('Report added and graph updated.');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Hadith Graph Builder</h1>
          <p className="subtitle">Bundle: {bundle.title}</p>
        </div>
        <div className="actions">
          <button type="button" onClick={handleNewBundle}>New Bundle</button>
          <button type="button" onClick={handleOpenImport}>Import JSON</button>
          <button type="button" onClick={handleExport}>Export JSON</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.hadith-graph.json"
          hidden
          onChange={handleImport}
        />
      </header>

      <main className="layout">
        <section className="panel">
          <h2>Add Report</h2>
          <form className="form" onSubmit={handleAddReport}>
            <label>
              Isnad (one narrator per line, or use -&gt;)
              <textarea
                dir="auto"
                value={isnadText}
                onChange={(event) => setIsnadText(event.target.value)}
                placeholder={'Narrator A\nNarrator B\nNarrator C'}
                rows={6}
              />
            </label>
            <label>
              Matn
              <textarea
                dir="auto"
                value={matnText}
                onChange={(event) => setMatnText(event.target.value)}
                placeholder="The report statement"
                rows={5}
              />
            </label>
            <button type="submit" className="primary">Add Report</button>
          </form>

          <div className="status" role="status">{message}</div>

          <div className="list-header">
            <h3>Reports ({bundle.reports.length})</h3>
          </div>
          <ol className="report-list">
            {bundle.reports.map((report, index) => (
              <li key={report.id}>
                <div className="report-chain" dir="auto">{report.isnad.join(' -> ')}</div>
                <div className="report-matn" dir="auto">{report.matn}</div>
                <div className="report-meta">#{index + 1}</div>
              </li>
            ))}
          </ol>
        </section>

        <section className="graph-card">
          <div className="graph-header">
            <h2>Graph</h2>
            <p>
              Nodes: {graph.nodes.length} | Edges: {graph.edges.length}
              {graph.hasCycle ? ' | Warning: cycle detected' : ''}
            </p>
            <p className="hint">Tip: select a report node, then drag its left or right edge to resize text width.</p>
          </div>
          <div className="graph-scroll">
            <GraphCanvas
              graph={graph}
              svgRef={svgRef}
              isBoxSelecting={isBoxSelecting}
              selectionBox={selectionBox}
              selectedSet={selectedSet}
              isDragging={isDragging}
              isResizing={isResizing}
              onCanvasPointerDown={handleCanvasPointerDown}
              onNodePointerDown={handleNodePointerDown}
              onResizePointerDown={handleResizePointerDown}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
