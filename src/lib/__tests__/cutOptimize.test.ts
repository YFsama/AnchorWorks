import { describe, it, expect } from 'vitest';
import {
  optimizeOrder, mirrorPolys, cutStats, estimateSeconds, estimateJobSeconds, formatDuration, bounds, applyOvercut, reversePolys, sortInsideFirst, applyBladeOffset, PER_PATH_OVERHEAD_SECONDS, cornerSpeedByRadius, circumradiusMm, type PolyLite,
} from '../cutOptimize';

const seg = (a: [number, number], b: [number, number]): PolyLite => ({ points: [a, b], closed: false });

describe('cutOptimize', () => {
  it('computes bounds of a polyline set', () => {
    const b = bounds([seg([0, 0], [10, 5]), seg([-2, 3], [4, 20])]);
    expect(b).toEqual({ minX: -2, minY: 0, maxX: 10, maxY: 20 });
  });

  it('mirrors horizontally about the bounding-box centre', () => {
    const m = mirrorPolys([seg([0, 0], [10, 0])], 'h');
    // centre x = 5 → x' = 10 - x
    expect(m[0].points).toEqual([[10, 0], [0, 0]]);
  });

  it('mirror preserves total cut length', () => {
    const polys = [seg([0, 0], [10, 0]), seg([3, 2], [3, 9])];
    const before = cutStats(polys).cutLen;
    const after = cutStats(mirrorPolys(polys, 'h')).cutLen;
    expect(after).toBeCloseTo(before, 6);
  });

  it('orders paths to reduce pen-up travel', () => {
    // Three far-flung segments; naive order zig-zags, optimised should not.
    const a = seg([0, 0], [1, 0]);
    const b = seg([100, 0], [101, 0]);
    const c = seg([2, 0], [3, 0]);
    const naive = cutStats([a, b, c]).travelLen;
    const opt = cutStats(optimizeOrder([a, b, c])).travelLen;
    expect(opt).toBeLessThan(naive);
  });

  it('reverses an open polyline to start from the nearer end', () => {
    // Head parked at origin; segment runs far→near, so it should flip.
    const far = seg([50, 0], [5, 0]);
    const [out] = optimizeOrder([far], [0, 0]);
    expect(out.points[0]).toEqual([5, 0]); // nearer end first
  });

  it('rotates a closed ring to begin near the head', () => {
    const ring: PolyLite = { points: [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]], closed: true };
    const [out] = optimizeOrder([ring], [10, 20]);
    // Nearest vertex to (10,20) is index 3; ring should now start there.
    expect(out.points[0]).toEqual([10, 20]);
    expect(out.points[0]).toEqual(out.points[out.points.length - 1]); // still closed
  });

  it('estimates time from cut + travel + overhead', () => {
    const stats = cutStats([seg([0, 0], [60, 0])]); // 60mm cut, 0 travel
    // 60mm at 60mm/min = 1 min = 60s, + 1 path * 0.15 overhead.
    expect(estimateSeconds(stats, 60, 3000)).toBeCloseTo(60.15, 2);
  });

  it('formats durations as m:ss and h:mm:ss', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('overcut extends a closed path and leaves open paths alone', () => {
    const square: PolyLite = { points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], closed: true };
    const before = cutStats([square]).cutLen;
    const [oc] = applyOvercut([square], 2);
    const after = cutStats([oc]).cutLen;
    expect(after).toBeCloseTo(before + 2, 6); // exactly 2mm more cut
    expect(oc.points.length).toBeGreaterThan(square.points.length);

    const open = seg([0, 0], [10, 0]);
    expect(applyOvercut([open], 2)[0].points).toEqual(open.points); // untouched
  });

  it('reversePolys flips point order, preserves closed + length', () => {
    const polys: PolyLite[] = [{ points: [[0, 0], [1, 0], [2, 5]], closed: true }];
    const [r] = reversePolys(polys);
    expect(r.points).toEqual([[2, 5], [1, 0], [0, 0]]);
    expect(r.closed).toBe(true);
    expect(cutStats([r]).cutLen).toBeCloseTo(cutStats(polys).cutLen, 6);
  });

  it('sortInsideFirst cuts a nested contour before its container', () => {
    const outer: PolyLite = { points: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], closed: true };
    const inner: PolyLite = { points: [[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]], closed: true };
    // Pass outer-first; inside-first should put the inner one before it.
    const ordered = sortInsideFirst([outer, inner]);
    expect(ordered[0]).toBe(inner);
    expect(ordered[1]).toBe(outer);
  });

  it('overcut of 0 is a no-op', () => {
    const square: PolyLite = { points: [[0, 0], [10, 0], [10, 10], [0, 0]], closed: true };
    expect(applyOvercut([square], 0)[0].points).toEqual(square.points);
  });
});

