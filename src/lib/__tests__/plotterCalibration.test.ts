import { describe, it, expect } from 'vitest';
import {
  BLADE_OFFSET_STEPS_MM,
  OVERCUT_STEPS_MM,
  buildBladeOffsetTest,
  buildCalibrationBox,
  buildCornerMarks,
  buildDriftTest,
  buildDryRun,
  buildOriginMark,
  buildOvercutTest,
  buildRuler,
  calBounds,
  calBoxNeedsMm,
  cellCenter,
  cornerRectFromBbox,
  parseSteps,
  payloadMarks,
  scaleErrorPercent,
  skewFromDiagonals,
  suggestBladeOffset,
  suggestDrift,
  suggestGrblSteps,
  type CalPoly,
} from '../plotterCalibration';
import { defaultPlotterOptions, buildPlotterOutput, type PlotterOptions } from '../plotter';
import { lintJob, simulateMachineCode } from '../hpglDebug';
import { PlotterSimulator } from '../plotterSimulator';

/* ---- fixtures: top-left origin / bottom-left origin on a 210 mm page ---- */
const TL: PlotterOptions = { ...defaultPlotterOptions, originBottomLeft: false };
const BL: PlotterOptions = { ...defaultPlotterOptions, originBottomLeft: true, paperHeightUnits: 210 };
const INCH: PlotterOptions = { ...TL, unit: 'in', paperHeightUnits: 8.5 };
const BOTH: Array<[string, PlotterOptions]> = [['top-left origin', TL], ['bottom-left origin', BL]];

const lintCtx = (o: PlotterOptions) => ({
  unit: o.unit, originBottomLeft: o.originBottomLeft, paperHeightUnits: o.paperHeightUnits, penDownZ: o.penDownZ, penUpZ: o.penUpZ,
});
const errors = (format: 'hpgl' | 'gcode', code: string, o: PlotterOptions) =>
  lintJob(format, code, lintCtx(o)).issues.filter(i => i.severity === 'error').map(i => i.message);
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pathLength = (p: CalPoly) => {
  let s = 0;
  for (let i = 1; i < p.points.length; i++) s += dist(p.points[i - 1], p.points[i]);
  return s;
};

/** HP-GL → pen-down polylines in MACHINE mm (plotter units ÷ 40), in cut order. */
function parseHpgl(code: string): CalPoly[] {
  const out: CalPoly[] = [];
  let pos: [number, number] = [0, 0];
  let cur: CalPoly | null = null;
  for (const raw of code.split(';')) {
    const m = /^([A-Za-z]{2})([-\d.,]*)$/.exec(raw.trim());
    if (!m) continue;
    const mn = m[1].toUpperCase();
    if (mn !== 'PU' && mn !== 'PD') continue;
    const nums = m[2] ? m[2].split(',').map(Number) : [];
    if (mn === 'PU' && cur) { out.push(cur); cur = null; } // the pen lifts where it is
    for (let k = 0; k + 1 < nums.length; k += 2) {
      const pt: [number, number] = [nums[k] / 40, nums[k + 1] / 40];
      if (mn === 'PD') {
        // The pen drops at the current position, then travels to the listed points.
        if (!cur) cur = { closed: true, points: [[...pos], pt] };
        else cur.points.push(pt);
      }
      pos = pt;
    }
  }
  if (cur) out.push(cur);
  for (const q of out) q.closed = dist(q.points[0], q.points[q.points.length - 1]) < 1e-9;
  return out;
}

