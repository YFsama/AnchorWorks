/**
 * Twist effect tests.
 *
 * twistPolyline is pure math and pinned exactly:
 *  - guards (short input, r ≤ 0) return a copy unchanged
 *  - the pivot point itself never moves
 *  - rotation angle grows linearly with distance: a corner at distance r
 *    rotates the full maxRad; a point at r/2 rotates half of it
 *  - sign of the angle controls swirl direction; closed loops stay closed
 *
 * twistObject / twistSelection run the REAL outline pipeline on an
 * origin-pinned square (see offsetPath.test.ts for why off-origin placement
 * is avoided while the contour fix lands): original replaced, style
 * inherited, angle-0 and type guards, history/selection side effects.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canTwist, canTwistObject, twistObject, twistPolyline, twistSelection } from '../twist';
import * as canvasEngine from '../canvasEngine';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCanvas(active: fabric.FabricObject[]) {
  const c = {
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
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
  return { c, history };
}

/** A 100×100 square, origin-pinned, stroke-free. */
function square(): fabric.Rect {
  return new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '#111111', stroke: '#abcdef', strokeWidth: 0, opacity: 0.6 });
}

const SQ_2 = Math.SQRT2;
const deg = (d: number) => (d * Math.PI) / 180;

describe('twistPolyline', () => {
  it('returns a copy unchanged for short input or a non-positive radius', () => {
    const pts: Array<[number, number]> = [[0, 0]];
    expect(twistPolyline(pts, false, 50, 50, 0, deg(90))).toEqual(pts);
    expect(twistPolyline([], true, 50, 50, 100, deg(90))).toEqual([]);
    const two: Array<[number, number]> = [[0, 0], [10, 0]];
    const out = twistPolyline(two, false, 5, 5, -1, deg(90));
    expect(out).toEqual(two); // guard paths are shallow copies...
    expect(out).not.toBe(two); // ...but a distinct array object
  });

  it('keeps the pivot point exactly in place', () => {
    const out = twistPolyline([[50, 50], [150, 50]], false, 50, 50, 100, deg(360));
    expect(out[0][0]).toBeCloseTo(50, 9);
    expect(out[0][1]).toBeCloseTo(50, 9);
  });

  it('rotates a corner at distance r by the full angle (square, 90°)', () => {
    // Square 0..100 around centre (50,50); corner distance = 50√2.
    const pts: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const out = twistPolyline(pts, true, 50, 50, 50 * SQ_2, deg(90));
    // Screen-coord rotation is clockwise: (0,0) → (100,0) → (100,100) → (0,100).
    expect(out[0][0]).toBeCloseTo(100, 6);
    expect(out[0][1]).toBeCloseTo(0, 6);
    expect(out[1][0]).toBeCloseTo(100, 6);
    expect(out[1][1]).toBeCloseTo(100, 6);
    // Closed loop stays closed.
    expect(out[4]).toEqual(out[0]);
  });

  it('scales the rotation linearly with distance (half radius → half angle)', () => {
    // Point (0,50) is at distance 50 from (50,50); with r = 100 and 90° max
    // it rotates by 45°: (−50,0) → (−50/√2, −50/√2) → absolute ≈ (14.64, 14.64).
    const out = twistPolyline([[0, 50], [100, 50]], false, 50, 50, 100, deg(90));
    expect(out[0][0]).toBeCloseTo(50 - 50 / SQ_2, 6);
    expect(out[0][1]).toBeCloseTo(50 - 50 / SQ_2, 6);
  });

  it('negative angles swirl the other way', () => {
    const out = twistPolyline([[0, 0], [100, 0]], false, 50, 50, 50 * SQ_2, -deg(90));
    expect(out[0][0]).toBeCloseTo(0, 6);
    expect(out[0][1]).toBeCloseTo(100, 6);
  });
});

describe('canTwistObject', () => {
  it('accepts path / rect / polygon / ellipse — but NOT circle', () => {
    expect(canTwistObject(new fabric.Path('M 0 0 L 10 0'))).toBe(true);
    expect(canTwistObject(new fabric.Rect({ width: 10, height: 10 }))).toBe(true);
    expect(canTwistObject(new fabric.Polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]))).toBe(true);
    expect(canTwistObject(new fabric.Ellipse({ rx: 10, ry: 5 }))).toBe(true);
    // Note: twist excludes circle (unlike offsetPath, which includes it).
    expect(canTwistObject(new fabric.Circle({ radius: 5 }))).toBe(false);
    expect(canTwistObject({ type: 'textbox' } as fabric.FabricObject)).toBe(false);
  });
});

describe('twistObject', () => {
  it('returns null for angle 0 or unsupported types, keeping the original', () => {
    const c = makeCanvas([]).c;
    expect(twistObject(c as unknown as fabric.Canvas, square(), 0)).toBeNull();
    expect(twistObject(c as unknown as fabric.Canvas, { type: 'textbox' } as fabric.FabricObject, 45)).toBeNull();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.add).not.toHaveBeenCalled();
  });

  it('replaces the object with a densified twisted path and inherits its style', () => {
    const { c } = makeCanvas([]);
    const src = square();
    const out = twistObject(c as unknown as fabric.Canvas, src, 45);
    expect(out).toBeInstanceOf(fabric.Path);
    expect(c.remove).toHaveBeenCalledWith(src);
    expect(c.add).toHaveBeenCalledWith(out);
    expect(out!.fill).toBe('#111111');
    expect(out!.stroke).toBe('#abcdef');
    expect(out!.opacity).toBeCloseTo(0.6, 6);
    // The swirl preserves the outline's centroid (bbox centre ≈ (50,50)).
    const b = out!.getBoundingRect();
    expect(b.left + b.width / 2).toBeCloseTo(50, 0);
    expect(b.top + b.height / 2).toBeCloseTo(50, 0);
    // Densified: a twisted square carries far more than the 4 source anchors.
    expect((out!.path as unknown[]).length).toBeGreaterThan(20);
  });
});

describe('canTwist / twistSelection', () => {
  it('canTwist is false without a canvas or with no twistable selection', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(canTwist()).toBe(false);
    const { c } = makeCanvas([{ type: 'textbox' } as fabric.FabricObject]);
    expect(canTwist()).toBe(false);
    void c;
  });

  it('twistSelection: angle 0 or empty/no-fit selection → 0, no history', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    expect(twistSelection(45)).toBe(0);
    const { c, history: h } = makeCanvas([square()]);
    expect(twistSelection(0)).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    expect(h).not.toHaveBeenCalled();
    void history;
  });

  it('twistSelection transforms each twistable object once and pushes one history entry', () => {
    const { c, history } = makeCanvas([square(), { type: 'textbox' } as fabric.FabricObject]);
    expect(twistSelection(30)).toBe(1);
    expect(c.add).toHaveBeenCalledTimes(1);
    expect(c.discardActiveObject).toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(1);
  });
});
