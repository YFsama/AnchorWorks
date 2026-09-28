/**
 * Round Corners (Effect→Stylize→Round Corners) — quadratic-bezier fillets.
 *
 * Each polyline vertex is replaced by a quad-bezier arc that starts/ends
 * `r` back along the two adjacent edges, clamped to half the shorter edge
 * so neighbouring fillets never overlap. These tests pin:
 *
 *  - straight-line geometry is a no-op (a 2-point path is returned as-is;
 *    collinear mid-vertices subdivide but never leave the line)
 *  - a closed square becomes 4×(STEPS+1)=28 anchors with every fillet
 *    point inside the original bounding box
 *  - radius clamping at half the shortest edge (a huge radius degrades to
 *    half-edge fillets, never beyond)
 *  - accepted object types (path/rect/polygon) and the radius>0 guard
 *  - selection-level counts/history side effects
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canRoundCorners, canRoundCornersObject, roundCornersObject, roundCornersOnSelection } from '../roundCorners';
import * as canvasEngine from '../canvasEngine';

type Cmd = [string, number?, number?];

/** Pin the object to its d-coordinates (exact absolute-space round trip). */
const OPTS = { left: 0, top: 0, fill: '', stroke: '#000', strokeWidth: 0 } as const;

const MM_TO_PX = 3.7795;

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

function makeCanvas(objects: fabric.FabricObject[]) {
  return {
    getActiveObjects: () => objects,
    remove: vi.fn(),
    add: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('canRoundCornersObject', () => {
  it('accepts path / rect / polygon only', () => {
    expect(canRoundCornersObject(new fabric.Path('M 0 0 L 10 0'))).toBe(true);
    expect(canRoundCornersObject(new fabric.Rect({ width: 10, height: 10 }))).toBe(true);
    expect(canRoundCornersObject(new fabric.Polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]))).toBe(true);
    expect(canRoundCornersObject(new fabric.Circle({ radius: 5 }))).toBe(false);
    expect(canRoundCornersObject({ type: 'textbox' } as fabric.FabricObject)).toBe(false);
  });
});

