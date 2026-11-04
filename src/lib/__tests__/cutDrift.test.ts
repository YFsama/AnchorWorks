import { describe, it, expect } from 'vitest';
import {
  applyDriftCompensation,
  driftPreviewAt,
  isValidCalibration,
  type CutPath,
  type DriftCalibration,
} from '../cutDrift';

const mk = (id: string, points: Array<[number, number]>, kind: CutPath['kind'] = 'outline'): CutPath =>
  ({ id, points, closed: true, kind });

const cal = (top: [number, number], bottom: [number, number]): DriftCalibration =>
  ({ top: { dxMm: top[0], dyMm: top[1] }, bottom: { dxMm: bottom[0], dyMm: bottom[1] } });

describe('isValidCalibration', () => {
  it('accepts finite samples — including the all-zero no-drift case', () => {
    expect(isValidCalibration(cal([0, 0], [0, 0]))).toBe(true);
    expect(isValidCalibration(cal([0.25, -1.5], [2, 0]))).toBe(true);
  });

  it('rejects NaN or Infinity in any of the four fields', () => {
    expect(isValidCalibration(cal([Number.NaN, 0], [0, 0]))).toBe(false);
    expect(isValidCalibration(cal([0, 0], [Number.POSITIVE_INFINITY, 0]))).toBe(false);
    expect(isValidCalibration(cal([0, Number.NEGATIVE_INFINITY], [0, 0]))).toBe(false);
    expect(isValidCalibration(cal([0, 0], [0, Number.NaN]))).toBe(false);
  });
});