/** G-code → pen-down polylines in MACHINE user units. */
function parseGcode(code: string): CalPoly[] {
  const out: CalPoly[] = [];
  let pos: [number, number] = [0, 0];
  let cur: CalPoly | null = null;
  for (const line of code.split('\n')) {
    const m = /^G([01])\s+X([-+\d.]+)\s+Y([-+\d.]+)/.exec(line);
    if (!m) continue;
    const pt: [number, number] = [Number(m[2]), Number(m[3])];
    if (m[1] === '1') {
      if (!cur) cur = { closed: true, points: [[...pos]] };
      cur.points.push(pt);
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
    pos = pt;
  }
  if (cur) out.push(cur);
  return out;
}

const centroid = (p: CalPoly): [number, number] => {
  const n = p.points.length;
  return [p.points.reduce((s, q) => s + q[0], 0) / n, p.points.reduce((s, q) => s + q[1], 0) / n];
};
/** Centre of a ring's bounding box — the two seam vertices would bias a plain mean. */
const centre = (p: CalPoly): [number, number] => {
  const xs = p.points.map(q => q[0]);
  const ys = p.points.map(q => q[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};

describe('parseSteps', () => {
  it('returns the typed values in order', () => {
    expect(parseSteps('0, 0.15,0.25 ', BLADE_OFFSET_STEPS_MM)).toEqual([0, 0.15, 0.25]);
  });
  it('drops junk, negatives, absurd and duplicate values and falls back when nothing is left', () => {
    expect(parseSteps('abc, -1, 9, 0.2, 0.20, 0.3', [1])).toEqual([0.2, 0.3]);
    expect(parseSteps('   ', [0, 0.5])).toEqual([0, 0.5]);
  });
  it('caps the row at eight cells', () => {
    expect(parseSteps('0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1', [0])).toHaveLength(8);
  });
});

describe('blade offset test — geometry', () => {
  const steps = BLADE_OFFSET_STEPS_MM;

  it(`cuts ${steps.length} closed circles (Ø20, 30 mm pitch) — one per value`, () => {
    const p = buildBladeOffsetTest(steps, TL, 'hpgl');
    const rings = p.doc.filter(q => q.closed && q.points.length > 60);
    expect(rings).toHaveLength(steps.length);
    rings.forEach((ring, i) => {
      expect(dist(ring.points[0], ring.points[ring.points.length - 1])).toBeLessThan(1e-9); // closed
      const [cx, cy] = cellCenter(i);
      for (const q of ring.points) close(dist(q, [cx, cy]), 10, 0.05); // every vertex on the Ø20 circle (0.05 = seam-chord sagitta)
      // Seam on top of the circle (12 o'clock), so the extension never collides with the ticks below.
      close(ring.points[0][0], cx, 1e-6);
      close(ring.points[0][1], cy - 10, 0.05);
    });
  });

  it('gives every ring a tangential extension of exactly its own blade-offset value', () => {
    const p = buildBladeOffsetTest(steps, TL, 'gcode');
    const rings = p.doc.filter(q => q.closed && q.points.length > 60);
    steps.forEach((v, i) => {
      const seam = rings[i].points[0];
      const lines = p.doc.filter(q => !q.closed && q.points.length === 2 && dist(q.points[0], seam) < 1e-9);
      if (v === 0) {
        expect(lines).toHaveLength(0); // nothing to compensate
        return;
      }
      expect(lines).toHaveLength(1);
      close(pathLength(lines[0]), v); // the extension IS the offset
      // Tangent = the seam's own cut direction: perpendicular to the radius at 12 o'clock.
      close(lines[0].points[1][1], seam[1], 0.02);
      expect(lines[0].points[1][0]).toBeGreaterThan(seam[0]);
    });
  });

  it('engraves the serial number: cell i carries i + 1 tick marks under the circle', () => {
    const p = buildBladeOffsetTest(steps, TL, 'hpgl');
    const ticks = p.doc.filter(q => !q.closed && q.points.length === 2 && q.points[0][1] > 30 && q.points[0][1] < 36);
    expect(ticks).toHaveLength(steps.length * (steps.length + 1) / 2);
    steps.forEach((_, i) => {
      const [cx] = cellCenter(i);
      const mine = ticks.filter(q => q.points[0][0] > cx - 12 && q.points[0][0] < cx + 12);
      expect(mine).toHaveLength(i + 1);
      for (const t of mine) close(pathLength(t), 3);
    });
  });

  it('runs the corners through the real blade-offset loops: the triangle grows loops only where the value is > 0', () => {
    const p = buildBladeOffsetTest(steps, TL, 'hpgl');
    const triangles = p.doc.filter(q => q.closed && q.points.length < 60);
    expect(triangles).toHaveLength(steps.length);
    steps.forEach((v, i) => {
      const tri = triangles[i];
      const [cx, cy] = cellCenter(i);
      const corners: Array<[number, number]> = [[cx, cy - 8], [cx + 8 * Math.cos(Math.PI / 6), cy + 4], [cx - 8 * Math.cos(Math.PI / 6), cy + 4]];
      if (v === 0) {
        expect(tri.points).toHaveLength(4); // plain triangle, closing vertex included
        return;
      }
      // 3 corners × (overshoot + 5 bow samples + return) = 21, plus the seam vertex the
      // real chain puts on the longest edge, plus its closing vertex.
      expect(tri.points.length).toBe(23);
      for (const c of corners) {
        // The loop overshoots the corner by exactly the offset along the incoming edge.
        expect(tri.points.some(q => Math.abs(dist(q, c) - v) < 1e-6)).toBe(true);
      }
    });
  });

  it('needs a 180 × 26 mm strip for the default row', () => {
    const { extent } = buildBladeOffsetTest(steps, TL, 'hpgl');
    expect(extent.x0).toBeCloseTo(10, 0);
    expect(extent.y0).toBeCloseTo(10, 1);
    expect(extent.x1).toBeCloseTo(180, 0);
    expect(extent.y1).toBeCloseTo(36, 3);
  });

  for (const [name, o] of BOTH) {
    for (const format of ['hpgl', 'gcode'] as const) {
      it(`lints with zero errors — ${format}, ${name}`, () => {
        expect(errors(format, buildBladeOffsetTest(steps, o, format).code, o)).toEqual([]);
      });
    }
  }

  it('HP-GL on the wire: Ø20 circle within 0.05 mm and the extension of each value on the wire', () => {
    const polys = parseHpgl(buildBladeOffsetTest(steps, TL, 'hpgl').code);
    const rings = polys.filter(q => q.points.length > 60);
    steps.forEach((v, i) => {
      const [cx, cy] = cellCenter(i);
      const xs = rings[i].points.map(q => q[0]);
      close(Math.max(...xs) - Math.min(...xs), 20, 0.05);
      close(centre(rings[i])[0], cx, 0.05);
      close(centre(rings[i])[1], cy, 0.05);
      const seam = rings[i].points[0];
      const ext = polys.find(q => q !== rings[i] && q.points.length === 2 && dist(q.points[0], seam) < 0.04 && Math.abs(q.points[0][1] - (cy - 10)) < 0.2);
      if (v === 0) expect(ext).toBeUndefined();
      else close(pathLength(ext!), v, 0.05);
    });
  });

  it('bottom-left origin flips Y like a real job: the row sits paperHeight − y from the machine origin', () => {
    const p = buildBladeOffsetTest(steps, BL, 'hpgl');
    const ring = p.doc.filter(q => q.closed && q.points.length > 60)[0];
    close(centre(ring)[1], 20); // document space is unchanged…
    const wire = parseHpgl(p.code).filter(q => q.points.length > 60)[0];
    close(centre(wire)[1], 210 - 20, 0.05); // …and the machine gets the flip, as cutPathsToPlotterPolylines does
    close(centre(wire)[0], 20, 0.05);
  });

  it('mirror flips the row about its own centre (cells read right → left on the material)', () => {
    const p = buildBladeOffsetTest(steps, { ...TL, mirror: true }, 'hpgl');
    const rings = p.doc.filter(q => q.closed && q.points.length > 60);
    const axis = p.extent.x0 + p.extent.x1; // 190
    steps.forEach((_, i) => close(centre(rings[i])[0], axis - cellCenter(i)[0], 0.05));
    // The extension follows the mirrored cut direction (now leftwards from the seam).
    const seam = rings[1].points[0];
    const ext = p.doc.find(q => !q.closed && q.points.length === 2 && dist(q.points[0], seam) < 1e-9)!;
    expect(ext.points[1][0]).toBeLessThan(seam[0]);
    close(pathLength(ext), steps[1]);
  });

  it('reverse direction keeps the extension on the seam, pointing the other way', () => {
    const p = buildBladeOffsetTest(steps, { ...TL, reverse: true }, 'hpgl');
    const rings = p.doc.filter(q => q.closed && q.points.length > 60);
    const seam = rings[2].points[0];
    const ext = p.doc.find(q => !q.closed && q.points.length === 2 && dist(q.points[0], seam) < 1e-9)!;
    expect(ext.points[1][0]).toBeLessThan(seam[0]);
    close(pathLength(ext), steps[2]);
    expect(rings[2].points[1][0]).toBeLessThan(seam[0]); // the circle is cut the other way round
  });

  it('never compensates twice: overcut stays 0, so the ring carries no retrace beyond the extension', () => {
    const p = buildBladeOffsetTest(steps, { ...TL, overcutMm: 0.5 }, 'hpgl');
    const rings = p.doc.filter(q => q.closed && q.points.length > 60);
    // One bare loop per ring: its length is the circumference, with nothing retraced
    // (0.05 = the chords' shortfall from the arc).
    steps.forEach((_, i) => close(pathLength(rings[i]), 2 * Math.PI * 10, 0.05));
  });

  it('inch mode: values stay millimetres (a Ø20 mm circle is still Ø20 mm)', () => {
    const p = buildBladeOffsetTest(steps, INCH, 'hpgl');
    const ring = p.doc.filter(q => q.closed && q.points.length > 60)[3];
    for (const q of ring.points) close(dist(q, cellCenter(3)), 10, 0.05); // 0.05 = the seam chord's sagitta
    expect(errors('hpgl', p.code, INCH)).toEqual([]);
  });
});

describe('overcut test — geometry', () => {
  const steps = OVERCUT_STEPS_MM;
  const shapes = (o: PlotterOptions) => {
    const p = buildOvercutTest(steps, o, 'hpgl');
    return { p, rings: p.doc.filter(q => q.closed && q.points.length > 60), tris: p.doc.filter(q => q.closed && q.points.length < 60) };
  };

  it('retraces every closed path by its own overcut value (circle and triangle alike)', () => {
    const { rings, tris } = shapes(TL);
    expect(rings).toHaveLength(steps.length);
    const base = pathLength(rings[0]);
    const baseTri = pathLength(tris[0]);
    steps.forEach((o, i) => {
      close(pathLength(rings[i]) - base, o);
      close(pathLength(tris[i]) - baseTri, o);
      expect(rings[i].points.length).toBe(73 + (o > 0 ? 1 : 0)); // one extra vertex lands `o` past the start
    });
  });

  it('leaves the tick marks alone (open paths are never overcut)', () => {
    const { p } = shapes(TL);
    const ticks = p.doc.filter(q => !q.closed);
    expect(ticks).toHaveLength(steps.length * (steps.length + 1) / 2);
    for (const t of ticks) close(pathLength(t), 3);
  });

  it('lints with zero errors in both formats', () => {
    for (const format of ['hpgl', 'gcode'] as const) {
      expect(errors(format, buildOvercutTest(steps, TL, format).code, TL)).toEqual([]);
      expect(errors(format, buildOvercutTest(steps, BL, format).code, BL)).toEqual([]);
    }
  });

  it("with the dialog's blade offset also set, the real chain swallows a retrace shorter than the offset and loops a longer one", () => {
    const short = shapes({ ...TL, bladeOffsetMm: 0.25 });
    close(pathLength(short.rings[1]) - pathLength(short.rings[0]), 0, 0.05); // 0.1 < 0.25 → collapsed
    const long = shapes({ ...TL, bladeOffsetMm: 0.25 });
    expect(pathLength(long.rings[4]) - pathLength(long.rings[0])).toBeGreaterThan(0.5); // 0.5 > 0.25 → kept + loop
  });
});

describe('distance calibration box', () => {
  it('states the room it takes from the page corner — margin, box and the crosshair arm past the far corner', () => {
    expect(calBoxNeedsMm(50)).toBe(64);
    expect(calBoxNeedsMm(100)).toBe(114);
    // On the default 210 mm page a 200 mm box does not fit: 4 mm of its far
    // crosshair would cross the origin line into the travel limit.
    expect(calBoxNeedsMm(200)).toBe(214);
    expect(calBoxNeedsMm(200)).toBeGreaterThan(TL.paperHeightUnits);
    const { extent } = buildCalibrationBox(200, TL, 'hpgl');
    expect(extent.x1).toBeCloseTo(214, 6);
    expect(extent.y1).toBeCloseTo(214, 6);
  });
  for (const [name, o] of BOTH) {
    it(`frame measures exactly the nominal size (±0.05 mm) — ${name}`, () => {
      for (const size of [50, 100, 200]) {
        const wire = parseHpgl(buildCalibrationBox(size, o, 'hpgl').code);
        const frame = wire.find(q => q.points.length === 5)!;
        const xs = frame.points.map(q => q[0]);
        const ys = frame.points.map(q => q[1]);
        close(Math.max(...xs) - Math.min(...xs), size, 0.05);
        close(Math.max(...ys) - Math.min(...ys), size, 0.05);
        expect(Math.min(...xs)).toBeCloseTo(10, 1);
        // Bottom-left origin: the box's top edge sits paperHeight − 10 above the machine origin.
        close(Math.max(...ys), o.originBottomLeft ? o.paperHeightUnits - 10 : 10 + size, 0.05);
      }
    });
  }

  it('carries a centred crosshair (4 mm arms) on each corner', () => {
    const wire = parseHpgl(buildCalibrationBox(100, TL, 'hpgl').code);
    const crosses = wire.filter(q => q.points.length === 2);
    expect(crosses).toHaveLength(8);
    const corners: Array<[number, number]> = [[10, 10], [110, 10], [110, 110], [10, 110]];
    for (const c of corners) {
      const mine = crosses.filter(q => dist(centroid(q), c) < 0.03);
      expect(mine).toHaveLength(2);
      for (const arm of mine) close(pathLength(arm), 8, 0.05);
    }
  });

  it('lints with zero errors in both formats', () => {
    for (const format of ['hpgl', 'gcode'] as const) {
      expect(errors(format, buildCalibrationBox(100, TL, format).code, TL)).toEqual([]);
      expect(errors(format, buildCalibrationBox(100, BL, format).code, BL)).toEqual([]);
    }
  });

  it('stays raw: overcut and blade offset in the settings do not touch the frame', () => {
    const frame = (o: PlotterOptions) => parseHpgl(buildCalibrationBox(100, o, 'hpgl').code).find(q => q.points.length === 5)!;
    expect(frame({ ...TL, overcutMm: 0.5, bladeOffsetMm: 0.6 }).points).toEqual(frame(TL).points);
  });

  it('G-code on the wire has the same extents', () => {
    const frame = parseGcode(buildCalibrationBox(50, { ...TL, spindle: { rpm: 1000 } }, 'gcode').code)[0];
    const xs = frame.points.map(q => q[0]);
    close(Math.max(...xs) - Math.min(...xs), 50, 1e-6);
  });
});

describe('ruler', () => {
  const ticksOf = (polys: CalPoly[]) => polys.filter(q => !q.closed && q.points.length === 2);

  it('has a tick every 10 mm along both axes, longer every 50 mm', () => {
    const ticks = ticksOf(parseHpgl(buildRuler(100, TL, 'hpgl').code));
    const xTicks = ticks.filter(q => q.points[0][1] === 0 && q.points[0][0] > 0);
    const yTicks = ticks.filter(q => q.points[0][0] === 0 && q.points[0][1] > 0);
    expect(xTicks.map(q => q.points[0][0])).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(yTicks.map(q => q.points[0][1])).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    for (const t of [...xTicks, ...yTicks]) close(pathLength(t), [50, 100].includes(Math.round(t.points[0][0] + t.points[0][1])) ? 8 : 5, 0.05);
  });

  it('runs from the machine origin along +X and +Y — identical in both origin modes, never negative', () => {
    const a = parseHpgl(buildRuler(100, TL, 'hpgl').code);
    const b = parseHpgl(buildRuler(100, BL, 'hpgl').code);
    expect(b).toEqual(a);
    const all = a.flatMap(q => q.points);
    expect(all.every(([x, y]) => x >= 0 && y >= 0)).toBe(true);
    expect(Math.max(...all.map(q => q[0]))).toBeCloseTo(100, 1);
    expect(Math.max(...all.map(q => q[1]))).toBeCloseTo(100, 1);
    // Arrowheads close each axis.
    expect(a.filter(q => q.closed)).toHaveLength(2);
  });

  it('honours the length', () => {
    const ticks = ticksOf(parseHpgl(buildRuler(50, TL, 'hpgl').code));
    expect(ticks).toHaveLength(12); // 5 ticks per arm + the two baselines
  });

  it('lints with zero errors in both formats', () => {
    for (const format of ['hpgl', 'gcode'] as const) {
      expect(errors(format, buildRuler(100, TL, format).code, TL)).toEqual([]);
      expect(errors(format, buildRuler(100, BL, format).code, BL)).toEqual([]);
    }
  });
});

describe('origin mark', () => {
  it('is a 10 mm corner bracket on the +X / +Y axes plus a dot square whose corner is the origin', () => {
    const wire = parseHpgl(buildOriginMark(TL, 'hpgl').code);
    expect(wire).toHaveLength(2);
    expect(wire[0].points.map(q => q.map(v => Math.round(v * 1000) / 1000))).toEqual([[10, 0], [0, 0], [0, 10]]);
    expect(wire[1].points.map(q => q.map(v => Math.round(v * 1000) / 1000))).toEqual([[0, 0], [1.5, 0], [1.5, 1.5], [0, 1.5], [0, 0]]);
  });
  it('sits on the machine origin in both origin modes and is never mirrored', () => {
    const a = parseHpgl(buildOriginMark(TL, 'hpgl').code);
    expect(parseHpgl(buildOriginMark(BL, 'hpgl').code)).toEqual(a);
    expect(parseHpgl(buildOriginMark({ ...BL, mirror: true }, 'hpgl').code)).toEqual(a);
    for (const format of ['hpgl', 'gcode'] as const) {
      expect(errors(format, buildOriginMark(BL, format).code, BL)).toEqual([]);
    }
  });
});

describe('positioning corner marks', () => {
  it('puts an inward 8 mm bracket on each corner of the rectangle, plus a diagonal on the top-left', () => {
    const p = buildCornerMarks({ x: 10, y: 10, w: 100, h: 60 }, TL, 'hpgl');
    expect(p.doc).toHaveLength(5);
    const heads = p.doc.slice(0, 4).map(q => q.points[1]);
    expect(heads).toEqual([[10, 10], [110, 10], [110, 70], [10, 70]]);
    for (const b of p.doc.slice(0, 4)) {
      close(dist(b.points[0], b.points[1]), 8);
      close(dist(b.points[2], b.points[1]), 8);
    }
    expect(p.doc[4].points).toEqual([[10, 10], [15, 15]]);
    expect(errors('hpgl', p.code, TL)).toEqual([]);
    expect(errors('gcode', buildCornerMarks({ x: 10, y: 10, w: 100, h: 60 }, BL, 'gcode').code, BL)).toEqual([]);
  });

  it('mirror moves the diagonal to the top-right corner — the tell-tale of a mirrored job', () => {
    const p = buildCornerMarks({ x: 10, y: 10, w: 100, h: 60 }, { ...TL, mirror: true }, 'hpgl');
    expect(p.doc[4].points).toEqual([[110, 10], [105, 15]]);
    expect(p.doc.slice(0, 4).map(q => q.points[1])).toEqual([[110, 10], [10, 10], [10, 70], [110, 70]]);
  });

  it('derives the rectangle from the job bbox (10 mm pad), kept on the page', () => {
    expect(cornerRectFromBbox({ x0: 30, y0: 40, x1: 90, y1: 100 })).toEqual({ x: 20, y: 30, w: 80, h: 80 });
    expect(cornerRectFromBbox({ x0: 3, y0: 0, x1: 50, y1: 20 })).toEqual({ x: 0, y: 0, w: 60, h: 30 });
    expect(cornerRectFromBbox(null)).toEqual({ x: 10, y: 10, w: 100, h: 100 });
    expect(calBounds([{ points: [[5, 5], [9, 7]], closed: false }])).toEqual({ x0: 5, y0: 5, x1: 9, y1: 7 });
    expect(calBounds([])).toBeNull();
  });
});

describe('drift test', () => {
  it('cuts a reference line and the same cross row 20 mm from the top and the bottom of the page', () => {
    const tl = parseHpgl(buildDriftTest(TL, 'hpgl').code);
    const centres = tl.slice(1).map(q => q.points[0]);
    expect(tl[0].points).toEqual([[10, 10], [10, 200]]);
    expect(centres.filter(q => q[1] === 15).map(q => q[0])).toEqual([40, 80, 120]); // top row: vertical arms from y=15 to 25
    expect(centres.filter(q => q[1] === 185)).toHaveLength(3); // bottom row: centred on 190
    const bl = parseHpgl(buildDriftTest(BL, 'hpgl').code);
    expect(bl[0].points).toEqual([[10, 200], [10, 10]]); // doc y 10 → machine y 200 (page top)
    expect(bl.slice(1).map(q => q.points[0]).filter(q => q[1] === 195)).toHaveLength(3); // top row (doc y 20) → machine y 190
    for (const format of ['hpgl', 'gcode'] as const) expect(errors(format, buildDriftTest(BL, format).code, BL)).toEqual([]);
  });
  it('suggestDrift rounds to 0.01 mm and turns an all-zero result off', () => {
    expect(suggestDrift(0.1234, -0.2, 1.006, 0)).toEqual({ topDxMm: 0.12, topDyMm: -0.2, bottomDxMm: 1.01, bottomDyMm: 0 });
    expect(suggestDrift(0, 0, 0, 0)).toBeNull();
  });
});

describe('dry run', () => {
  const job = (format: 'hpgl' | 'gcode', o: PlotterOptions, spindle = false) => buildPlotterOutput(format, { ...o, optimize: false, ...(spindle ? { spindle: { rpm: 1000 } } : {}) }, [
    { points: [[10, 10], [60, 10], [60, 40], [10, 40], [10, 10]], closed: true },
    { points: [[20, 20], [30, 30]], closed: false },
  ]);
  const dry = { penUpZ: 5, travelRate: 3000, unit: 'mm' as const };

  it('HP-GL: no pen-down statement at all — every PD became PU', () => {
    const out = buildDryRun('hpgl', job('hpgl', TL), dry);
    expect(/(^|[;\n\s])PD(?=[\s\d;,])/.test(out)).toBe(false);
    expect(out).toMatch(/^IN;/);
    expect(out).toContain('SP0;');
  });

  it('HP-GL: first travels the job bounding rectangle, then the very same points in the very same order', () => {
    const payload = job('hpgl', TL);
    const out = buildDryRun('hpgl', payload, dry);
    expect(out).toContain('PU400,400;\nPU2400,400;\nPU2400,1600;\nPU400,1600;\nPU400,400;');
    const coords = (code: string) => code.split(';').map(s => s.trim()).filter(s => /^P[UD][-\d]/.test(s)).map(s => s.replace(/^P[UD]/, ''));
    expect(coords(out).slice(5)).toEqual(coords(payload));
    // The rectangle sits after the header, before the first geometry statement.
    const lines = out.split('\n');
    expect(lines.indexOf('PU400,400;')).toBe(2);
  });

  it('HP-GL: drops the Roland sheet eject so the origin survives for the real cut', () => {
    const payload = job('hpgl', { ...TL, dialect: 'roland-camm' });
    expect(payload).toContain('!PG;');
    expect(buildDryRun('hpgl', payload, dry)).not.toContain('!PG');
  });

  it('G-code: Z is at the pen-up height for the whole program, no spindle / laser command, cut moves are rapids', () => {
    const out = buildDryRun('gcode', job('gcode', TL, true), dry);
    const zs = [...out.matchAll(/Z([-+\d.]+)/g)].map(m => Number(m[1]));
    expect(zs.length).toBeGreaterThan(0);
    expect(zs.every(z => z === 5)).toBe(true);
    expect(/^M[345]\b/m.test(out)).toBe(false);
    expect(out).toContain('G0 X60.000 Y40.000'); // was G1 … F1500
    expect(/^G1\s+X/m.test(out)).toBe(false); // no XY move is left at feed rate
    expect(out).toContain('G0 X10.000 Y10.000\nG0 X60.000 Y10.000\nG0 X60.000 Y40.000\nG0 X10.000 Y40.000\nG0 X10.000 Y10.000');
    expect(out).toContain('G21 ; mm');
    expect(out.trimEnd().endsWith('M30 ; end')).toBe(true);
  });

  it('follows origin and mirror settings because it IS the job (bottom-left origin + mirror)', () => {
    const payload = job('hpgl', { ...BL, mirror: true });
    const out = buildDryRun('hpgl', payload, dry);
    expect(out).not.toMatch(/(^|[;\n\s])PD(?=[\s\d;,])/);
    // doc y 10..40 → machine y 210 − y = 200..170; mirrored about the job's own x centre.
    expect(out).toContain('PU400,6800;\nPU2400,6800;\nPU2400,8000;\nPU400,8000;\nPU400,6800;');
  });
});

// The Code page is editable, files can be imported, and cutters take lower
// case as readily as upper — the rewrite may not depend on the generator's
// spelling. Each case first proves the simulator sees a cut in the payload.
describe('dry run — whatever the spelling', () => {
  const dry = { penUpZ: 5, travelRate: 3000, unit: 'mm' as const };

  it('HP-GL: lower-case mnemonics, a PD glued to a coordinate and a pen-down selector on PA are lifted too', () => {
    const payload = 'in; sp1; pa400,400;\npd1600,400 pd1600,1600;\npu; pa400,1600,1; pa1600,1600,1;\npu0,0; sp0;';
    expect(simulateMachineCode('hpgl', payload).cuts.length).toBeGreaterThan(0);
    const out = buildDryRun('hpgl', payload, dry);
    expect(payloadMarks('hpgl', out, 'mm')).toBe(false);
    expect(out).not.toMatch(/(?<![A-Za-z])pd(?![A-Za-z])/i);
    expect(out).toContain('PA400,1600,0;');
    expect(out).toContain('PA1600,1600,0;');
  });

  it('G-code: lower-case words and a spaced height are lifted too', () => {
    const payload = 'g21\ng90\ng0 x0 y0 z0\nm3 s1000\ng1 z-1 f100\ng1 x10 y10 f1500\ng1 x20 z -2\nm5\nm30';
    expect(simulateMachineCode('gcode', payload).cuts.length).toBeGreaterThan(0);
    const out = buildDryRun('gcode', payload, dry);
    expect(payloadMarks('gcode', out, 'mm')).toBe(false);
    expect(out).not.toMatch(/(?<![A-Za-z])m[345](?![\d.])/i);
    expect(out.trimEnd().endsWith('m30')).toBe(true); // the program end is not a spindle command
  });
});

describe('calibration and positioning patterns keep the origin the operator set', () => {
  // HP-GL `IN` resets the scaling points on a compliant plotter — and that is
  // what the app's Set origin (`IP;`) sets. The virtual plotter follows the
  // spec, so it shows where a mark really lands.
  const patterns: Array<[string, string]> = [
    ['blade offset test', buildBladeOffsetTest(BLADE_OFFSET_STEPS_MM, TL, 'hpgl').code],
    ['overcut test', buildOvercutTest(OVERCUT_STEPS_MM, TL, 'hpgl').code],
    ['distance box', buildCalibrationBox(50, TL, 'hpgl').code],
    ['origin mark', buildOriginMark(TL, 'hpgl').code],
    ['ruler', buildRuler(50, TL, 'hpgl').code],
    ['drift test', buildDriftTest(TL, 'hpgl').code],
  ];

  it('no pattern sends IN;, the one command that throws a software origin away', () => {
    for (const [name, code] of patterns) {
      expect(code, name).not.toMatch(/(?<![A-Za-z])IN;/i);
      expect(code, name).toMatch(/^SP1;/); // and still selects the pen
    }
    // A job keeps its initializer: `IN` also drains stale state before real work.
    expect(buildPlotterOutput('hpgl', TL, [{ points: [[1, 1], [2, 1]], closed: false, kind: 'outline' }])).toMatch(/^IN;/);
  });

  it('Mark origin lands at the origin the operator set, not back at the material corner', () => {
    const sim = new PlotterSimulator({ format: 'hpgl' });
    // The head sits 50 mm in and 20 mm below the top of a 210 mm page; Set origin there.
    const replies = [...sim.write('PU2000,7600;IP;'), ...sim.write(buildOriginMark(TL, 'hpgl').code), ...sim.flush()];
    expect(replies.some(r => /error/i.test(r)), replies.join(' ')).toBe(false);
    expect(sim.alarmReason).toBeNull();
    const cuts = sim.segments.filter(s => s.penDown).flatMap(s => s.points);
    expect(cuts.length).toBeGreaterThan(0);
    const xs = cuts.map(([x]) => x);
    const ys = cuts.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(50, 6);
    expect(Math.max(...xs)).toBeCloseTo(60, 6);
    expect(Math.min(...ys)).toBeCloseTo(190, 6);
    expect(Math.max(...ys)).toBeCloseTo(200, 6);
  });

  it('a job header does reset it — which is why the patterns leave IN; out', () => {
    const sim = new PlotterSimulator({ format: 'hpgl' });
    const replies = [...sim.write('PU2000,7600;IP;'), ...sim.write('IN;' + buildOriginMark(TL, 'hpgl').code), ...sim.flush()];
    expect(replies.some((r) => /error/i.test(r)), replies.join(' ')).toBe(false);
    const cuts = sim.segments.filter(s => s.penDown).flatMap(s => s.points);
    expect(Math.max(...cuts.map(([, y]) => y))).toBeLessThan(11); // back at the material corner
  });
});

describe('calculators', () => {
  it('blade offset: gap adds, overlap subtracts, never below zero, 0.01 mm', () => {
    expect(suggestBladeOffset(0.25, 0.12, 0)).toBe(0.37);
    expect(suggestBladeOffset(0.25, 0, 0.08)).toBe(0.17);
    expect(suggestBladeOffset(0.1, 0, 0.4)).toBe(0);
    expect(suggestBladeOffset(0.25, 0.1 + 0.2, 0)).toBe(0.55);
  });
  it('scale error: percent of nominal, positive when the machine cut longer', () => {
    expect(scaleErrorPercent(100, 101.5)).toBe(1.5);
    expect(scaleErrorPercent(100, 99)).toBe(-1);
    expect(scaleErrorPercent(50, 50)).toBe(0);
    expect(scaleErrorPercent(100, 0)).toBeNull();
    expect(scaleErrorPercent(0, 100)).toBeNull();
  });
  it('grbl steps/mm: current × nominal ÷ measured', () => {
    expect(suggestGrblSteps(250, 100, 101)).toBe(247.52);
    expect(suggestGrblSteps(250, 100, 99.5)).toBe(251.26);
    expect(suggestGrblSteps(80, 200, 200)).toBe(80);
    expect(suggestGrblSteps(0, 100, 100)).toBeNull();
    expect(suggestGrblSteps(250, 100, 0)).toBeNull();
  });
  it('skew from the two diagonals', () => {
    expect(skewFromDiagonals(100, 100 * Math.SQRT2, 100 * Math.SQRT2)).toBe(0);
    // 0.5° past square: d(AC)² − d(BD)² = 4 L² sin 0.5°
    const L = 100;
    const s = Math.sin((0.5 * Math.PI) / 180);
    const dAc = Math.sqrt(2 * L * L + 4 * L * L * s * 0.5);
    const dBd = Math.sqrt(2 * L * L - 4 * L * L * s * 0.5);
    close(skewFromDiagonals(L, dAc, dBd)!, 0.5, 0.01);
    expect(skewFromDiagonals(100, 141.4, null)).toBeNull();
    expect(skewFromDiagonals(100, 141.4, 141.4)).toBe(0);
  });
});
