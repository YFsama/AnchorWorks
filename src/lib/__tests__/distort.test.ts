import { describe, it, expect } from 'vitest';
import { roughenPolyline } from '../roughen';
import { zigzagPolyline } from '../zigzag';
import { twistPolyline } from '../twist';

type Pt = [number, number];
// A 100px square (closed: first === last).
const square: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

const closed = (pts: Pt[]) =>
  pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];

describe('roughenPolyline', () => {
  it('size 0 leaves points where they are (only densifies), keeping the loop closed', () => {
    const out = roughenPolyline(square, true, 0, 10);
    expect(out.length).toBeGreaterThanOrEqual(square.length);
    expect(closed(out)).toBe(true);
  });

  it('jitters points within ±size on each axis vs the densified baseline', () => {
    const base = roughenPolyline(square, true, 0, 10);   // size 0 → densified only
    const rough = roughenPolyline(square, true, 3, 10);
    expect(rough.length).toBe(base.length);
    for (let i = 0; i < base.length - 1; i++) {          // last point is forced == first
      expect(Math.abs(rough[i][0] - base[i][0])).toBeLessThanOrEqual(3 + 1e-9);
      expect(Math.abs(rough[i][1] - base[i][1])).toBeLessThanOrEqual(3 + 1e-9);
    }
    expect(closed(rough)).toBe(true);
  });
});

describe('zigzagPolyline', () => {
  it('keeps a closed loop closed and adds points', () => {
    const out = zigzagPolyline(square, true, 4, 8, false);
    expect(out.length).toBeGreaterThanOrEqual(square.length);
    expect(closed(out)).toBe(true);
  });

  it('actually displaces the path (corner profile moves points off the edge)', () => {
    const base = zigzagPolyline(square, true, 0, 8, false);
    const zz = zigzagPolyline(square, true, 5, 8, false);
    const moved = zz.some((p, i) => Math.hypot(p[0] - base[i][0], p[1] - base[i][1]) > 0.5);
    expect(moved).toBe(true);
  });

  it('ridges < 1 is a no-op', () => {
    expect(zigzagPolyline(square, true, 5, 0, false)).toEqual(square);
  });
});

describe('twistPolyline', () => {
  const cx = 50, cy = 50, r = Math.hypot(50, 50);

  it('angle 0 is identity and keeps the loop closed', () => {
    const out = twistPolyline(square, true, cx, cy, r, 0);
    expect(out).toEqual(square);
    expect(closed(out)).toBe(true);
  });

  it('rotates the outer edge by ~the full angle (90° here)', () => {
    const out = twistPolyline(square, true, cx, cy, r, Math.PI / 2);
    // Corner (0,0): radius == R, so it rotates a full 90° about the centre.
    // Rotating (−50,−50) by +90° → (50,−50); + centre (50,50) → (100,0).
    expect(out[0][0]).toBeCloseTo(100, 4);
    expect(out[0][1]).toBeCloseTo(0, 4);
    expect(closed(out)).toBe(true);
  });

  it('preserves each point\'s distance from the centre (pure rotation)', () => {
    const out = twistPolyline(square, true, cx, cy, r, Math.PI / 3);
    for (let i = 0; i < square.length; i++) {
      const d0 = Math.hypot(square[i][0] - cx, square[i][1] - cy);
      const d1 = Math.hypot(out[i][0] - cx, out[i][1] - cy);
      expect(d1).toBeCloseTo(d0, 4);
    }
  });
});
