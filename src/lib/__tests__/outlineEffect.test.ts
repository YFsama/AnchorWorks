/**
 * Multi-outline ring stacking tests.
 *
 * addOutlineEffectToCanvas pins the ring math on a REAL cloned Rect:
 *
 *  - N colours → N ring clones per object; ring r (0=innermost) gets
 *    strokeWidth = 2·(r+1)·widthMm·3.7795 — half of it grows the silhouette
 *    outward to (r+1)·widthMm·3.7795 px beyond the art
 *  - rings are added outermost-first so inner colours paint on top; each ring
 *    is stroke-painted with fill === stroke (silhouette trick), round joins
 *  - the original object is brought back to the front afterwards
 *  - colours map colors[0]→innermost, colors[N−1]→outermost
 *  - un-clonable objects are skipped per-ring without failing the pass
 *  - guards: no objects / no colours / width ≤ 0 → 0; history only when
 *    something was added (and never when commitHistory=false)
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addOutlineEffect, addOutlineEffectToCanvas } from '../outlineEffect';
import * as canvasEngine from '../canvasEngine';

const MM_TO_PX = 3.7795;

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCanvas() {
  const added: fabric.FabricObject[] = [];
  const c = {
    add: vi.fn((o: fabric.FabricObject) => { added.push(o); }),
    bringObjectToFront: vi.fn(),
    requestRenderAll: vi.fn(),
    fire: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
  return { c, added, history };
}

function art(): fabric.Rect {
  return new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '#ffffff', strokeWidth: 0 });
}

describe('addOutlineEffectToCanvas — ring stacking math', () => {
  it('one colour, uniform width: a single ring grown by widthMm outward', async () => {
    const { c, added, history } = makeCanvas();
    const src = art();
    const n = await addOutlineEffectToCanvas(c as unknown as fabric.Canvas, [src], ['#ff0000'], 2);
    expect(n).toBe(1);
    expect(added).toHaveLength(1);
    const ring = added[0] as fabric.Rect;
    // widthMm 2 → 2·3.7795·... : strokeWidth = 2 · 1 · 2 · MM_TO_PX = 15.118
    expect(ring.strokeWidth).toBeCloseTo(2 * 2 * MM_TO_PX, 3);
    expect(ring.stroke).toBe('#ff0000');
    expect(ring.fill).toBe('#ff0000');            // silhouette trick: fill === stroke
    expect(ring.paintFirst).toBe('stroke');       // stroke under fill of same colour
    expect(ring.strokeLineJoin).toBe('round');
    expect(ring.strokeLineCap).toBe('round');
    expect(ring.shadow).toBeNull();
    expect(ring.selectable).toBe(true);
    expect(ring.evented).toBe(true);
    // The clone kept the source geometry (100×100 at the origin).
    expect(ring.width).toBe(100);
    expect(ring.left).toBeCloseTo(0, 6);
    // Ring silhouette extent: bbox grown by half the stroke = 2mm px each side.
    const b = ring.getBoundingRect();
    expect(b.width).toBeCloseTo(100 + 2 * 2 * MM_TO_PX, 2);
    expect(c.bringObjectToFront).toHaveBeenCalledWith(src);
    expect(c.requestRenderAll).toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('four rings: widths stack at multiples of the uniform width, colours ordered inner→outer', async () => {
    const { c, added } = makeCanvas();
    const src = art();
    const colors = ['#111111', '#222222', '#333333', '#444444'];
    const n = await addOutlineEffectToCanvas(c as unknown as fabric.Canvas, [src], colors, 1);
    expect(n).toBe(4);
    expect(added).toHaveLength(4);
    // Added outermost-first: colors[3] lands first, colors[0] last (paints on top).
    expect(added.map((r) => r.stroke)).toEqual(['#444444', '#333333', '#222222', '#111111']);
    // Ring r grows (r+1)·width outward via strokeWidth = 2·(r+1)·wPx.
    for (let r = 0; r < 4; r++) {
      const ring = added[3 - r] as fabric.Rect; // added[] is reversed vs ring index
      expect(ring.strokeWidth).toBeCloseTo(2 * (r + 1) * 1 * MM_TO_PX, 3);
    }
    // Outermost ring silhouette: bbox grown by 4·1mm px on every side.
    const b = (added[0] as fabric.Rect).getBoundingRect();
    expect(b.width).toBeCloseTo(100 + 2 * 4 * MM_TO_PX, 2);
    expect(c.bringObjectToFront).toHaveBeenCalledWith(src);
  });

  it('stacks rings per object and fronts each original', async () => {
    const { c, added } = makeCanvas();
    const a = art();
    const b2 = art();
    const n = await addOutlineEffectToCanvas(c as unknown as fabric.Canvas, [a, b2], ['#0ff', '#f0f'], 1.5);
    expect(n).toBe(4);
    expect(added).toHaveLength(4);
    expect(c.bringObjectToFront).toHaveBeenCalledWith(a);
    expect(c.bringObjectToFront).toHaveBeenCalledWith(b2);
  });

  it('commitHistory=false skips the history push but still renders', async () => {
    const { c, added, history } = makeCanvas();
    const n = await addOutlineEffectToCanvas(c as unknown as fabric.Canvas, [art()], ['#123456'], 1, false);
    expect(n).toBe(1);
    expect(added).toHaveLength(1);
    expect(c.requestRenderAll).toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('guards: no objects / no colours / non-positive width → 0, nothing added', async () => {
    const { c, added, history } = makeCanvas();
    expect(await addOutlineEffectToCanvas(c as unknown as fabric.Canvas, [], ['#fff'], 1)).toBe(0);
    expect(await addOutlineEffectToCanvas(c as unknown as fabric.Canvas, [art()], [], 1)).toBe(0);
    expect(await addOutlineEffectToCanvas(c as unknown as fabric.Canvas, [art()], ['#fff'], 0)).toBe(0);
    expect(await addOutlineEffectToCanvas(c as unknown as fabric.Canvas, [art()], ['#fff'], -2)).toBe(0);
    expect(added).toHaveLength(0);
    expect(c.requestRenderAll).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('skips rings of un-clonable objects without failing the pass', async () => {
    const { c, added, history } = makeCanvas();
    const broken = {
      clone: () => Promise.reject(new Error('nope')),
    } as unknown as fabric.FabricObject;
    const n = await addOutlineEffectToCanvas(c as unknown as fabric.Canvas, [broken], ['#fff', '#000'], 1);
    expect(n).toBe(0);
    expect(added).toHaveLength(0);
    // The original is still fronted; nothing rendered or committed.
    expect(c.bringObjectToFront).toHaveBeenCalledWith(broken);
    expect(c.requestRenderAll).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });
});

describe('addOutlineEffect (canvas-engine wrapper)', () => {
  it('returns 0 without a canvas', async () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(await addOutlineEffect([new fabric.Rect({ width: 5, height: 5 })], ['#fff'], 1)).toBe(0);
  });

  it('delegates to the canvas variant when a canvas is live', async () => {
    const { added } = makeCanvas();
    expect(await addOutlineEffect([art()], ['#abcdef'], 2)).toBe(1);
    expect(added).toHaveLength(1);
  });
});
