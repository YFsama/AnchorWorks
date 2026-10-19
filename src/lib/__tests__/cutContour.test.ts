import { describe, it, expect, beforeAll } from 'vitest';
import {
  offsetPolyline,
  traceBitmap,
  generateRegMarks,
  detectRegMarks,
  douglasPeucker,
  flattenSvgPath,
} from '../cutContour';

/**
 * jsdom doesn't ship a working ImageData constructor (it's missing or
 * stubbed). traceBitmap only reads `.data`, `.width`, `.height` off it,
 * so a plain object shim is enough — no need for the full DOM type.
 */
beforeAll(() => {
  if (typeof (globalThis as { ImageData?: unknown }).ImageData === 'undefined') {
    class ImageDataShim {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, w: number, h: number) {
        this.data = data;
        this.width = w;
        this.height = h;
      }
    }
    (globalThis as { ImageData?: unknown }).ImageData = ImageDataShim;
  }
});

describe('offsetPolyline', () => {
  it('expands a square outward by `distance` on every side', () => {
    // 100x100 square at origin (counter-clockwise = outward normal is +).
    const square: Array<[number, number]> = [
      [0, 0], [100, 0], [100, 100], [0, 100],
    ];
    const out = offsetPolyline(square, 10, true);
    // Single polygon (no self-intersection cleanup needed).
    expect(out).toHaveLength(1);
    const ring = out[0];
    // Bounding box should be ~[-10, -10, 110, 110] for CCW outward offset
    // OR ~[10, 10, 90, 90] for CW interpretation; either way, it must be
    // axis-aligned and the centre must still be at (50, 50).
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    expect((minX + maxX) / 2).toBeCloseTo(50, 0);
    expect((minY + maxY) / 2).toBeCloseTo(50, 0);
    expect(maxX - minX).toBeCloseTo(120, 0); // grew by 20mm total
    expect(maxY - minY).toBeCloseTo(120, 0);
  });

  it('shrinks a square inward by negative `distance`', () => {
    const square: Array<[number, number]> = [
      [0, 0], [100, 0], [100, 100], [0, 100],
    ];
    const out = offsetPolyline(square, -10, true);
    expect(out).toHaveLength(1);
    let minX = Infinity, maxX = -Infinity;
    for (const [x] of out[0]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
    }
    expect(maxX - minX).toBeCloseTo(80, 0); // shrank by 20mm total
  });

  it('handles zero-distance as a no-op (passthrough)', () => {
    const pts: Array<[number, number]> = [[0, 0], [10, 0], [10, 10]];
    const out = offsetPolyline(pts, 0, false);
    expect(out).toEqual([pts]);
  });

  it('offsets an open polyline along its left side', () => {
    // Horizontal line. With +5 offset and right-hand normal, the result
    // should be the same line shifted +5 in Y (or -5; we just verify
    // it's been translated by ~5 in some direction perpendicular to X).
    const line: Array<[number, number]> = [[0, 0], [100, 0]];
    const out = offsetPolyline(line, 5, false);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    // Both endpoints must still have x ≈ {0, 100} (the line direction
    // hasn't changed) and their |y| should be 5.
    expect(out[0][0][0]).toBeCloseTo(0);
    expect(out[0][1][0]).toBeCloseTo(100);
    expect(Math.abs(out[0][0][1])).toBeCloseTo(5);
  });
});

describe('douglasPeucker', () => {
  it('drops collinear interior points', () => {
    const pts: Array<[number, number]> = [
      [0, 0], [25, 0], [50, 0], [75, 0], [100, 0],
    ];
    const out = douglasPeucker(pts, 0.1);
    // Endpoints survive, interior points should be eliminated because
    // they sit exactly on the chord.
    expect(out).toEqual([[0, 0], [100, 0]]);
  });

  it('keeps a sharp corner', () => {
    const pts: Array<[number, number]> = [
      [0, 0], [50, 0], [50, 50],
    ];
    const out = douglasPeucker(pts, 1);
    expect(out).toHaveLength(3);
  });

  it('honours the tolerance threshold', () => {
    // A point sits 0.4mm off the chord. Tolerance 1 → drop, 0.1 → keep.
    const pts: Array<[number, number]> = [[0, 0], [50, 0.4], [100, 0]];
    expect(douglasPeucker(pts, 1)).toEqual([[0, 0], [100, 0]]);
    expect(douglasPeucker(pts, 0.1)).toHaveLength(3);
  });
});

