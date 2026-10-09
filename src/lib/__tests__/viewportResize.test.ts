import { describe, expect, it } from 'vitest';
import * as fabric from 'fabric';
import { computeResizeViewportTransform } from '../viewport';

// Pure-math coverage for the resize-preserving viewport transform used by
// CanvasView's reflow. The contract under test:
//   1. centre invariance — the scene point at the OLD viewport centre lands
//      exactly on the NEW viewport centre;
//   2. zoom invariance — the linear part of the transform rides along
//      untouched;
//   3. purity — the input array is never mutated;
//   4. degenerate inputs — no old viewport / singular matrix / NaN dims
//      return the transform unchanged instead of NaN-ing out.
//
// The centre invariance is verified through fabric's own
// util.transformPoint / util.invertTransform so the test math is independent
// of the implementation's algebra.

type Vt = [number, number, number, number, number, number];

const asMat = (vt: readonly number[]) => vt as unknown as fabric.TMat2D;

/** Scene point (fabric math) sitting at the centre of a w×h viewport. */
function centreScenePoint(vt: readonly number[], w: number, h: number): fabric.Point {
  return fabric.util.transformPoint(new fabric.Point(w / 2, h / 2), fabric.util.invertTransform(asMat(vt)));
}

describe('computeResizeViewportTransform', () => {
  it('keeps the old viewport-centre scene point at the new centre (fabric-math check)', () => {
    const cases: Array<{ vt: Vt; oldW: number; oldH: number; newW: number; newH: number }> = [
      { vt: [2, 0, 0, 2, -40, 120], oldW: 800, oldH: 600, newW: 1000, newH: 400 },
      { vt: [0.5, 0, 0, 0.5, 13, -7], oldW: 100, oldH: 100, newW: 40, newH: 90 },
      // Skewed / non-uniform linear part — the general-affine path.
      { vt: [2, 0.5, -0.25, 1.5, 10, -20], oldW: 400, oldH: 300, newW: 640, newH: 480 },
    ];
    for (const { vt, oldW, oldH, newW, newH } of cases) {
      const sceneCentre = centreScenePoint(vt, oldW, oldH);
      const next = computeResizeViewportTransform(vt, oldW, oldH, newW, newH);
      const mapped = fabric.util.transformPoint(sceneCentre, asMat(next));
      expect(mapped.x).toBeCloseTo(newW / 2);
      expect(mapped.y).toBeCloseTo(newH / 2);
    }
  });

  it('keeps the old centre with hand-computed anchor numbers (diagonal matrix)', () => {
    // vt=[2,0,0,2,-40,120] over 800×600: centre (400,300) → scene
    // ((400+40)/2, (300−120)/2) = (220, 90). New 1000×400 centre (500,200)
    // needs tx = 500 − 2·220 = 60, ty = 200 − 2·90 = 20.
    expect(computeResizeViewportTransform([2, 0, 0, 2, -40, 120], 800, 600, 1000, 400))
      .toEqual([2, 0, 0, 2, 60, 20]);
  });

  it('is equivalent to shifting the translation by half the size delta (diagonal matrix)', () => {
    const vt: Vt = [1.25, 0, 0, 1.25, -60, 45];
    const [a, b, c, d, tx, ty] = vt;
    const next = computeResizeViewportTransform(vt, 500, 400, 700, 300);
    expect(next).toEqual([a, b, c, d, tx + (700 - 500) / 2, ty + (300 - 400) / 2]);
  });

  it('preserves zoom and the whole linear part, and never mutates the input', () => {
    const vt: Vt = [0.5, 0, 0, 0.5, 13, -7];
    const snapshot = [...vt] as Vt;
    const next = computeResizeViewportTransform(vt, 100, 100, 40, 90);
    expect([next[0], next[1], next[2], next[3]]).toEqual([vt[0], vt[1], vt[2], vt[3]]);
    expect(vt).toEqual(snapshot);
    expect(next).not.toBe(vt);
  });

  it('returns an equal, fresh transform for unchanged dimensions', () => {
    const vt: Vt = [1, 0, 0, 1, 25, 25];
    const next = computeResizeViewportTransform(vt, 500, 500, 500, 500);
    expect(next).toEqual(vt);
    expect(next).not.toBe(vt);
  });

  it('degenerate old dimensions (zero, negative, NaN) return the transform unchanged', () => {
    for (const bad of [0, -1, Number.NaN]) {
      expect(computeResizeViewportTransform([3, 0, 0, 3, 5, 6], bad, 600, 800, 600))
        .toEqual([3, 0, 0, 3, 5, 6]);
      expect(computeResizeViewportTransform([3, 0, 0, 3, 5, 6], 800, bad, 800, 600))
        .toEqual([3, 0, 0, 3, 5, 6]);
    }
  });

  it('non-finite new dimensions return the transform unchanged (no NaN leakage)', () => {
    expect(computeResizeViewportTransform([1, 0, 0, 1, 0, 0], 100, 100, Number.NaN, 100))
      .toEqual([1, 0, 0, 1, 0, 0]);
    expect(computeResizeViewportTransform([1, 0, 0, 1, 0, 0], 100, 100, 100, Number.POSITIVE_INFINITY))
      .toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('a singular linear part (zero determinant) returns the transform unchanged', () => {
    expect(computeResizeViewportTransform([0, 0, 0, 0, 10, 10], 100, 100, 200, 200))
      .toEqual([0, 0, 0, 0, 10, 10]);
  });
});
