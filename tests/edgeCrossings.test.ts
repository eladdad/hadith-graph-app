import { describe, expect, it } from 'vitest';
import { countEdgeCrossings, type CubicRoute } from '../src/edgeCrossings';
import type { Point } from '../src/layerPlacement';

function line(source: string, target: string, start: Point, end: Point): CubicRoute {
  return { source, target, points: [start,
    { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 },
    { x: start.x + (end.x - start.x) * 2 / 3, y: start.y + (end.y - start.y) * 2 / 3 }, end] };
}

describe('visible edge crossing metric', () => {
  it('counts distinct conflicting pairs and ignores parallel or disjoint paths', () => {
    const horizontal = line('a', 'b', { x: 0, y: 5 }, { x: 10, y: 5 });
    const vertical = line('c', 'd', { x: 5, y: 0 }, { x: 5, y: 10 });
    const separate = line('e', 'f', { x: 20, y: 0 }, { x: 20, y: 10 });
    expect(countEdgeCrossings([horizontal, vertical, separate])).toBe(1);
    expect(countEdgeCrossings([horizontal, line('g', 'h', { x: 0, y: 6 }, { x: 10, y: 6 })])).toBe(0);
    expect(countEdgeCrossings([])).toBe(0);
  });

  it('follows curved geometry rather than just the straight endpoint chord', () => {
    const bow: CubicRoute = { source: 'a', target: 'b', points: [
      { x: 0, y: 0 }, { x: 0, y: 8 }, { x: 10, y: 8 }, { x: 10, y: 0 },
    ] };
    expect(countEdgeCrossings([bow, line('c', 'd', { x: 0, y: 4 }, { x: 10, y: 4 })])).toBe(1);
    expect(countEdgeCrossings([bow, line('c', 'd', { x: 0, y: 7 }, { x: 10, y: 7 })])).toBe(0);
  });

  it('counts a cubic chain crossing the same edge repeatedly only once', () => {
    const vertices = [{ x: -3, y: -2 }, { x: -1, y: 2 }, { x: 1, y: -2 }, { x: 3, y: 2 }];
    const chain: CubicRoute = { source: 'a', target: 'b', points: [vertices[0]] };
    for (let index = 1; index < vertices.length; index += 1) {
      chain.points.push(...line('unused', 'unused', vertices[index - 1], vertices[index]).points.slice(1));
    }
    expect(countEdgeCrossings([chain, line('c', 'd', { x: -4, y: 0 }, { x: 4, y: 0 })])).toBe(1);
  });

  it('does not penalize intentional fan-out, merges, or shared graph endpoints', () => {
    const first = line('shared', 'b', { x: 0, y: 0 }, { x: 10, y: 10 });
    for (const ids of [['shared', 'd'], ['c', 'shared'], ['b', 'd'], ['c', 'b']]) {
      expect(countEdgeCrossings([first, line(ids[0], ids[1], { x: 0, y: 10 }, { x: 10, y: 0 })])).toBe(0);
    }
  });

  it('counts collinear overlap and physical contact between unrelated edges as conflicts', () => {
    const first = line('a', 'b', { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(countEdgeCrossings([first, line('c', 'd', { x: 5, y: 0 }, { x: 15, y: 0 })])).toBe(1);
    expect(countEdgeCrossings([first, line('c', 'd', { x: 10, y: 0 }, { x: 15, y: 5 })])).toBe(1);
    expect(countEdgeCrossings([first, line('c', 'd', { x: 11, y: 0 }, { x: 15, y: 0 })])).toBe(0);
  });

  it('preserves narrow crossings and prunes close but separated bounding boxes', () => {
    const first = line('a', 'b', { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(countEdgeCrossings([first, line('c', 'd', { x: 5, y: -0.000001 }, { x: 5, y: 0.000001 })])).toBe(1);
    expect(countEdgeCrossings([first, line('c', 'd', { x: 0, y: 0.00001 }, { x: 10, y: 0.00001 })])).toBe(0);
  });

  it('handles duplicate controls and collinear backtracking without hiding conflicts', () => {
    const duplicateControls: CubicRoute = { source: 'a', target: 'b', points: [
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 10 },
    ] };
    expect(countEdgeCrossings([duplicateControls, line('c', 'd', { x: 0, y: 10 }, { x: 10, y: 0 })])).toBe(1);
    const backtracking: CubicRoute = { source: 'a', target: 'b', points: [
      { x: 2, y: 0 }, { x: -10, y: 0 }, { x: -10, y: 0 }, { x: 3, y: 0 },
    ] };
    expect(countEdgeCrossings([backtracking, line('c', 'd', { x: -5, y: -1 }, { x: -5, y: 1 })])).toBe(1);
    expect(countEdgeCrossings([{ source: 'a', target: 'b', points: Array.from({ length: 7 }, () => ({ x: 0, y: 0 })) }, duplicateControls])).toBe(0);
  });

  it('ignores malformed routes and does not mutate valid inputs or depend on their order', () => {
    const routes = [line('a', 'b', { x: 0, y: 0 }, { x: 10, y: 10 }), line('c', 'd', { x: 0, y: 10 }, { x: 10, y: 0 })];
    const snapshot = JSON.stringify(routes);
    routes.forEach((route) => { route.points.forEach(Object.freeze); Object.freeze(route.points); Object.freeze(route); });
    Object.freeze(routes);
    expect(countEdgeCrossings(routes)).toBe(1);
    expect(countEdgeCrossings([...routes].reverse())).toBe(1);
    expect(JSON.stringify(routes)).toBe(snapshot);
    expect(countEdgeCrossings([
      ...routes,
      { source: 'e', target: 'f', points: [{ x: 0, y: 0 }] },
      { source: 'g', target: 'h', points: [{ x: NaN, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] },
    ])).toBe(1);
  });
});
