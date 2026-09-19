/**
 * PDF import tests — pure helpers from src/lib/pdfImporter.ts. pdf.js
 * itself is only loaded inside `importPdf` (lazy dynamic import), so these
 * tests exercise the transform / colour / operator-walk math without the
 * library, using a hand-built mini operator list + a fake OPS map with
 * arbitrary (but internally consistent) numeric codes.
 */
import { describe, expect, it } from 'vitest';
import {
  matMul, applyMat, cmykToRgb, rgbToCss, grayToCss,
  opListToPathElements, buildSvgFromPages, escapeXmlAttr,
  type Mat, type PdfOpsMap, type PdfPathElement,
} from '../pdfImporter';

/** Fake OPS table — values are arbitrary; only self-consistency matters. */
const OPS: PdfOpsMap = {
  save: 1, restore: 2, transform: 3,
  constructPath: 4,
  rectangle: 100, moveTo: 101, lineTo: 102,
  curveTo: 103, curveTo2: 104, curveTo3: 105, closePath: 106,
  setFillRGBColor: 5, setStrokeRGBColor: 6,
  setFillCMYKColor: 7, setStrokeCMYKColor: 8,
  setFillGray: 9, setStrokeGray: 10,
  setLineWidth: 11,
  fill: 12, eoFill: 13, stroke: 14, closeStroke: 15,
  fillStroke: 16, eoFillStroke: 17, closeFillStroke: 18, closeEOFillStroke: 19,
  endPath: 20,
  showText: 21, showSpacedText: 22,
};

describe('affine helpers', () => {
  it('composes matrices with apply-n-first semantics (PDF cm)', () => {
    const scale: Mat = [2, 0, 0, 2, 0, 0];
    const translate: Mat = [1, 0, 0, 1, 10, 20];
    // translate ∘ scale: scale first, then translate → (1,1) → (2,2) → (12,22).
    const m = matMul(translate, scale);
    expect(applyMat(m, 1, 1)).toEqual([12, 22]);
    // scale ∘ translate: translate first, then scale → (11,21) → (22,42).
    const m2 = matMul(scale, translate);
    expect(applyMat(m2, 1, 1)).toEqual([22, 42]);
  });

  it('identity leaves points untouched', () => {
    expect(applyMat([1, 0, 0, 1, 0, 0], 3.5, -7)).toEqual([3.5, -7]);
  });

  it('cm-matrix composition chains through the operator walk', () => {
    // 90° rotation via PDF cm [0 1 -1 0 0 0]: (x,y) → (−y, x).
    const rot: Mat = [0, 1, -1, 0, 0, 0];
    expect(applyMat(rot, 5, 0)).toEqual([0, 5]);
  });
});

describe('colour mapping', () => {
  it('cmykToRgb converts with the naive (1-c)(1-k) formula', () => {
    expect(cmykToRgb(0, 0, 0, 0)).toEqual([255, 255, 255]);
    expect(cmykToRgb(0, 0, 0, 1)).toEqual([0, 0, 0]);
    expect(cmykToRgb(1, 0, 0, 0)).toEqual([0, 255, 255]);
    // Full magenta halved by 50% black → 128/0/128.
    expect(cmykToRgb(0, 1, 0, 0.5)).toEqual([128, 0, 128]);
  });

  it('rgbToCss clamps and formats to hex', () => {
    expect(rgbToCss(0, 0, 0)).toBe('#000000');
    expect(rgbToCss(1, 1, 1)).toBe('#ffffff');
    expect(rgbToCss(0.5, 0.5, 0.5)).toBe('#808080');
    // Out-of-range components clamp; 0.1 → 25.5 → 26 = 0x1a.
    expect(rgbToCss(2, -1, 0.1)).toBe('#ff001a');
  });

  it('grayToCss maps additive gray', () => {
    expect(grayToCss(0)).toBe('#000000');
    expect(grayToCss(1)).toBe('#ffffff');
  });
});