describe('applyDriftCompensation', () => {
  it('zero calibration keeps every point numerically identical', () => {
    const paths = [mk('a', [[10, 0], [40, 100]]), mk('b', [[5, 50], [6, 50]])];
    const r = applyDriftCompensation(paths, cal([0, 0], [0, 0]));
    expect(r.paths.map(p => p.points)).toEqual([[[10, 0], [40, 100]], [[5, 50], [6, 50]]]);
    // A zero sample set is "no measurable drift", not an error.
    expect(isValidCalibration(cal([0, 0], [0, 0]))).toBe(true);
  });

  it('pure horizontal drift: page top unmoved, midpoint -0.5, page bottom -1; y untouched', () => {
    const r = applyDriftCompensation([mk('a', [[50, 0], [50, 50], [50, 100]])], cal([0, 0], [1, 0]));
    const pts = r.paths[0].points;
    expect(pts[0]).toEqual([50, 0]);               // t=0 → no drift, no move
    expect(pts[1][0]).toBeCloseTo(49.5, 12);       // t=0.5 → drifts +0.5 → cut shifts 0.5 LEFT
    expect(pts[1][1]).toBe(50);                    // dy is zero everywhere → y never moves
    expect(pts[2][0]).toBeCloseTo(49, 12);         // t=1 → drifts +1 → shift 1 LEFT
    expect(pts[2][1]).toBe(100);
  });

  it('leftward (negative) drift flips the correction direction', () => {
    const r = applyDriftCompensation([mk('a', [[20, 0], [20, 50], [20, 100]])], cal([0, 0], [-0.5, 0]));
    const pts = r.paths[0].points;
    expect(pts[0][0]).toBe(20);                    // top: no drift
    expect(pts[1][0]).toBeCloseTo(20.25, 12);      // mid: cuts 0.25 LEFT → move RIGHT
    expect(pts[2][0]).toBeCloseTo(20.5, 12);       // bottom: cuts 0.5 LEFT → move 0.5 RIGHT
  });

  it('mixed-sign 2D samples interpolate per axis (sign convention end to end)', () => {
    // offset(y): dx 0.4 → -0.4, dy -0.1 → 0.7 over y 0..100 (hand-computable)
    const r = applyDriftCompensation([mk('a', [[0, 0], [0, 25], [0, 100]])], cal([0.4, -0.1], [-0.4, 0.7]));
    const pts = r.paths[0].points;
    // y=0  (t=0):    offset (0.4, -0.1)  → move (-0.4, +0.1)
    expect(pts[0][0]).toBeCloseTo(-0.4, 12);
    expect(pts[0][1]).toBeCloseTo(0.1, 12);
    // y=25 (t=0.25): offset (0.2, 0.1)   → move (-0.2, -0.1)
    expect(pts[1][0]).toBeCloseTo(-0.2, 12);
    expect(pts[1][1]).toBeCloseTo(24.9, 12);
    // y=100 (t=1):   offset (-0.4, 0.7)  → move (+0.4, -0.7)
    expect(pts[2][0]).toBeCloseTo(0.4, 12);
    expect(pts[2][1]).toBeCloseTo(99.3, 12);
  });

  it('regmark paths keep their coordinates AND object reference while neighbours move', () => {
    const reg = mk('reg', [[0, 0], [0, 200]], 'regmark');
    const cut = mk('cut', [[10, 0], [10, 200]]);
    const r = applyDriftCompensation([reg, cut], cal([0, 0], [1, 1]));
    expect(r.paths[0]).toBe(reg);                          // same object, not a copy
    expect(r.paths[0].points).toEqual([[0, 0], [0, 200]]); // same coordinates
    expect(r.paths[1].points[1][0]).toBeCloseTo(9, 12);    // neighbour WAS compensated
    expect(r.paths[1].points[1][1]).toBeCloseTo(199, 12);
  });

  it('empty input and regmark-only input return safely (zero slope, extent 0, no throw)', () => {
    const empty = applyDriftCompensation([], cal([0, 0], [1, 0]));
    expect(empty.paths).toEqual([]);
    expect(empty.slope).toEqual({ dxPerMm: 0, dyPerMm: 0 });
    expect(empty.extentMm).toEqual({ minY: 0, maxY: 0 });

    const onlyReg = [mk('r', [[1, 1], [1, 5]], 'regmark')];
    const regOnly = applyDriftCompensation(onlyReg, cal([0, 0], [1, 1]));
    expect(regOnly.paths).toBe(onlyReg); // nothing compensatable → original reference
    expect(regOnly.slope).toEqual({ dxPerMm: 0, dyPerMm: 0 });
    expect(regOnly.extentMm).toEqual({ minY: 0, maxY: 0 });
  });

  it('invalid calibration passes the paths through untouched with zero slope', () => {
    const paths = [mk('a', [[1, 0], [2, 10]])];
    const bad = cal([Number.NaN, 0], [0, 0]);
    expect(isValidCalibration(bad)).toBe(false);
    const r = applyDriftCompensation(paths, bad);
    expect(r.paths).toBe(paths); // original array reference, not a copy
    expect(r.slope).toEqual({ dxPerMm: 0, dyPerMm: 0 });
    // extent is still reported as a diagnostic (it does not depend on the calibration)
    expect(r.extentMm).toEqual({ minY: 0, maxY: 10 });
  });

  it('slope and extent are hand-computable', () => {
    // y span 10..110 (range 100): dx 0.2 → 1.2, dy -0.3 → 0.7 → both slopes 0.01/mm
    const r = applyDriftCompensation([mk('a', [[0, 10], [0, 60], [0, 110]])], cal([0.2, -0.3], [1.2, 0.7]));
    expect(r.extentMm).toEqual({ minY: 10, maxY: 110 });
    expect(r.slope.dxPerMm).toBeCloseTo(0.01, 12);
    expect(r.slope.dyPerMm).toBeCloseTo(0.01, 12);
  });

  it('regmarks outside the cut extent do not widen the interpolation domain', () => {
    const reg = mk('m', [[0, -5], [0, 300]], 'regmark');
    const r = applyDriftCompensation([reg, mk('a', [[0, 10], [0, 110]])], cal([0, 0], [1, 0]));
    // Domain = the CUT geometry (10..110): the topmost cut row gets the FULL
    // top sample (t=0), the bottom row the FULL bottom sample (t=1) — the
    // regmarks are the sensor baseline, not drifted work.
    expect(r.extentMm).toEqual({ minY: 10, maxY: 110 });
    expect(r.slope.dxPerMm).toBeCloseTo(0.01, 12);
    expect(r.paths[1].points[0][0]).toBeCloseTo(0, 12);    // y=10 → t=0 → no move
    expect(r.paths[1].points[1][0]).toBeCloseTo(-1, 12);   // y=110 → t=1 → full -1
  });

  it('flat job (single y row): zero slope, every point corrected by exactly the top sample', () => {
    const r = applyDriftCompensation([mk('f', [[0, 42], [7, 42]])], cal([0.25, -0.5], [9, 9]));
    expect(r.slope).toEqual({ dxPerMm: 0, dyPerMm: 0 });
    expect(r.paths[0].points).toEqual([[-0.25, 42.5], [6.75, 42.5]]); // moved by -(top)
  });

  it('identical y values receive bit-identical compensation (float determinism)', () => {
    // Power-of-two-friendly numbers so the reconstruction x_in − x_out is
    // EXACT: slope 4/256 = 0.015625, offset at y=64 is exactly 1. Same y in
    // two different paths must subtract the very same float — duplicated or
    // collinear vertices never diverge.
    const r = applyDriftCompensation(
      [mk('a', [[0, 0], [10.5, 64]]), mk('b', [[3.25, 64], [0, 256]])],
      cal([0, 0], [4, 0]),
    );
    const d0 = 10.5 - r.paths[0].points[1][0];
    const d1 = 3.25 - r.paths[1].points[0][0];
    expect(d0).toBe(1); // strict Object.is equality, not closeTo
    expect(d1).toBe(1);
  });

  it('never mutates the input paths or the calibration', () => {
    const paths = [mk('a', [[1, 2], [3, 4], [5, 6]]), mk('r', [[0, 0], [1, 1]], 'regmark')];
    const pathsSnap = structuredClone(paths);
    const c = cal([0.3, -0.2], [-0.7, 0.9]);
    const calSnap = structuredClone(c);
    applyDriftCompensation(paths, c);
    expect(paths).toEqual(pathsSnap); // deep-compare against the snapshot
    expect(c).toEqual(calSnap);
    expect(paths[0].points[0][0]).toBe(1); // spot-check no in-place edits
  });

  it('preserves extra path fields through the shallow copy (store compatibility)', () => {
    const storeLike = { ...mk('a', [[0, 0], [10, 100]]), passes: 3, color: '#ff0000', sourceObjectId: 'obj-7' };
    const r = applyDriftCompensation([storeLike], cal([0, 0], [1, 0]));
    const out = r.paths[0] as typeof storeLike;
    expect(out.id).toBe('a');
    expect(out.closed).toBe(true);
    expect(out.kind).toBe('outline');
    expect(out.passes).toBe(3);
    expect(out.color).toBe('#ff0000');
    expect(out.sourceObjectId).toBe('obj-7');
  });

  it('paths with empty point lists pass through the copy unharmed', () => {
    const r = applyDriftCompensation([mk('e', []), mk('a', [[3, 4], [3, 6]])], cal([0, 0], [2, 0]));
    expect(r.paths[0].points).toEqual([]);
    expect(r.paths[1].points[0][0]).toBeCloseTo(3, 12); // y=4 → t=0 → no move
    expect(r.paths[1].points[1][0]).toBeCloseTo(1, 12); // y=6 → t=1 → full -2
    expect(r.extentMm).toEqual({ minY: 4, maxY: 6 });   // empty path anchors nothing
  });
});

