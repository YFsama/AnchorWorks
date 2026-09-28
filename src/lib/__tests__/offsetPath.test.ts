/**
 * Offset Path (Illustrator Object→Path→Offset Path) tests.
 *
 * Pins offsetPathObject / offsetPathSelection against the REAL outline
 * pipeline (buildOutlineCutPaths → offsetPolyline) on origin-pinned fabric
 * objects:
 *
 *  - accepted object types and the offsetMm guards (0 / NaN → null)
 *  - outward (+) and inward (−) offsets expand/shrink a square by exactly
 *    2·offset in each dimension (mm→px round trip is lossless)
 *  - the original object is kept; the new path inherits fill/stroke style
 *  - open paths offset sideways (no closing edge added); closed paths keep Z
 *  - an inward offset larger than the shape collapses to null
 *  - selection-level counts, selection hand-off and history
 *
 * NOTE: objects are pinned at left:0/top:0 with raw geometry starting at the
 * origin. buildOutlineCutPaths (contourFromSelection.ts) is mid-fix by the
 * parallel geometry agent for off-origin placement; the off-origin case is
 * skip-levelled below against its documented-intended behaviour.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canOffsetPath, canOffsetPathObject, offsetPathObject, offsetPathSelection } from '../offsetPath';
import { offsetPolyline } from '../cutContour';
import * as canvasEngine from '../canvasEngine';

type Cmd = [string, number?, number?];

const MM_TO_PX = 3.7795;

/** Pin the object to its d-coordinates (exact absolute-space round trip). */
const OPTS = { left: 0, top: 0, fill: '', stroke: '#000', strokeWidth: 0 } as const;

afterEach(() => {
  vi.restoreAllMocks();
});

/* --------------------------------- helpers --------------------------------- */

function makeCanvas(active: fabric.FabricObject[]) {
  return {
    getObjects: () => active,
    getActiveObjects: () => active,
    remove: vi.fn(),
    add: vi.fn(),
    setActiveObject: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
    fire: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

function mockCanvas(c: ReturnType<typeof makeCanvas>) {
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  return vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
}

/** Extract the L-anchors and closed flag of a generated fabric.Path. */
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

function area(pts: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return Math.abs(a / 2);
}

/** A 100×100 square, origin-pinned, stroke-free so the extracted outline
 *  equals the raw geometry (stroke interacts with the outline extraction —
 *  see the dedicated stroke test below). */
function square(fill = '#123456'): fabric.FabricObject {
  return new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill, stroke: '#abcdef', strokeWidth: 0, opacity: 0.7 });
}

/* --------------------------------- types ----------------------------------- */

describe('canOffsetPathObject', () => {
  it('accepts path / rect / polygon / ellipse / circle', () => {
    expect(canOffsetPathObject(new fabric.Path('M 0 0 L 10 0'))).toBe(true);
    expect(canOffsetPathObject(new fabric.Rect({ width: 10, height: 10 }))).toBe(true);
    expect(canOffsetPathObject(new fabric.Polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]))).toBe(true);
    expect(canOffsetPathObject(new fabric.Ellipse({ rx: 10, ry: 5 }))).toBe(true);
    expect(canOffsetPathObject(new fabric.Circle({ radius: 5 }))).toBe(true);
  });

  it('rejects other object types', () => {
    expect(canOffsetPathObject({ type: 'textbox' } as fabric.FabricObject)).toBe(false);
    expect(canOffsetPathObject({ type: 'image' } as fabric.FabricObject)).toBe(false);
    expect(canOffsetPathObject({ type: 'group' } as fabric.FabricObject)).toBe(false);
  });
});

/* ----------------------------- offsetPathObject ----------------------------- */

