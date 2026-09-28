/**
 * Free Distort (4-corner) tests.
 *
 * The bilinear quad mapping is not exported directly, so it is pinned through
 * freeDistortObject on origin-pinned shapes (see offsetPath.test.ts for why
 * off-origin placement is avoided while the contour fix lands):
 *
 *  - zero offsets = identity: the rebuilt path reproduces the source anchors
 *  - corner offsets are ABSOLUTE positions added to the bbox corners: a
 *    uniform +10 expansion moves a (50,50) centre anchor to (60,60)
 *  - horizontal taper (tr/br shifted): u=0.5 anchor lands halfway along the
 *    slanted edge — true bilinear interpolation, not an affine shear
 *  - vertical taper shifts only the top edge (v-direction interpolation)
 *  - pure translation invariance: all corners +dx,+dy shifts every anchor
 *  - corner anchors land exactly on their moved corners (u/v ∈ {0,1})
 *
 * Preview lifecycle: updateFreeDistortPreview adds flagged dashed overlay
 * paths and clears previous ones first; freeDistortSelection commits with
 * style inheritance, counts, and one history entry. Guards for non-quad
 * types and missing canvas.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canFreeDistortObject,
  clearFreeDistortPreview,
  freeDistortObject,
  freeDistortSelection,
  updateFreeDistortPreview,
  type FreeDistortCorners,
} from '../freeDistort';
import * as canvasEngine from '../canvasEngine';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCanvas(active: fabric.FabricObject[], objects?: fabric.FabricObject[]) {
  const c = {
    getObjects: () => objects ?? active,
    getActiveObjects: () => active,
    remove: vi.fn(),
    add: vi.fn(),
    bringObjectToFront: vi.fn(),
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

const zero = (): FreeDistortCorners => ({ tl: [0, 0], tr: [0, 0], br: [0, 0], bl: [0, 0] });

/** A 100×100 square, origin-pinned, stroke-free. */
function square(): fabric.Rect {
  return new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '#111111', stroke: '#abcdef', strokeWidth: 0, opacity: 0.6 });
}

/** A diamond inside the unit square: anchors at u/v = 0.5 on each edge. */
function diamond(): fabric.Path {
  return new fabric.Path('M 50 0 L 100 50 L 50 100 L 0 50 Z', { strokeWidth: 0 });
}

/** Commands of a rebuilt path as [kind, x, y] tuples (M/L + trailing Z). */
function cmds(p: fabric.Path): Array<[string, number, number]> {
  return p.path as unknown as Array<[string, number, number]>;
}

function anchor(p: fabric.Path | null, i: number): [number, number] {
  const c = cmds(p!)[i];
  return [c[1], c[2]];
}

describe('canFreeDistortObject', () => {
  it('accepts path / rect / polygon / ellipse — but NOT circle or text', () => {
    expect(canFreeDistortObject(new fabric.Path('M 0 0 L 10 0'))).toBe(true);
    expect(canFreeDistortObject(new fabric.Rect({ width: 10, height: 10 }))).toBe(true);
    expect(canFreeDistortObject(new fabric.Polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]))).toBe(true);
    expect(canFreeDistortObject(new fabric.Ellipse({ rx: 10, ry: 5 }))).toBe(true);
    expect(canFreeDistortObject(new fabric.Circle({ radius: 5 }))).toBe(false);
    expect(canFreeDistortObject({ type: 'textbox' } as fabric.FabricObject)).toBe(false);
  });
});

