import type { Point } from './layerPlacement';

export interface CubicRoute {
  source: string;
  target: string;
  /** A cubic chain: the initial point followed by three points per segment. */
  points: Point[];
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Segment extends Bounds {
  start: Point;
  end: Point;
}

interface PreparedRoute extends Bounds {
  source: string;
  target: string;
  segments: Segment[];
}

const FLATNESS = 0.5;
const MAX_DEPTH = 8;
const EPSILON = 1e-9;

function bounds(start: Point, end: Point): Bounds {
  return {
    minX: Math.min(start.x, end.x), maxX: Math.max(start.x, end.x),
    minY: Math.min(start.y, end.y), maxY: Math.max(start.y, end.y),
  };
}

function overlap(a: Bounds, b: Bounds): boolean {
  return a.maxX >= b.minX - EPSILON && b.maxX >= a.minX - EPSILON
    && a.maxY >= b.minY - EPSILON && b.maxY >= a.minY - EPSILON;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function isFlat(a: Point, b: Point, c: Point, d: Point): boolean {
  const dx = d.x - a.x;
  const dy = d.y - a.y;
  const squaredLength = dx * dx + dy * dy;
  if (squaredLength === 0) {
    return Math.hypot(b.x - a.x, b.y - a.y) <= FLATNESS
      && Math.hypot(c.x - a.x, c.y - a.y) <= FLATNESS;
  }
  return [b, c].every((point) => {
    const x = point.x - a.x;
    const y = point.y - a.y;
    const projection = x * dx + y * dy;
    const cross = x * dy - y * dx;
    // Collinear controls outside the chord can backtrack; do not flatten
    // those into a shortcut that hides overlapping or crossing routes.
    return projection >= 0 && projection <= squaredLength
      && cross * cross <= FLATNESS * FLATNESS * squaredLength;
  });
}

function flatten(a: Point, b: Point, c: Point, d: Point, segments: Segment[], depth = 0): void {
  if (depth >= MAX_DEPTH || isFlat(a, b, c, d)) {
    if (a.x !== d.x || a.y !== d.y) segments.push({ start: a, end: d, ...bounds(a, d) });
    return;
  }
  const ab = midpoint(a, b);
  const bc = midpoint(b, c);
  const cd = midpoint(c, d);
  const abc = midpoint(ab, bc);
  const bcd = midpoint(bc, cd);
  const centre = midpoint(abc, bcd);
  flatten(a, ab, abc, centre, segments, depth + 1);
  flatten(centre, bcd, cd, d, segments, depth + 1);
}

function prepare(route: CubicRoute): PreparedRoute | null {
  if (route.points.length < 4 || (route.points.length - 1) % 3 !== 0
    || route.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const segments: Segment[] = [];
  for (let index = 0; index + 3 < route.points.length; index += 3) {
    flatten(route.points[index], route.points[index + 1], route.points[index + 2], route.points[index + 3], segments);
  }
  if (segments.length === 0) return null;
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const segment of segments) {
    box.minX = Math.min(box.minX, segment.minX);
    box.maxX = Math.max(box.maxX, segment.maxX);
    box.minY = Math.min(box.minY, segment.minY);
    box.maxY = Math.max(box.maxY, segment.maxY);
  }
  segments.sort((a, b) => a.minY - b.minY || a.maxY - b.maxY);
  return { source: route.source, target: route.target, segments, ...box };
}

function orientation(a: Point, b: Point, c: Point): number {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(cross) <= EPSILON ? 0 : Math.sign(cross);
}

function onSegment(point: Point, segment: Segment): boolean {
  return point.x >= segment.minX - EPSILON && point.x <= segment.maxX + EPSILON
    && point.y >= segment.minY - EPSILON && point.y <= segment.maxY + EPSILON;
}

function intersects(a: Segment, b: Segment): boolean {
  if (!overlap(a, b)) return false;
  const first = orientation(a.start, a.end, b.start);
  const second = orientation(a.start, a.end, b.end);
  const third = orientation(b.start, b.end, a.start);
  const fourth = orientation(b.start, b.end, a.end);
  return (first * second < 0 && third * fourth < 0)
    || (first === 0 && onSegment(b.start, a))
    || (second === 0 && onSegment(b.end, a))
    || (third === 0 && onSegment(a.start, b))
    || (fourth === 0 && onSegment(a.end, b));
}

function routesIntersect(first: PreparedRoute, second: PreparedRoute): boolean {
  // Most graph edges cross several ranks. Sweep segment Y bounds so curves
  // spanning the same ranks do not require every segment combination.
  let start = 0;
  for (const segment of first.segments) {
    while (start < second.segments.length && second.segments[start].maxY < segment.minY - EPSILON) start += 1;
    for (let index = start; index < second.segments.length; index += 1) {
      const other = second.segments[index];
      if (other.minY > segment.maxY + EPSILON) break;
      if (intersects(segment, other)) return true;
    }
  }
  return false;
}

/**
 * Count conflicting edge pairs, including collinear overlap, once per pair.
 * Curves are flattened to half a world pixel with bounded subdivision. Edges
 * sharing a graph endpoint are excluded because their junction is intentional.
 */
export function countEdgeCrossings(routes: readonly CubicRoute[]): number {
  const prepared = routes.map(prepare).filter((route): route is PreparedRoute => route !== null);
  let count = 0;
  for (let index = 0; index < prepared.length; index += 1) {
    const first = prepared[index];
    for (let other = index + 1; other < prepared.length; other += 1) {
      const second = prepared[other];
      if (first.source === second.source || first.source === second.target
        || first.target === second.source || first.target === second.target || !overlap(first, second)) continue;
      if (routesIntersect(first, second)) count += 1;
    }
  }
  return count;
}
