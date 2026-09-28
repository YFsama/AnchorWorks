/**
 * Zig Zag effect tests.
 *
 * zigzagPolyline is pure math and pinned exactly:
 *  - guards (short input, ridges < 1, zero-length path) return a copy
 *  - displacement is perpendicular to the path with peak amplitude ≈ size
 *    (sine for smooth, triangle for corner), x-progress preserved
 *  - ridges full waves spread over the whole path (count the peaks)
 *  - zero size keeps every point on the original line; closed loops stay
 *    closed
 *
 * zigzagObject / zigzagSelection run the REAL outline pipeline on an
 * origin-pinned square: guards (size ≤ 0, ridges < 1), original replaced,
 * style inherited, densified output, counts and history.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canZigzagObject, zigzagObject, zigzagPolyline, zigzagSelection } from '../zigzag';
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

/** Count strict local maxima of the y coordinate. */
function peakCount(pts: Array<[number, number]>): number {
  let peaks = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i][1] > pts[i - 1][1] && pts[i][1] >= pts[i + 1][1]) peaks++;
  }
  return peaks;
}

const LINE: Array<[number, number]> = [[0, 0], [100, 0]];

describe('zigzagPolyline', () => {
  it('returns a copy unchanged for short input, ridges < 1, or a zero-length path', () => {
    const one: Array<[number, number]> = [[0, 0]];
    expect(zigzagPolyline(one, false, 10, 3, true)).toEqual(one);
    expect(zigzagPolyline(LINE, false, 10, 0, true)).toEqual(LINE);
    expect(zigzagPolyline(LINE, false, 10, 0.5, false)).toEqual(LINE);
    // Every point identical → total arc length 0 → copy.
    expect(zigzagPolyline([[5, 5], [5, 5]], false, 10, 3, true)).toEqual([[5, 5], [5, 5]]);
    // Guard paths return a shallow copy — equal values, distinct array.
    const out = zigzagPolyline(LINE, false, 10, 0, true);
    expect(out).toEqual(LINE);
    expect(out).not.toBe(LINE);
  });

  it('smooth mode displaces perpendicular by up to ±size (sine wave)', () => {
    const out = zigzagPolyline(LINE, false, 10, 1, true);
    const ys = out.map(([, y]) => y);
    const xs = out.map(([x]) => x);
    // Peak amplitude ≈ size (2px sampling hits the crest within ~0.1%).
    expect(Math.max(...ys)).toBeGreaterThan(0.95 * 10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(10 + 1e-9);
    expect(Math.min(...ys)).toBeLessThan(-0.95 * 10);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-10 - 1e-9);
    // x progress along the line is untouched (displacement is perpendicular).
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(100, 6);
  });

  it('corner mode (triangle wave) reaches the same amplitude envelope', () => {
    const out = zigzagPolyline(LINE, false, 8, 1, false);
    const ys = out.map(([, y]) => y);
    expect(Math.max(...ys)).toBeGreaterThan(0.95 * 8);
    expect(Math.min(...ys)).toBeLessThan(-0.95 * 8);
    expect(Math.max(...ys)).toBeLessThanOrEqual(8 + 1e-9);
  });

  it('spreads exactly `ridges` full waves over the path', () => {
    const out = zigzagPolyline(LINE, false, 5, 3, true);
    expect(peakCount(out)).toBe(3);
    const out7 = zigzagPolyline(LINE, false, 5, 7, true);
    expect(peakCount(out7)).toBe(7);
  });

  it('zero size keeps every point on the original line (geometry no-op after densify)', () => {
    const out = zigzagPolyline(LINE, false, 0, 3, true);
    expect(out.length).toBeGreaterThan(2); // densified
    for (const [, y] of out) expect(Math.abs(y)).toBeLessThan(1e-9);
  });

  it('keeps a closed loop closed', () => {
    const pts: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const out = zigzagPolyline(pts, true, 5, 4, true);
    expect(out[out.length - 1]).toEqual(out[0]);
  });
});

describe('canZigzagObject', () => {
  it('accepts path / rect / polygon / ellipse — but NOT circle', () => {
    expect(canZigzagObject(new fabric.Path('M 0 0 L 10 0'))).toBe(true);
    expect(canZigzagObject(new fabric.Rect({ width: 10, height: 10 }))).toBe(true);
    expect(canZigzagObject(new fabric.Polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]))).toBe(true);
    expect(canZigzagObject(new fabric.Ellipse({ rx: 10, ry: 5 }))).toBe(true);
    expect(canZigzagObject(new fabric.Circle({ radius: 5 }))).toBe(false);
    expect(canZigzagObject({ type: 'textbox' } as fabric.FabricObject)).toBe(false);
  });
});

describe('zigzagObject', () => {
  it('returns null for size ≤ 0, ridges < 1 or unsupported types (original kept)', () => {
    const { c } = makeCanvas([]);
    expect(zigzagObject(c as unknown as fabric.Canvas, square(), 0, 3, true)).toBeNull();
    expect(zigzagObject(c as unknown as fabric.Canvas, square(), -5, 3, true)).toBeNull();
    expect(zigzagObject(c as unknown as fabric.Canvas, square(), 5, 0, true)).toBeNull();
    expect(zigzagObject(c as unknown as fabric.Canvas, { type: 'textbox' } as fabric.FabricObject, 5, 3, true)).toBeNull();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.add).not.toHaveBeenCalled();
  });

  it('replaces the object with a densified zig-zag path and inherits its style', () => {
    const { c } = makeCanvas([]);
    const src = square();
    const out = zigzagObject(c as unknown as fabric.Canvas, src, 2, 8, false);
    expect(out).toBeInstanceOf(fabric.Path);
    expect(c.remove).toHaveBeenCalledWith(src);
    expect(c.add).toHaveBeenCalledWith(out);
    expect(out!.fill).toBe('#111111');
    expect(out!.stroke).toBe('#abcdef');
    expect(out!.opacity).toBeCloseTo(0.6, 6);
    // Densified + zig-zagged: many more anchors than the 4 source corners.
    expect((out!.path as unknown[]).length).toBeGreaterThan(20);
  });
});

describe('zigzagSelection', () => {
  it('returns 0 without a canvas / with invalid params / with no fit objects', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(zigzagSelection(5, 3, true)).toBe(0);
    const { c, history } = makeCanvas([square()]);
    expect(zigzagSelection(0, 3, true)).toBe(0);
    expect(zigzagSelection(5, 0, true)).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('transforms each zigzag-able object once and pushes one history entry', () => {
    const { c, history } = makeCanvas([square(), { type: 'circle' } as fabric.FabricObject]);
    // circle is excluded by canZigzagObject → only the square transforms.
    expect(zigzagSelection(2, 6, false)).toBe(1);
    expect(c.add).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
  });
});
