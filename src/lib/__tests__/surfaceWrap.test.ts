/**
 * Curved-surface unwrap math pins. Exact formulas, arc-length identities
 * (outer arc = π·D, inner arc = π·d within tessellation tolerance) and
 * the repo's closed-outline convention (first point repeated last).
 */
import { describe, expect, it } from 'vitest';
import {
  coneSector,
  cylinderWrap,
  sphereGore,
  SURFACE_WRAP_PRESETS,
} from '../surfaceWrap';

/** Segments whose BOTH endpoints sit at the given radius from the origin. */
function arcLengthAtRadius(
  pts: ReadonlyArray<readonly [number, number]>,
  radius: number,
  eps = 0.5,
): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const r0 = Math.hypot(pts[i][0], pts[i][1]);
    const r1 = Math.hypot(pts[i + 1][0], pts[i + 1][1]);
    if (Math.abs(r0 - radius) < eps && Math.abs(r1 - radius) < eps) {
      len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    }
  }
  return len;
}

describe('cylinderWrap', () => {
  it('develops the full circumference π·D as the width', () => {
    const w = cylinderWrap(50, 100);
    expect(w.type).toBe('cylinder');
    expect(w.widthMm).toBeCloseTo(157.0796, 3);
    expect(w.heightMm).toBe(100);
    expect(w.outline).toHaveLength(5);
    expect(w.outline[0]).toEqual([0, 0]);
    expect(w.outline[4]).toEqual([0, 0]);
    expect(w.outline[2][0]).toBeCloseTo(w.widthMm, 6);
    expect(w.outline[2][1]).toBe(100);
  });

  it('adds seam overlap past the circumference', () => {
    const w = cylinderWrap(50, 100, { overlapMm: 5 });
    expect(w.widthMm).toBeCloseTo(Math.PI * 50 + 5, 6);
  });

  it('throws on non-positive dimensions', () => {
    expect(() => cylinderWrap(0, 100)).toThrow(/diameter/);
    expect(() => cylinderWrap(50, -1)).toThrow(/height/);
  });
});

describe('coneSector', () => {
  it('pins the textbook formulas: R 300, r 240, θ 60° for (100, 80, 60)', () => {
    const c = coneSector(100, 80, 60);
    expect(c.type).toBe('cone');
    expect(c.RMm).toBeCloseTo(300, 6);
    expect(c.rMm).toBeCloseTo(240, 6);
    expect(c.thetaDeg).toBeCloseTo(60, 6);
  });

  it('walks outer and inner arcs of the right lengths (π·D and π·d, ±0.5%)', () => {
    const c = coneSector(100, 80, 60);
    const outer = arcLengthAtRadius(c.outline, c.RMm);
    const inner = arcLengthAtRadius(c.outline, c.rMm);
    expect(outer).toBeGreaterThan(0);
    expect(inner).toBeGreaterThan(0);
    expect(outer / (Math.PI * 100)).toBeCloseTo(1, 2); // within ~1% incl. tessellation
    expect(inner / (Math.PI * 80)).toBeCloseTo(1, 2);
  });

  it('closes the outline with the first point repeated last', () => {
    const c = coneSector(100, 80, 60);
    const first = c.outline[0];
    const last = c.outline[c.outline.length - 1];
    expect(last[0]).toBeCloseTo(first[0], 9);
    expect(last[1]).toBeCloseTo(first[1], 9);
  });

  it('widens θ by the overlap degrees', () => {
    const plain = coneSector(100, 80, 60);
    const overlapped = coneSector(100, 80, 60, { overlapDeg: 5 });
    expect(overlapped.thetaDeg).toBeCloseTo(plain.thetaDeg + 5, 6);
  });

  it('throws when D ≤ d or the slant height is not positive', () => {
    expect(() => coneSector(80, 100, 60)).toThrow(/cone/i);
    expect(() => coneSector(100, 100, 60)).toThrow(/cone/i);
    expect(() => coneSector(100, 80, 0)).toThrow(/slant/);
  });
});

describe('sphereGore', () => {
  it('pins gore height π·D/2 and equator width π·D/n', () => {
    const g = sphereGore(80, 12);
    expect(g.type).toBe('gore');
    expect(g.count).toBe(12);
    expect(g.heightMm).toBeCloseTo((Math.PI * 80) / 2, 6); // 125.66
    expect(g.maxWidthMm).toBeCloseTo((Math.PI * 80) / 12, 6); // 20.94
  });

  it('has zero width at both poles and closes the outline', () => {
    const g = sphereGore(80, 12);
    const first = g.outline[0];
    const last = g.outline[g.outline.length - 1];
    expect(first[0]).toBeCloseTo(0, 9);
    expect(first[1]).toBeCloseTo(0, 9);
    expect(last[0]).toBeCloseTo(0, 9);
    expect(last[1]).toBeCloseTo(0, 9);

    // South pole = max-y sample; its x must also be 0.
    let south = g.outline[0];
    for (const p of g.outline) if (p[1] > south[1]) south = p;
    expect(south[0]).toBeCloseTo(0, 9);
    expect(south[1]).toBeCloseTo(g.heightMm, 3);
  });

  it('reaches the full equator width at mid-height', () => {
    const g = sphereGore(80, 12);
    const mid = g.outline.find(p => Math.abs(p[1] - g.heightMm / 2) < 1e-6);
    expect(mid).toBeDefined();
    expect(Math.abs(mid![0]) * 2).toBeCloseTo(g.maxWidthMm, 6);
  });

  it('clamps segments to 4–24 and throws below 4', () => {
    expect(sphereGore(80, 99).count).toBe(24);
    expect(sphereGore(80, 4.9).count).toBe(4);
    expect(() => sphereGore(80, 3)).toThrow(/segments/);
  });
});

describe('SURFACE_WRAP_PRESETS', () => {
  it('ships the four starter wraps with kind-matched dims', () => {
    const ids = SURFACE_WRAP_PRESETS.map(p => p.id);
    expect(ids).toContain('straight-bottle');
    expect(ids).toContain('tumbler-30oz');
    expect(ids).toContain('wedding-cup');
    expect(ids).toContain('sphere-ornament');
    for (const p of SURFACE_WRAP_PRESETS) {
      expect(['cylinder', 'cone', 'gore']).toContain(p.kind);
      expect(Object.values(p.dims).length).toBeGreaterThan(0);
    }
  });

  it('feeds each preset straight into its constructor', () => {
    const bottle = SURFACE_WRAP_PRESETS.find(p => p.id === 'straight-bottle')!;
    const cyl = cylinderWrap(bottle.dims.diameter!, bottle.dims.height!, { overlapMm: bottle.dims.overlap });
    expect(cyl.widthMm).toBeCloseTo(Math.PI * 70 + 5, 6);

    const tumbler = SURFACE_WRAP_PRESETS.find(p => p.id === 'tumbler-30oz')!;
    const cone = coneSector(tumbler.dims.bottomDiameter!, tumbler.dims.topDiameter!, tumbler.dims.slantHeight!);
    expect(cone.RMm).toBeCloseTo((110 * 95) / 13, 6);

    const ornament = SURFACE_WRAP_PRESETS.find(p => p.id === 'sphere-ornament')!;
    const gore = sphereGore(ornament.dims.diameter!, ornament.dims.segments!);
    expect(gore.count).toBe(12);
  });
});