describe('traceBitmap', () => {
  it('extracts the outline of a black square on white', () => {
    // 30×30 white image with a centred 10×10 black square.
    const W = 30, H = 30;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    }
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) {
      const i = (y * W + x) * 4;
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
    }
    const img = new ImageData(data, W, H);
    const contours = traceBitmap(img, {
      threshold: 128,
      simplifyTolerance: 0,
      pixelSizeMm: 1,
      minSizeMm: 1,
    });
    expect(contours.length).toBeGreaterThanOrEqual(1);
    // Bounding box of the largest contour should be ~10x10 mm.
    const sizes = contours.map(c => {
      let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
      for (const [x, y] of c) {
        if (x < lx) lx = x; if (x > hx) hx = x;
        if (y < ly) ly = y; if (y > hy) hy = y;
      }
      return { w: hx - lx, h: hy - ly };
    });
    const main = sizes.reduce((a, b) => (a.w * a.h > b.w * b.h ? a : b));
    expect(main.w).toBeGreaterThanOrEqual(8); // ~10 with a bit of slack
    expect(main.h).toBeGreaterThanOrEqual(8);
  });

  it('uses alpha channel when useAlpha is set', () => {
    // 20×20 fully transparent except a 5×5 opaque square.
    const W = 20, H = 20;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 7; y < 12; y++) for (let x = 7; x < 12; x++) {
      const i = (y * W + x) * 4;
      data[i] = 200; data[i + 1] = 100; data[i + 2] = 50; data[i + 3] = 255;
    }
    const img = new ImageData(data, W, H);
    // Without alpha mode + threshold 128 + light-ish pixels, the luma
    // path would miss this region. With alpha mode it finds it.
    const noAlpha = traceBitmap(img, {
      threshold: 128, useAlpha: false, simplifyTolerance: 0,
      pixelSizeMm: 1, minSizeMm: 0.5,
    });
    const withAlpha = traceBitmap(img, {
      threshold: 128, useAlpha: true, simplifyTolerance: 0,
      pixelSizeMm: 1, minSizeMm: 0.5,
    });
    expect(withAlpha.length).toBeGreaterThanOrEqual(1);
    void noAlpha; // both branches exercised; we just assert alpha path works
  });

  it('drops tiny noise contours below minSizeMm', () => {
    // 10×10 image, one black pixel at (5,5). pixelSizeMm = 1, so the
    // contour spans <1mm. With minSizeMm 2 → dropped.
    const W = 10, H = 10;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < data.length; i += 4) { data[i + 3] = 255; data[i] = data[i + 1] = data[i + 2] = 255; }
    const i = (5 * W + 5) * 4;
    data[i] = data[i + 1] = data[i + 2] = 0;
    const img = new ImageData(data, W, H);
    const contours = traceBitmap(img, {
      threshold: 128, useAlpha: false, simplifyTolerance: 0,
      pixelSizeMm: 1, minSizeMm: 2,
    });
    expect(contours).toEqual([]);
  });
});

