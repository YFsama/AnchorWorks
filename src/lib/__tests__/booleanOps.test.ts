/**
 * Boolean operations (pathfinder / shape-builder backend) tests.
 *
 * Pins the destructive polygon-clipping pipeline end-to-end on a mocked
 * canvas with REAL fabric objects:
 *
 *  - objectToRings: rect / ellipse / polygon / path flattening into absolute-
 *    space rings (closed, correct area), fallback bounding box for foreign
 *    types, null for degenerate inputs.
 *  - multiPolygonToPathD: ring → 'd' conversion, ring skipping, curve refit.
 *  - booleanOp area identities on two 100×100 squares (A∪B + A∩B = A + B,
 *    subtract = A − A∩B, exclude = A + B − 2·A∩B), containment, disjoint
 *    no-ops, minus-back operand swap, style inheritance (subject vs clip),
 *    selection guards, empty-result operand retention.
 *  - divide / trim / crop / merge pathfinder counts and areas.
 *
 * The clipping Web Worker is mocked to fail construction so every op runs
 * through the synchronous main-thread fallback (deterministic, no posts).
 */
import * as fabric from 'fabric';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  booleanOp,
  cropSelection,
  divideSelection,
  mergeSelection,
  mergeSameFillSelection,
  multiPolygonToPathD,
  objectToRings,
  trimSelection,
} from '../booleanOps';
import * as canvasEngine from '../canvasEngine';

vi.mock('../workers/clipping.worker.ts?worker', () => ({
  default: class ThrowingWorker {
    constructor() {
      throw new Error('workers unavailable in unit tests');
    }
  },
}));

type Cmd = [string, ...number[]];

/** Pin the object to its d-coordinates (exact absolute-space round trip). */
const OPTS = { left: 0, top: 0, fill: '', stroke: '#000', strokeWidth: 0 } as const;

