export const REPORT_COUNT_BADGE_RADIUS = 14;
export const REPORT_COUNT_BADGE_DIAMETER = REPORT_COUNT_BADGE_RADIUS * 2;

export function getReportCountBadgeRadius(count: number): number {
  const digits = String(Math.max(0, Math.floor(count))).length;
  return Math.max(REPORT_COUNT_BADGE_RADIUS, digits * 3 + 4);
}

interface Point {
  x: number;
  y: number;
}

/** A vertical-tangent Bézier, with its badge anchored to an actual curve point. */
export function buildVerticalCurve(
  source: Point,
  target: Point,
  direction = 1,
  badgeT = 0.5,
): { path: string; labelX: number; labelY: number } {
  const sign = direction >= 0 ? 1 : -1;
  const bend = Math.max(18, Math.abs(target.y - source.y) / 2);
  const control1 = { x: source.x, y: source.y + sign * bend };
  const control2 = { x: target.x, y: target.y - sign * bend };
  const t = Math.min(1, Math.max(0, badgeT));
  const u = 1 - t;
  const at = (axis: 'x' | 'y') => u ** 3 * source[axis]
    + 3 * u ** 2 * t * control1[axis]
    + 3 * u * t ** 2 * control2[axis]
    + t ** 3 * target[axis];
  return {
    path: `M ${source.x} ${source.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${target.x} ${target.y}`,
    labelX: at('x'),
    labelY: at('y'),
  };
}
