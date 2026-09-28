/**
 * Outline-rebuild geometry regression (OPTIMIZATION_BACKLOG P1-6).
 *
 * buildOutlineCutPaths is the shared flatten→transform backbone behind
 * Simplify Path / Join / Round Corners / Knife / Outline Stroke / Weld and
 * the Cut Contour dialog. It must map a fabric.Path's `d` coordinates into
 * canvas (scene) space exactly the way fabric renders them:
 *
 *     scenePoint = calcTransformMatrix() × (dPoint − pathOffset)
 *
 * pathOffset is the centre of the path's own d-bbox (fabric's
 * Path._calcDimensions / _renderPathCommands; booleanOps.objectToRings uses
 * the identical composition). The historical code subtracted half the
 * object's width/height instead, which only equals pathOffset when the
 * d-bbox starts at the origin — any path whose coordinates do not begin at
 * (0,0) rebuilt shifted by its own bbox minimum (a `y≈10` polyline came
 * back at `y≈20`), and the primitive fallback branch doubled left/top the
 * same way by re-transforming already-scene-space getBoundingRect coords.
 *
 * Ground truth here never reuses the pipeline's own math: expected scene
 * points are derived from (a) the input `d` coordinates with hand-computed
 * d-bbox centres, (b) fabric's public getCenterPoint(), and (c) plain
 * rotation/scale composition. Envelope is deliberately absent — it sources
 * rings via booleanOps.objectToRings, which already maps correctly.
 */
import * as fabric from 'fabric';
import { describe, expect, it } from 'vitest';
import { buildOutlineCutPaths } from '../contourFromSelection';
import { simplifyPathObject } from '../pathSimplify';

const MM_TO_PX = 3.7795; // the pipeline's px→mm divisor, inverted for asserts
type Pt = [number, number];

/* --------------------------- ground-truth helpers --------------------------- */

/**
 * Where a d-point must land in scene space: the object centre (from fabric's
 * public getCenterPoint, group transforms included) plus fabric's documented
 * scale-then-rotate composition applied to (dPoint − d-bbox centre).
 */
function expectedScene(
  dPts: readonly Pt[],
  center: Pt,
  bboxCenter: Pt,
  opts: { scaleX?: number; scaleY?: number; angleDeg?: number } = {},
): Pt[] {
  const [cx, cy] = center;
  const [bx, by] = bboxCenter;
  const sx = opts.scaleX ?? 1;
  const sy = opts.scaleY ?? 1;
  const th = ((opts.angleDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  return dPts.map(([x, y]) => {
    const dx = (x - bx) * sx;
    const dy = (y - by) * sy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as Pt;
  });
}

/** Rebuild objects through the outline pipeline at offset 0, back in px. */
function outlinePx(objects: fabric.FabricObject[], offsetMm = 0): Array<{ points: Pt[]; closed: boolean }> {
  return buildOutlineCutPaths(objects, offsetMm, 1).map(cp => ({
    points: cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt),
    closed: cp.closed,
  }));
}

/** Assert two same-length polylines agree point-for-point within 0.5px. */
function expectPolylineMatch(actual: readonly Pt[], expected: readonly Pt[]) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i][0]).toBeCloseTo(expected[i][0], 1);
    expect(actual[i][1]).toBeCloseTo(expected[i][1], 1);
  }
}

/** Open polyline whose d-bbox does NOT start at the origin (bbox y∈[10,10.5]). */
const OFF_ORIGIN = 'M 0 10 L 30 10.5 L 70 10.5 L 100 10';
const OFF_ORIGIN_PTS: Pt[] = [[0, 10], [30, 10.5], [70, 10.5], [100, 10]];

/** Closed square whose d-bbox min is (20,10) — non-origin on both axes. */
const OFF_SQUARE = 'M 20 10 L 120 10 L 120 110 L 20 110 Z';
const OFF_SQUARE_PTS: Pt[] = [[20, 10], [120, 10], [120, 110], [20, 110], [20, 10]];

const centerOf = (o: fabric.FabricObject): Pt => {
  const c = o.getCenterPoint();
  return [c.x, c.y];
};

/* ------------------------------- the bug (P1-6) ------------------------------ */

