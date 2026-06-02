import { describe, it, expect } from 'vitest';
import { starVertices, polygonVertices, spiralVertices } from '../shapes';

const R = 90;
const dist = (x: number, y: number) => Math.hypot(x - R, y - R); // centre is (R, R)

describe('starVertices', () => {
  it('emits 2× the tip count, alternating outer and inner radius', () => {
    const v = starVertices(5, 0.5, R);
    expect(v.length).toBe(10);
    for (let i = 0; i < v.length; i++) {
      const expected = i % 2 === 0 ? R : R * 0.5;
      expect(dist(v[i][0], v[i][1])).toBeCloseTo(expected, 4);
    }
  });

  it('first tip sits at the top (12 o\'clock)', () => {
    const v = starVertices(6, 0.4, R);
    expect(v[0][0]).toBeCloseTo(R, 4);   // centred horizontally
    expect(v[0][1]).toBeCloseTo(0, 4);   // top of the box
  });

  it('clamps points to 3..60', () => {
    expect(starVertices(2, 0.5, R).length).toBe(6);   // min 3 tips → 6 verts
    expect(starVertices(99, 0.5, R).length).toBe(120); // max 60 tips
  });
});

describe('polygonVertices', () => {
  it('emits `sides` vertices all on the outer radius', () => {
    const v = polygonVertices(6, R);
    expect(v.length).toBe(6);
    for (const [x, y] of v) expect(dist(x, y)).toBeCloseTo(R, 4);
  });
});

describe('spiralVertices', () => {
  it('starts at the outer radius and decays inward each wind', () => {
    const v = spiralVertices(3, 0.8, R);
    expect(dist(v[0][0], v[0][1])).toBeCloseTo(R, 4);
    // Last point is the innermost — radius ≈ R·decay^turns.
    const last = dist(v[v.length - 1][0], v[v.length - 1][1]);
    expect(last).toBeCloseTo(R * Math.pow(0.8, 3), 1);
    expect(last).toBeLessThan(R);
  });

  it('is monotonically non-increasing in radius', () => {
    const v = spiralVertices(4, 0.7, R);
    for (let i = 1; i < v.length; i++) {
      expect(dist(v[i][0], v[i][1])).toBeLessThanOrEqual(dist(v[i - 1][0], v[i - 1][1]) + 1e-9);
    }
  });
});