describe('offsetPathObject', () => {
  it('returns null for a zero or non-finite offset (documented no-op)', () => {
    const c = makeCanvas([]);
    expect(offsetPathObject(c as unknown as fabric.Canvas, square(), 0)).toBeNull();
    expect(offsetPathObject(c as unknown as fabric.Canvas, square(), Number.NaN)).toBeNull();
    expect(c.add).not.toHaveBeenCalled();
  });

  it('returns null for unsupported object types', () => {
    const c = makeCanvas([]);
    const text = { type: 'textbox' } as fabric.FabricObject;
    expect(offsetPathObject(c as unknown as fabric.Canvas, text, 5)).toBeNull();
    expect(c.add).not.toHaveBeenCalled();
  });

  it('expands a square outward by exactly 2·offset in each dimension', () => {
    const c = makeCanvas([]);
    const out = offsetPathObject(c as unknown as fabric.Canvas, square(), 5)!;
    expect(out).toBeInstanceOf(fabric.Path);
    const d = 5 * MM_TO_PX;
    const { pts, closed } = anchors(out);
    expect(closed).toBe(true);
    expect(area(pts)).toBeCloseTo((100 + 2 * d) ** 2, -1);
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(-d, 0);
    expect(Math.max(...xs)).toBeCloseTo(100 + d, 0);
    expect(Math.min(...ys)).toBeCloseTo(-d, 0);
    expect(Math.max(...ys)).toBeCloseTo(100 + d, 0);
  });

  it('shrinks a square inward by exactly 2·offset in each dimension', () => {
    const c = makeCanvas([]);
    const out = offsetPathObject(c as unknown as fabric.Canvas, square(), -5)!;
    const d = 5 * MM_TO_PX;
    const { pts } = anchors(out);
    expect(area(pts)).toBeCloseTo((100 - 2 * d) ** 2, -1);
  });

  it('vanishes (null) when the inward offset exceeds the shape — offsetPolyline inward-overflow bug', () => {
    // A −60mm (≈227px) inward offset into a 100px square has no area to
    // keep, so nothing should be added. P1-8 fixed: offsetPolyline used to
    // return an INVERTED square LARGER than the input (span 2·(|d| − 50))
    // instead of collapsing; it now detects the orientation flip and
    // vanishes, so offsetPathObject adds nothing.
    const c = makeCanvas([]);
    expect(offsetPathObject(c as unknown as fabric.Canvas, square(), -60)).toBeNull();
    expect(c.add).not.toHaveBeenCalled();
  });

  it('keeps the original object and inherits its fill/stroke style on the copy', () => {
    const c = makeCanvas([]);
    const src = new fabric.Rect({
      left: 0, top: 0, width: 100, height: 100,
      fill: '#123456', stroke: '#abcdef', strokeWidth: 3, opacity: 0.7,
    });
    const out = offsetPathObject(c as unknown as fabric.Canvas, src, 5)!;
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.add).toHaveBeenCalledTimes(1);
    expect(c.add).toHaveBeenCalledWith(out);
    expect(out.fill).toBe('#123456');
    expect(out.stroke).toBe('#abcdef');
    expect(out.strokeWidth).toBe(3);
    expect(out.opacity).toBeCloseTo(0.7, 6);
  });

  it('stroke-width interplay: a stroked rect still offsets to a closed ring ~2·offset wider', () => {
    // The outline extraction reads the stroked bounding box, so the base
    // outline can sit up to strokeWidth/2 off the raw geometry (placement
    // depends on the contour extraction under repair). Pin only the robust
    // fact: the result is a closed ring whose span grows by ≈2·offset.
    const c = makeCanvas([]);
    const stroked = new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '', strokeWidth: 2 });
    const out = offsetPathObject(c as unknown as fabric.Canvas, stroked, 5)!;
    const { pts, closed } = anchors(out);
    expect(closed).toBe(true);
    const d = 5 * MM_TO_PX;
    const spanX = Math.max(...pts.map(([x]) => x)) - Math.min(...pts.map(([x]) => x));
    // Base span is 100 (stroke-exclusive) up to 102 (stroke-inclusive).
    expect(spanX).toBeGreaterThan(100 + 2 * d - 0.5);
    expect(spanX).toBeLessThan(102 + 2 * d + 0.5);
  });

  it('offsets an OPEN path sideways without closing it', () => {
    const c = makeCanvas([]);
    const open = new fabric.Path('M 0 0 L 100 0', OPTS);
    const out = offsetPathObject(c as unknown as fabric.Canvas, open, 10)!;
    const { pts, closed } = anchors(out);
    expect(closed).toBe(false);
    expect(pts).toHaveLength(2);
    const d = 10 * MM_TO_PX;
    // +distance walks left of the direction of travel (right-hand rule in
    // screen coords) — for a left→right horizontal line that is "up" (−y).
    expect(pts[0][0]).toBeCloseTo(0, 0);
    expect(pts[0][1]).toBeCloseTo(-d, 0);
    expect(pts[1][0]).toBeCloseTo(100, 0);
    expect(pts[1][1]).toBeCloseTo(-d, 0);
  });

  it('offsets a closed Path object (d-string input) and keeps it closed', () => {
    const c = makeCanvas([]);
    const closed = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', OPTS);
    const out = offsetPathObject(c as unknown as fabric.Canvas, closed, 5)!;
    const { pts, closed: isClosed } = anchors(out);
    expect(isClosed).toBe(true);
    const d = 5 * MM_TO_PX;
    expect(area(pts)).toBeCloseTo((100 + 2 * d) ** 2, -1);
  });

  it('hugs an object placed away from the origin', () => {
    // INTENDED behaviour: the offset ring surrounds the object's own on-screen
    // bounding box wherever it sits. Was skip-levelled on the P1-6 contour
    // bug (half-width subtracted from absolute coords doubled the position);
    // un-skipped now that buildOutlineCutPaths subtracts pathOffset.
    const c = makeCanvas([]);
    const moved = new fabric.Rect({ left: 200, top: 100, width: 100, height: 100, fill: '', strokeWidth: 0 });
    const out = offsetPathObject(c as unknown as fabric.Canvas, moved, 5)!;
    const d = 5 * MM_TO_PX;
    const { pts } = anchors(out);
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(200 - d, 0);
    expect(Math.max(...xs)).toBeCloseTo(300 + d, 0);
    expect(Math.min(...ys)).toBeCloseTo(100 - d, 0);
    expect(Math.max(...ys)).toBeCloseTo(200 + d, 0);
  });
});