describe('freeDistortObject — bilinear quad mapping', () => {
  it('zero offsets are the identity: source anchors reproduced exactly', () => {
    const { c } = makeCanvas([]);
    const out = freeDistortObject(c as unknown as fabric.Canvas, square(), zero());
    expect(out).toBeInstanceOf(fabric.Path);
    expect(anchor(out, 0)).toEqual([0, 0]);
    expect(anchor(out, 1)).toEqual([100, 0]);
    expect(anchor(out, 2)).toEqual([100, 100]);
    expect(anchor(out, 3)).toEqual([0, 100]);
    expect(cmds(out!).some(([t]) => t === 'Z')).toBe(true);
  });

  it('corner anchors land exactly on their moved corners (u/v ∈ {0,1})', () => {
    const { c } = makeCanvas([]);
    const offsets: FreeDistortCorners = { tl: [5, 7], tr: [50, -10], br: [-20, 30], bl: [0, 0] };
    const out = freeDistortObject(c as unknown as fabric.Canvas, square(), offsets);
    // Source square 0..100²: tl (0,0)+[5,7], tr (100,0)+[50,-10],
    // br (100,100)+[-20,30], bl (0,100)+[0,0].
    expect(anchor(out, 0)[0]).toBeCloseTo(5, 1);
    expect(anchor(out, 0)[1]).toBeCloseTo(7, 1);
    expect(anchor(out, 1)[0]).toBeCloseTo(150, 1);
    expect(anchor(out, 1)[1]).toBeCloseTo(-10, 1);
    expect(anchor(out, 2)[0]).toBeCloseTo(80, 1);
    expect(anchor(out, 2)[1]).toBeCloseTo(130, 1);
    expect(anchor(out, 3)[0]).toBeCloseTo(0, 1);
    expect(anchor(out, 3)[1]).toBeCloseTo(100, 1);
  });

  it('interpolates midpoints along the top edge (u=0.5) under a horizontal taper', () => {
    const { c } = makeCanvas([]);
    // Right corners pushed +50 → top edge runs (0,0)→(150,0).
    const offsets: FreeDistortCorners = { ...zero(), tr: [50, 0], br: [50, 0] };
    const out = freeDistortObject(c as unknown as fabric.Canvas, diamond(), offsets);
    // Diamond anchors: (50,0)→u=.5,v=0 → (75,0); (100,50)→u=1,v=.5 → (150,50);
    // (50,100)→u=.5,v=1 → (75,100); (0,50) unchanged.
    expect(anchor(out, 0)[0]).toBeCloseTo(75, 1);
    expect(anchor(out, 0)[1]).toBeCloseTo(0, 1);
    expect(anchor(out, 1)[0]).toBeCloseTo(150, 1);
    expect(anchor(out, 1)[1]).toBeCloseTo(50, 1);
    expect(anchor(out, 2)[0]).toBeCloseTo(75, 1);
    expect(anchor(out, 2)[1]).toBeCloseTo(100, 1);
    expect(anchor(out, 3)[0]).toBeCloseTo(0, 1);
    expect(anchor(out, 3)[1]).toBeCloseTo(50, 1);
  });

  it('interpolates in v too: a vertical taper moves only the top edge', () => {
    const { c } = makeCanvas([]);
    const offsets: FreeDistortCorners = { ...zero(), tl: [0, -30], tr: [0, -30] };
    const out = freeDistortObject(c as unknown as fabric.Canvas, diamond(), offsets);
    // (50,0) sits on the moved top edge → y=-30; (0,50) at v=.5 → y=35;
    // (50,100) on the unmoved bottom edge → y=100.
    expect(anchor(out, 0)[1]).toBeCloseTo(-30, 1);
    expect(anchor(out, 3)[1]).toBeCloseTo(35, 1);
    expect(anchor(out, 2)[1]).toBeCloseTo(100, 1);
  });

  it('is a true bilinear map, not affine: a non-parallelogram quad pulls u=1 mid-height', () => {
    const { c } = makeCanvas([]);
    // Right edge slants: tr stays at x=100 but br comes in to x=60.
    const offsets: FreeDistortCorners = { ...zero(), br: [-40, 0] };
    const out = freeDistortObject(c as unknown as fabric.Canvas, diamond(), offsets);
    // (100,50): u=1, v=.5 → x = 100·(1−.5) + 60·.5 = 80; y stays 50.
    expect(anchor(out, 1)[0]).toBeCloseTo(80, 1);
    expect(anchor(out, 1)[1]).toBeCloseTo(50, 1);
  });

  it('uniform outward offsets grow the quad symmetrically by the offset on each side', () => {
    const { c } = makeCanvas([]);
    // All corners out by 10 → a 120×120 quad; edge-midpoint anchors of the
    // diamond (u or v = 0.5) stay centred but move outward by exactly 10.
    const offsets: FreeDistortCorners = { tl: [-10, -10], tr: [10, -10], br: [10, 10], bl: [-10, 10] };
    const out = freeDistortObject(c as unknown as fabric.Canvas, diamond(), offsets);
    expect(anchor(out, 0)[0]).toBeCloseTo(50, 1);   // (50,0): x centred, y grown to −10
    expect(anchor(out, 0)[1]).toBeCloseTo(-10, 1);
    expect(anchor(out, 1)[0]).toBeCloseTo(110, 1);  // (100,50): right edge grown to 110
    expect(anchor(out, 1)[1]).toBeCloseTo(50, 1);
    expect(anchor(out, 3)[0]).toBeCloseTo(-10, 1);  // (0,50): left edge grown to −10
    expect(anchor(out, 3)[1]).toBeCloseTo(50, 1);
  });

  it('pure translation offsets shift every anchor by the same vector', () => {
    const { c } = makeCanvas([]);
    const offsets: FreeDistortCorners = { tl: [10, 20], tr: [10, 20], br: [10, 20], bl: [10, 20] };
    const out = freeDistortObject(c as unknown as fabric.Canvas, square(), offsets);
    expect(anchor(out, 0)).toEqual([10, 20]);
    expect(anchor(out, 1)).toEqual([110, 20]);
    expect(anchor(out, 2)).toEqual([110, 120]);
    expect(anchor(out, 3)).toEqual([10, 120]);
  });

  it('replaces the object and inherits its style; guards non-quad types', () => {
    const { c } = makeCanvas([]);
    expect(freeDistortObject(c as unknown as fabric.Canvas, { type: 'textbox' } as fabric.FabricObject, zero())).toBeNull();
    expect(c.remove).not.toHaveBeenCalled();
    const src = square();
    const out = freeDistortObject(c as unknown as fabric.Canvas, src, zero());
    expect(c.remove).toHaveBeenCalledWith(src);
    expect(c.add).toHaveBeenCalledWith(out);
    expect(out!.fill).toBe('#111111');
    expect(out!.stroke).toBe('#abcdef');
    expect(out!.strokeWidth).toBe(0);
    expect(out!.opacity).toBeCloseTo(0.6, 6);
  });
});

