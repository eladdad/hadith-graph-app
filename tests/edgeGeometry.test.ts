import { describe, expect, it } from 'vitest';
import { buildCubicPath, buildVerticalCurve, getVerticalCurvePoints } from '../src/edgeGeometry';

describe('rendered edge geometry', () => {
  it('renders every cubic segment with a common translation and leaves input points untouched', () => {
    const points = [
      { x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 30 }, { x: 40, y: 50 },
      { x: 70, y: 60 }, { x: 90, y: 80 }, { x: 100, y: 100 },
    ];
    const before = JSON.stringify(points);
    points.forEach(Object.freeze);
    Object.freeze(points);
    const curve = buildCubicPath(points, -30, 80);

    expect(curve.path).toBe('M -30 80 C -20 100 0 110 10 130 C 40 140 60 160 70 180');
    const untranslated = buildCubicPath(points);
    expect(curve.labelX).toBeCloseTo(untranslated.labelX - 30, 8);
    expect(curve.labelY).toBeCloseTo(untranslated.labelY + 80, 8);
    expect(JSON.stringify(points)).toBe(before);
  });

  it('places a multi-segment badge halfway along the actual route rather than its endpoint chord', () => {
    // A 30px horizontal segment followed by a 120px vertical segment has
    // its half-length point 45px down the second segment.
    const curve = buildCubicPath([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 },
      { x: 30, y: 40 }, { x: 30, y: 80 }, { x: 30, y: 120 },
    ], 50, -20);

    expect(curve.labelX).toBeCloseTo(80, 8);
    expect(curve.labelY).toBeCloseTo(25, 8);
    expect([curve.labelX, curve.labelY]).not.toEqual([65, 40]);
  });

  it('keeps zero-length routes finite and shares vertical-curve controls with the rendered path', () => {
    const point = { x: 12, y: -4 };
    const collapsed = buildCubicPath([point, point, point, point], 5, 7);
    expect(collapsed).toEqual({ path: 'M 17 3 C 17 3 17 3 17 3', labelX: 17, labelY: 3 });
    const source = Object.freeze({ x: 10, y: 300 });
    const target = Object.freeze({ x: 110, y: 100 });
    expect(getVerticalCurvePoints(source, target, -1)).toEqual([
      source, { x: 10, y: 200 }, { x: 110, y: 200 }, target,
    ]);
    expect(buildVerticalCurve(source, target, -1)).toEqual({
      path: 'M 10 300 C 10 200 110 200 110 100', labelX: 60, labelY: 200,
    });
  });
});