/* ---------------------------- selection wrappers ---------------------------- */

describe('canOffsetPath', () => {
  it('is false without a live canvas or an empty selection', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(canOffsetPath()).toBe(false);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(makeCanvas([]) as never);
    expect(canOffsetPath()).toBe(false);
  });

  it('is true when at least one active object is offsettable', () => {
    vi.spyOn(canvasEngine, 'getCanvas')
      .mockReturnValue(makeCanvas([{ type: 'textbox' } as fabric.FabricObject, new fabric.Rect({ width: 5, height: 5 })]) as never);
    expect(canOffsetPath()).toBe(true);
  });
});

describe('offsetPathSelection', () => {
  it('returns 0 for a zero offset without touching the canvas', () => {
    const c = makeCanvas([square()]);
    mockCanvas(c);
    expect(offsetPathSelection(0)).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
  });

  it('returns 0 with no live canvas or empty selection', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(offsetPathSelection(5)).toBe(0);
    const c = makeCanvas([]);
    mockCanvas(c);
    expect(offsetPathSelection(5)).toBe(0);
  });

  it('creates one offset copy per selected object and selects the copies', async () => {
    const c = makeCanvas([square('#111111'), square('#222222')]);
    const history = mockCanvas(c);
    expect(offsetPathSelection(5)).toBe(2);
    expect(c.add).toHaveBeenCalledTimes(2);
    expect(c.discardActiveObject).toHaveBeenCalled();
    expect(c.setActiveObject).toHaveBeenCalledTimes(1);
    expect(c.setActiveObject.mock.calls[0][0]).toBeInstanceOf(fabric.ActiveSelection);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('selects the single copy directly when only one object is offset', () => {
    const c = makeCanvas([square()]);
    mockCanvas(c);
    expect(offsetPathSelection(5)).toBe(1);
    const selected = c.setActiveObject.mock.calls[0][0];
    expect(selected).toBeInstanceOf(fabric.Path);
    expect(c.setActiveObject).toHaveBeenCalledTimes(1);
  });

  it('skips unsupported objects and reports only the created count', () => {
    const c = makeCanvas([{ type: 'textbox' } as fabric.FabricObject, square()]);
    mockCanvas(c);
    expect(offsetPathSelection(5)).toBe(1);
    expect(c.add).toHaveBeenCalledTimes(1);
  });
});

/* ---------------- direct offsetPolyline cases (P1-8) ---------------- */

describe('offsetPolyline — inward-overflow inversion (P1-8)', () => {
  // Convention shared with cutContour.test.ts: a 100-unit square listed
  // [[0,0],[100,0],[100,100],[0,100]] with +distance = expand. An inward
  // offset is "overflowing" once |d| exceeds the half-extent (50 here).
  const SQ: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];

  function span(ring: Array<[number, number]>): number {
    const xs = ring.map(([x]) => x);
    return Math.max(...xs) - Math.min(...xs);
  }

  it('vanishes (no rings) when the inward offset slightly exceeds the half-extent', () => {
    // Used to return an INVERTED square with span 2·(|d| − 50) = 20.
    expect(offsetPolyline(SQ, -60, true)).toEqual([]);
  });

  it('vanishes (no rings) at the degenerate exactly-half-extent offset (zero-area ring)', () => {
    // All four miter points collapse onto the centre → zero area → vanish.
    expect(offsetPolyline(SQ, -50, true)).toEqual([]);
  });

  it('still returns the correct smaller ring for a normal inward offset', () => {
    const rings = offsetPolyline(SQ, -10, true);
    expect(rings).toHaveLength(1);
    expect(span(rings[0])).toBeCloseTo(80, 6);
  });

  it('still returns the larger ring for an outward offset', () => {
    const rings = offsetPolyline(SQ, 10, true);
    expect(rings).toHaveLength(1);
    expect(span(rings[0])).toBeCloseTo(120, 6);
  });

  it('leaves open polylines untouched by the closed-shape overflow guard', () => {
    // The guard is meaningless for open paths — a sideways shift is always
    // representable, so the line still offsets to a translated segment.
    const line: Array<[number, number]> = [[0, 0], [100, 0]];
    const out = offsetPolyline(line, -60, false);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
  });
});
