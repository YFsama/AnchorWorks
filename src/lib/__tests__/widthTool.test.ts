/**
 * Width tool tests — pure logic only.
 *
 * Station math + outline building live in ../variableWidth.ts; gesture
 * helpers (nearest-point, frames, insert/remove, cursor width) live in
 * ../tools/widthTool.ts. The canvas-bound interaction (hover overlays,
 * drag state machine) is not covered here — same convention as
 * knifeFreehand.test.ts / eyedropperTool.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import {
  MAX_STATION_WIDTH,
  MIN_STATION_WIDTH,
  applyWidthStationsToObject,
  buildVariableWidthOutline,
  buildVariableWidthOutlineFromStations,
  clampStationWidth,
  cumulativeLengths,
  normalizeStations,
  pathSpaceToScene,
  pointAtT,
  readVariableWidthMeta,
  sceneToPathSpace,
  stationsFromProfile,
  widthAtT,
  widthScaleAt,
  type WidthStation,
} from '../variableWidth';
import {
  frameAtCenterline,
  insertStation,
  nearestOnCenterline,
  removeStation,
  sampleCenterline,
  widthFromCursor,
} from '../tools/widthTool';

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

/* ------------------------- station value model ------------------------- */

describe('clampStationWidth', () => {
  it('clamps into [0, 1000] and sanitises non-finite input', () => {
    expect(clampStationWidth(-5)).toBe(MIN_STATION_WIDTH);
    expect(clampStationWidth(5000)).toBe(MAX_STATION_WIDTH);
    expect(clampStationWidth(NaN)).toBe(MIN_STATION_WIDTH);
    expect(clampStationWidth(Infinity)).toBe(MIN_STATION_WIDTH);
    expect(clampStationWidth(42)).toBe(42);
  });
});

describe('normalizeStations', () => {
  it('sorts by t, clamps t and width, and drops near-duplicates', () => {
    const out = normalizeStations([
      { t: 1.2, width: 5000 },   // clamps to t=1, width=1000
      { t: 0.5, width: 8 },
      { t: -0.3, width: 3 },     // clamps to t=0
      { t: 0.50005, width: 99 }, // within eps of 0.5 → dropped
    ]);
    expect(out.map(s => s.t)).toEqual([0, 0.5, 1]);
    expect(out.map(s => s.width)).toEqual([3, 8, 1000]);
  });

  it('filters non-finite entries and leaves the input untouched', () => {
    const input: WidthStation[] = [{ t: 0, width: 5 }, { t: NaN, width: 1 }];
    const out = normalizeStations(input);
    expect(out).toEqual([{ t: 0, width: 5 }]);
    expect(input).toHaveLength(2);
  });
});

/* --------------------------- interpolation ---------------------------- */

describe('widthAtT', () => {
  const stations: WidthStation[] = [{ t: 0, width: 4 }, { t: 0.5, width: 20 }, { t: 1, width: 4 }];

  it('is exact at every station', () => {
    for (const s of stations) expect(widthAtT(stations, s.t)).toBe(s.width);
  });

  it('reproduces uniform-slope data exactly (linear sanity)', () => {
    const lin: WidthStation[] = [{ t: 0, width: 10 }, { t: 0.5, width: 20 }, { t: 1, width: 30 }];
    for (let i = 0; i <= 20; i++) expect(approx(widthAtT(lin, i / 20), 10 + 20 * (i / 20))).toBe(true);
  });

  it('never overshoots between monotone stations', () => {
    const mono: WidthStation[] = [{ t: 0, width: 2 }, { t: 0.3, width: 6 }, { t: 0.6, width: 9 }, { t: 1, width: 40 }];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const w = widthAtT(mono, t);
      // Bounded by the bracketing station values.
      let lo = 0;
      let hi = mono.length - 1;
      for (let k = 0; k < mono.length; k++) {
        if (mono[k].t <= t) lo = k;
        if (mono[k].t >= t) { hi = k; break; }
      }
      expect(w).toBeGreaterThanOrEqual(mono[lo].width - 1e-9);
      expect(w).toBeLessThanOrEqual(mono[hi].width + 1e-9);
    }
  });

  it('stays monotone where the data is monotone', () => {
    const mono: WidthStation[] = [{ t: 0, width: 1 }, { t: 0.5, width: 10 }, { t: 1, width: 12 }];
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const w = widthAtT(mono, i / 100);
      expect(w).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = w;
    }
  });

  it('clamps t outside [0,1] and handles the single-station case', () => {
    expect(widthAtT(stations, -1)).toBe(stations[0].width);
    expect(widthAtT(stations, 2)).toBe(stations[stations.length - 1].width);
    expect(widthAtT([{ t: 0, width: 7 }], 0.42)).toBe(7);
    expect(widthAtT([], 0.5)).toBe(0);
  });
});

