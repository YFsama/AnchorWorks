/**
 * Contour-from-selection tests — the weldOutline colour-threading contract
 * (layered-vinyl support): a weld of uniformly coloured inputs carries that
 * colour onto the welded rings so the plotter's Layers section can see the
 * job as a vinyl layer; mixed or colourless input stays colourless.
 *
 * Real fabric.Path squares (the makeSticker.test.ts pattern — no 2D-context
 * stub needed for path-only objects).
 */
import * as fabric from 'fabric';
import { describe, expect, it } from 'vitest';
import { weldOutline } from '../contourFromSelection';

/** 100×100 px square at (left, top) filled with `color` (or colourless). */
function square(color: string | undefined, left: number, top: number): fabric.FabricObject {
  return new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', { left, top, fill: color });
}

describe('weldOutline colour threading', () => {
  it('tags welded rings with the colour when every input object shares one', () => {
    const out = weldOutline([
      square('#ff0000', 100, 100),
      square('#ff0000', 160, 140), // overlapping — unions into one ring
    ]);
    const closed = out.filter(p => p.closed);
    expect(closed).toHaveLength(1);
    expect(closed.every(p => p.color === '#ff0000')).toBe(true);
  });

  it('leaves colour undefined when input colours are mixed', () => {
    const out = weldOutline([
      square('#ff0000', 100, 100),
      square('#0000ff', 160, 140),
    ]);
    const closed = out.filter(p => p.closed);
    expect(closed).toHaveLength(1);
    expect(closed.every(p => p.color === undefined)).toBe(true);
  });

  it('leaves colour undefined when any input is colourless', () => {
    const out = weldOutline([
      square('#ff0000', 100, 100),
      square(undefined, 160, 140),
    ]);
    const closed = out.filter(p => p.closed);
    expect(closed).toHaveLength(1);
    expect(closed.every(p => p.color === undefined)).toBe(true);
  });
});
