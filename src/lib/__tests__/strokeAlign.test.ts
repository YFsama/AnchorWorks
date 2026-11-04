import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { getStrokeAlign, applyStrokeAlign } from '../strokeAlign';
import * as canvasEngine from '../canvasEngine';

/**
 * getStrokeAlign is pure — it just reads the `__strokeAlign` augmented prop.
 * applyStrokeAlign's behavioural path runs against a stub canvas via
 * vi.spyOn(canvasEngine, 'getCanvas') with REAL fabric objects (the
 * booleanOps/masks test pattern): Fabric v6+ clone() is promise-based, so
 * the inside-mode clipPath attaches after a setTimeout(0) microtask drain.
 */
describe('getStrokeAlign', () => {
  it("returns 'center' for null", () => {
    expect(getStrokeAlign(null)).toBe('center');
  });

  it("returns 'center' for undefined", () => {
    expect(getStrokeAlign(undefined)).toBe('center');
  });

  it("returns 'center' for a plain object without __strokeAlign", () => {
    const obj = {} as unknown as fabric.FabricObject;
    expect(getStrokeAlign(obj)).toBe('center');
  });

  it("returns the stored value when __strokeAlign is 'inside'", () => {
    const obj = { __strokeAlign: 'inside' } as unknown as fabric.FabricObject;
    expect(getStrokeAlign(obj)).toBe('inside');
  });

  it("returns the stored value when __strokeAlign is 'outside'", () => {
    const obj = { __strokeAlign: 'outside' } as unknown as fabric.FabricObject;
    expect(getStrokeAlign(obj)).toBe('outside');
  });

  it("returns 'center' when __strokeAlign is explicitly set to 'center'", () => {
    const obj = { __strokeAlign: 'center' } as unknown as fabric.FabricObject;
    expect(getStrokeAlign(obj)).toBe('center');
  });
});

describe('applyStrokeAlign', () => {
  it('is exported as a function', () => {
    expect(typeof applyStrokeAlign).toBe('function');
  });

  it('is a no-op when there is no canvas (does not throw)', () => {
    // Without an active canvas, applyStrokeAlign should return early without
    // raising — the editor calls this on selection-change events, which can
    // race with canvas disposal.
    expect(() => applyStrokeAlign('inside')).not.toThrow();
    expect(() => applyStrokeAlign('outside')).not.toThrow();
    expect(() => applyStrokeAlign('center')).not.toThrow();
  });
});

/* ------------------------- behavioural (stub canvas) ------------------------- */

type AlignedObject = fabric.FabricObject & {
  __originalStrokeWidth?: number;
  __alignClip?: boolean;
};

function makeCanvas(active: fabric.FabricObject[]) {
  const objects = [...active];
  return {
    getObjects: () => objects,
    getActiveObjects: () => active,
    remove: vi.fn((o: fabric.FabricObject) => {
      const i = objects.indexOf(o);
      if (i >= 0) objects.splice(i, 1);
    }),
    add: vi.fn((o: fabric.FabricObject) => {
      objects.push(o);
    }),
    setActiveObject: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
    fire: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

/** Resolve after Fabric's promise-based clone() and strokeAlign's
 *  Promise.all(...).then(...) commit handler have settled. */
const drainAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyStrokeAlign — inside mode (stub canvas, real fabric)', () => {
  it('doubles strokeWidth on inside-aligned objects', async () => {
    const rect = new fabric.Rect({
      width: 100, height: 100, fill: '#111111', stroke: '#000000', strokeWidth: 4,
    });
    const c = makeCanvas([rect]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    applyStrokeAlign('inside');
    await drainAsync();

    expect(getStrokeAlign(rect)).toBe('inside');
    // The visual trick: width doubles so the clipped-away outer half leaves
    // an inside stroke of exactly the requested width.
    expect(rect.strokeWidth).toBe(8);
    // The user-facing width is stashed so mode switches restore it.
    expect((rect as AlignedObject).__originalStrokeWidth).toBe(4);
  });

  it('attaches an __alignClip clipPath for inside mode', async () => {
    const rect = new fabric.Rect({
      width: 100, height: 100, fill: '#111111', stroke: '#000000', strokeWidth: 2,
    });
    const c = makeCanvas([rect]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    applyStrokeAlign('inside');
    await drainAsync();

    const clip = rect.clipPath as AlignedObject | undefined;
    expect(clip).toBeTruthy();
    // Relative (not absolutePositioned): the clip rides with the object.
    expect(clip!.absolutePositioned).toBe(false);
    expect(clip!.__alignClip).toBe(true);
    expect(c.requestRenderAll).toHaveBeenCalled();
  });

  it('switching back to center restores the original width and strips the clip', async () => {
    const rect = new fabric.Rect({
      width: 100, height: 100, fill: '#111111', stroke: '#000000', strokeWidth: 3,
    });
    const c = makeCanvas([rect]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    applyStrokeAlign('inside');
    await drainAsync();
    expect(rect.clipPath).toBeTruthy();

    applyStrokeAlign('center');
    expect(rect.strokeWidth).toBe(3);
    expect(rect.clipPath).toBeUndefined();
    expect(getStrokeAlign(rect)).toBe('center');
  });
});
