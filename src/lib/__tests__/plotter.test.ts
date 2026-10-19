import { describe, it, expect, beforeAll } from 'vitest';
import {
  svgToPolylines,
  buildForceTest,
  buildPlotterOutput,
  generateGCode,
  generateHPGL,
  postProcess,
  defaultPlotterOptions,
  MATERIAL_PRESETS,
} from '../plotter';

/**
 * jsdom (as of v27) does not implement DOMMatrix or DOMPoint. plotter.ts
 * uses both for the SVG transform stack. Polyfill them with a minimal
 * shim that's enough for the cases under test (no transform="..." in our
 * sample SVGs, so identity-matrix behaviour is all we need).
 */
beforeAll(() => {
  if (typeof (globalThis as { DOMPoint?: unknown }).DOMPoint === 'undefined') {
    class DOMPointShim {
      x: number;
      y: number;
      z: number;
      w: number;
      constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
      }
    }
    (globalThis as { DOMPoint?: unknown }).DOMPoint = DOMPointShim;
  }
  if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
    class DOMMatrixShim {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      constructor(init?: string | number[]) {
        // We only need identity; accept and ignore unsupported transform
        // strings since the test SVG has no transform="…" attribute.
        if (Array.isArray(init) && init.length === 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        } else if (typeof init === 'string' && init.trim()) {
          // Unsupported in the shim — throw so the caller's try/catch
          // can fall back to the parent matrix.
          throw new Error('DOMMatrix string constructor not supported in shim');
        }
      }
      multiply(other: DOMMatrixShim): DOMMatrixShim {
        const m = new DOMMatrixShim();
        m.a = this.a * other.a + this.c * other.b;
        m.b = this.b * other.a + this.d * other.b;
        m.c = this.a * other.c + this.c * other.d;
        m.d = this.b * other.c + this.d * other.d;
        m.e = this.a * other.e + this.c * other.f + this.e;
        m.f = this.b * other.e + this.d * other.f + this.f;
        return m;
      }
      transformPoint(p: { x: number; y: number }): { x: number; y: number } {
        return {
          x: this.a * p.x + this.c * p.y + this.e,
          y: this.b * p.x + this.d * p.y + this.f,
        };
      }
    }
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrixShim;
  }
});

describe('svgToPolylines', () => {
  it('flattens a simple M..L..Z path into a closed 2+ point polyline', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<path d="M 0 0 L 10 0 Z" />' +
      '</svg>';
    // Use originBottomLeft: false to keep things obvious in tests
    const opts = {
      ...defaultPlotterOptions,
      pxPerUnit: 1,
      originBottomLeft: false,
    };
    const polylines = svgToPolylines(svg, opts);
    expect(polylines.length).toBeGreaterThan(0);
    // After M 0 0 L 10 0 Z, expect at least the two unique points and
    // closed: true.
    const pl = polylines[0];
    expect(pl.closed).toBe(true);
    expect(pl.points.length).toBeGreaterThanOrEqual(2);
    // Coordinates should reflect the path (origin = top-left in this opts).
    expect(pl.points[0][0]).toBeCloseTo(0, 3);
    expect(pl.points[0][1]).toBeCloseTo(0, 3);
  });

  it('handles a <line> element', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<line x1="0" y1="0" x2="10" y2="20" />' +
      '</svg>';
    const opts = {
      ...defaultPlotterOptions,
      pxPerUnit: 1,
      originBottomLeft: false,
    };
    const polylines = svgToPolylines(svg, opts);
    expect(polylines.length).toBe(1);
    expect(polylines[0].closed).toBe(false);
    expect(polylines[0].points.length).toBe(2);
  });
});