describe('preview lifecycle', () => {
  it('clearFreeDistortPreview is a no-op without a canvas or previews', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(() => clearFreeDistortPreview()).not.toThrow();
    const { c } = makeCanvas([]);
    clearFreeDistortPreview();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.requestRenderAll).not.toHaveBeenCalled();
  });

  it('clearFreeDistortPreview removes only flagged objects', () => {
    const flagged = { __freeDistortPreview: true } as unknown as fabric.FabricObject;
    const plain = square();
    const { c } = makeCanvas([], [flagged, plain]);
    clearFreeDistortPreview();
    expect(c.remove).toHaveBeenCalledTimes(1);
    expect(c.remove).toHaveBeenCalledWith(flagged);
    expect(c.requestRenderAll).toHaveBeenCalled();
  });

  it('updateFreeDistortPreview adds a flagged dashed overlay per fitting object', () => {
    const { c } = makeCanvas([square(), { type: 'textbox' } as fabric.FabricObject]);
    expect(updateFreeDistortPreview(zero())).toBe(1);
    expect(c.add).toHaveBeenCalledTimes(1);
    const preview = (c.add as ReturnType<typeof vi.fn>).mock.calls[0][0] as fabric.Path & { __freeDistortPreview?: boolean };
    expect(preview.__freeDistortPreview).toBe(true);
    expect(preview.stroke).toBe('#5ac8d8');
    expect(preview.strokeDashArray).toEqual([5, 4]);
    expect(preview.selectable).toBe(false);
    expect(preview.evented).toBe(false);
    expect(preview.excludeFromExport).toBe(true);
    expect(c.bringObjectToFront).toHaveBeenCalledWith(preview);
    expect(c.requestRenderAll).toHaveBeenCalled();
  });

  it('updateFreeDistortPreview clears stale previews first', () => {
    const flagged = { __freeDistortPreview: true } as unknown as fabric.FabricObject;
    const { c } = makeCanvas([square()], [flagged]);
    expect(updateFreeDistortPreview(zero())).toBe(1);
    expect(c.remove).toHaveBeenCalledWith(flagged);
  });

  it('returns 0 without a canvas', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(updateFreeDistortPreview(zero())).toBe(0);
  });
});

describe('freeDistortSelection', () => {
  it('returns 0 without a canvas or with no fitting objects', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(freeDistortSelection(zero())).toBe(0);
    const { c, history } = makeCanvas([{ type: 'textbox' } as fabric.FabricObject]);
    expect(freeDistortSelection(zero())).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('commits each fitting object once, clears previews, pushes one history entry', () => {
    const flagged = { __freeDistortPreview: true } as unknown as fabric.FabricObject;
    const { c, history } = makeCanvas([square(), square(), { type: 'circle' } as fabric.FabricObject], [flagged]);
    expect(freeDistortSelection(zero())).toBe(2);
    expect(c.remove).toHaveBeenCalledWith(flagged); // stale preview swept on commit
    expect(c.add).toHaveBeenCalledTimes(2);
    expect(c.discardActiveObject).toHaveBeenCalled();
    expect(c.requestRenderAll).toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(1);
  });
});
