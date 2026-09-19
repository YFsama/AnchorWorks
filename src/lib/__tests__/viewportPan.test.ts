import { afterEach, describe, expect, it, vi } from 'vitest';
import * as canvasEngine from '../canvasEngine';
import { handleWheel } from '../viewport';
import { DEFAULT_PREFERENCES, savePreferences } from '../preferences';

/**
 * Shift+wheel horizontal-pan remap (Figma/Illustrator muscle memory):
 * browsers deliver shift+wheel as deltaY with shiftKey set and deltaX 0,
 * so handleWheel must translate that to a viewport X pan instead of a
 * vertical one. True trackpad horizontal scrolls (deltaX ≠ 0) keep the
 * combined X+Y behaviour.
 */
describe('handleWheel shift+wheel horizontal pan', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  type WheelOpts = { deltaY?: number; deltaX?: number; shiftKey?: boolean; ctrlKey?: boolean };

  function fire(opts: WheelOpts): number[] {
    const vt = [1, 0, 0, 1, 0, 0];
    const setViewportTransform = vi.fn((next: number[]) => { vt.splice(0, vt.length, ...next); });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      viewportTransform: vt,
      setViewportTransform,
      getViewportPoint: () => ({ x: 0, y: 0 }),
      getZoom: () => 1,
    } as never);
    handleWheel({
      e: {
        deltaY: opts.deltaY ?? 0,
        deltaX: opts.deltaX ?? 0,
        shiftKey: opts.shiftKey ?? false,
        ctrlKey: opts.ctrlKey ?? false,
        metaKey: false,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as WheelEvent,
    } as never);
    return vt;
  }

  it('plain wheel pans vertically', () => {
    const vt = fire({ deltaY: 100 });
    expect(vt[4]).toBe(0);
    expect(vt[5]).toBe(-100);
  });

  it('shift+wheel (deltaX 0) pans horizontally instead of vertically', () => {
    const vt = fire({ deltaY: 100, shiftKey: true });
    expect(vt[4]).toBe(-100);
    expect(vt[5]).toBe(0);
  });

  it('true horizontal trackpad scroll still pans both axes', () => {
    const vt = fire({ deltaY: 40, deltaX: 60 });
    expect(vt[4]).toBe(-60);
    expect(vt[5]).toBe(-40);
  });

  it('wheel-mode "zoom" preference makes plain wheel zoom (Inkscape-style)', () => {
    savePreferences({ ...DEFAULT_PREFERENCES, wheelMode: 'zoom' });
    try {
      const zoomToPoint = vi.fn();
      vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
        viewportTransform: [1, 0, 0, 1, 0, 0],
        setViewportTransform: vi.fn(),
        getViewportPoint: () => ({ x: 0, y: 0 }),
        getZoom: () => 1,
        zoomToPoint,
      } as never);
      handleWheel({
        e: {
          deltaY: 100, deltaX: 0, shiftKey: false, ctrlKey: false, metaKey: false,
          preventDefault: () => {}, stopPropagation: () => {},
        } as unknown as WheelEvent,
      } as never);
      expect(zoomToPoint).toHaveBeenCalled();
    } finally {
      savePreferences({ ...DEFAULT_PREFERENCES });
    }
  });
});