describe('driftPreviewAt', () => {
  it('reports the APPLIED displacement (negated drift) at top, middle and bottom', () => {
    // drift dx 0 → 1, dy 0 → -0.4 over y 0..100
    const p = driftPreviewAt(cal([0, 0], [1, -0.4]), { minY: 0, maxY: 100 });
    expect(p.top).toEqual({ dxMm: 0, dyMm: 0 });
    expect(p.middle.dxMm).toBeCloseTo(-0.5, 12); // blade coords move LEFT half the bottom drift
    expect(p.middle.dyMm).toBeCloseTo(0.2, 12);
    expect(p.bottom.dxMm).toBeCloseTo(-1, 12);
    expect(p.bottom.dyMm).toBeCloseTo(0.4, 12);
  });

  it('degenerate extent reports the top sample displacement at all three points', () => {
    const p = driftPreviewAt(cal([0.2, -0.1], [5, 5]), { minY: 7, maxY: 7 });
    const expected = { dxMm: -0.2, dyMm: 0.1 };
    expect(p.top).toEqual(expected);
    expect(p.middle).toEqual(expected);
    expect(p.bottom).toEqual(expected);
  });

  it('agrees with applyDriftCompensation at the extent edges', () => {
    const c = cal([0.4, -0.1], [-0.4, 0.7]);
    const extent = { minY: 0, maxY: 100 };
    const r = applyDriftCompensation([mk('a', [[0, 0], [0, 100]])], c);
    const p = driftPreviewAt(c, extent);
    // top point moved from x=0 to -0.4 → preview top.dxMm must equal that move
    expect(p.top.dxMm).toBeCloseTo(r.paths[0].points[0][0] - 0, 12);
    expect(p.top.dyMm).toBeCloseTo(r.paths[0].points[0][1] - 0, 12);
    expect(p.bottom.dxMm).toBeCloseTo(r.paths[0].points[1][0] - 0, 12);
    expect(p.bottom.dyMm).toBeCloseTo(r.paths[0].points[1][1] - 100, 12);
  });
});