describe('applyBladeOffset', () => {
  /** Min distance from p to a polyline's segments (cyclic when closed). */
  const distToPoly = (p: [number, number], pts: Array<[number, number]>, closed: boolean): number => {
    let best = Infinity;
    const segs = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
    }
    return best;
  };

  /** Corner-loop count: contiguous runs of output points further than
   *  offset/2 off the source path (each loop's overshoot + bow samples). */
  const countLoops = (out: Array<[number, number]>, src: PolyLite, offset: number): number => {
    let loops = 0;
    let inLoop = false;
    for (const p of out) {
      if (distToPoly(p, src.points, src.closed) > offset / 2) {
        if (!inLoop) { loops++; inLoop = true; }
      } else {
        inLoop = false;
      }
    }
    return loops;
  };

  it('loops each square corner, re-seams to the longest edge, stays close', () => {
    const sq: PolyLite = { points: [[0, 0], [10, 0], [10, 10], [0, 10]], closed: true };
    const [out] = applyBladeOffset([sq], 1);
    expect(out.closed).toBe(true);
    // Seam moved to the midpoint of the (first) longest edge.
    expect(out.points[0]).toEqual([5, 0]);
    expect(out.points[out.points.length - 1]).toEqual([5, 0]);
    expect(countLoops(out.points, sq, 1)).toBe(4);
    for (const p of out.points) {
      expect(distToPoly(p, sq.points, true)).toBeLessThanOrEqual(1 * 1.6);
    }
  });

  it('leaves collinear (0-degree turn) vertices untouched', () => {
    const shape: PolyLite = { points: [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]], closed: true };
    const [out] = applyBladeOffset([shape], 1);
    expect(out.points.some(p => p[0] === 5 && p[1] === 0)).toBe(true);
    expect(countLoops(out.points, shape, 1)).toBe(4); // (5,0) adds no loop
  });

  it('collapses near-coincident vertices into one loop, not two tangled ones', () => {
    // (10,0) -> (10.3,0.4) spans 0.5mm — under the 1mm offset.
    const shape: PolyLite = {
      points: [[0, 0], [10, 0], [10.3, 0.4], [10.3, 10], [0, 10]],
      closed: true,
    };
    const [out] = applyBladeOffset([shape], 1);
    expect(countLoops(out.points, shape, 1)).toBe(4); // 3 corners + 1 merged cluster
    expect(out.points.some(p => p[0] === 10 && p[1] === 0)).toBe(false);
    expect(out.points.some(p => p[0] === 10.3 && p[1] === 0.4)).toBe(false);
  });

  it('loops interior corners of open paths but never their endpoints', () => {
    const open: PolyLite = { points: [[0, 0], [10, 0], [10, 5], [20, 5]], closed: false };
    const [out] = applyBladeOffset([open], 1);
    expect(out.closed).toBe(false);
    expect(out.points[0]).toEqual([0, 0]);
    expect(out.points[out.points.length - 1]).toEqual([20, 5]);
    expect(countLoops(out.points, open, 1)).toBe(2);
  });

  it('offset 0 deep-clones the input unchanged', () => {
    const sq: PolyLite = { points: [[0, 0], [10, 0], [10, 10], [0, 10]], closed: true };
    const open: PolyLite = { points: [[0, 0], [5, 5]], closed: false };
    const input = [sq, open];
    const out = applyBladeOffset(input, 0);
    expect(out).toEqual(input);
    expect(out[0]).not.toBe(input[0]);
    expect(out[0].points).not.toBe(input[0].points);
    expect(out[0].points[0]).not.toBe(input[0].points[0]);
  });

  it('respects the turn-angle threshold (10 degrees skipped, 20 looped)', () => {
    const bend = (deg: number): PolyLite => {
      const r = (deg * Math.PI) / 180;
      return {
        points: [[0, 0], [10, 0], [10 + 10 * Math.cos(r), 10 * Math.sin(r)]],
        closed: false,
      };
    };
    const [shallow] = applyBladeOffset([bend(10)], 1); // default threshold 15
    expect(shallow.points).toHaveLength(3);
    const [sharp] = applyBladeOffset([bend(20)], 1);
    expect(sharp.points.length).toBeGreaterThan(3);
  });
});

