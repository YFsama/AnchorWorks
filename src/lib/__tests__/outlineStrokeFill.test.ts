/**
 * Outline Stroke → filled shape tests.
 *
 * outlineStrokeObjectToFill runs the REAL stroke-band pipeline
 * (outlineStrokeToCutPaths → px↔mm round trip) on origin-pinned shapes:
 *
 *  - a closed stroked rect yields an outer + inner ring (offset ±½ stroke):
 *    an even-odd compound Path whose bbox is the rect grown by ½ stroke all
 *    round, painted with the original stroke colour
 *  - an open stroked path yields ONE closed band loop (left edge forward,
 *    right edge back) roughly the stroke-width tall
 *  - the source object keeps its geometry but loses stroke + strokeWidth
 *  - guards: strokeWidth ≤ 0, missing / non-string stroke → null, no add
 *
 * canOutlineStrokeFill / outlineStrokeToFillSelection follow the usual
 * canvas-mock conventions.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canOutlineStrokeFill, outlineStrokeObjectToFill, outlineStrokeToFillSelection } from '../outlineStrokeFill';
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

/** 100×100 at the origin with a 4px stroke. */
function strokedRect(): fabric.Rect {
  return new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '#00ff00', stroke: '#123456', strokeWidth: 4, opacity: 0.9 });
}

function zCount(p: fabric.Path): number {
  return (p.path as unknown as Array<[string]>).filter(([t]) => t === 'Z').length;
}

describe('outlineStrokeObjectToFill', () => {
  it('returns null for unstroked or invalid strokes, touching nothing', () => {
    const { c } = makeCanvas([]);
    const noWidth = new fabric.Rect({ width: 10, height: 10, stroke: '#fff', strokeWidth: 0 });
    expect(outlineStrokeObjectToFill(c as unknown as fabric.Canvas, noWidth)).toBeNull();
    const emptyStroke = new fabric.Rect({ width: 10, height: 10, stroke: '', strokeWidth: 4 });
    expect(outlineStrokeObjectToFill(c as unknown as fabric.Canvas, emptyStroke)).toBeNull();
    const nonString = new fabric.Rect({ width: 10, height: 10, strokeWidth: 4 });
    (nonString as unknown as { stroke: unknown }).stroke = { kind: 'gradient' };
    expect(outlineStrokeObjectToFill(c as unknown as fabric.Canvas, nonString)).toBeNull();
    expect(c.add).not.toHaveBeenCalled();
  });

  it('turns a closed stroked rect into an even-odd two-ring fill shape', () => {
    const { c } = makeCanvas([]);
    const src = strokedRect();
    const srcB = src.getBoundingRect(); // captured while the stroke is still set
    const out = outlineStrokeObjectToFill(c as unknown as fabric.Canvas, src);
    expect(out).toBeInstanceOf(fabric.Path);
    // Outer ring (rect + 2px) + inner ring (rect − 2px): two closed subpaths.
    expect(zCount(out!)).toBe(2);
    // Painted with the stroke colour, as an even-odd fill with no stroke.
    expect(out!.fill).toBe('#123456');
    expect(out!.fillRule).toBe('evenodd');
    expect(out!.stroke).toBe('');
    expect(out!.strokeWidth).toBe(0);
    expect(out!.opacity).toBeCloseTo(0.9, 6);
    // Bbox = the source's stroke-inclusive bounding box (fabric v6 left/top
    // already include ½ stroke): 104×104 at the origin — the full stroke band.
    const b = out!.getBoundingRect();
    expect(b.left).toBeCloseTo(srcB.left, 1);
    expect(b.top).toBeCloseTo(srcB.top, 1);
    expect(b.width).toBeCloseTo(srcB.width, 1);
    expect(b.height).toBeCloseTo(srcB.height, 1);
    expect(b.width).toBeCloseTo(104, 1);
    expect(b.height).toBeCloseTo(104, 1);
    // Source keeps geometry but loses its stroke.
    expect(src.stroke).toBe('');
    expect(src.strokeWidth).toBe(0);
    expect(src.width).toBe(100);
    expect(c.add).toHaveBeenCalledWith(out);
  });

  it('turns an open stroked path into a single closed band loop', () => {
    const { c } = makeCanvas([]);
    const src = new fabric.Path('M 0 0 L 100 0', { stroke: '#654321', strokeWidth: 4, fill: '' });
    const out = outlineStrokeObjectToFill(c as unknown as fabric.Canvas, src);
    expect(out).toBeInstanceOf(fabric.Path);
    expect(zCount(out!)).toBe(1); // one band, closed
    // Band spans the 100px line and is ~4px tall (±2px each side).
    const b = out!.getBoundingRect();
    expect(b.left).toBeCloseTo(0, 1);
    expect(b.width).toBeCloseTo(100, 1);
    expect(b.height).toBeCloseTo(4, 1);
    expect(b.top).toBeCloseTo(-2, 1);
    expect(out!.fill).toBe('#654321');
    expect(src.stroke).toBe('');
  });
});

describe('canOutlineStrokeFill / outlineStrokeToFillSelection', () => {
  it('canOutlineStrokeFill is false without a canvas or without a stroked selection', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(canOutlineStrokeFill()).toBe(false);
    const { c } = makeCanvas([new fabric.Rect({ width: 10, height: 10, strokeWidth: 0 })]);
    expect(canOutlineStrokeFill()).toBe(false);
    void c;
  });

  it('is true when any selected object has a string stroke with width', () => {
    makeCanvas([new fabric.Rect({ width: 10, height: 10, strokeWidth: 0 }), strokedRect()]);
    expect(canOutlineStrokeFill()).toBe(true);
  });

  it('selection: 0 without a canvas or with nothing stroked; no history', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(outlineStrokeToFillSelection()).toBe(0);
    const { c, history } = makeCanvas([new fabric.Rect({ width: 10, height: 10, strokeWidth: 0 })]);
    expect(outlineStrokeToFillSelection()).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('selection: outlines only the stroked objects, renders once, pushes one history entry', () => {
    const plain = new fabric.Rect({ left: 200, top: 0, width: 10, height: 10, strokeWidth: 0 });
    const { c, history } = makeCanvas([strokedRect(), plain]);
    expect(outlineStrokeToFillSelection()).toBe(1);
    expect(c.add).toHaveBeenCalledTimes(1);
    expect(c.requestRenderAll).toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(1);
    expect(plain.strokeWidth).toBe(0); // untouched
  });
});