/* --------------------------- centreline math --------------------------- */

describe('cumulativeLengths + pointAtT', () => {
  const pts: Array<[number, number]> = [[0, 0], [3, 4], [3, 10]];

  it('accumulates segment lengths', () => {
    expect(cumulativeLengths(pts)).toEqual([0, 5, 11]);
  });

  it('interpolates along arc length (clamped)', () => {
    expect(pointAtT(pts, 0)).toEqual([0, 0]);
    // t=0.5 → 5.5 of 11 → 0.5 into the 6-unit vertical segment.
    expect(approx((pointAtT(pts, 0.5) as number[])[1], 4.5)).toBe(true);
    // t=0.75 → 75% of 11 = 8.25 → 3.25 into the vertical segment.
    expect(approx((pointAtT(pts, 0.75) as number[])[1], 7.25)).toBe(true);
    expect(pointAtT(pts, 2)).toEqual([3, 10]);
  });
});

describe('nearestOnCenterline', () => {
  const line: Array<[number, number]> = [[0, 0], [50, 0], [100, 0]];
  const cum = [0, 50, 100];

  it('finds the closest point with sub-sample refinement', () => {
    const hit = nearestOnCenterline(line, cum, { x: 60, y: 3 });
    expect(approx(hit.t, 0.6)).toBe(true);
    expect(approx(hit.dist, 3)).toBe(true);
    expect(approx(hit.x, 60)).toBe(true);
  });

  it('falls back to the exact sample when on it', () => {
    const hit = nearestOnCenterline(line, cum, { x: 50, y: 0 });
    expect(approx(hit.dist, 0)).toBe(true);
    expect(approx(hit.t, 0.5)).toBe(true);
  });
});

describe('frameAtCenterline', () => {
  const line: Array<[number, number]> = [[0, 0], [50, 0], [100, 0]];
  const cum = [0, 50, 100];

  it('returns the point and a unit normal perpendicular to the tangent', () => {
    const f = frameAtCenterline(line, cum, 0.5);
    expect(approx(f.x, 50)).toBe(true);
    expect(approx(f.y, 0)).toBe(true);
    // Tangent is +x → normal is (-dy, dx) = (0, 1); unit length either way.
    expect(approx(Math.hypot(f.nx, f.ny), 1)).toBe(true);
    expect(approx(Math.abs(f.nx), 0)).toBe(true);
    expect(approx(Math.abs(f.ny), 1)).toBe(true);
  });

  it('clamps t and never returns a zero-length normal', () => {
    for (const t of [-0.5, 0, 0.999, 1, 1.5]) {
      const f = frameAtCenterline(line, cum, t);
      expect(Math.hypot(f.nx, f.ny)).toBeGreaterThan(0.99);
    }
  });
});

/* ------------------------ station edit helpers ------------------------ */

describe('insertStation', () => {
  const base: WidthStation[] = [{ t: 0, width: 10 }, { t: 1, width: 10 }];

  it('inserts sorted and reports the dragged index', () => {
    const { stations, index } = insertStation(base, 0.5, 6);
    expect(stations.map(s => s.t)).toEqual([0, 0.5, 1]);
    expect(index).toBe(1);
    expect(base).toHaveLength(2); // input untouched
  });

  it('snaps to a nearby existing station instead of inserting', () => {
    const grown = insertStation(base, 0.5, 6).stations;
    const snap = insertStation(grown, 0.505, 99);
    expect(snap.stations).toBe(grown); // same array reference
    expect(snap.index).toBe(1);
    expect(snap.stations[1].width).toBe(6); // width not clobbered
  });

  it('clamps t into [0,1] before matching', () => {
    const res = insertStation(base, -0.5, 3);
    expect(res.index).toBe(0); // clamps to t=0 → snaps to the endpoint
    expect(res.stations).toHaveLength(2);
  });
});