describe('roundCornersObject', () => {
  it('returns a 2-point straight path unchanged (no corners to round)', () => {
    const line = new fabric.Path('M 0 0 L 100 0', OPTS);
    const c = makeCanvas([]);
    const out = roundCornersObject(c as unknown as fabric.Canvas, line, 10)!;
    expect(out).toBeInstanceOf(fabric.Path);
    const { pts, closed } = anchors(out);
    expect(closed).toBe(false);
    expect(pts).toHaveLength(2);
    expect(pts[0][0]).toBeCloseTo(0, 1);
    expect(pts[1][0]).toBeCloseTo(100, 1);
    expect(pts.every(([, y]) => Math.abs(y) < 0.05)).toBe(true);
  });

  it('subdivides collinear mid-vertices without leaving the straight line', () => {
    // Three collinear anchors: rounding inserts bezier samples, but with a
    // straight corner every sample stays on the line — geometry no-op.
    const straight = new fabric.Path('M 0 0 L 50 0 L 100 0', OPTS);
    const out = roundCornersObject(makeCanvas([]) as unknown as fabric.Canvas, straight, 5)!;
    const { pts } = anchors(out);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(pts.every(([, y]) => Math.abs(y) < 0.05)).toBe(true);
    // X still spans the full original extent.
    const xs = pts.map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(0, 1);
    expect(Math.max(...xs)).toBeCloseTo(100, 1);
  });

  it('fillets every corner of a closed square into 7-sample bezier arcs', () => {
    const square = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', OPTS);
    const out = roundCornersObject(makeCanvas([]) as unknown as fabric.Canvas, square, 10)!;
    const { pts, closed } = anchors(out);
    expect(closed).toBe(true);
    // 4 corners × (STEPS + 1 samples) — the ring's duplicate closing anchor
    // is dropped before filleting (eq(start,end) check).
    expect(pts).toHaveLength(4 * 7);
    // Every fillet point stays inside the original 100×100 box — the arcs
    // cut the corner, never bulge past the edges.
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(-0.05);
      expect(x).toBeLessThanOrEqual(100.05);
      expect(y).toBeGreaterThanOrEqual(-0.05);
      expect(y).toBeLessThanOrEqual(100.05);
    }
    // The first fillet starts r back from corner (0,0) along the previous
    // edge (coming from (0,100)) — i.e. at (0, r_px).
    const rPx = 10 * MM_TO_PX;
    expect(pts[0][0]).toBeCloseTo(0, 1);
    expect(pts[0][1]).toBeCloseTo(rPx, 1);
    // The sharp corners themselves are gone: no anchor lands on (0,0).
    expect(pts.some(([x, y]) => Math.abs(x) < 0.05 && Math.abs(y) < 0.05)).toBe(false);
  });

  it('clamps the effective radius to half the shorter adjacent edge', () => {
    const square = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', OPTS);
    // Radius far larger than the edges — fillets must degrade to half-edge
    // (50px) and the shape must remain inside its bounding box.
    const out = roundCornersObject(makeCanvas([]) as unknown as fabric.Canvas, square, 1000)!;
    const { pts } = anchors(out);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(-0.05);
      expect(x).toBeLessThanOrEqual(100.05);
      expect(y).toBeGreaterThanOrEqual(-0.05);
      expect(y).toBeLessThanOrEqual(100.05);
    }
    // At the clamp limit the fillet endpoints meet the edge midpoints —
    // e.g. corner (100,0) arcs from (50,0) to (100,50).
    const hasMidTop = pts.some(([x, y]) => Math.abs(x - 50) < 0.05 && Math.abs(y) < 0.05);
    const hasMidRight = pts.some(([x, y]) => Math.abs(x - 100) < 0.05 && Math.abs(y - 50) < 0.05);
    expect(hasMidTop).toBe(true);
    expect(hasMidRight).toBe(true);
  });

  it('never lets adjacent fillets overlap on a narrow rectangle', () => {
    // 200×40 box: the short (40px) edges clamp the radius to 20px so the
    // long-edge fillets can't cross the centre.
    const rect = new fabric.Path('M 0 0 L 200 0 L 200 40 L 0 40 Z', OPTS);
    const out = roundCornersObject(makeCanvas([]) as unknown as fabric.Canvas, rect, 100)!;
    const { pts } = anchors(out);
    const xs = pts.map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.05);
    expect(Math.max(...xs)).toBeLessThanOrEqual(200.05);
    expect(pts).toHaveLength(4 * 7);
  });

  it('rounds rect and polygon objects too (type gate)', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, strokeWidth: 0 });
    const c = makeCanvas([rect]);
    const out = roundCornersObject(c as unknown as fabric.Canvas, rect, 10)!;
    expect(out).toBeInstanceOf(fabric.Path);
    // Rects trace a closed outline → 4 filleted corners, still closed.
    const { pts, closed } = anchors(out);
    expect(closed).toBe(true);
    expect(pts).toHaveLength(4 * 7);

    const poly = new fabric.Polygon(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      { left: 0, top: 0, strokeWidth: 0 },
    );
    const c2 = makeCanvas([poly]);
    expect(roundCornersObject(c2 as unknown as fabric.Canvas, poly, 10)).toBeInstanceOf(fabric.Path);
  });

  it('rounds an off-origin square in place (P1-6)', () => {
    // d-bbox min (20,10), default placement → the square's scene geometry is
    // exactly its d geometry. The fillets must stay inside that box — the
    // historical rebuild shifted the whole ring by the bbox minimum, pushing
    // every anchor to (x+20, y+10).
    const square = new fabric.Path('M 20 10 L 120 10 L 120 110 L 20 110 Z');
    const out = roundCornersObject(makeCanvas([]) as unknown as fabric.Canvas, square, 10)!;
    const { pts, closed } = anchors(out);
    expect(closed).toBe(true);
    expect(pts).toHaveLength(4 * 7);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(20 - 0.05);
      expect(x).toBeLessThanOrEqual(120.05);
      expect(y).toBeGreaterThanOrEqual(10 - 0.05);
      expect(y).toBeLessThanOrEqual(110.05);
    }
    // First fillet starts r back from the M corner (20,10) along the closing
    // edge — i.e. at (20, 10 + r_px).
    const rPx = 10 * MM_TO_PX;
    expect(pts[0][0]).toBeCloseTo(20, 1);
    expect(pts[0][1]).toBeCloseTo(10 + rPx, 1);
    expect(pts.some(([x, y]) => Math.abs(x - 20) < 0.05 && Math.abs(y - 10) < 0.05)).toBe(false);
  });

  it('returns null for unsupported objects or radius <= 0', () => {
    const c = makeCanvas([]);
    expect(roundCornersObject(c as unknown as fabric.Canvas, new fabric.Circle({ radius: 5 }), 10)).toBeNull();
    expect(roundCornersObject(c as unknown as fabric.Canvas, new fabric.Path('M 0 0 L 10 0 L 10 10', OPTS), 0)).toBeNull();
    expect(roundCornersObject(c as unknown as fabric.Canvas, new fabric.Path('M 0 0 L 10 0 L 10 10', OPTS), -5)).toBeNull();
    expect(c.add).not.toHaveBeenCalled();
  });

  it('carries fill/stroke/opacity onto the replacement path', () => {
    const square = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', { ...OPTS, fill: '#abcdef', stroke: '#111111', opacity: 0.6 });
    const out = roundCornersObject(makeCanvas([]) as unknown as fabric.Canvas, square, 5)!;
    expect(out.fill).toBe('#abcdef');
    expect(out.stroke).toBe('#111111');
    expect(out.opacity).toBe(0.6);
  });
});

describe('roundCornersOnSelection', () => {
  it('rounds every selected eligible object and reports the count', () => {
    const a = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', OPTS);
    const b = new fabric.Rect({ left: 0, top: 0, width: 80, height: 80, strokeWidth: 0 });
    const skip = new fabric.Circle({ radius: 5 });
    const c = makeCanvas([a, b, skip]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(roundCornersOnSelection(10)).toBe(2);
    expect(c.remove).toHaveBeenCalledTimes(2);
    expect(c.add).toHaveBeenCalledTimes(2);
    expect(c.remove).not.toHaveBeenCalledWith(skip);
    expect(c.discardActiveObject).toHaveBeenCalledOnce();
    expect(c.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('returns 0 for radius <= 0 or empty / ineligible selections', () => {
    const c = makeCanvas([new fabric.Path('M 0 0 L 10 0 L 10 10', OPTS)]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    expect(roundCornersOnSelection(0)).toBe(0);
    expect(roundCornersOnSelection(-3)).toBe(0);
    expect(c.add).not.toHaveBeenCalled();

    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(makeCanvas([new fabric.Circle({ radius: 5 })]) as never);
    expect(roundCornersOnSelection(10)).toBe(0);
  });

  it('returns 0 without a live canvas; canRoundCorners mirrors eligibility', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(roundCornersOnSelection(10)).toBe(0);
    expect(canRoundCorners()).toBe(false);

    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(makeCanvas([new fabric.Rect({ width: 5, height: 5 })]) as never);
    expect(canRoundCorners()).toBe(true);
  });
});