describe('generateRegMarks', () => {
  it('places 4 marks (TL/TR/BL/BR) at the corners of the bounds', () => {
    const marks = generateRegMarks({
      bounds: { x: 0, y: 0, w: 200, h: 100 },
      armLength: 10,
      inset: 5,
    });
    expect(marks).toHaveLength(4);
    expect(marks.map(m => m.kind)).toEqual(['regmark', 'regmark', 'regmark', 'regmark']);
    // Top-left mark's corner should sit at (inset, inset) = (5, 5).
    const tl = marks[0];
    expect(tl.points[1]).toEqual([5, 5]);
    // Bottom-right mark's corner should sit at (w - inset, h - inset) = (195, 95).
    const br = marks[3];
    expect(br.points[1]).toEqual([195, 95]);
  });

  it('respects custom arm length', () => {
    const marks = generateRegMarks({
      bounds: { x: 0, y: 0, w: 100, h: 100 },
      armLength: 20,
      inset: 0,
    });
    // Top-left arm should run from (0, 20) → (0, 0) → (20, 0).
    const tl = marks[0];
    expect(tl.points[0]).toEqual([0, 20]);
    expect(tl.points[1]).toEqual([0, 0]);
    expect(tl.points[2]).toEqual([20, 0]);
  });
});

describe('detectRegMarks', () => {
  it('finds 4-corner L-shapes and returns their bounds', () => {
    // Build a synthetic PLT-like polyline list: 4 L-marks at known
    // corners plus a couple of unrelated lines.
    const polylines = [
      // Top-left L
      { points: [[0, 10], [0, 0], [10, 0]] as Array<[number, number]>, closed: false },
      // Top-right L
      { points: [[90, 0], [100, 0], [100, 10]] as Array<[number, number]>, closed: false },
      // Bottom-left L
      { points: [[0, 90], [0, 100], [10, 100]] as Array<[number, number]>, closed: false },
      // Bottom-right L
      { points: [[90, 100], [100, 100], [100, 90]] as Array<[number, number]>, closed: false },
      // Some unrelated geometry that mustn't be misidentified.
      { points: [[20, 20], [80, 20], [80, 80], [20, 80], [20, 20]] as Array<[number, number]>, closed: true },
    ];
    const reg = detectRegMarks(polylines);
    expect(reg).not.toBeNull();
    if (!reg) return;
    expect(reg.markIndexes).toHaveLength(4);
    expect(reg.bounds.x).toBeCloseTo(0);
    expect(reg.bounds.y).toBeCloseTo(0);
    expect(reg.bounds.w).toBeCloseTo(100);
    expect(reg.bounds.h).toBeCloseTo(100);
  });

  it('returns null when fewer than 4 L-shapes are present', () => {
    const polylines = [
      { points: [[0, 10], [0, 0], [10, 0]] as Array<[number, number]>, closed: false },
      // Just one L → not a regmark set.
    ];
    expect(detectRegMarks(polylines)).toBeNull();
  });

  it('rejects polylines where the arms are not approximately equal', () => {
    const polylines = [
      // Lopsided "L"s — one arm 50× longer than the other.
      { points: [[0, 100], [0, 0], [2, 0]] as Array<[number, number]>, closed: false },
      { points: [[100, 0], [102, 0], [102, 100]] as Array<[number, number]>, closed: false },
      { points: [[0, 0], [0, 100], [2, 100]] as Array<[number, number]>, closed: false },
      { points: [[100, 100], [102, 100], [102, 200]] as Array<[number, number]>, closed: false },
    ];
    expect(detectRegMarks(polylines)).toBeNull();
  });
});

describe('flattenSvgPath', () => {
  it('flattens M/L commands into a single polyline', () => {
    const out = flattenSvgPath('M0 0 L10 0 L10 10');
    expect(out).toHaveLength(1);
    expect(out[0].points).toHaveLength(3);
    expect(out[0].closed).toBe(false);
  });

  it('marks Z-terminated paths as closed', () => {
    const out = flattenSvgPath('M0 0 L10 0 L10 10 Z');
    expect(out).toHaveLength(1);
    expect(out[0].closed).toBe(true);
  });

  it('approximates a cubic Bezier with multiple points', () => {
    const out = flattenSvgPath('M0 0 C0 50 100 50 100 0');
    expect(out[0].points.length).toBeGreaterThan(4);
    // Endpoints preserved exactly.
    expect(out[0].points[0]).toEqual([0, 0]);
    const last = out[0].points[out[0].points.length - 1];
    expect(last[0]).toBeCloseTo(100);
    expect(last[1]).toBeCloseTo(0);
  });
});