describe('generateGCode', () => {
  it('emits G21 and G90 preamble', () => {
    const out = generateGCode([], defaultPlotterOptions);
    expect(out).toMatch(/G21/);
    expect(out).toMatch(/G90/);
  });

  it('emits G20 when unit is inches', () => {
    const out = generateGCode([], { ...defaultPlotterOptions, unit: 'in' });
    expect(out).toMatch(/G20/);
  });

  it('emits travel-cut-up sequence for each polyline', () => {
    const polylines = [
      { points: [[0, 0], [10, 0], [10, 10]] as Array<[number, number]>, closed: false },
    ];
    const out = generateGCode(polylines, defaultPlotterOptions);
    const lines = out.split('\n');
    // Should contain a G0 move-to-start, G1 down (penDownZ),
    // G1 cut moves, then G0 up (penUpZ).
    const downZ = defaultPlotterOptions.penDownZ.toFixed(3);
    const upZ = defaultPlotterOptions.penUpZ.toFixed(3);
    expect(lines.some((l) => l.includes('G0 X0.000 Y0.000'))).toBe(true);
    expect(lines.some((l) => l.includes(`G1 Z${downZ}`))).toBe(true);
    expect(lines.some((l) => l.includes('G1 X10.000 Y0.000'))).toBe(true);
    expect(lines.some((l) => l.includes('G1 X10.000 Y10.000'))).toBe(true);
    expect(lines.some((l) => l.includes(`G0 Z${upZ}`))).toBe(true);
    // Ends with M30
    expect(out).toMatch(/M30/);
  });

  it('skips polylines with < 2 points', () => {
    const polylines = [
      { points: [[5, 5]] as Array<[number, number]>, closed: false },
    ];
    const out = generateGCode(polylines, defaultPlotterOptions);
    // No move-to with the (5,5) coordinate should be present.
    expect(out.includes('X5.000 Y5.000')).toBe(false);
  });
});

describe('generateHPGL', () => {
  it('emits IN; and SP1; prelude', () => {
    const out = generateHPGL([], defaultPlotterOptions);
    expect(out).toMatch(/IN;/);
    expect(out).toMatch(/SP1;/);
  });

  it('emits PU / PD pairs for each polyline', () => {
    const polylines = [
      { points: [[0, 0], [1, 0], [1, 1]] as Array<[number, number]>, closed: false },
    ];
    const out = generateHPGL(polylines, defaultPlotterOptions);
    // mm * 40 = HPGL units
    expect(out).toMatch(/PU0,0;/);
    expect(out).toMatch(/PD40,0,40,40;/);
  });

  it('ends with PU0,0; and SP0;', () => {
    const out = generateHPGL([], defaultPlotterOptions);
    expect(out).toMatch(/PU0,0;/);
    expect(out).toMatch(/SP0;/);
  });
});

describe('plotter preferences', () => {
  it('round-trips machine settings through localStorage', async () => {
    const { savePlotterPrefs, loadPlotterPrefs } = await import('../plotter');
    savePlotterPrefs({
      opts: { ...defaultPlotterOptions, feedRate: 999, dialect: 'roland-camm' },
      format: 'gcode',
      materialId: 'htv',
      baud: 9600,
      flowControl: 'hardware',
      lastPort: 'COM7',
      profileId: 'china-clone',
    });
    const p = loadPlotterPrefs();
    expect(p.opts?.feedRate).toBe(999);
    expect(p.opts?.dialect).toBe('roland-camm');
    expect(p.format).toBe('gcode');
    expect(p.materialId).toBe('htv');
    expect(p.baud).toBe(9600);
    expect(p.flowControl).toBe('hardware');
    expect(p.lastPort).toBe('COM7');
    expect(p.profileId).toBe('china-clone');
    window.localStorage.clear();
  });

  it('falls back to defaults on a corrupt or hostile blob', async () => {
    const { loadPlotterPrefs } = await import('../plotter');
    window.localStorage.setItem('vector.plotter.prefs', '{"opts":{"feedRate":"fast","unit":"cubits","dialect":42},"format":"plt","baud":-5,"flowControl":"smoke"}');
    const p = loadPlotterPrefs();
    expect(p.format).toBeUndefined();
    expect(p.baud).toBeUndefined();
    expect(p.flowControl).toBeUndefined();
    expect(p.opts?.unit).toBe('mm');        // invalid unit → default
    expect(p.opts?.dialect).toBe('bare');   // invalid dialect → default
    expect(p.opts?.feedRate).toBe(defaultPlotterOptions.feedRate); // non-numeric → default
    window.localStorage.clear();
  });

  it('clamps out-of-range numerics into safe bands', async () => {
    const { loadPlotterPrefs } = await import('../plotter');
    window.localStorage.setItem(
      'vector.plotter.prefs',
      JSON.stringify({ opts: { ...defaultPlotterOptions, feedRate: 1e9, paperHeightUnits: -20 }, baud: 4000000 }),
    );
    const p = loadPlotterPrefs();
    expect(p.opts?.feedRate).toBe(100000);
    expect(p.opts?.paperHeightUnits).toBe(1);
    expect(p.baud).toBeUndefined(); // outside the accepted band → dropped
    window.localStorage.clear();
  });
});