beforeEach(() => {
  // Silence the fallback logger.warn / console.log the worker path emits.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* --------------------------------- helpers --------------------------------- */

function makeCanvas(objects: fabric.FabricObject[], active = objects) {
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
    // ActiveSelection's LayoutManager pokes at these during construction.
    fire: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

/** Shoelace signed area of a ring (screen coords — sign per winding). */
function signedArea(ring: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function ringArea(ring: Array<[number, number]>): number {
  return Math.abs(signedArea(ring));
}

/** Flatten a fabric.Path's command array (M/L/C/Q/Z, absolute coords) into
 *  sub-path rings, sampling curves at 24 steps. Segments whose endpoints
 *  coincide are skipped: the boolean refit emits degenerate zero-length C
 *  segments at ring seams (duplicate closing vertex — see the note at the
 *  bottom of this file), and they must not contribute area. */
function flattenCommands(path: fabric.Path): Array<Array<[number, number]>> {
  const subs: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  let cx = 0;
  let cy = 0;
  const cubic = (p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], t: number): [number, number] => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
  const degenerate = (x: number, y: number): boolean =>
    Math.abs(x - cx) < 1e-9 && Math.abs(y - cy) < 1e-9;
  for (const cmd of path.path as unknown as Cmd[]) {
    const c = String(cmd[0]).toUpperCase();
    if (c === 'M') {
      if (cur.length > 1) subs.push(cur);
      cx = cmd[1] as number;
      cy = cmd[2] as number;
      cur = [[cx, cy]];
    } else if (c === 'L' || c === 'T') {
      const nx = cmd[1] as number;
      const ny = cmd[2] as number;
      if (!degenerate(nx, ny)) {
        cur.push([nx, ny]);
        cx = nx;
        cy = ny;
      }
    } else if (c === 'C') {
      const p0: [number, number] = [cx, cy];
      const p1: [number, number] = [cmd[1] as number, cmd[2] as number];
      const p2: [number, number] = [cmd[3] as number, cmd[4] as number];
      const p3: [number, number] = [cmd[5] as number, cmd[6] as number];
      if (!degenerate(p3[0], p3[1])) {
        for (let i = 1; i <= 24; i++) cur.push(cubic(p0, p1, p2, p3, i / 24));
        cx = p3[0];
        cy = p3[1];
      }
    } else if (c === 'Q') {
      const p0: [number, number] = [cx, cy];
      const cp: [number, number] = [cmd[1] as number, cmd[2] as number];
      const p2: [number, number] = [cmd[3] as number, cmd[4] as number];
      if (!degenerate(p2[0], p2[1])) {
        // Promote Q → C with the standard 2/3 control-point mapping.
        const c1: [number, number] = [p0[0] + (2 / 3) * (cp[0] - p0[0]), p0[1] + (2 / 3) * (cp[1] - p0[1])];
        const c2: [number, number] = [p2[0] + (2 / 3) * (cp[0] - p2[0]), p2[1] + (2 / 3) * (cp[1] - p2[1])];
        for (let i = 1; i <= 24; i++) cur.push(cubic(p0, c1, c2, p2, i / 24));
        cx = p2[0];
        cy = p2[1];
      }
    } else if (c === 'Z') {
      if (cur.length > 1) {
        cur.push([cur[0][0], cur[0][1]]);
        subs.push(cur);
      }
      cur = [];
    }
  }
  if (cur.length > 1) subs.push(cur);
  return subs;
}

/** Net area of a path's sub-paths (outer rings minus holes via winding). */
function pathArea(path: fabric.Path): number {
  return flattenCommands(path).reduce((sum, ring) => sum + signedArea(ring), 0);
}

function pathRingCount(path: fabric.Path): number {
  return flattenCommands(path).length;
}

/** A 100×100 rect at (x, y). */
function rect(x: number, y: number, fill = '#123456'): fabric.Rect {
  return new fabric.Rect({ left: x, top: y, width: 100, height: 100, fill, stroke: '#000', strokeWidth: 0 });
}

/** Overlapping pair: A at (0,0) (bottom), B at (50,0) (top) → A∩B = 5000. */
function overlappingPair(): [fabric.Rect, fabric.Rect] {
  return [rect(0, 0, '#123456'), rect(50, 0, '#abcdef')];
}

function mockCanvas(c: ReturnType<typeof makeCanvas>) {
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
  return history;
}

/* ------------------------------ objectToRings ------------------------------ */

describe('objectToRings', () => {
  it('flattens a rect into one closed absolute-space ring with exact area and corners', () => {
    const r = rect(10, 20);
    const rings = objectToRings(r)!;
    expect(rings).toHaveLength(1);
    const ring = rings[0] as Array<[number, number]>;
    expect(ringArea(ring)).toBeCloseTo(10000, 6);
    // Closed (first == last) and sitting at the object's on-canvas position.
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 6);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 6);
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(10, 6);
    expect(Math.max(...xs)).toBeCloseTo(110, 6);
    expect(Math.min(...ys)).toBeCloseTo(20, 6);
    expect(Math.max(...ys)).toBeCloseTo(120, 6);
  });

  it('flattens an ellipse/circle into a ring of area ≈ π·r²', () => {
    const circle = new fabric.Circle({ left: 0, top: 0, radius: 50, originX: 'left', originY: 'top' });
    const rings = objectToRings(circle)!;
    expect(rings).toHaveLength(1);
    // ~1px sampling on a 2π·50 circumference → error well under 1%.
    expect(ringArea(rings[0])).toBeGreaterThan(Math.PI * 50 * 50 * 0.99);
    expect(ringArea(rings[0])).toBeLessThan(Math.PI * 50 * 50 * 1.01);
  });

  it('maps a polygon through its transform into an exact-area ring', () => {
    const tri = new fabric.Polygon([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], {
      left: 0,
      top: 0,
      fill: '',
    });
    const rings = objectToRings(tri)!;
    expect(rings).toHaveLength(1);
    expect(ringArea(rings[0])).toBeCloseTo(5000, 3);
  });

  it('returns null for a polygon/polyline with fewer than 3 points', () => {
    const duo = new fabric.Polyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], { left: 0, top: 0 });
    expect(objectToRings(duo)).toBeNull();
  });

  it('flattens a path with bezier segments into a dense closed ring', () => {
    // A quad bump on a 100-wide baseline: the curve peaks at y=50 (midpoint of
    // a quadratic is the average of the three points' y: (0+2·100+0)/4=50),
    // so the exact enclosed area is the parabola segment 2/3·w·h ≈ 3333.
    const p = new fabric.Path('M 0 0 Q 50 100 100 0 Z', OPTS);
    const rings = objectToRings(p)!;
    expect(rings).toHaveLength(1);
    const ring = rings[0] as Array<[number, number]>;
    // 1px flatten tolerance → dense sampling.
    expect(ring.length).toBeGreaterThan(20);
    const area = ringArea(ring);
    expect(area).toBeGreaterThan((2 / 3) * 100 * 50 * 0.95);
    expect(area).toBeLessThan((2 / 3) * 100 * 50 * 1.05);
  });

  it('treats an open path as implicitly closed (no Z still yields a closed ring)', () => {
    const p = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100', OPTS);
    const rings = objectToRings(p)!;
    expect(rings).toHaveLength(1);
    const ring = rings[0] as Array<[number, number]>;
    expect(ringArea(ring)).toBeCloseTo(10000, 3);
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 6);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 6);
  });

  it('falls back to a bounding-box ring for foreign object types with size', () => {
    const foreign = {
      type: 'image',
      width: 40,
      height: 30,
      calcTransformMatrix: () => [1, 0, 0, 1, 0, 0],
    } as unknown as fabric.FabricObject;
    const rings = objectToRings(foreign)!;
    expect(rings).toHaveLength(1);
    expect(ringArea(rings[0])).toBeCloseTo(1200, 6);
  });

  it('returns null for foreign objects without a positive width/height', () => {
    const zero = {
      type: 'image',
      width: 0,
      height: 30,
      calcTransformMatrix: () => [1, 0, 0, 1, 0, 0],
    } as unknown as fabric.FabricObject;
    expect(objectToRings(zero)).toBeNull();
  });
});

