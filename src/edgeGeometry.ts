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

/** Control points shared by rendering and crossing evaluation. */
export function getVerticalCurvePoints(source: Point, target: Point, direction = 1): Point[] {
  const sign = direction >= 0 ? 1 : -1;
  const bend = Math.max(18, Math.abs(target.y - source.y) / 2);
  return [source, { x: source.x, y: source.y + sign * bend }, { x: target.x, y: target.y - sign * bend }, target];
}

/** A vertical-tangent Bézier, with its badge anchored to an actual curve point. */
export function buildVerticalCurve(
  source: Point,
  target: Point,
  direction = 1,
  badgeT = 0.5,
): { path: string; labelX: number; labelY: number } {
  const [, control1, control2] = getVerticalCurvePoints(source, target, direction);
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

function cubicPoint(points: Point[], index: number, t: number): Point {
  const [a, b, c, d] = points.slice(index, index + 4);
  const u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y,
  };
}

/** Render Graphviz's cubic chain, keeping its report badge on the routed path. */
export function buildCubicPath(points: Point[], offsetX = 0, offsetY = 0): { path: string; labelX: number; labelY: number } {
  const translated = points.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }));
  const commands = [`M ${translated[0].x} ${translated[0].y}`];
  const samples: { index: number; t: number; length: number }[] = [];
  let length = 0;
  let previous = translated[0];
  for (let index = 0; index + 3 < translated.length; index += 3) {
    commands.push(`C ${translated[index + 1].x} ${translated[index + 1].y} ${translated[index + 2].x} ${translated[index + 2].y} ${translated[index + 3].x} ${translated[index + 3].y}`);
    for (let step = 1; step <= 24; step += 1) {
      const point = cubicPoint(translated, index, step / 24);
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      samples.push({ index, t: step / 24, length });
      previous = point;
    }
  }
  const halfLength = length / 2;
  let before = 0;
  let label = translated[0];
  for (const sample of samples) {
    if (sample.length >= halfLength) {
      const fraction = sample.length > before ? (halfLength - before) / (sample.length - before) : 0;
      label = cubicPoint(translated, sample.index, sample.t - (1 - fraction) / 24);
      break;
    }
    before = sample.length;
  }
  return { path: commands.join(' '), labelX: label.x, labelY: label.y };
}
