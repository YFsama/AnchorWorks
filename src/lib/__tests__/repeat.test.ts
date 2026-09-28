/**
 * Repeat / array transforms (Illustrator Object→Repeat analogue) tests.
 *
 * Pins the placement math of repeatGrid / repeatRadial / repeatMirror on a
 * mocked canvas with real fabric objects (clone() runs the real fabric
 * serialization round trip):
 *
 *  - grid: clones at (col·dx, row·dy) offsets around the source cell, the
 *    (0,0) cell is the original, count = cols·rows − 1 per source
 *  - radial: 0° = up, closed 360° ring skips the seam duplicate; open arcs
 *    populate both endpoints; count−1 clones; the source is moved onto
 *    slot 0; rotateInstances adds the slot angle; count clamps to ≥2
 *  - mirror: 1 clone per axis flip (3 for 'both') with bboxes abutting the
 *    source across the union-bounds axis; flip flags XOR with the source's
 *  - guards: no canvas / no selection → 0; pushHistory fires exactly once
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repeatGrid, repeatMirror, repeatRadial } from '../repeat';
import * as canvasEngine from '../canvasEngine';

type FabricObject = fabric.FabricObject;

afterEach(() => {
  vi.restoreAllMocks();
});

/* --------------------------------- helpers --------------------------------- */

function makeCanvas(active: FabricObject | null) {
  const c = {
    getActiveObject: () => active,
    getActiveObjects: () => (active ? [active] : []),
    add: vi.fn(),
    remove: vi.fn(),
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

/** A 100×100 rect pinned at (0,0), stroke-free for exact bounding boxes. */
function tile(): fabric.Rect {
  return new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, strokeWidth: 0 });
}

/** Stand-in matching the ActiveSelection surface selectionSources() uses. */
function multiSelection(objects: FabricObject[]): FabricObject {
  return { type: 'activeselection', getObjects: () => objects } as unknown as FabricObject;
}

/* ---------------------------------- grid ----------------------------------- */

describe('repeatGrid', () => {
  it('places one clone per non-origin cell at (col·dx, row·dy) from the source', async () => {
    const src = tile();
    const { c, history } = makeCanvas(src);

    expect(await repeatGrid({ cols: 3, rows: 2, dx: 50, dy: 40 })).toBe(5);

    const clones = c.add.mock.calls.map((call) => call[0] as fabric.Rect);
    expect(clones).toHaveLength(5);
    const byPos = new Map(clones.map((cl) => [`${cl.left},${cl.top}`, cl]));
    expect([...byPos.keys()].sort()).toEqual(['0,40', '100,0', '100,40', '50,0', '50,40']);
    expect(history).toHaveBeenCalledTimes(1);
    expect(c.requestRenderAll).toHaveBeenCalled();
  });

  it('clones every member of an ActiveSelection into each cell', async () => {
    const a = tile();
    const b = new fabric.Circle({ left: 200, top: 0, radius: 10, originX: 'left', originY: 'top', strokeWidth: 0 });
    const sel = multiSelection([a, b]);
    const { c } = makeCanvas(sel);

    // 2×1 grid → 1 non-origin cell × 2 sources = 2 clones.
    expect(await repeatGrid({ cols: 2, rows: 1, dx: 75, dy: 0 })).toBe(2);
    const clones = c.add.mock.calls.map((call) => call[0] as FabricObject);
    expect(clones).toHaveLength(2);
    const [cloneA, cloneB] = clones;
    expect(cloneA.left).toBeCloseTo(75, 6);
    expect(cloneB.left).toBeCloseTo(275, 6);
  });

  it('clamps cols/rows below 1 to a single cell (0 clones)', async () => {
    const src = tile();
    const { c } = makeCanvas(src);
    expect(await repeatGrid({ cols: 0, rows: -3, dx: 10, dy: 10 })).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    // Still one history push per invocation.
  });

  it('returns 0 without a canvas or selection', async () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    expect(await repeatGrid({ cols: 2, rows: 2, dx: 10, dy: 10 })).toBe(0);
    const { c } = makeCanvas(null);
    expect(await repeatGrid({ cols: 2, rows: 2, dx: 10, dy: 10 })).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('applyAsGroup wraps sources + clones into one selected Group', async () => {
    const src = tile();
    const { c } = makeCanvas(src);
    expect(await repeatGrid({ cols: 2, rows: 1, dx: 50, dy: 0, applyAsGroup: true })).toBe(1);
    // Source removed so the Group can take ownership; group added + selected.
    expect(c.remove).toHaveBeenCalledWith(src);
    const group = c.add.mock.calls[0][0];
    expect(group).toBeInstanceOf(fabric.Group);
    expect(c.setActiveObject).toHaveBeenCalledWith(group);
  });
});

/* --------------------------------- radial ---------------------------------- */

describe('repeatRadial', () => {
  it('arranges count−1 clones on a closed ring with 0° pointing up', async () => {
    const src = tile(); // bbox centre (50,50)
    const { c, history } = makeCanvas(src);

    expect(await repeatRadial({ count: 4, radius: 100 })).toBe(3);

    const clones = c.add.mock.calls.map((call) => call[0] as fabric.Rect);
    expect(clones).toHaveLength(3);
    // Default centre = (ub.centerX, ub.centerY + radius) = (50, 150).
    // Slots: 0°=(50,50) source, 90°=(150,150), 180°=(50,250), 270°=(−50,150).
    // Clones are placed so their bbox CENTRES land on the slot → left/top
    // = slot − 50.
    const centres = clones.map((cl) => [cl.left! + 50, cl.top! + 50] as [number, number]);
    const key = (p: [number, number]) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`;
    expect(new Set(centres.map(key))).toEqual(new Set(['150,150', '50,250', '-50,150']));
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('moves the source onto slot 0 of the ring (no clone for i=0)', async () => {
    const src = tile();
    const { c } = makeCanvas(src);
    await repeatRadial({ count: 3, radius: 100, startAngle: 90 });
    // startAngle 90 → slot 0 sits at (cx + r, cy) = (150, 150); the source's
    // centre is moved there: left = 150 − 50 = 100.
    expect(src.left).toBeCloseTo(100, 1);
    expect(src.top).toBeCloseTo(100, 1);
    expect(c.add.mock.calls).toHaveLength(2); // count 3 → clones for i=1,2
  });

  it('open arcs populate both endpoints (denominator count−1)', async () => {
    const src = tile();
    const { c } = makeCanvas(src);
    expect(await repeatRadial({ count: 3, radius: 100, startAngle: 0, endAngle: 180 })).toBe(2);
    const clones = c.add.mock.calls.map((call) => call[0] as fabric.Rect);
    const centres = clones.map((cl) => [cl.left! + 50, cl.top! + 50] as [number, number]);
    // Angles 90° and 180° → (150,150) and (50,250).
    const key = (p: [number, number]) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`;
    expect(new Set(centres.map(key))).toEqual(new Set(['150,150', '50,250']));
  });

  it('rotateInstances adds each slot angle to the clone rotation', async () => {
    const src = tile();
    const { c } = makeCanvas(src);
    await repeatRadial({ count: 4, radius: 100, rotateInstances: true });
    const clones = c.add.mock.calls.map((call) => call[0] as fabric.Rect);
    // Slots at 90/180/270 → clone angles exactly those (source angle 0).
    const angles = clones.map((cl) => cl.angle).sort((a, b) => a - b);
    expect(angles.map((a) => Math.round(a))).toEqual([90, 180, 270]);
    // Without rotateInstances the clones keep the source's angle 0.
    const src2 = tile();
    const { c: c2 } = makeCanvas(src2);
    await repeatRadial({ count: 4, radius: 100, rotateInstances: false });
    for (const call of c2.add.mock.calls) expect((call[0] as fabric.Rect).angle ?? 0).toBe(0);
  });

  it('clamps count below 2 up to 2 (one clone + repositioned source)', async () => {
    const src = tile();
    const { c } = makeCanvas(src);
    expect(await repeatRadial({ count: 1, radius: 100 })).toBe(1);
    expect(c.add.mock.calls).toHaveLength(1);
  });

  it('returns 0 without a canvas or selection', async () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(await repeatRadial({ count: 4, radius: 100 })).toBe(0);
    const { c } = makeCanvas(null);
    expect(await repeatRadial({ count: 4, radius: 100 })).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
  });
});

