import { describe, it, expect, beforeAll } from 'vitest';
import {
  svgToPolylines,
  generateGCode,
  generateHPGL,
  defaultPlotterOptions,
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