describe('dialect force/speed embedding + eject option', () => {
  const rolandOpts = { ...defaultPlotterOptions, dialect: 'roland-camm' as const };

  it('embeds FS/VS into the Roland (clone) dialect header', () => {
    const out = generateHPGL([], rolandOpts);
    expect(out).toMatch(/FS30;/);
    expect(out).toMatch(/VS20;/);
  });

  it('skips FS/VS when set to 0', () => {
    const out = generateHPGL([], { ...rolandOpts, graphtecForce: 0, graphtecSpeed: 0 });
    expect(out).not.toMatch(/FS\d/);
    expect(out).not.toMatch(/VS\d/);
  });

  it('never puts FS/VS into the bare pen-plotter dialect', () => {
    const out = generateHPGL([], defaultPlotterOptions);
    expect(out).not.toMatch(/FS\d/);
    expect(out).not.toMatch(/VS\d/);
  });

  it('ejects by default but honours ejectAfter=false (job nesting)', () => {
    expect(generateHPGL([], rolandOpts)).toMatch(/!PG;/);
    const nested = generateHPGL([], { ...rolandOpts, ejectAfter: false });
    expect(nested).not.toMatch(/!PG;/);
    expect(nested).toMatch(/PU0,0;/);
  });
});

describe('buildForceTest', () => {
  it('cuts one square per force step and restores the configured force', () => {
    const out = buildForceTest('hpgl', { ...defaultPlotterOptions, dialect: 'roland-camm' });
    for (const f of [30, 40, 50, 60, 70]) expect(out).toMatch(new RegExp(`FS${f};`));
    // five PD squares + closing PD back at start
    expect(out.match(/PD[^;]+;/g)?.length).toBe(5);
    // restore the operator force after the strip
    expect(out.lastIndexOf('FS30;')).toBeGreaterThan(out.lastIndexOf('FS70;'));
    expect(out).toMatch(/!PG;/);
  });

  it('respects start/step/count overrides', () => {
    const out = buildForceTest('hpgl', defaultPlotterOptions, 80, 5, 3);
    expect(out).toMatch(/FS80;/);
    expect(out).toMatch(/FS90;/);
    expect(out).not.toMatch(/FS95;/);
    expect(out.match(/PD[^;]+;/g)?.length).toBe(3);
  });

  it('falls back to the plain test cut for gcode (pen plotters have no force)', async () => {
    const { buildTestCut } = await import('../plotter');
    expect(buildForceTest('gcode', defaultPlotterOptions)).toBe(buildTestCut('gcode', defaultPlotterOptions));
  });
});

describe('ARMS registration (Graphtec)', () => {
  const square = [{
    points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] as Array<[number, number]>,
    closed: true,
  }];
  const arms = { armMm: 20, type: 2 as const, rectW: 200, rectH: 150 };
  const gOpts = { ...defaultPlotterOptions, dialect: 'graphtec-fc' as const };

  it('emits the ETX-terminated TB block before geometry and TB0 after the footer', () => {
    const out = generateHPGL(square, { ...gOpts, arms });
    // Header (IN;SP1;FS30;VS20;PA;) then the full registration block,
    // verbatim with 0.1mm-step lengths.
    const prefix = [
      'IN;', 'SP1;', 'FS30;', 'VS20;', 'PA;',
      'TB99\x03',
      'TB51,200\x03',
      'TB52,2\x03',
      'TB54,0,0\x03',
      'TB55,1\x03',
      'TB24,2000,1500\x03',
      'TB99\x03',
    ].join('\n');
    expect(out.startsWith(prefix)).toBe(true);
    // Graphtec footer is a plain park (no !PG eject) — TB0 is the last word.
    expect(out.endsWith('PU0,0;\nSP0;\nTB0\x03')).toBe(true);
    // Geometry still rides between the two.
    expect(out).toMatch(/PU0,\d+;/);
    expect(out).toMatch(/PD[^;]+;/);
  });

  it('is byte-identical when arms is unset', () => {
    const without = generateHPGL(square, gOpts);
    expect(generateHPGL(square, { ...gOpts, arms: undefined })).toBe(without);
    expect(without).not.toContain('TB');
  });

  it('throws for non-Graphtec dialects', () => {
    expect(() => generateHPGL(square, { ...defaultPlotterOptions, arms })).toThrow(
      /ARMS registration marks require the Graphtec dialect/,
    );
    expect(() => generateHPGL(square, { ...defaultPlotterOptions, dialect: 'roland-camm', arms })).toThrow(
      /ARMS registration marks require the Graphtec dialect/,
    );
  });

  it('round-trips bladeOffsetMm and arms through the prefs loader', async () => {
    const { savePlotterPrefs, loadPlotterPrefs } = await import('../plotter');
    savePlotterPrefs({
      opts: { ...defaultPlotterOptions, bladeOffsetMm: 0.25, arms: { armMm: 20, type: 1, rectW: 200, rectH: 150 } },
      format: 'hpgl',
      materialId: 'htv',
      baud: 9600,
      flowControl: 'none',
      lastPort: '',
      profileId: '',
    });
    const p = loadPlotterPrefs();
    expect(p.opts?.bladeOffsetMm).toBe(0.25);
    expect(p.opts?.arms).toEqual({ armMm: 20, type: 1, rectW: 200, rectH: 150 });
    window.localStorage.clear();
  });
});

