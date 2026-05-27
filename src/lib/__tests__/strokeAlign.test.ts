import { describe, it, expect } from 'vitest';
import type * as fabric from 'fabric';
import { getStrokeAlign, applyStrokeAlign } from '../strokeAlign';

/**
 * getStrokeAlign is pure — it just reads the `__strokeAlign` augmented prop.
 * applyStrokeAlign requires a real Fabric canvas (it pokes `getCanvas()` and
 * the active selection), so we only verify export + no-canvas safety here.
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

  // Behavioural tests require a real fabric.Canvas with a selection.
  it.todo('doubles strokeWidth on inside-aligned objects');
  it.todo('attaches an __alignClip clipPath for inside mode');
});