/* --------------------------------- mirror ---------------------------------- */

describe('repeatMirror', () => {
  it("horizontal mirrors flip X with the clone's bbox abutting the source's", async () => {
    const src = tile();
    const { c, history } = makeCanvas(src);

    expect(await repeatMirror({ axis: 'horizontal' })).toBe(1);
    const clone = c.add.mock.calls[0][0] as fabric.Rect;
    expect(clone.flipX).toBe(true);
    expect(clone.flipY).toBe(false);
    // Reflected across the union centre then pushed out by the union width:
    // newCx = 2·50 − 50 + 100 = 150 → left = 150 − 50 = 100 → bboxes touch
    // at x=100 with no gap and no overlap.
    expect(clone.left).toBeCloseTo(100, 6);
    expect(clone.top).toBeCloseTo(0, 6);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('vertical mirrors flip Y and stack the clone below the source', async () => {
    const src = tile();
    const { c } = makeCanvas(src);
    expect(await repeatMirror({ axis: 'vertical' })).toBe(1);
    const clone = c.add.mock.calls[0][0] as fabric.Rect;
    expect(clone.flipY).toBe(true);
    expect(clone.flipX).toBe(false);
    expect(clone.left).toBeCloseTo(0, 6);
    expect(clone.top).toBeCloseTo(100, 6);
  });

  it("'both' produces the 3-clone kaleidoscope (X, Y, XY)", async () => {
    const src = tile();
    const { c } = makeCanvas(src);
    expect(await repeatMirror({ axis: 'both' })).toBe(3);
    const clones = c.add.mock.calls.map((call) => call[0] as fabric.Rect);
    const flips = clones.map((cl) => `${cl.flipX ? 'x' : ''}${cl.flipY ? 'y' : ''}@${cl.left!.toFixed(0)},${cl.top!.toFixed(0)}`);
    expect(new Set(flips)).toEqual(new Set(['x@100,0', 'y@0,100', 'xy@100,100']));
  });

  it('XORs flip flags against a pre-flipped source instead of resetting them', async () => {
    const src = tile();
    src.set({ flipX: true });
    const { c } = makeCanvas(src);
    await repeatMirror({ axis: 'horizontal' });
    const clone = c.add.mock.calls[0][0] as fabric.Rect;
    expect(clone.flipX).toBe(false); // toggled back so it mirrors visually
  });

  it('returns 0 without a canvas or selection', async () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(await repeatMirror({ axis: 'both' })).toBe(0);
    const { c } = makeCanvas(null);
    expect(await repeatMirror({ axis: 'both' })).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
  });
});