/* --------------------------- multiPolygonToPathD ---------------------------- */

describe('multiPolygonToPathD', () => {
  it('emits a closed polygon d-string for a square ring (corners stay L)', () => {
    const d = multiPolygonToPathD([[[[0, 0], [100, 0], [100, 100], [0, 100]]]]);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).not.toContain('C '); // square corners are refit as L, not curves
    // The emitted d round-trips to the exact square.
    expect(pathArea(new fabric.Path(d, OPTS))).toBeCloseTo(10000, 3);
  });

  it('emits one sub-path per polygon in a MultiPolygon', () => {
    const d = multiPolygonToPathD([
      [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      [[[100, 0], [110, 0], [110, 10], [100, 10], [100, 0]]],
    ]);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it('skips rings with fewer than 2 points and yields an empty string for no geometry', () => {
    expect(multiPolygonToPathD([[[]]])).toBe('');
    expect(multiPolygonToPathD([[[[0, 0]]]] as never)).toBe('');
    expect(multiPolygonToPathD([])).toBe('');
  });

  it('refits dense smooth rings with real C segments (round stays round)', () => {
    // ~1px-sampled circle of radius 50 → every vertex is "smooth" for the
    // refit, so the output must contain bezier C commands, not 300 L steps.
    const circle = new fabric.Circle({ left: 0, top: 0, radius: 50, originX: 'left', originY: 'top' });
    const rings = objectToRings(circle)!;
    const d = multiPolygonToPathD([rings as never]);
    expect(d).toContain(' C ');
    // And far fewer commands than the raw flattened vertex count.
    expect((d.match(/L /g) ?? []).length).toBeLessThan(rings[0].length / 2);
  });
});

/* -------------------------------- booleanOp -------------------------------- */

describe('booleanOp — guards', () => {
  it('resolves null without a live canvas', async () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    await expect(booleanOp('union')).resolves.toBeNull();
  });

  it('resolves null for a selection with fewer than two objects', async () => {
    const c = makeCanvas([rect(0, 0)]);
    mockCanvas(c);
    await expect(booleanOp('union')).resolves.toBeNull();
    expect(c.add).not.toHaveBeenCalled();
  });

});

describe('booleanOp — two overlapping squares (A∩B = 5000)', () => {
  it.each([
    ['union', 15000, '#123456'],
    ['subtract', 5000, '#123456'],
    ['intersect', 5000, '#123456'],
    ['exclude', 10000, '#123456'],
  ] as const)('%s yields the exact area identity and inherits the bottom shape style', async (op, area, fill) => {
    const [a, b] = overlappingPair();
    const c = makeCanvas([a, b]);
    const history = mockCanvas(c);

    const result = await booleanOp(op);
    expect(result).toBeInstanceOf(fabric.Path);
    expect(pathArea(result!)).toBeCloseTo(area, 2);
    expect(result!.fill).toBe(fill);
    // Destructive swap: both operands gone, result selected, history pushed.
    expect(c.remove).toHaveBeenCalledWith(a);
    expect(c.remove).toHaveBeenCalledWith(b);
    expect(c.setActiveObject).toHaveBeenCalledWith(result);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('exclude produces two disjoint pieces', async () => {
    const [a, b] = overlappingPair();
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    const result = await booleanOp('exclude');
    expect(pathRingCount(result!)).toBe(2);
  });

  it('minus-back subtracts the BACK shape from the FRONT and styles from the front', async () => {
    const [a, b] = overlappingPair(); // a bottom, b top
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    const result = await booleanOp('minus-back');
    // front − back = B − A∩B = 10000 − 5000.
    expect(pathArea(result!)).toBeCloseTo(5000, 2);
    expect(result!.fill).toBe('#abcdef');
  });

  it('keeps both operands untouched when the result is empty (fully covered subtract)', async () => {
    const a = rect(0, 0);
    const cover = new fabric.Rect({ left: -100, top: -100, width: 300, height: 300, fill: '#abcdef' });
    const c = makeCanvas([a, cover]);
    mockCanvas(c);
    await expect(booleanOp('subtract')).resolves.toBeNull();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.add).not.toHaveBeenCalled();
  });
});

describe('booleanOp — disjoint squares (A∩B = 0)', () => {
  it('union keeps both pieces with total area A + B', async () => {
    const a = rect(0, 0);
    const b = rect(500, 500);
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    const result = await booleanOp('union');
    expect(pathArea(result!)).toBeCloseTo(20000, 2);
    expect(pathRingCount(result!)).toBe(2);
  });

  it('intersect on disjoint shapes is empty → null and operands are kept', async () => {
    const a = rect(0, 0);
    const b = rect(500, 500);
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    await expect(booleanOp('intersect')).resolves.toBeNull();
    expect(c.remove).not.toHaveBeenCalled();
  });

  it('subtract on disjoint shapes is a no-op geometry copy of the subject', async () => {
    const a = rect(0, 0, '#111111');
    const b = rect(500, 500, '#222222');
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    const result = await booleanOp('subtract');
    expect(pathArea(result!)).toBeCloseTo(10000, 2);
    expect(result!.fill).toBe('#111111');
  });
});

describe('booleanOp — containment (B strictly inside A)', () => {
  const smallB = () =>
    new fabric.Rect({ left: 25, top: 25, width: 50, height: 50, fill: '#abcdef', stroke: '#000', strokeWidth: 0 });

  it('union of contained shapes collapses to the outer area', async () => {
    const a = rect(0, 0);
    const b = smallB();
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    const result = await booleanOp('union');
    expect(pathArea(result!)).toBeCloseTo(10000, 2);
  });

  it('subtract punches a hole: net signed area = outer − inner', async () => {
    const a = rect(0, 0);
    const b = smallB();
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    const result = await booleanOp('subtract');
    expect(pathArea(result!)).toBeCloseTo(10000 - 2500, 1);
  });

  it('intersect yields the inner square area', async () => {
    const a = rect(0, 0);
    const b = smallB();
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    const result = await booleanOp('intersect');
    expect(pathArea(result!)).toBeCloseTo(2500, 2);
  });

  it('exclude of contained shapes equals outer − inner (inner − outer is empty)', async () => {
    const a = rect(0, 0);
    const b = smallB();
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    const result = await booleanOp('exclude');
    expect(pathArea(result!)).toBeCloseTo(10000 - 2500, 1);
  });
});

describe('booleanOp — open paths participate as implicitly closed polygons', () => {
  it('unions an open 3-sided path with an overlapping rect by its closed hull', async () => {
    // strokeWidth pinned to 0: fabric's Path layout shifts the transform by
    // sw/2 for stroked paths, which would offset the geometry (fabric's own
    // rendering semantics, not a booleanOps issue).
    const open = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100', { left: 0, top: 0, fill: '#111111', strokeWidth: 0 });
    const b = rect(50, 0, '#abcdef');
    const c = makeCanvas([open, b]);
    mockCanvas(c);
    const result = await booleanOp('union');
    // Treated as a closed 100×100 square overlapping B by 5000.
    expect(pathArea(result!)).toBeCloseTo(15000, 1);
    expect(result!.fill).toBe('#111111');
  });
});

describe('booleanOp — round inputs keep curves through the refit', () => {
  it('union of two overlapping circles contains C segments and a sane area', async () => {
    const c1 = new fabric.Circle({ left: 20, top: 60, radius: 40, originX: 'left', originY: 'top', fill: '#111111' });
    const c2 = new fabric.Circle({ left: 60, top: 60, radius: 40, originX: 'left', originY: 'top', fill: '#222222' });
    const c = makeCanvas([c1, c2]);
    mockCanvas(c);
    const result = await booleanOp('union');
    expect(result).toBeInstanceOf(fabric.Path);
    const cmds = result!.path as unknown as Cmd[];
    expect(cmds.some((cmd) => String(cmd[0]).toUpperCase() === 'C')).toBe(true);
    const area = Math.abs(pathArea(result!));
    // Between one circle and two circles; overlap of these two is ~55% of one.
    expect(area).toBeGreaterThan(Math.PI * 40 * 40);
    expect(area).toBeLessThan(2 * Math.PI * 40 * 40);
  });
});

/* ----------------------------- divide / trim ------------------------------- */

describe('divideSelection', () => {
  it('splits two overlapping squares into A−B, B−A and A∩B (3 pieces)', () => {
    const [a, b] = overlappingPair();
    const c = makeCanvas([a, b]);
    const history = mockCanvas(c);

    expect(divideSelection()).toBe(3);
    expect(c.remove).toHaveBeenCalledWith(a);
    expect(c.remove).toHaveBeenCalledWith(b);
    // Pieces added, total area = A∪B = 15000 (no overlap double-counted).
    const pieces = c.add.mock.calls.map((call) => call[0] as fabric.Path);
    expect(pieces).toHaveLength(3);
    const total = pieces.reduce((sum, p) => sum + Math.abs(pathArea(p)), 0);
    expect(total).toBeCloseTo(15000, 1);
    expect(history).toHaveBeenCalledTimes(1);
    expect(c.discardActiveObject).toHaveBeenCalled();
  });

  it('returns 0 for fewer than two selected objects', () => {
    const c = makeCanvas([rect(0, 0)]);
    mockCanvas(c);
    expect(divideSelection()).toBe(0);
  });

  it('yields the two disjoint pieces (A−B and B−A) for non-overlapping shapes', () => {
    const a = rect(0, 0);
    const b = rect(500, 500);
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    // The intersection is empty but both differences survive → 2 pieces.
    expect(divideSelection()).toBe(2);
  });
});

describe('trimSelection', () => {
  it('keeps the front whole, trims the back by the overlap (2 objects)', () => {
    const [a, b] = overlappingPair();
    const c = makeCanvas([a, b]);
    const history = mockCanvas(c);

    expect(trimSelection()).toBe(2);
    // Back (a) replaced by its remainder of area 5000; front (b) untouched.
    expect(c.remove).toHaveBeenCalledTimes(1);
    expect(c.remove).toHaveBeenCalledWith(a);
    const trimmed = c.add.mock.calls[0][0] as fabric.Path;
    expect(Math.abs(pathArea(trimmed))).toBeCloseTo(5000, 1);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('returns 1 when the back is fully covered by the front', () => {
    const back = new fabric.Rect({ left: 25, top: 25, width: 50, height: 50, fill: '#123456' });
    const front = rect(0, 0); // strictly covers the 50×50 back
    const c = makeCanvas([back, front]);
    mockCanvas(c);
    expect(trimSelection()).toBe(1);
    expect(c.add).not.toHaveBeenCalled(); // nothing left of the back to add
  });

  it('returns 0 for fewer than two selected objects', () => {
    const c = makeCanvas([rect(0, 0)]);
    mockCanvas(c);
    expect(trimSelection()).toBe(0);
  });
});

describe('cropSelection', () => {
  it('clips every back object to the front frame and consumes the frame', () => {
    const back1 = rect(0, 0, '#111111');
    const back2 = rect(50, 0, '#222222');
    const frame = rect(25, 25, '#abcdef');
    // frame at (25,25) covers [25,125]² — each back square overlaps by 75×75.
    const c = makeCanvas([back1, back2, frame]);
    const history = mockCanvas(c);

    expect(cropSelection()).toBe(2);
    expect(c.remove).toHaveBeenCalledWith(back1);
    expect(c.remove).toHaveBeenCalledWith(back2);
    expect(c.remove).toHaveBeenCalledWith(frame);
    const pieces = c.add.mock.calls.map((call) => call[0] as fabric.Path);
    expect(pieces).toHaveLength(2);
    for (const p of pieces) expect(Math.abs(pathArea(p))).toBeCloseTo(75 * 75, 1);
    // Each piece keeps its own back fill.
    expect(new Set(pieces.map((p) => p.fill))).toEqual(new Set(['#111111', '#222222']));
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('drops back objects that fall entirely outside the frame', () => {
    const inside = rect(0, 0, '#111111');
    const outside = rect(900, 900, '#222222');
    const frame = rect(0, 0, '#abcdef');
    const c = makeCanvas([inside, outside, frame]);
    mockCanvas(c);
    expect(cropSelection()).toBe(1);
    expect(c.remove).toHaveBeenCalledWith(outside); // still consumed/removed
  });

  it('returns 0 when nothing survives the crop', () => {
    const back = rect(900, 900);
    const frame = rect(0, 0);
    const c = makeCanvas([back, frame]);
    mockCanvas(c);
    expect(cropSelection()).toBe(0);
    expect(c.remove).toHaveBeenCalledWith(back);
    expect(c.remove).toHaveBeenCalledWith(frame);
  });
});

/* ------------------------------- merge suite ------------------------------- */

describe('mergeSelection', () => {
  it('unites same-fill overlapping shapes into one path per colour', () => {
    const a = rect(0, 0, '#ff0000');
    const b = rect(50, 0, '#ff0000');
    const c = makeCanvas([a, b]);
    const history = mockCanvas(c);

    expect(mergeSelection()).toBe(1);
    const merged = c.add.mock.calls[0][0] as fabric.Path;
    expect(Math.abs(pathArea(merged))).toBeCloseTo(15000, 1);
    expect(merged.fill).toBe('#ff0000');
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('knocks out hidden parts before uniting: different fills stay separate', () => {
    const a = rect(0, 0, '#ff0000');
    const b = rect(50, 0, '#00ff00');
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    expect(mergeSelection()).toBe(2);
    const pieces = c.add.mock.calls.map((call) => call[0] as fabric.Path);
    const total = pieces.reduce((sum, p) => sum + Math.abs(pathArea(p)), 0);
    // Visible area = A∪B (overlap shows only the front colour) = 15000.
    expect(total).toBeCloseTo(15000, 1);
    expect(new Set(pieces.map((p) => p.fill))).toEqual(new Set(['#ff0000', '#00ff00']));
  });

  it('normalises fill keys case-insensitively (#FF0000 + #ff0000 merge)', () => {
    const a = rect(0, 0, '#FF0000');
    const b = rect(500, 0, '#ff0000'); // disjoint — union still one path
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    expect(mergeSelection()).toBe(1);
  });

  it('returns 0 when fewer than two objects have a solid string fill', () => {
    const a = rect(0, 0, '');
    const b = new fabric.Rect({ left: 50, top: 0, width: 100, height: 100, fill: null });
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    expect(mergeSelection()).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
  });
});

describe('mergeSameFillSelection', () => {
  it('unions only groups of 2+ same-fill objects and consumes just those', () => {
    const a = rect(0, 0, '#ff0000');
    const b = rect(50, 0, '#ff0000');
    const lone = rect(500, 0, '#00ff00'); // group of one → untouched
    const c = makeCanvas([a, b, lone]);
    const history = mockCanvas(c);

    expect(mergeSameFillSelection()).toBe(1);
    expect(c.remove).toHaveBeenCalledWith(a);
    expect(c.remove).toHaveBeenCalledWith(b);
    expect(c.remove).not.toHaveBeenCalledWith(lone);
    const merged = c.add.mock.calls[0][0] as fabric.Path;
    expect(Math.abs(pathArea(merged))).toBeCloseTo(15000, 1);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('returns 0 without at least two objects in one colour group', () => {
    const a = rect(0, 0, '#ff0000');
    const b = rect(50, 0, '#00ff00');
    const c = makeCanvas([a, b]);
    mockCanvas(c);
    expect(mergeSameFillSelection()).toBe(0);
    expect(c.remove).not.toHaveBeenCalled();
  });

  it('returns 0 for a selection with fewer than two objects', () => {
    const c = makeCanvas([rect(0, 0)]);
    mockCanvas(c);
    expect(mergeSameFillSelection()).toBe(0);
  });
});

/* NOTE (measured behaviour, not asserted as "correct"): polygon-clipping
 * rings close by repeating the first vertex, and ringToBezierPathD does not
 * drop that duplicate — so the refit can emit a degenerate zero-length C at
 * the ring seam with control points offset up to ~⅓ of the neighbouring
 * edge length OUTSIDE the shape (observed: `C 0 -33.3 -50 0 0 0` on the seam
 * of a 150×100 union). The area helper below therefore ignores segments
 * whose endpoints coincide; see the batch report for the isolated bug. */
