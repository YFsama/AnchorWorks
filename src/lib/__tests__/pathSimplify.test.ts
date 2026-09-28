/**
 * Simplify Path (Object→Path→Simplify) — destructive polyline simplify.
 *
 * simplifyPathObject runs the real production pipeline on real fabric
 * objects: buildOutlineCutPaths flattens the object to absolute-space mm
 * polylines, douglasPeucker reduces anchors at a px tolerance, and the
 * result is rebuilt as a new fabric.Path in absolute space. These tests
 * pin:
 *
 *  - tolerance behaviour: sub-tolerance wobble collapses to the chord,
 *    super-tolerance corners survive, higher tolerance never keeps more
 *    anchors than lower tolerance
 *  - the tolerance floor (passed 0 clamps to 0.1)
 *  - closed paths keep their Z / subpath structure; compound paths keep
 *    every subpath
 *  - position is preserved through the mm→px round trip
 *  - appearance (fill/stroke/strokeWidth/opacity) is carried onto the
 *    replacement path
 *  - selection-level guards: non-path selections are a no-op, counts and
 *    history side effects are exact
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSimplify, canSimplifyPathObject, simplifyPathObject, simplifySelection } from '../pathSimplify';
import * as canvasEngine from '../canvasEngine';

/* --------------------------- test helpers --------------------------- */

type Cmd = [string, number?, number?];

/** Extract the M/L anchor list (and Z presence) from a fabric.Path. */
function anchors(p: fabric.Path): { pts: Array<[number, number]>; closed: boolean } {
  const pts: Array<[number, number]> = [];
  let closed = false;
  for (const seg of p.path as unknown as Cmd[]) {
    const c = String(seg[0]).toUpperCase();
    if (c === 'M' || c === 'L') pts.push([seg[1] ?? 0, seg[2] ?? 0]);
    if (c === 'Z') closed = true;
  }
  return { pts, closed };
}

/**
 * Shared path options for origin-bbox d: explicit left/top 0 + strokeWidth 0
 * pins the object to its d-coordinates, so the mm→px round trip reproduces
 * the source `d` exactly (the pipeline's position-preservation contract).
 * NOTE: left/top 0 only pins d when the d-bbox starts at the origin — fabric
 * moves the bbox min to (left, top). For non-origin d use default placement
 * (fabric pins the d-bbox centre to the object centre, so scene == d exactly);
 * see the off-origin P1-6 case below.
 */
const PATH_OPTS = { left: 0, top: 0, fill: '', stroke: '#000', strokeWidth: 0 } as const;

/** A shallow open polyline with ±0.5px wobble — inside the 1.5px default. */
const WOBBLE = 'M 0 0 L 10 0.5 L 20 -0.5 L 30 0.5 L 40 -0.5 L 50 0.5 L 60 -0.5 L 70 0.5 L 80 -0.5 L 90 0.5 L 100 0';