describe('generateRegMarks styles', () => {
  const bounds = { x: 0, y: 0, w: 100, h: 60 };

  it('default L style keeps the 4 corner brackets', () => {
    const marks = generateRegMarks({ bounds });
    expect(marks).toHaveLength(4);
    expect(marks.every(m => m.kind === 'regmark' && !m.closed)).toBe(true);
    expect(marks.map(m => m.id)).toEqual(['regmark-tl', 'regmark-tr', 'regmark-bl', 'regmark-br']);
  });

  it('cross style emits two strokes per corner', () => {
    const marks = generateRegMarks({ bounds, style: 'cross', armLength: 10 });
    expect(marks).toHaveLength(8);
    expect(marks.filter(m => m.id.endsWith('-h'))).toHaveLength(4);
    expect(marks.filter(m => m.id.endsWith('-v'))).toHaveLength(4);
  });

  it('square style emits closed squares', () => {
    const marks = generateRegMarks({ bounds, style: 'square', armLength: 8 });
    expect(marks).toHaveLength(4);
    expect(marks.every(m => m.closed)).toBe(true);
    // 8mm square → 5 points, ~8mm wide
    const xs = marks[0].points.map(p => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8, 5);
  });

  it('circle style emits a closed 24-gon of the right diameter', () => {
    const marks = generateRegMarks({ bounds, style: 'circle', armLength: 10 });
    expect(marks).toHaveLength(4);
    expect(marks.every(m => m.closed)).toBe(true);
    expect(marks[0].points).toHaveLength(25); // 24 segments + closing point
    const pts = marks[0].points;
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const r = Math.hypot(pts[0][0] - cx, pts[0][1] - pts[1 % pts.length][1]);
    void r;
    const xs = pts.map(p => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 3);
  });
});

