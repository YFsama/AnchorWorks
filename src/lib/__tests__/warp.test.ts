import { describe, it, expect } from 'vitest';
import { warpArcPoints, warpPoints } from '../warp';

type Pt = [number, number];

describe('warpArcPoints', () => {
  it('leaves the frame edges fixed and lifts the centre most (positive bend)', () => {
    // Three points across a width-100 frame at y=0; bend 1 (=100%).
    const pts: Pt[] = [[0, 0], [50, 0], [100, 0]];
    const out = warpArcPoints(pts, 0, 100, 1);
    expect(out[0][1]).toBeCloseTo(0, 6);    // left edge unmoved
    expect(out[2][1]).toBeCloseTo(0, 6);    // right edge unmoved
    // centre parabola = 1 → dy = -(bend·width·½)·1 = -50
    expect(out[1][1]).toBeCloseTo(-50, 6);
  });

  it('negative bend pushes the centre down by the same magnitude', () => {
    const out = warpArcPoints([[50, 10]], 0, 100, -1);
    expect(out[0][1]).toBeCloseTo(60, 6);   // 10 - (-50) = 60
  });

  it('never moves X and is a no-op for zero width', () => {
    const out = warpArcPoints([[5, 5]], 0, 0, 1);
    expect(out).toEqual([[5, 5]]);
  });
});

describe('warpPoints styles', () => {
  it('rise ramps linearly (centre at half depth)', () => {
    const out = warpPoints([[50, 0]], 0, 100, 1, 'rise'); // nx=0.5 → profile 0.5
    expect(out[0][1]).toBeCloseTo(-25, 6); // -(depth=50)*0.5
  });
  it('flag is a full sine: zero at the ends and the middle', () => {
    expect(warpPoints([[0, 0]], 0, 100, 1, 'flag')[0][1]).toBeCloseTo(0, 6);
    expect(warpPoints([[50, 0]], 0, 100, 1, 'flag')[0][1]).toBeCloseTo(0, 6);
    expect(warpPoints([[25, 0]], 0, 100, 1, 'flag')[0][1]).toBeCloseTo(-50, 6); // sin(π/2)=1
  });
});
