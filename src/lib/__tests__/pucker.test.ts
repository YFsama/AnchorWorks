import { describe, it, expect } from 'vitest';
import { centroidOf, puckerBloatPolyline } from '../pucker';

// A unit square centred on the origin (closed, with the repeated first point).
const SQUARE: [number, number][] = [
  [-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10],
];

describe('centroidOf', () => {
  it('ignores the duplicated closing point', () => {
    expect(centroidOf(SQUARE)).toEqual([0, 0]);
  });
});

describe('puckerBloatPolyline', () => {
  it('is a no-op when amount is 0', () => {
    expect(puckerBloatPolyline(SQUARE, true, 0)).toEqual(SQUARE);
  });

  it('keeps the original anchors in place (t=0 of each edge)', () => {
    const out = puckerBloatPolyline(SQUARE, true, 0.5);
    // Every original corner must still appear exactly in the output.
    for (const corner of [[-10, -10], [10, -10], [10, 10], [-10, 10]]) {
      expect(out.some(([x, y]) => Math.abs(x - corner[0]) < 1e-9 && Math.abs(y - corner[1]) < 1e-9)).toBe(true);
    }
  });

  it('bloat pushes edge midpoints outward (farther from centre)', () => {
    const out = puckerBloatPolyline(SQUARE, true, 0.5);
    // The midpoint of the top edge starts at (0,-10), r=10. Bloat → r>10.
    const maxR = Math.max(...out.map(([x, y]) => Math.hypot(x, y)));
    expect(maxR).toBeGreaterThan(10.1);
  });

  it('pucker pulls edge midpoints inward (closer to centre)', () => {
    const out = puckerBloatPolyline(SQUARE, true, -0.5);
    // Edge midpoints move toward 0; the smallest radius drops below the
    // anchor radius (~14.14 at corners, 10 at midpoints originally).
    const minR = Math.min(...out.map(([x, y]) => Math.hypot(x, y)));
    expect(minR).toBeLessThan(9.9);
  });

  it('keeps a closed loop closed', () => {
    const out = puckerBloatPolyline(SQUARE, true, 0.5);
    expect(out[0]).toEqual(out[out.length - 1]);
  });
});
