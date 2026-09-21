import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ringIntervalsAtY,
  createEnvelopeShape,
  envelopeRowInterval,
  envelopeMapPoint,
  createEnvelopeMapper,
  splitTopmostByZ,
  canEnvelopeTopObject,
  canEnvelopeTargetObject,
  applyEnvelopeWithTopObject,
  envelopeSelection,
} from '../envelope';
import * as canvasEngine from '../canvasEngine';
import { getCanvas } from '../canvasEngine';

type Pt = [number, number];

// Closed ring helpers (same convention as objectToRings: last point repeats the first).
const rectRing = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y],
];
const circleRing = (cx: number, cy: number, r: number, steps = 256): Pt[] => {
  const ring: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
};

const fake = (type: string) => ({ type }) as unknown as fabric.FabricObject;

// Plain-object canvas mock (the blend.test.ts pattern): real fabric objects,
// spyable add/remove around a live array.
function mockCanvas(objects: fabric.FabricObject[], active: fabric.FabricObject[] = objects) {
  const canvas = {
    getActiveObjects: () => active,
    getObjects: () => objects,
    add: vi.fn((o: fabric.FabricObject) => { objects.push(o); }),
    remove: vi.fn((o: fabric.FabricObject) => {
      const i = objects.indexOf(o);
      if (i >= 0) objects.splice(i, 1);
    }),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
  };
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
  return canvas;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------ scanline core ------------------------------ */

describe('ringIntervalsAtY', () => {
  it('returns the full-width span for a rectangle row', () => {
    const ivs = ringIntervalsAtY([rectRing(10, 20, 100, 50)], 45);
    expect(ivs).toHaveLength(1);
    expect(ivs[0][0]).toBeCloseTo(10, 6);
    expect(ivs[0][1]).toBeCloseTo(110, 6);
  });

  it('pools crossings from multiple rings even-odd (two disjoint boxes → two spans)', () => {
    const rings = [rectRing(0, 0, 10, 10), rectRing(20, 0, 10, 10)];
    expect(ringIntervalsAtY(rings, 5)).toEqual([[0, 10], [20, 30]]);
  });

  it('excludes a hole: outer square + inner square pair around the gap', () => {
    const rings = [rectRing(0, 0, 100, 100), rectRing(40, 40, 20, 20)];
    expect(ringIntervalsAtY(rings, 50)).toEqual([[0, 40], [60, 100]]);
  });

  it('returns nothing for a row outside the shape', () => {
    expect(ringIntervalsAtY([rectRing(0, 0, 10, 10)], 50)).toEqual([]);
  });

  it('degrades a vertex-on-the-line tangent to a zero-width point instead of mis-pairing', () => {
    const triangle = [[0, 10], [10, 0], [20, 10], [0, 10]] as Pt[];
    expect(ringIntervalsAtY([triangle], 0)).toEqual([[10, 10]]);
  });
});

/* --------------------------- shape / row mapping --------------------------- */

describe('envelope — rectangle top is near-identity', () => {
  const shape = createEnvelopeShape([rectRing(10, 20, 100, 50)]);
  expect(shape).not.toBeNull();

  it('maps normalized coordinates linearly onto the rectangle frame', () => {
    const p = envelopeMapPoint(shape!, 0.25, 0.5);
    expect(p[0]).toBeCloseTo(10 + 25, 6);
    expect(p[1]).toBeCloseTo(20 + 25, 6);
  });

  it('keeps all four corners exact', () => {
    expect(envelopeMapPoint(shape!, 0, 0)).toEqual([10, 20]);
    expect(envelopeMapPoint(shape!, 1, 0)).toEqual([110, 20]);
    expect(envelopeMapPoint(shape!, 1, 1)).toEqual([110, 70]);
    expect(envelopeMapPoint(shape!, 0, 1)).toEqual([10, 70]);
  });
});

describe('envelope — circle top chords', () => {
  const r = 50;
  const shape = createEnvelopeShape([circleRing(100, 100, r)]);
  expect(shape).not.toBeNull();

  it.each([0.25, 0.5, 0.75] as const)('row v=%f spans the chord |x| ≤ r·√(1−v′²)', (v) => {
    const [xl, xr] = envelopeRowInterval(shape!, v);
    const half = r * Math.sqrt(1 - (2 * v - 1) ** 2);
    expect(xl).toBeCloseTo(100 - half, 1);
    expect(xr).toBeCloseTo(100 + half, 1);
  });

  it('falls back to the nearest row with width at the tangent top (v=0)', () => {
    const [xl, xr] = envelopeRowInterval(shape!, 0);
    const width = xr - xl;
    expect(width).toBeGreaterThan(0.4 * r);  // borrows the v≈1/64 chord…
    expect(width).toBeLessThan(0.6 * r);    // …not the full diameter, not zero
  });

  it('keeps the arch centre on the axis of symmetry at the tangent row', () => {
    // u = 0.5 at the very top row must stay centred even though the row is borrowed.
    const p = envelopeMapPoint(shape!, 0.5, 0);
    expect(p[0]).toBeCloseTo(100, 1);
    expect(p[1]).toBeCloseTo(shape!.top, 6);
  });
});

describe('envelope — clamping', () => {
  const shape = createEnvelopeShape([rectRing(0, 0, 100, 100)])!;

  it('clamps out-of-range normalized coordinates in envelopeMapPoint', () => {
    expect(envelopeMapPoint(shape, -1, 2)).toEqual(envelopeMapPoint(shape, 0, 1));
    expect(envelopeMapPoint(shape, 2, -1)).toEqual(envelopeMapPoint(shape, 1, 0));
  });

  it('clamps source points outside the source frame to its border via the mapper', () => {
    const map = createEnvelopeMapper(shape, { left: 0, top: 0, width: 100, height: 100 });
    expect(map(-50, -20)).toEqual(map(0, 0));
    expect(map(200, 300)).toEqual(map(100, 100));
  });

  it('mapper is near-identity when source frame equals a rectangle envelope', () => {
    const map = createEnvelopeMapper(shape, { left: 0, top: 0, width: 100, height: 100 });
    expect(map(35, 45)[0]).toBeCloseTo(35, 6);
    expect(map(35, 45)[1]).toBeCloseTo(45, 6);
  });
});

/* --------------------------------- guards ---------------------------------- */

describe('envelope — guards', () => {
  it('only basic vector shapes can be the top object', () => {
    for (const t of ['path', 'rect', 'circle', 'ellipse', 'polygon']) {
      expect(canEnvelopeTopObject(fake(t))).toBe(true);
    }
    for (const t of ['image', 'i-text', 'textbox', 'group', 'line']) {
      expect(canEnvelopeTopObject(fake(t))).toBe(false);
    }
  });

  it('targets may be shapes, groups or live text — never rasters', () => {
    for (const t of ['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'group', 'i-text', 'text', 'textbox']) {
      expect(canEnvelopeTargetObject(fake(t))).toBe(true);
    }
    expect(canEnvelopeTargetObject(fake('image'))).toBe(false);
    expect(canEnvelopeTargetObject(fake('line'))).toBe(false);
  });

  it('splitTopmostByZ picks the max-z object and keeps the rest in order', () => {
    const a = fake('path'), b = fake('rect'), c = fake('path');
    const z = new Map<unknown, number>([[a, 1], [b, 5], [c, 3]]);
    const { top, rest } = splitTopmostByZ([a, b, c], (o) => z.get(o) ?? 0);
    expect(top).toBe(b);
    expect(rest).toEqual([a, c]);
  });

  it('splitTopmostByZ breaks z ties toward the later item and handles empty input', () => {
    const a = fake('path'), b = fake('path');
    expect(splitTopmostByZ([a, b], () => -1).top).toBe(b); // nested sub-selection fallback
    expect(splitTopmostByZ([], () => 0).top).toBeNull();
    expect(splitTopmostByZ([], () => 0).rest).toEqual([]);
  });

  it('degenerate shapes fail soft (null, not throw)', () => {
    expect(createEnvelopeShape([])).toBeNull();
    expect(createEnvelopeShape([[]])).toBeNull();
    expect(createEnvelopeShape([[[0, 0], [1, 0], [2, 0]]])).toBeNull(); // zero height
    expect(createEnvelopeShape([[[5, 5], [5, 5], [5, 5]]])).toBeNull();  // zero extent
  });
});

/* ------------------------------ fail-soft ops ------------------------------- */

describe('envelope — fail-soft without a canvas', () => {
  it('test fixture starts without a canvas (same sanity check as masks.test)', () => {
    expect(getCanvas()).toBeNull();
  });

  it('envelopeSelection resolves null with no canvas', async () => {
    await expect(envelopeSelection()).resolves.toBeNull();
  });

  it('a non-vector top object rejects before touching geometry or canvas', async () => {
    await expect(applyEnvelopeWithTopObject(fake('image'), [fake('path')])).resolves.toBeNull();
  });

  it('an empty target list rejects', async () => {
    await expect(applyEnvelopeWithTopObject(fake('rect'), [])).resolves.toBeNull();
  });
});

/* ----------------------------- fabric integration --------------------------- */

describe('envelope — applyEnvelopeWithTopObject (real fabric objects)', () => {
  it('rectangle top over a coincident target is a near-identity rebuild', async () => {
    // strokeWidth 0 on both: fabric anchors stroke geometry into the object
    // transform, so a default 1px stroke would legitimately shift the rings
    // by 0.5px (objectToRings follows the stroked extent).
    const top = new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '#123456', strokeWidth: 0 });
    const target = new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '#654321', strokeWidth: 0 });
    const objects: fabric.FabricObject[] = [target, top];
    const canvas = mockCanvas(objects);

    const out = await applyEnvelopeWithTopObject(top, [target], canvas as unknown as fabric.Canvas);
    expect(out?.reshaped).toBe(1);
    expect(objects).not.toContain(top);   // envelope consumed, like Illustrator
    expect(objects).not.toContain(target);
    const made = canvas.add.mock.calls[0][0] as fabric.Path;
    expect(made.type).toBe('path');
    expect(made.fill).toBe('#654321');    // style carried over
    const r = made.getBoundingRect();
    expect(r.left).toBeCloseTo(0, 0);
    expect(r.top).toBeCloseTo(0, 0);
    expect(r.width).toBeCloseTo(100, 0);
    expect(r.height).toBeCloseTo(100, 0);
  });

  it('circle top: the mapped target fills the circle disk', async () => {
    const top = new fabric.Circle({ left: 0, top: 0, radius: 50, fill: '#000' });
    const target = new fabric.Rect({ left: 25, top: 25, width: 50, height: 50, fill: '#ff0000' });
    const objects: fabric.FabricObject[] = [target, top];
    const canvas = mockCanvas(objects);

    const out = await applyEnvelopeWithTopObject(top, [target], canvas as unknown as fabric.Canvas);
    expect(out?.reshaped).toBe(1);
    const made = canvas.add.mock.calls[0][0] as fabric.Path;
    const r = made.getBoundingRect();
    expect(r.left).toBeGreaterThan(-5);
    expect(r.top).toBeGreaterThan(-5);
    expect(r.left + r.width).toBeLessThan(105);
    expect(r.top + r.height).toBeLessThan(105);
    // And it actually squeezed: narrower than the un-mapped bbox would allow
    // relative to the frame (a 50×50 source stretched over a 100×100 circle frame).
    expect(r.width).toBeGreaterThan(60);
    expect(r.height).toBeGreaterThan(60);
  });

  it('groups keep structure: rebuilt as a group of mapped member paths', async () => {
    const a = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, fill: '#111' });
    const b = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, fill: '#222' });
    const group = new fabric.Group([a, b]);
    const top = new fabric.Rect({ left: 0, top: 0, width: 100, height: 50, fill: '#000' });
    const objects: fabric.FabricObject[] = [group, top];
    const canvas = mockCanvas(objects);

    const out = await applyEnvelopeWithTopObject(top, [group], canvas as unknown as fabric.Canvas);
    expect(out?.reshaped).toBe(1);
    expect(objects).not.toContain(group);
    const made = canvas.add.mock.calls[0][0] as fabric.Group;
    expect(made.type).toBe('group');
    expect(made.getObjects()).toHaveLength(2);
    const r = made.getBoundingRect();
    expect(r.width).toBeGreaterThan(90);   // both members stretched across the frame
    expect(r.height).toBeGreaterThan(40);
  });

  it('raster targets are skipped and counted, not reshaped', async () => {
    const img = fake('image');
    const top = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, fill: '#000' });
    const objects: fabric.FabricObject[] = [img, top];
    const canvas = mockCanvas(objects);

    const out = await applyEnvelopeWithTopObject(top, [img], canvas as unknown as fabric.Canvas);
    expect(out).toEqual({ reshaped: 0, skipped: 1 });
    expect(canvas.add).not.toHaveBeenCalled();
    expect(objects).toContain(top);       // nothing reshaped → top survives untouched
  });

  it('envelopeSelection pushes one history entry and discards the selection', async () => {
    const target = new fabric.Rect({ left: 0, top: 0, width: 40, height: 40, fill: '#333' });
    const top = new fabric.Rect({ left: 0, top: 0, width: 80, height: 80, fill: '#000' });
    const objects: fabric.FabricObject[] = [target, top];
    const canvas = mockCanvas(objects, [target, top]);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    const out = await envelopeSelection();
    expect(out?.reshaped).toBe(1);         // top-most (highest z) became the envelope
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledTimes(1);
  });

  it('envelopeSelection with fewer than 2 objects resolves null (guard toast path)', async () => {
    const only = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000' });
    mockCanvas([only], [only]);
    await expect(envelopeSelection()).resolves.toBeNull();
  });

  it('envelopeSelection with a non-vector top-most resolves null', async () => {
    const img = fake('image');
    const shape = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#000' });
    const objects: fabric.FabricObject[] = [shape, img];
    mockCanvas(objects, [shape, img]);
    await expect(envelopeSelection()).resolves.toBeNull();
  });
});