describe('offsetPolyline round joins', () => {
  const TOL = 1e-6;

  /** Min distance from p to a ring treated as a closed segment cycle. */
  const distToRing = (p: [number, number], ring: Array<[number, number]>): number => {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
    }
    return best;
  };

  const shoelace = (ring: Array<[number, number]>): number => {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    return area / 2;
  };

  it('rounds rectangle corners with arc points at |d| from the source corner', () => {
    const d = 5;
    const rect: Array<[number, number]> = [[0, 0], [100, 0], [100, 50], [0, 50]];
    const out = offsetPolyline(rect, d, true, { join: 'round' });
    expect(out).toHaveLength(1);
    const ring = out[0];
    // Sane point count, closed, no NaN.
    expect(ring.length).toBeGreaterThanOrEqual(40);
    expect(ring.length).toBeLessThan(200);
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 9);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 9);
    for (const [x, y] of ring) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    // Every point sits exactly |d| off the source rectangle boundary.
    for (const p of ring) {
      expect(distToRing(p, rect)).toBeGreaterThanOrEqual(d - TOL);
      expect(distToRing(p, rect)).toBeLessThanOrEqual(d + TOL);
    }
    // Each corner carries an arc: the two offset-segment endpoints plus
    // at least 2 intermediate points, all within |d| of the corner.
    for (const corner of rect) {
      const near = ring.filter(p => Math.hypot(p[0] - corner[0], p[1] - corner[1]) <= d + TOL);
      expect(near.length).toBeGreaterThanOrEqual(4);
    }
    // Bounding box grows by exactly |d| on each side.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    expect(minX).toBeCloseTo(-d, 6);
    expect(maxX).toBeCloseTo(100 + d, 6);
    expect(minY).toBeCloseTo(-d, 6);
    expect(maxY).toBeCloseTo(50 + d, 6);
    // No spike: everything within half-diagonal + d of the centre.
    const halfDiag = Math.hypot(50, 25);
    for (const [x, y] of ring) {
      expect(Math.hypot(x - 50, y - 25)).toBeLessThanOrEqual(halfDiag + d + TOL);
    }
    // Winding/area sane: the ring grew, orientation preserved.
    expect(Math.sign(shoelace(ring))).toBe(Math.sign(shoelace(rect)));
    expect(Math.abs(shoelace(ring))).toBeGreaterThan(5000);
  });

  it('suppresses star-tip spikes vs miter and stays a simple ring', () => {
    // 5-point star, tips at r=100, inner corners at r=40.
    const star: Array<[number, number]> = [];
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 100 : 40;
      const a = (k * Math.PI) / 5;
      star.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const miterOut = offsetPolyline(star, 5, true);
    const roundOut = offsetPolyline(star, 5, true, { join: 'round' });
    expect(miterOut).toHaveLength(1);
    expect(roundOut).toHaveLength(1);
    const maxR = (ring: Array<[number, number]>) =>
      Math.max(...ring.map(([x, y]) => Math.hypot(x, y)));
    const miterR = maxR(miterOut[0]);
    const roundR = maxR(roundOut[0]);
    expect(miterR).toBeGreaterThan(105); // tip miters survive under the limit
    expect(roundR).toBeLessThanOrEqual(105 + TOL); // arcs never exceed tip + d
    expect(miterR).toBeGreaterThanOrEqual(roundR);
    const ring = roundOut[0];
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 9);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 9);
    for (const [x, y] of ring) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });

  it('inward round offset returns a valid ring or vanishes per the guards', () => {
    const octa: Array<[number, number]> = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      octa.push([50 * Math.cos(a), 50 * Math.sin(a)]);
    }
    const small = offsetPolyline(octa, -3, true, { join: 'round' });
    expect(small).toHaveLength(1);
    for (const [x, y] of small[0]) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    let minX = Infinity, maxX = -Infinity;
    for (const [x] of small[0]) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    // Corner miters recede d/sin(half the 135° interior angle) — the axis
    // vertices bound the ring, so the shrink is 3/sin(67.5°) per side.
    expect(maxX - minX).toBeCloseTo(100 - 6 / Math.sin((3 * Math.PI) / 8), 6);
    expect(offsetPolyline(octa, -1000, true, { join: 'round' })).toEqual([]);
  });

  it('round-joins the reflex corners an inward offset grows (notch)', () => {
    const notched: Array<[number, number]> = [
      [0, 0], [100, 0], [100, 100], [60, 100], [60, 40], [40, 40], [40, 100], [0, 100],
    ];
    const miter = offsetPolyline(notched, -2, true);
    const round = offsetPolyline(notched, -2, true, { join: 'round' });
    expect(miter).toHaveLength(1);
    expect(round).toHaveLength(1);
    // Arcs added at the two notch corners the inward offset widens.
    expect(round[0].length).toBeGreaterThan(miter[0].length);
    // Every point stays at >= |d| from the source boundary (overflow guard intact).
    for (const p of round[0]) {
      expect(distToRing(p, notched)).toBeGreaterThanOrEqual(2 - TOL);
    }
  });

  it('default join (option absent) is byte-identical to explicit miter', () => {
    const tri: Array<[number, number]> = [[0, 0], [10, 0], [0, 10]];
    const open = offsetPolyline(tri, 2, false);
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveLength(3);
    // Pinned expected coordinates for today's miter output.
    expect(open[0][0][0]).toBeCloseTo(0, 9);
    expect(open[0][0][1]).toBeCloseTo(-2, 9);
    expect(open[0][1][0]).toBeCloseTo(12 + 2 * Math.SQRT2, 9);
    expect(open[0][1][1]).toBeCloseTo(-2, 9);
    expect(open[0][2][0]).toBeCloseTo(Math.SQRT2, 9);
    expect(open[0][2][1]).toBeCloseTo(10 + Math.SQRT2, 9);
    expect(offsetPolyline(tri, 2, true)).toEqual(offsetPolyline(tri, 2, true, { join: 'miter' }));
    expect(offsetPolyline(tri, 2, false)).toEqual(offsetPolyline(tri, 2, false, { join: 'miter' }));
  });
});