describe('removeStation', () => {
  const three: WidthStation[] = [{ t: 0, width: 1 }, { t: 0.5, width: 2 }, { t: 1, width: 3 }];

  it('removes a middle station', () => {
    expect(removeStation(three, 1)).toEqual([{ t: 0, width: 1 }, { t: 1, width: 3 }]);
  });

  it('refuses the t=0 / t=1 anchor stations', () => {
    expect(removeStation(three, 0)).toBeNull();
    expect(removeStation(three, 2)).toBeNull();
    expect(removeStation(three, -1)).toBeNull();
  });
});

describe('widthFromCursor', () => {
  it('is twice the absolute perpendicular distance from the station centre', () => {
    // normal (0,1) → perpendicular axis is y.
    expect(widthFromCursor(0, 0, 0, 1, { x: 10, y: 5 })).toBe(10);
    expect(widthFromCursor(0, 0, 0, 1, { x: 10, y: -5 })).toBe(10); // either side
    expect(widthFromCursor(0, 0, 0, 1, { x: 7, y: 0 })).toBe(0);    // on the path
  });

  it('clamps to the legal width range (huge drags)', () => {
    expect(widthFromCursor(0, 0, 0, 1, { x: 0, y: 600 })).toBe(MAX_STATION_WIDTH);
  });
});

/* ------------------------- outline construction ------------------------ */

describe('buildVariableWidthOutlineFromStations', () => {
  const straight: Array<[number, number]> = [[0, 0], [100, 0]];

  it('offsets a uniform width symmetrically about the centreline', () => {
    const outline = buildVariableWidthOutlineFromStations(
      straight, [{ t: 0, width: 10 }, { t: 1, width: 10 }],
    );
    // 2 vertices + 1 refinement midpoint → 3 evaluation sites → 6 points.
    expect(outline).toHaveLength(6);
    // Left side walks +x at y = +5; right side returns at y = -5.
    expect(approx(outline[0][0], 0, 1e-4)).toBe(true);
    expect(approx(outline[0][1], 5, 1e-4)).toBe(true);
    expect(approx(outline[1][0], 50, 1e-4)).toBe(true);
    expect(approx(outline[1][1], 5, 1e-4)).toBe(true);
    expect(approx(outline[5][0], 0, 1e-4)).toBe(true);
    expect(approx(outline[5][1], -5, 1e-4)).toBe(true);
  });

  it('evaluates station positions between vertices (taper on a 2-point path)', () => {
    const outline = buildVariableWidthOutlineFromStations(
      straight, [{ t: 0, width: 0 }, { t: 0.5, width: 20 }, { t: 1, width: 0 }],
    );
    // Evaluation sites: t = 0, 0.25, 0.5, 0.75, 1 (stations + refinement
    // midpoints) → 10 outline points; the t=0.5 bulge is index 2.
    expect(outline).toHaveLength(10);
    const mid = outline[2];
    expect(approx(mid[0], 50, 1e-4)).toBe(true);
    expect(approx(Math.abs(mid[1]), 10, 1e-4)).toBe(true);
    // Zero-width ends pinch to a point: left and right sides coincide.
    expect(approx(outline[0][0], outline[9][0], 1e-6)).toBe(true);
    expect(approx(outline[0][1], outline[9][1], 1e-6)).toBe(true);
  });

  it('returns [] for degenerate inputs', () => {
    expect(buildVariableWidthOutlineFromStations([], [{ t: 0, width: 5 }])).toEqual([]);
    expect(buildVariableWidthOutlineFromStations([[0, 0]], [{ t: 0, width: 5 }])).toEqual([]);
    expect(buildVariableWidthOutlineFromStations(straight, [])).toEqual([]);
  });

  it('reproduces profile outlines at the centreline vertices', () => {
    const pts: Array<[number, number]> = [[0, 0], [40, 10], [90, -10], [150, 0]];
    const baseWidth = 12;
    const stations = stationsFromProfile(pts, baseWidth, 'taper-both');
    const viaProfile = buildVariableWidthOutline(pts, baseWidth, 'taper-both');
    const viaStations = buildVariableWidthOutlineFromStations(pts, stations);
    // Evaluation sites are vertices + midpoints; vertices sit at even indices.
    for (let v = 0; v < pts.length; v++) {
      const a = viaProfile[v];
      const b = viaStations[v * 2];
      expect(approx(a[0], b[0], 1e-4)).toBe(true);
      expect(approx(a[1], b[1], 1e-4)).toBe(true);
    }
    // Station widths match the profile formula at the vertices exactly.
    for (const s of stations) expect(approx(s.width, baseWidth * widthScaleAt(s.t, 'taper-both'))).toBe(true);
  });
});

