/**
 * Roughen effect tests.
 *
 * roughenPolyline has no seed parameter (it calls Math.random directly), so
 * determinism is pinned by mocking Math.random; unmocked runs pin the
 * statistical guarantees instead:
 *
 *  - short input → copy; zero size → densified but geometrically unchanged
 *  - every jittered point stays within ±size of the original line/extent
 *  - jitter = (2·rand − 1)·size per axis (pinned exactly with a fixed rand)
 *  - detail spacing controls densification; closed loops stay closed
 *
 * roughenObject / roughenSelection run the REAL outline pipeline on an
 * origin-pinned square: guards (size ≤ 0), original replaced, style
 * inherited, counts and history.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canRoughenObject, roughenObject, roughenPolyline, roughenSelection } from '../roughen';
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

const LINE: Array<[number, number]> = [[0, 0], [100, 0]];

describe('roughenPolyline', () => {
  it('returns a copy unchanged for short input (and detached from it)', () => {
    const one: Array<[number, number]> = [[3, 4]];
    expect(roughenPolyline(one, false, 10, 5)).toEqual(one);
    expect(roughenPolyline([], true, 10, 5)).toEqual([]);
    const out = roughenPolyline(one, false, 10, 5);
    out.push([9, 9]);
    expect(one).toHaveLength(1);
  });

  it('zero size densifies but never leaves the original line', () => {
    const out = roughenPolyline(LINE, false, 0, 5);
    expect(out.length).toBeGreaterThan(LINE.length);
    for (const [x, y] of out) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(Math.abs(y)).toBeLessThan(1e-9);
    }
  });

  it('jitters each axis by (2·random − 1)·size — pinned with a fixed random', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const out = roughenPolyline(LINE, false, 10, 1000);
    // rand 0.75 → +0.5·size on both axes for every point; detail 1000 means
    // no densification, so the two source points map 1:1.
    expect(out).toEqual([[5, 5], [105, 5]]);
    rand.mockReturnValue(0);
    const outMin = roughenPolyline(LINE, false, 10, 1000);
    expect(outMin).toEqual([[-10, -10], [90, -10]]);
  });

  it('keeps every jittered point within ±size of the source extent (real random)', () => {
    const out = roughenPolyline(LINE, false, 7, 3);
    expect(out.length).toBeGreaterThan(10);
    for (const [x, y] of out) {
      expect(x).toBeGreaterThanOrEqual(0 - 7 - 1e-9);
      expect(x).toBeLessThanOrEqual(100 + 7 + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(7 + 1e-9);
    }
    // At least one point actually moved (jitter is live, not a no-op).
    const moved = out.some(([, y]) => Math.abs(y) > 1e-6);
    expect(moved).toBe(true);
  });

  it('honours the detail spacing when densifying', () => {
    // A 100px segment at detail 1000 → 1 interval → endpoints only.
    expect(roughenPolyline(LINE, false, 1, 1000)).toHaveLength(2);
    // At detail 10 → 10 intervals → 11 dense points.
    expect(roughenPolyline(LINE, false, 1, 10)).toHaveLength(11);
  });

  it('keeps a closed loop closed after jitter', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pts: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const out = roughenPolyline(pts, true, 5, 1000);
    expect(out[out.length - 1]).toEqual(out[0]);
    void rand;
  });

  it('survives degenerate duplicate points', () => {
    const out = roughenPolyline([[5, 5], [5, 5]], false, 3, 10);
    expect(out).toHaveLength(2);
  });
});

describe('canRoughenObject', () => {
  it('accepts path / rect / polygon / ellipse — but NOT circle', () => {
    expect(canRoughenObject(new fabric.Path('M 0 0 L 10 0'))).toBe(true);
    expect(canRoughenObject(new fabric.Rect({ width: 10, height: 10 }))).toBe(true);
    expect(canRoughenObject(new fabric.Polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]))).toBe(true);
    expect(canRoughenObject(new fabric.Ellipse({ rx: 10, ry: 5 }))).toBe(true);
    expect(canRoughenObject(new fabric.Circle({ radius: 5 }))).toBe(false);
    expect(canRoughenObject({ type: 'textbox' } as fabric.FabricObject)).toBe(false);
  });
});

describe('roughenObject', () => {
  it('returns null for size ≤ 0 or unsupported types (original kept)', () => {
    const { c } = makeCanvas([]);
    expect(roughenObject(c as unknown as fabric.Canvas, square(), 0, 2)).toBeNull();
    expect(roughenObject(c as unknown as fabric.Canvas, square(), -3, 2)).toBeNull();
    expect(roughenObject(c as unknown as fabric.Canvas, { type: 'textbox' } as fabric.FabricObject, 3, 2)).toBeNull();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.add).not.toHaveBeenCalled();
  });

  it('replaces the object with a densified jittered path and inherits its style', () => {
    const { c } = makeCanvas([]);
    const src = square();
    const out = roughenObject(c as unknown as fabric.Canvas, src, 2, 5);
    expect(out).toBeInstanceOf(fabric.Path);
    expect(c.remove).toHaveBeenCalledWith(src);
    expect(c.add).toHaveBeenCalledWith(out);
    expect(out!.fill).toBe('#111111');
    expect(out!.stroke).toBe('#abcdef');
    expect(out!.opacity).toBeCloseTo(0.6, 6);
    // Densified to ~detail spacing: a 100px side at ~19px detail → many anchors.
    expect((out!.path as unknown[]).length).toBeGreaterThan(20);
  });
});

describe('roughenSelection', () => {
  it('returns 0 without a canvas / size ≤ 0 / no fit objects', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(roughenSelection(3, 2)).toBe(0);
    const { c, history } = makeCanvas([square()]);
    expect(roughenSelection(0, 2)).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('roughens each roughen-able object once and pushes one history entry', () => {
    const { c, history } = makeCanvas([square(), { type: 'textbox' } as fabric.FabricObject]);
    expect(roughenSelection(2, 5)).toBe(1);
    expect(c.add).toHaveBeenCalledTimes(1);
    expect(c.discardActiveObject).toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(1);
  });
});
