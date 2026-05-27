import { describe, it, expect } from 'vitest';
import { ringToBezierPathD } from '../pathOps';

// Curve refit — the heuristic that boolean op output runs through so a
// polygon-clipping result stays visually "rounded" when the original
// inputs were rounded. We don't assert exact control-point positions
// (the heuristic isn't a precise inverse); we assert structural
// properties: corners stay as L, smooth runs emit C, the output
// always starts with M and ends with Z.

describe('ringToBezierPathD', () => {
  it('returns empty string for an empty ring', () => {
    expect(ringToBezierPathD([])).toBe('');
  });

  it('emits a plain polygon for fewer than 3 points (degenerate)', () => {
    const d = ringToBezierPathD([[0, 0], [10, 10]]);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('L 10 10');
    expect(d.endsWith(' Z')).toBe(true);
    expect(d.includes('C')).toBe(false);
  });

  it('preserves sharp corners as L commands on a square', () => {
    // A square has four 90° corners — every vertex is a "sharp turn", so
    // the refit should keep every segment as L.
    const d = ringToBezierPathD([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith(' Z')).toBe(true);
    expect(d.includes('C')).toBe(false);
    // Four corners → at minimum four L commands (one per edge of the square).
    const lCount = (d.match(/\bL\b/g) ?? []).length;
    expect(lCount).toBeGreaterThanOrEqual(3);
  });

  it('emits C commands when sampled along a circle (sustained curvature)', () => {
    // Sample a 32-sided polygon on the unit circle. Adjacent edges make
    // very gentle ~11° turns — well within the "smooth" threshold — so
    // the refit should emit cubic bezier segments along most of the loop.
    const ring: [number, number][] = [];
    const n = 32;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      ring.push([Math.cos(t) * 100, Math.sin(t) * 100]);
    }
    const d = ringToBezierPathD(ring);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith(' Z')).toBe(true);
    // Should have *some* C commands — the circle is the canonical curve
    // case. We don't assert "all C" because there's a startup edge effect
    // around the starting vertex.
    const cCount = (d.match(/\bC\b/g) ?? []).length;
    expect(cCount).toBeGreaterThan(n / 2);
  });

  it('mixes L and C on a "stadium" (rectangle with rounded ends)', () => {
    // Simulate a stadium shape: two straight sides plus two semicircular
    // ends. Verifies that corners (the join between line and arc) keep L
    // while the arcs become C runs.
    const ring: [number, number][] = [];
    // Top straight edge
    for (let x = -50; x <= 50; x += 5) ring.push([x, 30]);
    // Right semicircle (8 points)
    for (let i = 1; i < 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI;
      ring.push([50 + Math.cos(a) * 30, Math.sin(a) * 30]);
    }
    // Bottom straight edge (reverse direction)
    for (let x = 50; x >= -50; x -= 5) ring.push([x, -30]);
    // Left semicircle
    for (let i = 1; i < 8; i++) {
      const a = Math.PI / 2 + (i / 8) * Math.PI;
      ring.push([-50 + Math.cos(a) * 30, Math.sin(a) * 30]);
    }
    const d = ringToBezierPathD(ring);
    expect(d).toMatch(/^M /);
    expect(d).toMatch(/ Z$/);
    expect(d).toContain('C ');
    expect(d).toContain('L ');
  });
});
