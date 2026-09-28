/**
 * Scale-to-exact-size tests.
 *
 * Runs against a REAL fabric.Rect as the active object so getBoundingRect /
 * getCenterPoint / setPositionByOrigin behave exactly as in the app:
 *
 *  - selectionSizeMm converts the px bounding box to mm (÷3.7795); null guards
 *  - exact width scaling: fx = target/current, about the centre (centre fixed)
 *  - lock=true makes the scale uniform (factor from whichever dim is given);
 *    lock=false only scales the provided dimension
 *  - null / zero / negative dims are ignored, not clamped; both missing → false
 *  - identity targets (factor within 1e-6 of 1) are a no-op returning false
 *  - scaling composes onto the object's existing scaleX/scaleY
 *  - success renders + pushes one history entry; guards never do
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scaleSelectionToSize, selectionSizeMm } from '../scaleToSize';
import * as canvasEngine from '../canvasEngine';

const MM_TO_PX = 3.7795;
const px = (v: number) => v / MM_TO_PX; // px expressed as its mm equivalent

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCanvas(active: fabric.FabricObject | null) {
  const c = {
    getActiveObject: () => active ?? null,
    requestRenderAll: vi.fn(),
    fire: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
  return { c, history };
}

/** 100×50 at the origin, stroke-free so the bbox is exact. */
function rect(): fabric.Rect {
  return new fabric.Rect({ left: 0, top: 0, width: 100, height: 50, strokeWidth: 0 });
}

describe('selectionSizeMm', () => {
  it('returns null without a canvas or an active object', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(selectionSizeMm()).toBeNull();
    const { c } = makeCanvas(null);
    expect(selectionSizeMm()).toBeNull();
    void c;
  });

  it('converts the px bounding box to mm', () => {
    makeCanvas(rect());
    const s = selectionSizeMm()!;
    expect(s.w).toBeCloseTo(100 / MM_TO_PX, 6);
    expect(s.h).toBeCloseTo(50 / MM_TO_PX, 6);
  });
});

describe('scaleSelectionToSize', () => {
  it('returns false for every guard without touching the object', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(scaleSelectionToSize(100, 100, true)).toBe(false);

    const noActive = makeCanvas(null);
    expect(scaleSelectionToSize(100, 100, true)).toBe(false);

    const flat = new fabric.Rect({ left: 0, top: 0, width: 0, height: 0, strokeWidth: 0 });
    makeCanvas(flat);
    expect(scaleSelectionToSize(100, 100, true)).toBe(false);

    const r = rect();
    const { c, history } = makeCanvas(r);
    expect(scaleSelectionToSize(null, null, true)).toBe(false);       // nothing asked
    expect(scaleSelectionToSize(0, 0, true)).toBe(false);             // zeros ignored
    expect(scaleSelectionToSize(-5, -5, true)).toBe(false);           // negatives ignored
    expect(r.scaleX).toBe(1);
    expect(r.scaleY).toBe(1);
    expect(c.requestRenderAll).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
    void noActive;
  });

  it('scales to an exact width in mm, about the centre', () => {
    const r = rect();
    const { history } = makeCanvas(r);
    expect(scaleSelectionToSize(px(200), null, false)).toBe(true);
    expect(r.scaleX).toBeCloseTo(2, 6);
    expect(r.scaleY).toBeCloseTo(1, 6); // lock off — height untouched
    const b = r.getBoundingRect();
    expect(b.width).toBeCloseTo(200, 6);
    expect(b.height).toBeCloseTo(50, 6);
    // Centred: the box grew symmetrically around (50, 25).
    expect(r.getCenterPoint().x).toBeCloseTo(50, 3);
    expect(r.getCenterPoint().y).toBeCloseTo(25, 3);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('scales to an exact height in mm when only height is given', () => {
    const r = rect();
    makeCanvas(r);
    expect(scaleSelectionToSize(null, px(100), false)).toBe(true);
    expect(r.scaleX).toBeCloseTo(1, 6);
    expect(r.scaleY).toBeCloseTo(2, 6);
    expect(r.getBoundingRect().width).toBeCloseTo(100, 6);
    expect(r.getBoundingRect().height).toBeCloseTo(100, 6);
  });

  it('lock=true derives a uniform factor from width and scales both axes', () => {
    const r = rect();
    makeCanvas(r);
    expect(scaleSelectionToSize(px(300), null, true)).toBe(true);
    expect(r.scaleX).toBeCloseTo(3, 6);
    expect(r.scaleY).toBeCloseTo(3, 6); // uniform even though h was null
  });

  it('lock=true derives the uniform factor from height when width is absent', () => {
    const r = rect();
    makeCanvas(r);
    expect(scaleSelectionToSize(null, px(200), true)).toBe(true);
    expect(r.scaleX).toBeCloseTo(4, 6);
    expect(r.scaleY).toBeCloseTo(4, 6);
  });

  it('unlock with both dims scales each axis independently', () => {
    const r = rect();
    makeCanvas(r);
    expect(scaleSelectionToSize(px(50), px(100), false)).toBe(true);
    expect(r.scaleX).toBeCloseTo(0.5, 6);
    expect(r.scaleY).toBeCloseTo(2, 6);
    const b = r.getBoundingRect();
    expect(b.width).toBeCloseTo(50, 6);
    expect(b.height).toBeCloseTo(100, 6);
  });

  it('a target equal to the current size is a no-op returning false', () => {
    const r = rect();
    const { c, history } = makeCanvas(r);
    expect(scaleSelectionToSize(px(100), null, false)).toBe(false);
    expect(r.scaleX).toBe(1);
    expect(c.requestRenderAll).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('composes onto the object\u2019s existing scale', () => {
    const r = rect();
    r.scale(2); // now 200×100 px, scaleX=scaleY=2
    makeCanvas(r);
    // Ask for the CURRENT size in mm → factor 1 → no-op...
    expect(scaleSelectionToSize(px(200), null, false)).toBe(false);
    // Ask for 100px wide from the 200px state → fx = 0.5 on top of scaleX 2.
    expect(scaleSelectionToSize(px(100), null, false)).toBe(true);
    expect(r.scaleX).toBeCloseTo(1, 6);
    expect(r.getBoundingRect().width).toBeCloseTo(100, 6);
  });
});