describe('cutStats corners / closedPaths / estimateSeconds opts', () => {
  const square: PolyLite = { points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], closed: true };

  it('counts corners at >=15 degrees but not collinear mid-vertices', () => {
    const withMid: PolyLite = {
      points: [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      closed: true,
    };
    expect(cutStats([withMid]).corners).toBe(4); // (5,0) is collinear → no
    expect(cutStats([square]).corners).toBe(4);
  });

  it('closedPaths counts only closed polylines', () => {
    const s = cutStats([square, seg([20, 0], [30, 0]), square]);
    expect(s.closedPaths).toBe(2);
    expect(s.paths).toBe(3);
  });

  it('estimateSeconds opts adds overcut retrace and corner-loop swing', () => {
    const s = cutStats([square]); // cutLen 40, travel 0, corners 4, closedPaths 1
    const base = estimateSeconds(s, 60, 300);
    const withOpts = estimateSeconds(s, 60, 300, { bladeOffsetMm: 0.25, overcutMm: 0.5 });
    // overcut: 0.5mm × 1 closed path at 60mm/min = 0.5 s
    // swing: 4 corners × π × 0.25mm at 60mm/min = π s
    expect(withOpts).toBeCloseTo(base + 0.5 + Math.PI, 6);
    expect(withOpts).toBeGreaterThan(base);
  });

  it('estimateSeconds without opts is unchanged (pinned exact value)', () => {
    const s = cutStats([square]); // 40mm cut at 60mm/min + 1 path × 0.15 s
    expect(estimateSeconds(s, 60, 300)).toBeCloseTo(40.15, 6);
    expect(estimateSeconds(s, 60, 300, undefined)).toBe(estimateSeconds(s, 60, 300));
  });
});

