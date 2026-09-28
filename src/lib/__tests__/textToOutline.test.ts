/**
 * Create-Outlines-from-Text tests (raster-trace flavour).
 *
 * jsdom has no real rasteriser, so HTMLCanvasElement.getContext is stubbed the
 * repo-standard way (printMarks pattern) with a CONTROLLABLE getImageData: an
 * all-opaque raster makes the REAL marching-squares tracer return the full
 * raster rectangle; an all-transparent raster traces nothing. That pins the
 * coordinate math end to end — the traced mm ring, offset by the text's
 * bounding-box origin and scaled px↔mm, must land back on the text's own
 * bounding box — plus the guards, style inheritance, and selection/history
 * side effects.
 *
 * The glyph-shape fidelity of a real browser raster (curves, counters) is out
 * of scope here; the tracer itself is covered by cutContour tests.
 */
import * as fabric from 'fabric';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canCreateOutlines, createOutlinesFromText } from '../textToOutline';
import * as canvasEngine from '../canvasEngine';

/** 255 = every pixel ink; 0 = fully transparent (nothing traceable). */
let rasterAlpha = 255;

beforeEach(() => {
  rasterAlpha = 255;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: 40 * text.length }),
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    transform: vi.fn(), setTransform: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    bezierCurveTo: vi.fn(), quadraticCurveTo: vi.fn(), clearRect: vi.fn(),
    fillRect: vi.fn(), strokeRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(rasterAlpha),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
    canvas: document.createElement('canvas'),
  } as unknown as CanvasRenderingContext2D);
});

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

/** A real measured IText (via the ctx mock) placed on the page. */
function text(): fabric.IText {
  return new fabric.IText('AB', { left: 37.8, top: 18.9, fontSize: 24, fill: '#654321', opacity: 0.8 });
}

describe('canCreateOutlines', () => {
  it('is false without a canvas or without text in the selection', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(canCreateOutlines()).toBe(false);
    const { c } = makeCanvas([new fabric.Rect({ width: 10, height: 10 })]);
    expect(canCreateOutlines()).toBe(false);
    void c;
  });

  it('is true for i-text / text / textbox selections', () => {
    makeCanvas([new fabric.Rect({ width: 10, height: 10 }), text()]);
    expect(canCreateOutlines()).toBe(true);
  });
});

describe('createOutlinesFromText', () => {
  it('returns false without a canvas or with no text selected', async () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    await expect(createOutlinesFromText()).resolves.toBe(false);
    const { c, history } = makeCanvas([new fabric.Rect({ width: 10, height: 10 })]);
    await expect(createOutlinesFromText()).resolves.toBe(false);
    expect(c.remove).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('replaces the text with a traced even-odd Path landing on its bounding box', async () => {
    const t = text();
    const before = t.getBoundingRect();
    const { c, history } = makeCanvas([t]);
    await expect(createOutlinesFromText()).resolves.toBe(true);
    expect(c.remove).toHaveBeenCalledWith(t);
    expect(c.add).toHaveBeenCalledTimes(1);
    const path = (c.add as ReturnType<typeof vi.fn>).mock.calls[0][0] as fabric.Path;
    expect(path).toBeInstanceOf(fabric.Path);
    // Painted with the text's fill as an even-odd compound, no stroke.
    expect(path.fill).toBe('#654321');
    expect(path.fillRule).toBe('evenodd');
    expect(path.stroke).toBe('');
    expect(path.strokeWidth).toBe(0);
    expect(path.opacity).toBeCloseTo(0.8, 6);
    // The traced rectangle (full raster) maps back onto the text's bbox:
    // left/top exact; size within the raster's pixel-center + DP-tolerance
    // slack (~1 raster px = ¼ scene px, plus ceil() rounding of W/H).
    const b = path.getBoundingRect();
    expect(b.left).toBeCloseTo(before.left, 0);
    expect(b.top).toBeCloseTo(before.top, 0);
    expect(Math.abs(b.width - before.width)).toBeLessThan(1.5);
    expect(Math.abs(b.height - before.height)).toBeLessThan(1.5);
    // A closed contour: at least one Z command.
    const kinds = (path.path as unknown as Array<[string]>).map(([k]) => k);
    expect(kinds.filter((k) => k === 'Z').length).toBeGreaterThanOrEqual(1);
    expect(c.discardActiveObject).toHaveBeenCalled();
    expect(c.setActiveObject).toHaveBeenCalledWith(path);
    expect(c.requestRenderAll).toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('converts only the texts in a mixed selection', async () => {
    const t = text();
    const shape = new fabric.Rect({ left: 300, top: 0, width: 10, height: 10 });
    const { c } = makeCanvas([shape, t]);
    await expect(createOutlinesFromText()).resolves.toBe(true);
    expect(c.remove).toHaveBeenCalledTimes(1);
    expect(c.remove).toHaveBeenCalledWith(t);
    expect(c.add).toHaveBeenCalledTimes(1);
  });

  it('converts several texts and selects them together', async () => {
    const { c, history } = makeCanvas([text(), text()]);
    await expect(createOutlinesFromText()).resolves.toBe(true);
    expect(c.add).toHaveBeenCalledTimes(2);
    expect(c.setActiveObject).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('keeps the text when nothing could be traced (transparent raster)', async () => {
    rasterAlpha = 0;
    const t = text();
    const { c, history } = makeCanvas([t]);
    await expect(createOutlinesFromText()).resolves.toBe(false);
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.add).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('skips texts whose bounding box is too small to rasterise', async () => {
    const flat = {
      type: 'textbox',
      getBoundingRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    } as fabric.FabricObject;
    const { c } = makeCanvas([flat]);
    await expect(createOutlinesFromText()).resolves.toBe(false);
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.add).not.toHaveBeenCalled();
  });
});