/** Minimal canvas double — simplify only needs remove/add on this path. */
function fakeCanvas(objects: fabric.FabricObject[]) {
  const c = {
    getActiveObjects: () => objects,
    remove: vi.fn(),
    add: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
  };
  return c;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------- object-level API ------------------------- */

describe('canSimplifyPathObject', () => {
  it('accepts only path objects', () => {
    expect(canSimplifyPathObject(new fabric.Path('M 0 0 L 10 0'))).toBe(true);
    expect(canSimplifyPathObject(new fabric.Rect({ width: 10, height: 10 }))).toBe(false);
    expect(canSimplifyPathObject(new fabric.Circle({ radius: 5 }))).toBe(false);
    expect(canSimplifyPathObject({ type: 'textbox' } as fabric.FabricObject)).toBe(false);
  });
});

describe('simplifyPathObject', () => {
  it('collapses sub-tolerance wobble to the two chord endpoints', () => {
    // Default placement (WOBBLE's d-bbox does not start at y=0 — left/top 0
    // would move it; P1-6): scene == d, so the round trip lands on d exactly.
    const src = new fabric.Path(WOBBLE, { fill: '', stroke: '#000', strokeWidth: 0 });
    const c = fakeCanvas([]);
    const out = simplifyPathObject(c as unknown as fabric.Canvas, src, 1.5);
    expect(out).toBeInstanceOf(fabric.Path);
    const { pts, closed } = anchors(out!);
    expect(closed).toBe(false);
    expect(pts).toHaveLength(2);
    // Absolute-space round trip: endpoints land back on the original coords.
    expect(pts[0][0]).toBeCloseTo(0, 1);
    expect(pts[0][1]).toBeCloseTo(0, 1);
    expect(pts[1][0]).toBeCloseTo(100, 1);
    expect(pts[1][1]).toBeCloseTo(0, 1);
  });

  it('keeps corners that deviate beyond the tolerance', () => {
    // A 30px spike is way outside any sane tolerance — the tip must survive.
    const spiky = 'M 0 0 L 25 0 L 50 30 L 75 0 L 100 0';
    const src = new fabric.Path(spiky, PATH_OPTS);
    const c = fakeCanvas([]);
    const out = simplifyPathObject(c as unknown as fabric.Canvas, src, 1.5)!;
    const { pts } = anchors(out);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    const tip = pts.find(([x, y]) => Math.abs(x - 50) < 0.5 && Math.abs(y - 30) < 0.5);
    expect(tip).toBeDefined();
  });

  it('higher tolerance never keeps more anchors than lower tolerance', () => {
    // Dense polyline around a circle: tol 0.5 should keep ≥ the anchors of tol 5.
    const ring: string[] = [];
    const n = 72;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push(`${i === 0 ? 'M' : 'L'}${(100 + Math.cos(a) * 60).toFixed(3)} ${(100 + Math.sin(a) * 60).toFixed(3)}`);
    }
    ring.push('Z');
    const coarse = anchors(simplifyPathObject(fakeCanvas([]) as unknown as fabric.Canvas, new fabric.Path(ring.join(' ')), 5)!);
    const fine = anchors(simplifyPathObject(fakeCanvas([]) as unknown as fabric.Canvas, new fabric.Path(ring.join(' ')), 0.5)!);
    expect(fine.pts.length).toBeGreaterThan(coarse.pts.length);
    // Both stay closed.
    expect(coarse.closed).toBe(true);
    expect(fine.closed).toBe(true);
  });

  it('clamps a zero tolerance to the 0.1px floor instead of no-op', () => {
    const src = new fabric.Path(WOBBLE, { fill: '', stroke: '#000' });
    const out = simplifyPathObject(fakeCanvas([]) as unknown as fabric.Canvas, src, 0)!;
    // 0.5px wobble > 0.1px floor → wobble anchors survive the simplify.
    const { pts } = anchors(out);
    expect(pts.length).toBeGreaterThan(2);
  });

  it('preserves closed paths (Z) and their corner structure', () => {
    const square = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
    const out = simplifyPathObject(fakeCanvas([]) as unknown as fabric.Canvas, new fabric.Path(square, PATH_OPTS), 1.5)!;
    const { pts, closed } = anchors(out);
    expect(closed).toBe(true);
    // DP always pins the first + last anchors; a closed cut-path rings back
    // to its start, so the simplified output carries the duplicate closing
    // anchor: 4 unique corners + the closing repeat.
    expect(pts).toHaveLength(5);
    expect(pts[0][0]).toBeCloseTo(pts[4][0], 1);
    expect(pts[0][1]).toBeCloseTo(pts[4][1], 1);
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(0, 1);
    expect(Math.max(...xs)).toBeCloseTo(100, 1);
    expect(Math.min(...ys)).toBeCloseTo(0, 1);
    expect(Math.max(...ys)).toBeCloseTo(100, 1);
  });

  it('keeps every subpath of a compound path', () => {
    const two = 'M 0 0 L 100 0 M 200 0 L 300 0';
    const out = simplifyPathObject(fakeCanvas([]) as unknown as fabric.Canvas, new fabric.Path(two), 1.5)!;
    const cmds = (out.path as unknown as Cmd[]).map(s => String(s[0]).toUpperCase());
    expect(cmds.filter(c => c === 'M')).toHaveLength(2);
    // Each subpath simplified to its own chord (2 anchors × 2 subpaths).
    expect(anchors(out).pts).toHaveLength(4);
  });

  it('rebuilds a non-origin-bbox path at its scene coordinates (P1-6)', () => {
    // Default construction places the d-bbox centre at the object centre, so
    // the scene geometry IS the d geometry — but the d-bbox starts at
    // (0,10), the exact shape that used to rebuild shifted by its bbox
    // minimum (y≈10 → y≈20). The round trip must land back on the input.
    const src = new fabric.Path('M 0 10 L 30 10.5 L 70 10.5 L 100 10');
    const out = simplifyPathObject(fakeCanvas([]) as unknown as fabric.Canvas, src, 1.5)!;
    const { pts } = anchors(out);
    expect(pts).toHaveLength(2); // 0.5px wobble collapses under the tolerance
    expect(pts[0][0]).toBeCloseTo(0, 1);
    expect(pts[0][1]).toBeCloseTo(10, 1);
    expect(pts[1][0]).toBeCloseTo(100, 1);
    expect(pts[1][1]).toBeCloseTo(10, 1);
  });

  it('returns null for non-path objects without touching the canvas', () => {
    const c = fakeCanvas([]);
    expect(simplifyPathObject(c as unknown as fabric.Canvas, new fabric.Rect({ width: 5, height: 5 }), 1.5)).toBeNull();
    expect(c.add).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();
  });

  it('carries fill/stroke/strokeWidth/opacity onto the replacement path', () => {
    const src = new fabric.Path(WOBBLE, { ...PATH_OPTS, fill: '#123456', stroke: '#abcdef', strokeWidth: 3, opacity: 0.5 });
    const out = simplifyPathObject(fakeCanvas([]) as unknown as fabric.Canvas, src, 1.5)!;
    expect(out.fill).toBe('#123456');
    expect(out.stroke).toBe('#abcdef');
    expect(out.strokeWidth).toBe(3);
    expect(out.opacity).toBe(0.5);
  });

  it('swaps the object on the canvas (remove old, add new)', () => {
    const src = new fabric.Path(WOBBLE);
    const c = fakeCanvas([]);
    const out = simplifyPathObject(c as unknown as fabric.Canvas, src, 1.5)!;
    expect(c.remove).toHaveBeenCalledWith(src);
    expect(c.add).toHaveBeenCalledWith(out);
  });
});

/* ------------------------- selection-level API ------------------------- */

describe('simplifySelection', () => {
  it('simplifies every selected path and reports the count', () => {
    const p1 = new fabric.Path(WOBBLE);
    const p2 = new fabric.Path('M 0 0 L 5 0.1 L 10 0');
    const c = fakeCanvas([p1, p2]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(simplifySelection()).toBe(2);
    expect(c.remove).toHaveBeenCalledTimes(2);
    expect(c.add).toHaveBeenCalledTimes(2);
    expect(c.discardActiveObject).toHaveBeenCalledOnce();
    expect(c.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('is a no-op when the selection has no paths', () => {
    const c = fakeCanvas([new fabric.Rect({ width: 5, height: 5 }), new fabric.Circle({ radius: 3 })]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(simplifySelection()).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    expect(c.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('returns 0 without a live canvas', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(simplifySelection()).toBe(0);
    expect(canSimplify()).toBe(false);
  });

  it('canSimplify reflects the selection shape', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(fakeCanvas([new fabric.Path('M 0 0 L 10 0')]) as never);
    expect(canSimplify()).toBe(true);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(fakeCanvas([new fabric.Rect({ width: 5, height: 5 })]) as never);
    expect(canSimplify()).toBe(false);
  });
});
