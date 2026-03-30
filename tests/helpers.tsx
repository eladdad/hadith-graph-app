import { fireEvent } from '@testing-library/react';
import type { HadithBundle, HadithReport, RenderableGraph } from '../src/types';

const TEST_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export function makeReport(
  id: string,
  isnad: string[],
  matn: string,
): HadithReport {
  return {
    id,
    isnad,
    matn,
    matnHighlights: [],
    note: '',
    createdAt: TEST_TIMESTAMP,
  };
}

export function makeBundle(
  reports: HadithReport[],
  overrides: Partial<HadithBundle> = {},
): HadithBundle {
  return {
    format: 'hadith-graph-bundle',
    version: 1,
    title: 'Test Bundle',
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    reports,
    highlightLegend: [],
    nodePositions: {},
    nodeWidths: {},
    fontSizes: {
      narrator: 13,
      matn: 12,
    },
    ...overrides,
  };
}

export function getFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('File input not found.');
  }
  return input;
}

export async function importJson(
  container: HTMLElement,
  contents: string,
  filename = 'import.hadith-graph.json',
): Promise<void> {
  const fileInput = getFileInput(container);
  const file = new File([contents], filename, { type: 'application/json' });
  fireEvent.change(fileInput, {
    target: {
      files: [file],
    },
  });
}

export function getGraphNode(container: HTMLElement, nodeId: string): SVGGElement {
  const node = container.querySelector(`[data-node-id="${nodeId}"]`);
  if (!(node instanceof SVGGElement)) {
    throw new Error(`Graph node "${nodeId}" not found.`);
  }
  return node;
}

export function getGraphEdge(container: HTMLElement, edgeId: string): SVGPathElement {
  const edge = container.querySelector(`path[data-edge-id="${edgeId}"]`);
  if (!(edge instanceof SVGElement)) {
    throw new Error(`Graph edge "${edgeId}" not found.`);
  }
  return edge as SVGPathElement;
}

export function makeGraph(overrides: Partial<RenderableGraph> = {}): RenderableGraph {
  return {
    nodes: [],
    edges: [],
    width: 800,
    height: 600,
    hasCycle: false,
    ...overrides,
  };
}