describe('postProcess blade-offset wiring', () => {
  const square = [{
    points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] as Array<[number, number]>,
    closed: true,
  }];
  const base = { optimize: false, mirror: false, overcutMm: 0, reverse: false, insideFirst: false };

  it('adds drag-knife corner loops when bladeOffsetMm > 0', () => {
    const off = postProcess(square, { ...base, bladeOffsetMm: 0.25 });
    expect(off[0].points.length).toBeGreaterThan(square[0].points.length);
    // Off (the default) leaves the geometry untouched.
    expect(postProcess(square, base)[0].points).toEqual(square[0].points);
  });

  it('loops before mirroring, so the mirror flips the finished geometry', () => {
    const off = postProcess(square, { ...base, bladeOffsetMm: 0.25, mirror: true });
    const unm = postProcess(square, { ...base, bladeOffsetMm: 0.25 });
    expect(off[0].points.length).toBe(unm[0].points.length);
    // Horizontal mirror about the bbox centre: x -> 10 - x for this square.
    for (const [x, y] of off[0].points) {
      expect(unm[0].points.some(([ux, uy]) =>
        Math.abs(ux - (10 - x)) < 1e-9 && Math.abs(uy - y) < 1e-9)).toBe(true);
    }
  });
});

describe('kiss/perf cut ordering', () => {
  // Squares spaced along X; PU x-coordinates identify the kind in the output.
  const sq = (x: number): Array<[number, number]> =>
    [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]];
  const cuts = [
    { points: sq(0), closed: true, kind: 'perf' },
    { points: sq(20), closed: true, kind: 'outline' },
    { points: sq(40), closed: true, kind: 'kiss' },
    { points: sq(60), closed: true, kind: 'manual' },
  ];
  // Squares occupy distinct x-bands (units = mm * 40): perf [0,400],
  // outline [800,1200], kiss [1600,2000], manual [2400,2800]. Band-based
  // because the travel optimiser may rotate a closed ring to start at any
  // of its vertices.
  const rankOf = (x: number) => (x <= 400 ? 2 : x <= 1200 ? 0 : x <= 2000 ? 1 : 0);
  const puOrder = (out: string): number[] =>
    out.split('\n')
      .filter((l) => /^PU-?\d+,-?\d+;$/.test(l))
      .slice(0, -1) // drop the footer park PU0,0;
      .map((l) => Number(l.slice(2).split(',')[0]));

  it('groups through-cuts first, kiss, then perf (stable within groups)', () => {
    const out = buildPlotterOutput('hpgl', { ...defaultPlotterOptions, optimize: false }, cuts);
    expect(puOrder(out)).toEqual([800, 2400, 1600, 0]);
  });

  it('still groups after travel optimisation reorders the job', () => {
    const out = buildPlotterOutput('hpgl', { ...defaultPlotterOptions }, cuts);
    const ranks = puOrder(out).map(rankOf);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('kind tags survive the travel optimiser permutation (kiss listed first, farthest from origin)', () => {
    // Adversarial layout: input order [kiss, outline, perf] but greedy travel
    // from the origin visits outline → perf → kiss. Pairing a parallel kinds
    // array against post-optimiser polylines would misrank every path.
    const shuffled = [
      { points: sq(60), closed: true, kind: 'kiss' },   // x-band [2400,2800]
      { points: sq(0), closed: true, kind: 'outline' }, // x-band [0,400]
      { points: sq(30), closed: true, kind: 'perf' },   // x-band [1200,1600]
    ];
    const band = (x: number) => (x <= 400 ? 0 : x <= 1600 ? 2 : 1);
    const out = buildPlotterOutput('hpgl', defaultPlotterOptions, shuffled);
    const order = puOrder(out);
    const ranks = order.map(band);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // The optimiser provably permuted (nearest square first, not the
    // array-first kiss square) so this is not the identity case.
    expect(order[0]).toBeLessThanOrEqual(400);
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[2]).toBeGreaterThanOrEqual(1200);
  });
});