describe('estimateJobSeconds (physics model)', () => {
  // Hand-computed pins. feed = travel = 18000 mm/min = 300 mm/s,
  // accel 1500 mm/s² → accel/decel distance to full speed = 300²/3000 = 30mm.
  const opts = { feedMmMin: 18000, travelMmMin: 18000, accelMmS2: 1500 };

  it('straight 100mm: trapezoid 30 accel + 40 cruise + 30 decel = 0.5333s + 0.15 head-up', () => {
    const t = estimateJobSeconds([{ points: [[0, 0], [100, 0]], closed: false }], [0, 0], opts);
    // 0.2s accel + 40/300 = 0.1333s cruise + 0.2s decel, zero travel,
    // default headUpS = PER_PATH_OVERHEAD_SECONDS = 0.15.
    expect(PER_PATH_OVERHEAD_SECONDS).toBe(0.15);
    expect(t).toBeCloseTo(0.2 + 40 / 300 + 0.2 + 0.15, 6);
    expect(t).toBeCloseTo(0.6833, 3);
  });

  it('10mm short move is triangular: t = 2·√(d/a) = 0.1633s + 0.15', () => {
    const t = estimateJobSeconds([{ points: [[0, 0], [10, 0]], closed: false }], [0, 0], opts);
    // Peak √(a·d) = √15000 ≈ 122.5 mm/s < 300 → never cruises.
    expect(t).toBeCloseTo(2 * Math.sqrt(10 / 1500) + 0.15, 6);
    expect(t).toBeCloseTo(0.3133, 3);
  });

  it('10mm square: corner-radius caps are slower than cornerSlow:false; both pinned', () => {
    const sq: PolyLite = { points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], closed: true };
    const slow = estimateJobSeconds([sq], [0, 0], opts); // cornerSlow defaults true
    const fast = estimateJobSeconds([sq], [0, 0], { ...opts, cornerSlow: false });
    expect(slow).toBeGreaterThan(fast);
    // Every 90° corner triple (legs 10/10, chord 10√2) has circumradius
    // 10/√2 ≈ 7.07 mm — below the table's 15 mm floor → the 55 mm/s entry
    // scaled by 300/400 = 41.25 mm/s at each junction and the seam ceiling:
    // 0.14037 + 0.11731 + 0.11731 + 0.25617 + 0.15.
    expect(slow).toBeCloseTo(0.7812, 3);
    // fast: 300mm/s junctions → 0.11547 + 0.03333 + 0.03333 + 0.03670 + 0.15.
    expect(fast).toBeCloseTo(0.3688, 3);
  });

  it('two paths: pen-up travel trapezoid between them is included (exact pin)', () => {
    const a: PolyLite = { points: [[0, 0], [10, 0]], closed: false };
    const b: PolyLite = { points: [[0, 5], [10, 5]], closed: false };
    const total = estimateJobSeconds([a, b], [0, 0], opts);
    const single = estimateJobSeconds([a], [0, 0], opts) + estimateJobSeconds([b], [0, 0], opts);
    expect(total).toBeGreaterThan(single);
    // Two 10mm triangular cuts + the √125≈11.18mm a.end→b.start hop
    // (triangular, same math) + 2 head-ups:
    const tri = (d: number) => 2 * Math.sqrt(d / 1500);
    expect(total).toBeCloseTo(2 * tri(10) + tri(Math.sqrt(125)) + 0.3, 6);
    expect(total).toBeCloseTo(0.7993, 3);
    // The delta vs the singles is exactly the inter-path hop replacing b's
    // own shorter 5mm start hop.
    expect(total - single).toBeCloseTo(tri(Math.sqrt(125)) - tri(5), 6);
  });

  it('clamps accel ≤ 0 to 1 mm/s² instead of throwing', () => {
    const p: PolyLite = { points: [[0, 0], [10, 0]], closed: false };
    const zero = estimateJobSeconds([p], [0, 0], { ...opts, accelMmS2: 0 });
    const one = estimateJobSeconds([p], [0, 0], { ...opts, accelMmS2: 1 });
    expect(zero).toBe(one);
    expect(zero).toBeCloseTo(2 * Math.sqrt(10 / 1) + 0.15, 3);
  });

  it('curvature sensitivity: tight-cornered hexagon cuts slower per mm than the gentle one; all pinned', () => {
    // Regular 6-point hexagon whose vertices sit on a radius-R circle: every
    // consecutive vertex triple lies on that same circle, so each corner's
    // circumradius is exactly R. R = 45 sits on a table key (→ 104 mm/s
    // class, 78 at feed 300); R = 5 floors below the 15 mm key (→ 55 class,
    // 41.25 at feed 300). 30 mm was avoided: it lands exactly on the 15/45
    // nearest-key midpoint (a float knife-edge that also maps to the same
    // floored speed as 5 mm, killing the contrast).
    const hex = (R: number): PolyLite => ({
      closed: true,
      points: Array.from({ length: 6 }, (_, k) => {
        const a = Math.PI + (k * Math.PI) / 3; // first vertex at angle 180° → (0,0)
        return [R + R * Math.cos(a), R * Math.sin(a)] as [number, number];
      }),
    });
    expect(cornerSpeedByRadius(300, 45)).toBeCloseTo(78, 9);
    expect(cornerSpeedByRadius(300, 5)).toBeCloseTo(41.25, 9);

    const gentle = estimateJobSeconds([hex(45)], [0, 0], opts); // 6 × 45 mm sides
    const tight = estimateJobSeconds([hex(5)], [0, 0], opts);   // 6 × 5 mm sides
    // gentle: 78 mm/s junctions, 45 mm sides → 0.30213 + 4×0.25768 +
    // 0.60292 + 0.15; tight: 41.25 mm/s junctions, 5 mm sides →
    // 0.09434 + 4×0.07290 + 0.13496 + 0.15.
    expect(gentle).toBeCloseTo(2.0858, 3);
    expect(tight).toBeCloseTo(0.6709, 3);
    // The small hexagon is 9× shorter, so its absolute time is lower — but
    // per cut millimetre the tight curvature more than halves the average
    // blade-down speed (270/1.93579 vs 30/0.52090).
    expect(270 / (gentle - 0.15)).toBeCloseTo(139.5, 1);
    expect(30 / (tight - 0.15)).toBeCloseTo(57.6, 1);
    expect(30 / (tight - 0.15)).toBeLessThan(270 / (gentle - 0.15));
    // Isolating curvature on the SAME tight geometry: with the caps off it
    // runs 0.08165 + 4×0.01667 + 0.01743 + 0.15 — the radius caps alone
    // more than double its blade-down time.
    const tightFast = estimateJobSeconds([hex(5)], [0, 0], { ...opts, cornerSlow: false });
    expect(tightFast).toBeCloseTo(0.3157, 3);
    expect(tight - 0.15).toBeGreaterThan(2 * (tightFast - 0.15));
  });
});