describe('buildOutlineCutPaths — scene-space geometry (P1-6 outline shift)', () => {
  it('rebuilds a non-origin-bbox path at its scene position (default placement)', () => {
    // Default construction pins the d-bbox centre to the object centre, so
    // the scene geometry IS the d geometry — the repro from the backlog.
    const path = new fabric.Path(OFF_ORIGIN);
    const out = outlinePx([path]);
    expect(out).toHaveLength(1);
    expect(out[0].closed).toBe(false);
    expectPolylineMatch(out[0].points, OFF_ORIGIN_PTS);
  });

  it('rebuilds a translated path (explicit left/top) without shifting it', () => {
    const path = new fabric.Path(OFF_ORIGIN, { left: 240, top: 130 });
    const out = outlinePx([path]);
    expectPolylineMatch(out[0].points, expectedScene(OFF_ORIGIN_PTS, centerOf(path), [50, 10.25]));
  });

  it('rebuilds a scaled + rotated closed ring at its scene position (knife-style input)', () => {
    const path = new fabric.Path(OFF_SQUARE);
    path.set({ scaleX: 2, scaleY: 1.5 });
    path.rotate(37);
    const out = outlinePx([path]);
    expect(out[0].closed).toBe(true);
    expectPolylineMatch(out[0].points, expectedScene(OFF_SQUARE_PTS, centerOf(path), [70, 60], { scaleX: 2, scaleY: 1.5, angleDeg: 37 }));
  });

  it('rebuilds a path inside a translated group at its scene position', () => {
    const child = new fabric.Path(OFF_ORIGIN);
    const group = new fabric.Group([child]);
    group.set({ left: group.left + 300, top: group.top + 150 });
    const out = outlinePx([child]);
    expectPolylineMatch(out[0].points, expectedScene(OFF_ORIGIN_PTS, centerOf(child), [50, 10.25]));
  });

  it('traces a translated primitive rect as its own scene rectangle', () => {
    // strokeWidth 0 keeps left/top stroke-exclusive so the hand-computed
    // rectangle is exact (with a stroke, fabric v6 positions the stroke-
    // outset box — pinned separately by the translated-path test above).
    const rect = new fabric.Rect({ left: 90, top: 60, width: 100, height: 60, strokeWidth: 0 });
    const out = outlinePx([rect]);
    expect(out).toHaveLength(1);
    expect(out[0].closed).toBe(true);
    expectPolylineMatch(out[0].points, [[90, 60], [190, 60], [190, 120], [90, 120], [90, 60]]);
  });

  it('is independent of strokeWidth (stroke must not leak into the mapping)', () => {
    const thin = new fabric.Path(OFF_ORIGIN, { strokeWidth: 0 });
    const thick = new fabric.Path(OFF_ORIGIN, { strokeWidth: 7 });
    const a = outlinePx([thin])[0].points;
    const b = outlinePx([thick])[0].points;
    expectPolylineMatch(a, b);
    expectPolylineMatch(a, OFF_ORIGIN_PTS);
  });

  it('composes a contour offset (CutContour dialog input) around the correct position', () => {
    // strokeWidth 0 → scene ring is exactly d + (60,60): an 80..180 × 70..170 square.
    const path = new fabric.Path(OFF_SQUARE, { left: 80, top: 70, strokeWidth: 0 });
    const d = 5 * MM_TO_PX; // 5mm outward on every side
    const out = outlinePx([path], 5);
    expect(out).toHaveLength(1);
    const xs = out[0].points.map(([x]) => x);
    const ys = out[0].points.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(80 - d, 1);
    expect(Math.max(...xs)).toBeCloseTo(180 + d, 1);
    expect(Math.min(...ys)).toBeCloseTo(70 - d, 1);
    expect(Math.max(...ys)).toBeCloseTo(170 + d, 1);
  });
});

/* ----------------------------- public entry proof ---------------------------- */

describe('outline rebuild consumers — public entry', () => {
  it('simplifyPathObject keeps a non-origin path at its scene coordinates', () => {
    const src = new fabric.Path(OFF_ORIGIN);
    const canvas = { remove: () => {}, add: () => {} };
    const out = simplifyPathObject(canvas as unknown as fabric.Canvas, src, 1.5);
    expect(out).toBeInstanceOf(fabric.Path);
    // 0.5px wobble collapses under the 1.5px tolerance → the two chord
    // endpoints must land back on the input's scene coords (y≈10, not 20).
    const pts: Pt[] = [];
    for (const seg of out!.path as unknown as Array<[string, number, number]>) {
      if (seg[0] === 'M' || seg[0] === 'L') pts.push([seg[1], seg[2]]);
    }
    expect(pts).toHaveLength(2);
    expect(pts[0][0]).toBeCloseTo(0, 1);
    expect(pts[0][1]).toBeCloseTo(10, 1);
    expect(pts[1][0]).toBeCloseTo(100, 1);
    expect(pts[1][1]).toBeCloseTo(10, 1);
  });
});
