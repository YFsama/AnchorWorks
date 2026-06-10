import { describe, it, expect } from 'vitest';
import {
  applyClipMask,
  releaseClipMask,
  makeCompoundPath,
  releaseCompoundPath,
  countClipPathsInObject,
} from '../masks';
import { getCanvas } from '../canvasEngine';

/**
 * masks.ts depends on a live Fabric canvas. jsdom can't render Fabric, so
 * we only verify graceful no-canvas behaviour (each public fn must return
 * false rather than throw when `getCanvas()` is null). Full behavioural
 * coverage is marked todo — that path requires a real fabric.Canvas with
 * a 2D rendering context.
 */
describe('masks — no-canvas guards', () => {
  it('test fixture starts without a canvas', () => {
    // Sanity: the canvas singleton is null in this test env because nothing
    // ever called initCanvas. If this assertion ever fails, the rest of the
    // no-canvas guards become meaningless.
    expect(getCanvas()).toBeNull();
  });

  it('applyClipMask returns false when there is no canvas', () => {
    expect(applyClipMask()).toBe(false);
  });

  it('releaseClipMask returns false when there is no canvas', () => {
    expect(releaseClipMask()).toBe(false);
  });

  it('makeCompoundPath returns false when there is no canvas', () => {
    expect(makeCompoundPath()).toBe(false);
  });

  it('releaseCompoundPath returns false when there is no canvas', () => {
    expect(releaseCompoundPath()).toBe(false);
  });

  it('all mask and compound exports are functions', () => {
    expect(typeof applyClipMask).toBe('function');
    expect(typeof releaseClipMask).toBe('function');
    expect(typeof makeCompoundPath).toBe('function');
    expect(typeof releaseCompoundPath).toBe('function');
  });

  it('counts clip paths recursively for clipping-mask expansion', () => {
    const leaf = { clipPath: {} };
    const group = { type: 'group', getObjects: () => [leaf, { clipPath: {} }] };

    expect(countClipPathsInObject(group as never)).toBe(2);
    expect(countClipPathsInObject({} as never)).toBe(0);
  });

  // Behavioural coverage requires a real fabric.Canvas — punt for now.
  it.todo('applyClipMask wraps clipped objects in a Group');
  it.todo('releaseClipMask strips clipPath from descendants');
  it.todo('makeCompoundPath concatenates subpaths with evenodd fill');
  it.todo('releaseCompoundPath splits multi-M paths into pieces');
});