describe('cornerSpeedByRadius (CutTime radius→speed table)', () => {
  it('scales the 400 mm/s-class table linearly with vMax; beyond-table radii run at vMax', () => {
    expect(cornerSpeedByRadius(300, 7)).toBeCloseTo(41.25, 9);   // below 15 mm → floor entry 55·0.75
    expect(cornerSpeedByRadius(300, 375)).toBeCloseTo(241.5, 9); // exact key 375 → 322·0.75
    expect(cornerSpeedByRadius(300, 1e6)).toBe(300);             // gentler than the table binds → vMax
    expect(cornerSpeedByRadius(400, 45)).toBeCloseTo(104, 9);    // head-class speed, verbatim
    expect(cornerSpeedByRadius(200, 375)).toBeCloseTo(161, 9);   // 322·0.5
  });

  it('uses nearest-key lookup; exact midpoints err slow; Infinity is uncapped', () => {
    expect(cornerSpeedByRadius(300, 45)).toBeCloseTo(78, 9);    // key 45 → 104·0.75
    expect(cornerSpeedByRadius(300, 5)).toBeCloseTo(41.25, 9);  // floor
    expect(cornerSpeedByRadius(300, 30)).toBeCloseTo(41.25, 9); // 15/45 midpoint → smaller (slower) key 55
    expect(cornerSpeedByRadius(300, Infinity)).toBe(300);       // collinear triple caps nothing
  });
});

describe('circumradiusMm (polyline-triple corner radius)', () => {
  it('returns the circle radius for three points on a circle (10 mm ± 0.01)', () => {
    // Three points 120° apart on a radius-10 circle.
    const s = 5 * Math.sqrt(3);
    expect(circumradiusMm([10, 0], [-5, s], [-5, -s])).toBeCloseTo(10, 2);
  });

  it('right triangle → half the hypotenuse; 10 mm square corner → 10/√2', () => {
    expect(circumradiusMm([0, 0], [6, 0], [0, 8])).toBeCloseTo(5, 6);
    // The pinned square test's corner: legs 10/10, chord 10√2 → R = 5√2.
    expect(circumradiusMm([0, 0], [10, 0], [10, 10])).toBeCloseTo(10 / Math.SQRT2, 6);
  });

  it('collinear and degenerate triples return Infinity (no cap)', () => {
    expect(circumradiusMm([0, 0], [5, 5], [10, 10])).toBe(Infinity);
    expect(circumradiusMm([1, 1], [1, 1], [2, 2])).toBe(Infinity);
  });
});
