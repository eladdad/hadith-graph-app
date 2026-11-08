import { alignVerticalChains } from './verticalAlignment';

interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutLayer {
  y: number;
  nodes: LayoutNode[];
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface Point {
  x: number;
  y: number;
}

interface Block {
  first: number;
  last: number;
  sum: number;
  count: number;
}

/** Keep row order and minimum spacing while staying close to target centers. */
export function separateRowNodes(nodes: { width: number }[], targets: number[], gap: number): number[] {
  const offsets = [0];
  const blocks: Block[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    if (i > 0) {
      offsets[i] = offsets[i - 1] + (nodes[i - 1].width + nodes[i].width) / 2 + gap;
    }
    blocks.push({ first: i, last: i, sum: targets[i] - offsets[i], count: 1 });

    // Subtracting the required spacing turns non-overlap into a monotonicity
    // constraint. Pool conflicting blocks instead of pushing the whole row right.
    while (blocks.length > 1) {
      const right = blocks[blocks.length - 1];
      const left = blocks[blocks.length - 2];
      if (left.sum / left.count <= right.sum / right.count) {
        break;
      }
      blocks.splice(-2, 2, {
        first: left.first,
        last: right.last,
        sum: left.sum + right.sum,
        count: left.count + right.count,
      });
    }
  }

  const positions: number[] = [];
  for (const block of blocks) {
    for (let i = block.first; i <= block.last; i += 1) {
      positions[i] = block.sum / block.count + offsets[i];
    }
  }
  return positions;
}

/**
 * Assign coordinates top-down, including parents on non-adjacent ranks. Roots
 * retain packed positions; descendants prefer the center of their parents.
 * Negative coordinates are allowed here so the caller can shift the entire
 * graph into bounds without breaking vertical alignment.
 */
export function positionLayers(layers: LayoutLayer[], edges: LayoutEdge[], gap: number): Map<string, Point> {
  const parents = new Map<string, Set<string>>();
  for (const { source, target } of edges) {
    if (!parents.has(target)) {
      parents.set(target, new Set());
    }
    parents.get(target)!.add(source);
  }

  const centers = new Map<string, Point>();
  for (const layer of layers) {
    let fallbackX = 0;
    const targets = layer.nodes.map((node) => {
      const xs = [...(parents.get(node.id) ?? [])]
        .sort((a, b) => a.localeCompare(b))
        .flatMap((id) => {
          const center = centers.get(id);
          return center ? [center.x] : [];
        });
      const target = xs.length > 0
        ? xs.reduce((sum, x) => sum + x, 0) / xs.length
        : fallbackX + node.width / 2;
      fallbackX += node.width + gap;
      return target;
    });
    const xs = separateRowNodes(layer.nodes, targets, gap);
    layer.nodes.forEach((node, index) => centers.set(node.id, { x: xs[index], y: layer.y }));
  }
  return alignVerticalChains(layers, edges, centers, gap);
}