describe('material presets', () => {
  it('adds the researched presets with documented fields, ids of existing ones stable', () => {
    const ids = MATERIAL_PRESETS.map((p) => p.id);
    for (const id of ['sign-vinyl', 'htv', 'sticker', 'cardstock', 'window-tint', 'stencil']) {
      expect(ids).toContain(id);
    }
    const glitter = MATERIAL_PRESETS.find((p) => p.id === 'glitter-htv')!;
    expect(glitter.force).toBe(170);
    expect(glitter.speed).toBe(30);
    expect(glitter.bladeAngleDeg).toBe(60);
    expect(glitter.defaultOvercutMm).toBe(0.5);
    expect(glitter.mirror).toBe(true);
    expect(glitter.passes).toBe(2);
    const oracal = MATERIAL_PRESETS.find((p) => p.id === 'oracal-651')!;
    expect(oracal.force).toBe(14);
    expect(oracal.speed).toBe(50);
    expect(oracal.bladeAngleDeg).toBe(45);
    const printable = MATERIAL_PRESETS.find((p) => p.id === 'printable-vinyl')!;
    expect(printable.force).toBe(12);
    expect(printable.speed).toBe(40);
    expect(printable.bladeAngleDeg).toBe(45);
    expect(printable.label).toMatch(/print then cut/i);
    const htv = MATERIAL_PRESETS.find((p) => p.id === 'htv')!;
    expect(htv.force).toBe(85);
    expect(htv.bladeAngleDeg).toBe(45);
    const sticker = MATERIAL_PRESETS.find((p) => p.id === 'sticker')!;
    expect(sticker.overcut).toBe(0.5);
    expect(sticker.defaultOvercutMm).toBe(0.5);
  });
});

describe('material preset physics constants', () => {
  it('every preset carries accelMmS2 and headUpS within the researched bands', () => {
    // The physics estimate relies on presence: the UI must never see
    // undefined. Bands from docs/research-sticker-printcut-2026-10.md §3:
    // accel 500–2500 mm/s², head-up 0.1–0.4 s.
    for (const p of MATERIAL_PRESETS) {
      expect(typeof p.accelMmS2, p.id).toBe('number');
      expect(typeof p.headUpS, p.id).toBe('number');
      expect(p.accelMmS2!).toBeGreaterThanOrEqual(500);
      expect(p.accelMmS2!).toBeLessThanOrEqual(2500);
      expect(p.headUpS!).toBeGreaterThanOrEqual(0.1);
      expect(p.headUpS!).toBeLessThanOrEqual(0.4);
    }
  });

  it('matches the per-material CutTime research values', () => {
    const by = (id: string) => MATERIAL_PRESETS.find((p) => p.id === id)!;
    // Vinyl family (sign / oracal / printable / sticker): 1500 / 0.15.
    expect(by('sign-vinyl')).toMatchObject({ accelMmS2: 1500, headUpS: 0.15 });
    expect(by('oracal-651')).toMatchObject({ accelMmS2: 1500, headUpS: 0.15 });
    expect(by('printable-vinyl')).toMatchObject({ accelMmS2: 1500, headUpS: 0.15 });
    expect(by('sticker')).toMatchObject({ accelMmS2: 1500, headUpS: 0.15 });
    // HTV: 1000 / 0.2, glitter needing the slower settle.
    expect(by('htv')).toMatchObject({ accelMmS2: 1000, headUpS: 0.2 });
    expect(by('glitter-htv')).toMatchObject({ accelMmS2: 1000, headUpS: 0.25 });
    // Cardstock: 800 / 0.35.
    expect(by('cardstock')).toMatchObject({ accelMmS2: 800, headUpS: 0.35 });
    expect(by('window-tint')).toMatchObject({ accelMmS2: 1500, headUpS: 0.15 });
    expect(by('stencil')).toMatchObject({ accelMmS2: 1500, headUpS: 0.15 });
  });
});
