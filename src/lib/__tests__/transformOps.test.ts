import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTransform, reflectSelection } from '../transformOps';
import * as canvasEngine from '../canvasEngine';

describe('applyTransform', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scales strokes and shadows when enabled', async () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 20, height: 20, strokeWidth: 4 });
    rect.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 6, offsetX: 2, offsetY: -4 });
    const canvas = { getActiveObject: () => rect, getActiveObjects: () => [rect], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(await applyTransform({ dx: 0, dy: 0, scale: 2, scaleY: 2, rotate: 0, copy: false, each: false, scaleStrokesEffects: true })).toBe(true);
    expect(rect.scaleX).toBe(2);
    expect(rect.scaleY).toBe(2);
    expect(rect.strokeWidth).toBe(8);
    expect(rect.shadow).toMatchObject({ blur: 12, offsetX: 4, offsetY: -8 });
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('leaves strokes and shadows unchanged when disabled', async () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 20, height: 20, strokeWidth: 4 });
    rect.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 6, offsetX: 2, offsetY: -4 });
    const canvas = { getActiveObject: () => rect, getActiveObjects: () => [rect], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(await applyTransform({ dx: 0, dy: 0, scale: 2, scaleY: 2, rotate: 0, copy: false, each: false })).toBe(true);
    expect(rect.strokeWidth).toBe(4);
    expect(rect.shadow).toMatchObject({ blur: 6, offsetX: 2, offsetY: -4 });
  });

  it('reflects selections across an arbitrary diagonal axis', () => {
    const rect = new fabric.Rect({ left: 10, top: 20, width: 20, height: 10, angle: 10 });
    const canvas = { getActiveObjects: () => [rect], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(reflectSelection(45)).toBe(true);
    expect(rect.flipY).toBe(true);
    expect(rect.angle).toBe(10);
    expect(rect.left).toBeCloseTo(10);
    expect(rect.top).toBeCloseTo(20);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not reflect when nothing is selected', () => {
    const canvas = { getActiveObjects: () => [], requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(reflectSelection(45)).toBe(false);
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it('uses geometric mean for non-uniform Transform Each stroke scaling', async () => {
    const first = new fabric.Rect({ left: 0, top: 0, width: 20, height: 20, strokeWidth: 4 });
    const second = new fabric.Rect({ left: 40, top: 0, width: 20, height: 20, strokeWidth: 6 });
    const canvas = { getActiveObject: () => first, getActiveObjects: () => [first, second], discardActiveObject: vi.fn(), setActiveObject: vi.fn(), requestRenderAll: vi.fn(), _onObjectAdded: vi.fn(), _onObjectRemoved: vi.fn(), fire: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(await applyTransform({ dx: 0, dy: 0, scale: 4, scaleY: 1, rotate: 0, copy: false, each: true, scaleStrokesEffects: true })).toBe(true);
    expect(first.strokeWidth).toBe(8);
    expect(second.strokeWidth).toBe(12);
    expect(canvas.setActiveObject).toHaveBeenCalledOnce();
  });
});