describe('opListToPathElements — hand-built operator list', () => {
  it('converts a rectangle under a scale transform with fill colour', () => {
    const fn = [OPS.setFillRGBColor, OPS.transform, OPS.constructPath, OPS.fill];
    const args: unknown[][] = [
      [1, 0, 0],                              // fill red
      [2, 0, 0, 2, 10, 10],                   // cm: scale 2 then translate 10
      [[OPS.rectangle], [0, 0, 5, 4]],        // 5×4 rect at origin (user space)
      [],
    ];
    const { elements, textRuns } = opListToPathElements(fn, args, OPS);
    expect(textRuns).toBe(0);
    expect(elements).toHaveLength(1);
    const el = elements[0];
    // Corners map to (10,10)-(20,10)-(20,18)-(10,18) in page space.
    expect(el.d).toContain('M10 10');
    expect(el.d).toContain('L20 10');
    expect(el.d).toContain('L20 18');
    expect(el.d).toContain('L10 18');
    expect(el.d).toContain('Z');
    expect(el.fill).toBe('#ff0000');
    expect(el.stroke).toBe('none');
    expect(el.fillRule).toBe('nonzero');
  });

  it('applies evenodd for eoFill and keeps stroke info for fillStroke', () => {
    const fn = [
      OPS.setLineWidth, OPS.setStrokeRGBColor,
      OPS.constructPath, OPS.eoFill,
      OPS.constructPath, OPS.fillStroke,
    ];
    const args: unknown[][] = [
      [0.5], [0, 0, 1],
      [[OPS.moveTo, OPS.lineTo, OPS.lineTo, OPS.closePath], [0, 0, 9, 0, 9, 9]],
      [],
      [[OPS.moveTo, OPS.lineTo, OPS.lineTo, OPS.closePath], [0, 0, 1, 0, 1, 1]],
      [],
    ];
    const { elements } = opListToPathElements(fn, args, OPS);
    expect(elements).toHaveLength(2);
    expect(elements[0].fillRule).toBe('evenodd');
    expect(elements[1].fillRule).toBe('nonzero');
    expect(elements[1].stroke).toBe('#0000ff');
    expect(elements[1].strokeWidth).toBe(0.5);
  });

  it('save/restore pops the colour + CTM state (q/Q)', () => {
    const fn = [
      OPS.save,
      OPS.setFillRGBColor, OPS.transform,
      OPS.constructPath, OPS.fill,
      OPS.restore,
      OPS.constructPath, OPS.fill,
    ];
    const args: unknown[][] = [
      [],
      [0, 1, 0],
      [1, 0, 0, 1, 100, 0],
      [[OPS.moveTo, OPS.lineTo], [0, 0, 1, 1]],
      [],
      [],
      [[OPS.moveTo, OPS.lineTo], [0, 0, 1, 1]],
      [],
    ];
    const { elements } = opListToPathElements(fn, args, OPS);
    expect(elements).toHaveLength(2);
    expect(elements[0].fill).toBe('#00ff00');
    expect(elements[0].d).toContain('M100 0');
    // After restore: default black fill + identity transform.
    expect(elements[1].fill).toBe('#000000');
    expect(elements[1].d).toContain('M0 0');
  });

  it('converts CMYK + gray colour operators', () => {
    const fn = [OPS.setFillCMYKColor, OPS.setStrokeCMYKColor, OPS.setFillGray, OPS.setStrokeGray];
    const args: unknown[][] = [[0, 1, 1, 0], [1, 0, 0, 0], [0.5], [0.2]];
    // No painting — just verify no crash; colours verified via a painted path next.
    const { elements } = opListToPathElements(fn, args, OPS);
    expect(elements).toHaveLength(0);

    const fn2 = [OPS.setFillCMYKColor, OPS.constructPath, OPS.fill, OPS.setFillGray, OPS.constructPath, OPS.fill];
    const args2: unknown[][] = [
      [1, 0, 0, 0],
      [[OPS.rectangle], [0, 0, 1, 1]], [],
      [0.5],
      [[OPS.rectangle], [0, 0, 1, 1]], [],
    ];
    const res2 = opListToPathElements(fn2, args2, OPS);
    expect(res2.elements[0].fill).toBe('#00ffff'); // cyan = (1,0,0,0)
    expect(res2.elements[1].fill).toBe('#808080'); // 50% gray
  });

  it('emits C segments for curveTo / curveTo2 / curveTo3', () => {
    const fn = [
      OPS.constructPath,
      OPS.constructPath,
      OPS.constructPath,
      OPS.stroke,
    ];
    const args: unknown[][] = [
      [[OPS.moveTo, OPS.curveTo], [0, 0, 1, 1, 2, 1, 3, 0]],
      [[OPS.moveTo, OPS.curveTo2], [10, 10, 11, 11, 12, 10]],
      [[OPS.moveTo, OPS.curveTo3], [20, 10, 21, 11, 22, 10]],
      [],
    ];
    const { elements } = opListToPathElements(fn, args, OPS);
    expect(elements).toHaveLength(1);
    const cs = elements[0].d.match(/C[-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+/g) ?? [];
    expect(cs).toHaveLength(3);
    // curveTo2: first control mirrors the current point (10,10).
    expect(elements[0].d).toContain('C10 10');
    // curveTo3: second control equals the endpoint (22,10).
    expect(cs[2]).toBe('C21 11 22 10 22 10');
  });

  it('counts showText/showSpacedText runs and discards endPath geometry', () => {
    const fn = [
      OPS.constructPath, OPS.endPath,
      OPS.showText, OPS.showSpacedText, OPS.showText,
    ];
    const args: unknown[][] = [
      [[OPS.rectangle], [0, 0, 5, 5]],
      [],
      [['a']], [['b']], [['c']],
    ];
    const { elements, textRuns } = opListToPathElements(fn, args, OPS);
    expect(textRuns).toBe(3);
    expect(elements).toHaveLength(0);
  });

  it('applies the base viewport matrix (y-down page transform)', () => {
    // Typical pdf.js viewport.transform for an unrotated page at scale 1:
    // [1, 0, 0, -1, 0, pageHeight] — flips PDF's y-up to canvas y-down.
    const base: Mat = [1, 0, 0, -1, 0, 200];
    const { elements } = opListToPathElements(
      [OPS.constructPath, OPS.fill],
      [[[OPS.moveTo, OPS.lineTo], [10, 10, 10, 20]], []],
      OPS,
      base,
    );
    expect(elements[0].d).toBe('M10 190L10 180');
  });

  it('stops cleanly on an unknown path op inside constructPath', () => {
    const fn = [OPS.constructPath, OPS.fill];
    const args: unknown[][] = [
      [[999, OPS.lineTo], [1, 1, 2, 2]],
      [],
    ];
    const { elements } = opListToPathElements(fn, args, OPS);
    // Unknown op halts the walk — nothing painted from misaligned coords.
    expect(elements).toHaveLength(0);
  });
});

describe('buildSvgFromPages', () => {
  const el = (d: string): PdfPathElement => ({ d, fill: '#123456', stroke: 'none', strokeWidth: 0, fillRule: 'nonzero' });

  it('stacks pages vertically with the gap and tags page groups', () => {
    const svg = buildSvgFromPages([
      { elements: [el('M0 0L1 1')], width: 100, height: 50 },
      { elements: [el('M0 0L1 1')], width: 80, height: 30 },
    ]);
    expect(svg).toContain('viewBox="0 0 100 128"'); // 50 + 48 gap + 30
    expect(svg).toContain('data-pdf-page="1"');
    expect(svg).toContain('data-pdf-page="2"');
    expect(svg).toContain('translate(0 98)'); // 50 + 48
    expect(svg).toContain('<rect');
  });

  it('escapes attribute-hostile characters in path data', () => {
    // d strings are numeric in practice, but the escaper guards the assembly.
    expect(escapeXmlAttr('a"b<c>&d')).toBe('a&quot;b&lt;c&gt;&amp;d');
  });
});