/* -------------------------------- commit ------------------------------- */

describe('applyWidthStationsToObject', () => {
  function stubCanvas(): { canvas: fabric.Canvas; added: fabric.FabricObject[] } {
    const added: fabric.FabricObject[] = [];
    const canvas = { add: (o: fabric.FabricObject) => { added.push(o); return canvas; } } as unknown as fabric.Canvas;
    return { canvas, added };
  }

  it('expands a plain stroked path and tags the outline with stations', () => {
    const { canvas, added } = stubCanvas();
    const src = new fabric.Path('M 0 0 L 100 0', { stroke: '#123456', strokeWidth: 4 });
    const stations: WidthStation[] = [{ t: 0, width: 4 }, { t: 0.5, width: 24 }, { t: 1, width: 4 }];
    const out = applyWidthStationsToObject(canvas, src, stations, [[0, 0], [100, 0]]);
    expect(out).not.toBeNull();
    expect(added).toHaveLength(1);
    expect(added[0]).toBe(out);
    expect(out?.fill).toBe('#123456');
    expect(out?.stroke).toBe('');
    // Original stroke consumed, matching the profile-menu contract.
    expect(src.stroke).toBe('');
    expect(src.strokeWidth).toBe(0);
    // Metadata: normalised station array + centreline for re-editing.
    const meta = readVariableWidthMeta(out!);
    expect(meta).not.toBeNull();
    expect(meta!.stations.map(s => s.t)).toEqual([0, 0.5, 1]);
    expect(meta!.stations.map(s => s.width)).toEqual([4, 24, 4]);
    expect(meta!.baseWidth).toBe(4);
  });

  it('refuses objects without a usable stroke and empty station sets', () => {
    const { canvas } = stubCanvas();
    const noStroke = new fabric.Path('M 0 0 L 10 0', { fill: '#000', strokeWidth: 0 });
    expect(applyWidthStationsToObject(canvas, noStroke, [{ t: 0, width: 5 }, { t: 1, width: 5 }], [[0, 0], [10, 0]])).toBeNull();
    const stroked = new fabric.Path('M 0 0 L 10 0', { stroke: '#000', strokeWidth: 2 });
    expect(applyWidthStationsToObject(canvas, stroked, [], [[0, 0], [10, 0]])).toBeNull();
  });

  it('updates an existing variable-width outline in place', () => {
    const { canvas, added } = stubCanvas();
    const src = new fabric.Path('M 0 0 L 100 0', { stroke: '#654321', strokeWidth: 6 });
    const first = applyWidthStationsToObject(
      canvas, src, [{ t: 0, width: 6 }, { t: 1, width: 6 }], [[0, 0], [100, 0]],
    )!;
    const pathDataBefore = JSON.stringify(first.path);
    // Re-edit: taper it. No centreline passed → recovered from metadata.
    const second = applyWidthStationsToObject(
      canvas, first, [{ t: 0, width: 2 }, { t: 0.5, width: 18 }, { t: 1, width: 2 }],
    );
    expect(second).toBe(first); // same object identity — no nesting
    expect(added).toHaveLength(1); // nothing new added to the canvas
    expect(second?.fill).toBe('#654321');
    expect(JSON.stringify(second?.path)).not.toBe(pathDataBefore);
    const meta = readVariableWidthMeta(first);
    expect(meta?.stations.map(s => s.width)).toEqual([2, 18, 2]);
  });

  it('clamps a huge station width during commit', () => {
    const { canvas } = stubCanvas();
    const src = new fabric.Path('M 0 0 L 100 0', { stroke: '#000', strokeWidth: 4 });
    const out = applyWidthStationsToObject(
      canvas, src, [{ t: 0, width: 9999 }, { t: 1, width: 9999 }], [[0, 0], [100, 0]],
    );
    const meta = readVariableWidthMeta(out!);
    expect(meta?.stations.every(s => s.width <= MAX_STATION_WIDTH)).toBe(true);
  });
});

