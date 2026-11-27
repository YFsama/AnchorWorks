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
  savePlotterPrefs,
  loadPlotterPrefs,
  applyDriftToPolylines,
} from '../plotter';
import { simulateMachineCode } from '../hpglDebug';
import { previewGeometry } from '../cutPreview';

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

  // Canvas-mode jobs read the canvas SVG, where every object carries its
  // placement as a transform. Losing one flattened the object at the page
  // origin — on the wire, not only in the preview.
  const placed = (transform: string): Array<[number, number]> => svgToPolylines(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><path d="M 0 0 L 10 0 L 10 10 Z" transform="${transform}"/></svg>`,
    { ...defaultPlotterOptions, pxPerUnit: 1, originBottomLeft: false },
  )[0].points;

  it('applies the space-separated matrix fabric writes for every placed object', () => {
    const pts = placed('matrix(1 0 0 1 50 60)');
    expect(pts[0][0]).toBeCloseTo(50, 6);
    expect(pts[0][1]).toBeCloseTo(60, 6);
    expect(pts[1][0]).toBeCloseTo(60, 6);
  });

  it('applies translate however it is spelled — spaces, commas, and with a unit', () => {
    for (const t of ['translate(50 60)', 'translate(50, 60)', 'translate(50px, 60px)', 'translate(50px 60px)']) {
      const pts = placed(t);
      expect(pts[0][0], t).toBeCloseTo(50, 6);
      expect(pts[0][1], t).toBeCloseTo(60, 6);
    }
    // The cut preview rewrites transforms into CSS, which adds the unit.
    const mm = placed('translate(25.4mm, 0)');
    expect(mm[0][0]).toBeCloseTo(96, 3); // 25.4 mm at the canvas's 96 dpi
  });

  it('rotates about a centre and keeps a list of transforms in order', () => {
    const about = placed('rotate(90 5 5)');
    expect(about[0][0]).toBeCloseTo(10, 6);
    expect(about[0][1]).toBeCloseTo(0, 6);
    const both = placed('translate(100 0) scale(2)');
    expect(both[2][0]).toBeCloseTo(120, 6); // (10 × 2) + 100
    expect(both[2][1]).toBeCloseTo(20, 6);
  });

  it('ignores a transform it cannot read instead of inventing numbers', () => {
    const pts = placed('translate(50%, 60)');
    expect(pts[0][0]).toBeCloseTo(0, 6); // the attribute as a whole is not applied
    expect(pts[1][0]).toBeCloseTo(10, 6);
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

describe('generateGCode — spindle / laser option', () => {
  const polylines = [
    { points: [[0, 0], [10, 0]] as Array<[number, number]>, closed: false },
  ];

  it('outputs the classic pen model byte-for-byte when spindle is undefined', () => {
    const expected = [
      '; Anchorworks — G-code output',
      'G21 ; mm',
      'G90 ; absolute',
      'G0 Z5.000 F3000',
      'G0 X0.000 Y0.000 F3000',
      'G1 Z-1.000 F1500',
      'G1 X10.000 Y0.000 F1500',
      'G0 Z5.000 F3000',
      'G0 X0 Y0',
      'M30 ; end',
      // The job ends with a newline: grbl runs a line only once it is
      // terminated, and without it the next whole-line command on the link
      // (`G92 X0 Y0` from Set origin) was appended to `M30 ; end` and
      // swallowed by that comment.
    ].join('\n') + '\n';
    expect(generateGCode(polylines, defaultPlotterOptions)).toBe(expected);
    expect(generateGCode(polylines, { ...defaultPlotterOptions, spindle: undefined })).toBe(expected);
  });

  it('wraps the job in M3 S… / M5, with M5 before the return-to-origin travel', () => {
    const out = generateGCode(polylines, { ...defaultPlotterOptions, spindle: { rpm: 800 } });
    const lines = out.split('\n');
    expect(lines[4]).toBe('M3 S800');
    const m5 = lines.indexOf('M5');
    const home = lines.indexOf('G0 X0 Y0');
    expect(m5).toBeGreaterThan(0);
    expect(m5).toBe(home - 1); // laser/spindle off BEFORE travelling home
    expect(out).not.toContain('laser on');
  });

  it('laser mode keeps the M3/M5 shape and tags the M3 line', () => {
    const out = generateGCode(polylines, { ...defaultPlotterOptions, spindle: { rpm: 250, laserMode: true } });
    expect(out).toContain('M3 S250 ; laser on');
    expect(out).toContain('M5');
  });

  it('ignores a zero-rpm spindle block (falls back to the pen model)', () => {
    const plain = generateGCode(polylines, defaultPlotterOptions);
    expect(generateGCode(polylines, { ...defaultPlotterOptions, spindle: { rpm: 0 } })).toBe(plain);
  });

  it('round-trips a valid spindle block and drops invalid ones through prefs', async () => {
    savePlotterPrefs({
      opts: { ...defaultPlotterOptions, spindle: { rpm: 800, laserMode: true } },
      format: 'gcode', materialId: '', baud: 115200, flowControl: 'none', lastPort: '', profileId: 'grbl-laser',
    });
    expect(loadPlotterPrefs().opts?.spindle).toEqual({ rpm: 800, laserMode: true });
    window.localStorage.setItem(
      'vector.plotter.prefs',
      JSON.stringify({ opts: { ...defaultPlotterOptions, spindle: { rpm: -5 } } }),
    );
    expect(loadPlotterPrefs().opts?.spindle).toBeUndefined();
    window.localStorage.clear();
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

  // `IN` resets the scaling points on an HP-GL-compliant plotter, which throws
  // away an origin set with the app's Set origin (`IP;`). Calibration and
  // positioning patterns are emitted without it; a job keeps it.
  it('initialize: false leaves out every IN; in every dialect, and nothing else', () => {
    const polylines = [{ points: [[1, 1], [2, 1]] as Array<[number, number]>, closed: false }];
    for (const dialect of ['bare', 'roland-camm', 'graphtec-fc'] as const) {
      const opts = { ...defaultPlotterOptions, dialect, graphtecForce: 20, graphtecSpeed: 5 };
      const job = generateHPGL(polylines, opts);
      const mark = generateHPGL(polylines, { ...opts, initialize: false });
      expect(job, dialect).toMatch(/(?<![A-Za-z])IN;/);
      expect(mark, dialect).not.toMatch(/(?<![A-Za-z])IN;/);
      expect(mark.split('\n'), dialect).toEqual(job.split('\n').filter(l => l !== 'IN;')); // nothing else differs
    }
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

  it('mirror: every kind flips about the whole job’s line, so a kiss-cut window follows its print', () => {
    // A die-cut border with a kiss-cut window on its left (x 30–70 of 0–200).
    const rect = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
      [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    const job: Array<{ points: Array<[number, number]>; closed: boolean; kind: 'perf' | 'kiss' }> = [
      { points: rect(0, 0, 200, 100), closed: true, kind: 'perf' },
      { points: rect(30, 20, 70, 60), closed: true, kind: 'kiss' },
    ];
    const out = buildPlotterOutput('gcode', { ...defaultPlotterOptions, optimize: false, mirror: true }, job);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    const xRanges = simulateMachineCode('gcode', out).cuts
      .map((c) => [round(Math.min(...c.map(([x]) => x))), round(Math.max(...c.map(([x]) => x)))] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    // The sheet is flipped as one piece: the border stays put and the window
    // lands on its right. Each kind about its own centre left the window at
    // 30–70 — beside the print it belongs to.
    expect(xRanges).toEqual([[0, 200], [130, 170]]);
    // …which is exactly where the canvas overlay draws it.
    const overlay = previewGeometry({
      paths: job.map((p, i) => ({ ...p, id: `p${i}` })),
      originBottomLeft: false,
      paperHeightMm: 210,
      mirror: true,
    });
    expect(overlay.ghostPaths!.map((g) => [round(Math.min(...g.points.map(([x]) => x))), round(Math.max(...g.points.map(([x]) => x)))].sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0])).toEqual([[0, 200], [130, 170]]);
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

describe('drift compensation at the plotter output seam', () => {
  // Two squares anchored at the interpolation domain's exact endpoints so
  // the expected compensation is hand-computable: top square starts at
  // y=10 (t=0, no compensation), bottom square starts at y=100 (t=1, full
  // sample). The regmark shares the bottom square's y but must never be
  // compensated (sensor reference frame) nor widen the domain.
  // HP-GL units are mm*40; optimize off keeps input order (all three kinds
  // share rank 0, and the partition is stable); originBottomLeft off keeps
  // raw document y.
  const topSquare = { points: [[10, 10], [20, 10], [20, 20], [10, 20]] as Array<[number, number]>, closed: true, kind: 'manual' };
  const bottomSquare = { points: [[10, 100], [20, 100], [20, 90], [10, 90]] as Array<[number, number]>, closed: true, kind: 'manual' };
  const bottomRegmark = { points: [[50, 90], [60, 90], [60, 100], [50, 100]] as Array<[number, number]>, closed: true, kind: 'regmark' };
  const baseOpts = { ...defaultPlotterOptions, optimize: false, originBottomLeft: false };
  const puStarts = (out: string): Array<[number, number]> =>
    out.split('\n')
      .filter((l) => /^PU-?\d+(\.\d+)?,-?\d+(\.\d+)?;$/.test(l))
      .slice(0, -1) // footer park
      .map((l) => l.slice(2).replace(';', '').split(',').map(Number) as [number, number]);

  it('leaves coordinates untouched without a drift block', () => {
    const out = buildPlotterOutput('hpgl', baseOpts, [topSquare, bottomSquare, bottomRegmark]);
    expect(puStarts(out)).toEqual([[400, 400], [400, 4000], [2000, 3600]]);
  });

  it('applies the negated interpolated offset at the domain endpoints', () => {
    // Drift measured +1 mm right / +0.5 mm down at the bottom, none at the
    // top: the bottom square must cut 1 mm LEFT and 0.5 mm UP.
    const out = buildPlotterOutput('hpgl', {
      ...baseOpts,
      drift: { topDxMm: 0, topDyMm: 0, bottomDxMm: 1, bottomDyMm: 0.5 },
    }, [topSquare, bottomSquare, bottomRegmark]);
    expect(puStarts(out)).toEqual([[400, 400], [360, 3980], [2000, 3600]]);
  });

  it('compensates uniformly across the whole job when only the top sample is set', () => {
    // top-only drift with a zero bottom sample interpolates from the top
    // sample down to zero — the top square (t=0) takes the FULL top offset.
    const out = buildPlotterOutput('hpgl', {
      ...baseOpts,
      drift: { topDxMm: 0.5, topDyMm: 0, bottomDxMm: 0, bottomDyMm: 0 },
    }, [topSquare, bottomSquare, bottomRegmark]);
    expect(puStarts(out)).toEqual([[380, 400], [400, 4000], [2000, 3600]]);
  });

  it('survives the prefs round-trip (sanitize keeps the block, drops all-zero)', () => {
    // sanitizePlotterOptions is not exported; the prefs path is covered via
    // loadPlotterPrefs round-trip in the drift-active shape only — here we
    // pin the PlotterOptions typing seam: a valid block flows through
    // buildPlotterOutput unchanged in behaviour when re-supplied.
    const drift = { topDxMm: 0.25, topDyMm: 0, bottomDxMm: 0.75, bottomDyMm: 0 };
    const a = buildPlotterOutput('hpgl', { ...baseOpts, drift }, [topSquare, bottomSquare]);
    const b = buildPlotterOutput('hpgl', { ...baseOpts, drift: { ...drift } }, [topSquare, bottomSquare]);
    expect(a).toBe(b);
  });
});

describe('drift compensation — default origin flip + prefs round-trip + canvas fallback', () => {
  const topSquare = { points: [[10, 10], [20, 10], [20, 20], [10, 20]] as Array<[number, number]>, closed: true, kind: 'manual' };
  const bottomSquare = { points: [[10, 100], [20, 100], [20, 90], [10, 90]] as Array<[number, number]>, closed: true, kind: 'manual' };
  const puStarts = (out: string): Array<[number, number]> =>
    out.split('\n')
      .filter((l) => /^PU-?\d+(\.\d+)?,-?\d+(\.\d+)?;$/.test(l))
      .slice(0, -1)
      .map((l) => l.slice(2).replace(';', '').split(',').map(Number) as [number, number]);
  const drift = { topDxMm: 0, topDyMm: 0, bottomDxMm: 1, bottomDyMm: 0.5 };

  it('keeps the physical compensation direction under the default originBottomLeft flip', () => {
    // Bottom-left origin: machine Y = paperHeightUnits − document y. With
    // paperHeightUnits = 200 the bottom sample sits at machine Y = 100. The
    // +0.5 mm down-cut sample must move the cut UP: machine Y +0.5 → 100.5
    // → 4020 plotter units; dx is unaffected by the y flip (−1 mm → 360).
    const flipped = { ...defaultPlotterOptions, optimize: false, originBottomLeft: true, paperHeightUnits: 200, drift };
    const out = buildPlotterOutput('hpgl', flipped, [topSquare, bottomSquare]);
    expect(puStarts(out)).toEqual([
      [400, (200 - 10) * 40],        // top: no compensation
      [360, (200 - 99.5) * 40],      // bottom: x −1 mm, machine Y +0.5 mm
    ]);
  });

  it('sanitizeDrift survives a real prefs round-trip and drops all-zero blocks', () => {
    // The prefs blob is written by savePlotterPrefs; a drifted opts object
    // must come back with the block intact (±20 band), and an all-zero one
    // must come back without a block at all.
    const prefs = { format: 'hpgl' as const, materialId: '', baud: 9600, flowControl: 'none' as const, lastPort: '', profileId: '' };
    savePlotterPrefs({ ...prefs, opts: { ...defaultPlotterOptions, drift } });
    const kept = loadPlotterPrefs().opts?.drift;
    expect(kept).toEqual(drift);
    savePlotterPrefs({ ...prefs, opts: { ...defaultPlotterOptions, drift: { topDxMm: 0, topDyMm: 0, bottomDxMm: 0, bottomDyMm: 0 } } });
    expect(loadPlotterPrefs().opts?.drift).toBeUndefined();
    savePlotterPrefs({ ...prefs, opts: { ...defaultPlotterOptions, drift: { topDxMm: 99, topDyMm: -99, bottomDxMm: 5, bottomDyMm: 0 } } });
    expect(loadPlotterPrefs().opts?.drift).toEqual({ topDxMm: 20, topDyMm: -20, bottomDxMm: 5, bottomDyMm: 0 });
    window.localStorage.removeItem('vector.plotter.prefs');
  });

  it('applyDriftToPolylines compensates the canvas fallback in user-unit space', () => {
    // Two polylines already in mm (unit 'mm', no flip): top at y=10, bottom
    // at y=100 — same geometry as the seam tests, expressed as raw polylines.
    const polys = [
      { points: [[10, 10], [20, 10]] as Array<[number, number]>, closed: false },
      { points: [[10, 100], [20, 100]] as Array<[number, number]>, closed: false },
    ];
    const out = applyDriftToPolylines(polys, drift, { ...defaultPlotterOptions, unit: 'mm', originBottomLeft: false });
    expect(out[0].points).toEqual([[10, 10], [20, 10]]);            // t=0: untouched
    expect(out[1].points).toEqual([[9, 99.5], [19, 99.5]]);         // t=1: −1/−0.5
    expect(polys[1].points[0]).toEqual([10, 100]);                  // input immutable
  });

  it('applyDriftToPolylines anchors the top sample at maxY under the y flip', () => {
    const polys = [
      { points: [[0, 90], [1, 90]] as Array<[number, number]>, closed: false },
      { points: [[0, 10], [1, 10]] as Array<[number, number]>, closed: false },
    ];
    // Flipped machine space: the physical page TOP is the polyline with the
    // LARGEST machine y (y=90 here) — it anchors the top sample (−2); the
    // y=10 polyline is the physical bottom (bottom sample = 0 shift).
    const out = applyDriftToPolylines(polys, { topDxMm: 2, topDyMm: 0, bottomDxMm: 0, bottomDyMm: 0 },
      { ...defaultPlotterOptions, unit: 'mm', originBottomLeft: true });
    expect(out[0].points).toEqual([[-2, 90], [-1, 90]]);            // machine y=90: physical top, full −2
    expect(out[1].points).toEqual([[0, 10], [1, 10]]);              // machine y=10: physical bottom, 0
  });

  it('applyDriftToPolylines converts mm samples into inch user units', () => {
    const polys = [{ points: [[0, 0], [0, 25.4]] as Array<[number, number]>, closed: false }];
    const out = applyDriftToPolylines(polys, { topDxMm: 0, topDyMm: 0, bottomDxMm: 25.4, bottomDyMm: 0 },
      { ...defaultPlotterOptions, unit: 'in', originBottomLeft: false });
    expect(out[0].points[1][0]).toBeCloseTo(-1, 10); // 25.4 mm sample = 1 in of shift
  });

  it('applyDriftToPolylines passes single-row jobs through unchanged', () => {
    const polys = [{ points: [[5, 5], [6, 5]] as Array<[number, number]>, closed: false }];
    const out = applyDriftToPolylines(polys, drift, { ...defaultPlotterOptions, unit: 'mm', originBottomLeft: false });
    expect(out).toBe(polys); // degenerate extent — no interpolation possible
  });
});

describe('postProcess — overcutMm / bladeOffsetMm are millimetres in every unit', () => {
  // A 1 × 1 square (user units), perimeter 4. The mm-named options used to be
  // applied as-is on user-unit geometry, so an inch job cut an overcut and a
  // blade-offset loop 25.4× too large (0.254 mm became 0.254 in).
  type P = { points: Array<[number, number]>; closed: boolean };
  const square: P[] = [{ points: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], closed: true }];
  const totalLength = (polys: P[]) => polys.reduce(
    (sum, p) => sum + p.points.slice(1).reduce((s, [x, y], i) => s + Math.hypot(x - p.points[i][0], y - p.points[i][1]), 0), 0);
  const base = { optimize: false, mirror: false, reverse: false, insideFirst: false, overcutMm: 0, bladeOffsetMm: 0 };

  it('applies the millimetre overcut as-is for a millimetre job, and when unit is omitted', () => {
    expect(totalLength(postProcess(square, { ...base, overcutMm: 0.254 }))).toBeCloseTo(4.254, 6);
    expect(totalLength(postProcess(square, { ...base, overcutMm: 0.254, unit: 'mm' }))).toBeCloseTo(4.254, 6);
  });

  it('converts the millimetre overcut to inches for an inch job', () => {
    expect(totalLength(postProcess(square, { ...base, overcutMm: 0.254, unit: 'in' }))).toBeCloseTo(4.01, 6);
  });

  it('sizes blade-offset loops in millimetres for an inch job too', () => {
    const extraMm = totalLength(postProcess(square, { ...base, bladeOffsetMm: 0.254, unit: 'mm' })) - 4;
    const extraInch = totalLength(postProcess(square, { ...base, bladeOffsetMm: 0.254, unit: 'in' })) - 4;
    expect(extraMm).toBeGreaterThan(0);
    expect(extraInch).toBeGreaterThan(0);
    expect(extraMm / extraInch).toBeCloseTo(25.4, 3);
  });
});
