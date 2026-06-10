import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { applyOverprintToSelection, clearGradientFillFromObject, expandAppearanceSelection, flattenTransparencyObject, flattenTransparencySelection, generatePalette, setOverprintOnObject } from '../effects';
import * as canvasEngine from '../canvasEngine';

describe('generatePalette', () => {
  it('returns exactly 5 colours from a base hex', () => {
    const palette = generatePalette('#ff0000');
    expect(palette).toHaveLength(5);
  });

  it('every entry is a #RRGGBB hex string', () => {
    const palette = generatePalette('#ff0000');
    for (const c of palette) {
      expect(c.startsWith('#')).toBe(true);
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('returns 5 distinct colours', () => {
    const palette = generatePalette('#ff0000');
    expect(new Set(palette).size).toBe(5);
  });

  it('is deterministic for the same input', () => {
    const a = generatePalette('#3d9bff');
    const b = generatePalette('#3d9bff');
    expect(a).toEqual(b);
  });

  it('falls back gracefully when input is garbage', () => {
    const palette = generatePalette('not-a-hex');
    expect(palette).toHaveLength(5);
    for (const c of palette) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('gradient cleanup helpers', () => {
  it('clears a live gradient fill back to the first stop color', () => {
    const rect = new fabric.Rect({ fill: '#000000' });
    rect.fill = new fabric.Gradient({
      type: 'linear',
      gradientUnits: 'pixels',
      coords: { x1: 0, y1: 0, x2: 10, y2: 0 },
      colorStops: [
        { offset: 0, color: '#112233' },
        { offset: 1, color: '#ffffff' },
      ],
    });

    expect(clearGradientFillFromObject(rect)).toBe(true);
    expect(rect.fill).toBe('#112233');
    expect(clearGradientFillFromObject(rect)).toBe(false);
  });
});

describe('overprint metadata controls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets fill, stroke, and combined overprint metadata on objects', () => {
    const rect = new fabric.Rect({ fill: '#ffffff', stroke: '#000000' });

    expect(setOverprintOnObject(rect, 'fill', true)).toBe(true);
    expect(rect).toMatchObject({ fillOverprint: true, overprintFill: true });
    expect(setOverprintOnObject(rect, 'fill', true)).toBe(false);

    expect(setOverprintOnObject(rect, 'stroke', true)).toBe(true);
    expect(rect).toMatchObject({ strokeOverprint: true, overprintStroke: true });

    expect(setOverprintOnObject(rect, 'both', true)).toBe(true);
    expect(rect).toMatchObject({ overprint: true, fillOverprint: true, strokeOverprint: true });
  });

  it('applies and clears overprint metadata on the selected objects', () => {
    const first = new fabric.Rect({ fill: '#ffffff' });
    const second = new fabric.Rect({ fill: '#000000' });
    const canvas = { getActiveObjects: () => [first, second], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(applyOverprintToSelection('stroke', true)).toBe(2);
    expect(first).toMatchObject({ strokeOverprint: true, overprintStroke: true });
    expect(second).toMatchObject({ strokeOverprint: true, overprintStroke: true });
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();

    expect(applyOverprintToSelection('both', false)).toBe(2);
    expect(first).toMatchObject({ overprint: false, fillOverprint: false, strokeOverprint: false, overprintFill: false, overprintStroke: false });
    expect(second).toMatchObject({ overprint: false, fillOverprint: false, strokeOverprint: false, overprintFill: false, overprintStroke: false });
    expect(canvas.requestRenderAll).toHaveBeenCalledTimes(2);
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it('does not push history when overprint metadata is already unchanged', () => {
    const rect = new fabric.Rect({ fill: '#ffffff' });
    setOverprintOnObject(rect, 'both', false);
    const canvas = { getActiveObjects: () => [rect], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(applyOverprintToSelection('both', false)).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });
});

describe('flatten transparency', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bakes object opacity into solid fill, stroke, and shadow alpha', () => {
    const rect = new fabric.Rect({ fill: '#336699', stroke: 'rgba(255, 0, 0, 0.5)', opacity: 0.5 });
    rect.globalCompositeOperation = 'multiply';
    rect.shadow = new fabric.Shadow({ color: '#000000', blur: 4, offsetX: 1, offsetY: 2 });

    expect(flattenTransparencyObject(rect)).toBe(true);
    expect(rect.opacity).toBe(1);
    expect(rect.fill).toBe('rgba(51, 102, 153, 0.5)');
    expect(rect.stroke).toBe('rgba(255, 0, 0, 0.25)');
    expect(rect.globalCompositeOperation).toBe('source-over');
    expect(rect.shadow).toMatchObject({ color: 'rgba(0, 0, 0, 0.5)', blur: 4, offsetX: 1, offsetY: 2 });
  });

  it('flattens selected transparent or blended objects once', () => {
    const transparent = new fabric.Rect({ fill: '#ffffff', opacity: 0.25 });
    const normal = new fabric.Rect({ fill: '#000000', opacity: 1 });
    const canvas = { getActiveObjects: () => [transparent, normal], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(flattenTransparencySelection()).toBe(1);
    expect(transparent.opacity).toBe(1);
    expect(normal.opacity).toBe(1);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not push history when no selected objects need flattening', () => {
    const normal = new fabric.Rect({ fill: '#000000', opacity: 1 });
    const canvas = { getActiveObjects: () => [normal], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(flattenTransparencySelection()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });
});


describe('expand appearance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('expands patterns, shadows, and transparency in one history step', async () => {
    const object = new fabric.Rect({ left: 0, top: 0, width: 20, height: 20, fill: '#ffffff', opacity: 0.5 });
    (object as { patternSpec?: unknown }).patternSpec = { kind: 'checker', size: 10, color1: '#ffffff', color2: '#000000' };
    object.shadow = new fabric.Shadow({ color: '#000000', blur: 4, offsetX: 2, offsetY: 3 });
    const canvas = {
      getActiveObjects: () => [object],
      add: vi.fn(),
      sendObjectToBack: vi.fn(),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(await expandAppearanceSelection()).toBe(3);
    expect((object as { patternSpec?: unknown }).patternSpec).toBeUndefined();
    expect(object.shadow).toBeNull();
    expect(object.opacity).toBe(1);
    expect(canvas.add).toHaveBeenCalled();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not push history when no appearances can expand', async () => {
    const object = new fabric.Rect({ fill: '#ffffff', opacity: 1 });
    const canvas = { getActiveObjects: () => [object], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(await expandAppearanceSelection()).toBe(0);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });
});