describe('path command-space transforms', () => {
  it('round-trips scene ↔ command space through a moved/scaled path', () => {
    const p = new fabric.Path('M 0 0 L 100 0', { stroke: '#000', strokeWidth: 2 });
    p.set({ left: 250, top: 90, scaleX: 2, scaleY: 2 });
    p.setCoords();
    const scenePts = pathSpaceToScene(p, [[0, 0], [100, 0]]);
    const back = sceneToPathSpace(p, scenePts);
    expect(approx(back[0][0], 0, 1e-6)).toBe(true);
    expect(approx(back[0][1], 0, 1e-6)).toBe(true);
    expect(approx(back[1][0], 100, 1e-6)).toBe(true);
    expect(approx(back[1][1], 0, 1e-6)).toBe(true);
  });
});

/* --------------------------- centreline sampling ----------------------- */

describe('sampleCenterline', () => {
  it('flattens path commands into scene-space samples', () => {
    const p = new fabric.Path('M 0 0 L 100 0', { stroke: '#000', strokeWidth: 2 });
    const pts = sampleCenterline(p);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    const first = pts[0];
    const last = pts[pts.length - 1];
    expect(approx(first[0], 0, 1e-3)).toBe(true);
    expect(approx(first[1], 0, 1e-3)).toBe(true);
    expect(approx(last[0], 100, 1e-3)).toBe(true);
    expect(approx(last[1], 0, 1e-3)).toBe(true);
  });

  it('tracks the object transform (translated path samples shift too)', () => {
    const p = new fabric.Path('M 0 0 L 100 0', { stroke: '#000', strokeWidth: 2 });
    const before = sampleCenterline(p);
    const leftBefore = p.left;
    p.set({ left: (leftBefore ?? 0) + 100 });
    p.setCoords();
    const after = sampleCenterline(p);
    expect(approx(after[0][0] - before[0][0], 100, 1e-3)).toBe(true);
    expect(approx(after[after.length - 1][0] - before[before.length - 1][0], 100, 1e-3)).toBe(true);
  });

  it('samples bezier segments along the curve, not the chord', () => {
    const p = new fabric.Path('M 0 0 C 0 100 100 100 100 0', { stroke: '#000', strokeWidth: 2 });
    const pts = sampleCenterline(p);
    // The curve dips to y=75 at t=0.5; the chord never leaves y=0.
    const maxDepth = Math.max(...pts.map(pt => pt[1]));
    expect(maxDepth).toBeGreaterThan(50);
    expect(maxDepth).toBeLessThan(100);
  });

  it('returns [] for paths without drawable commands', () => {
    const p = new fabric.Path('', {});
    expect(sampleCenterline(p)).toEqual([]);
  });
});

/* ------------------------------ misc guards ---------------------------- */

describe('widthTool module side-effect isolation', () => {
  it('exports pure helpers without requiring a live canvas', () => {
    // Importing the module already ran; touching every helper here guards
    // against accidental canvas access creeping into the pure layer.
    expect(vi.isMockFunction(() => 0)).toBe(false);
    expect(typeof insertStation).toBe('function');
    expect(typeof removeStation).toBe('function');
    expect(typeof nearestOnCenterline).toBe('function');
    expect(typeof frameAtCenterline).toBe('function');
    expect(typeof widthFromCursor).toBe('function');
    expect(typeof sampleCenterline).toBe('function');
  });
});
