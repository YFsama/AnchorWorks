/**
 * Glyph-level Text→Outlines tests (slice 1).
 *
 * Fixture: Gruppo-Regular.ttf — SIL Open Font License 1.1 (see
 * fixtures/Gruppo-OFL.txt, copied from google/fonts/ofl/gruppo; upstream
 * https://github.com/googlefonts/GruppoFont, Copyright 2010 The Gruppo Project
 * Authors). TTF, unitsPerEm 2048, capHeight 1114, quadratic TrueType outlines
 * covering A–Z 0–9 — small, license-clean, and curved (unlike pixel fonts).
 *
 * Strategy: jsdom cannot rasterise, so fabric's measuring context is stubbed
 * the repo-standard way (printMarks pattern, `measureText = 40px/char` —
 * deterministic, kerning-free). Glyph-geometry assertions use fontkit's exact
 * per-glyph bboxes as an INDEPENDENT oracle; layout assertions (pen advances,
 * alignment, line pitch) derive expected values from fabric's own caches and
 * assert ratios or cache-exact offsets so they stay robust to fabric's
 * rounding. Gruppo 'A' has its extremes ON-curve (y ∈ [−10, 1114] == bbox), so
 * on-curve-point assertions are exact, and two contours (outline + counter).
 *
 * The equivalence contract (outline ink bbox ≤1 css px from a real browser
 * render) is a live-browser property — it holds here by construction because
 * glyphOutline replays the same caches + object matrix the canvas render
 * consumes.
 */
import * as fabric from 'fabric';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create, type Font } from 'fontkit';
import * as canvasEngine from '../canvasEngine';
import * as cutContour from '../cutContour';
import { createOutlinesFromText } from '../textToOutline';
import { glyphOutlinePath } from '../glyphOutline';
import {
  clearFontBytes,
  registerFontBytes,
  resolveFontBytes,
  sniffFontFaceStyle,
} from '../fontBytes';
import { loadCustomFontFile } from '../fonts';

// jsdom rewrites import.meta.url to a page URL, so resolve from the project
// root vitest runs in instead.
const FIXTURE = resolve(process.cwd(), 'src/lib/__tests__/fixtures/Gruppo-Regular.ttf');
const fontBuffer = readFileSync(FIXTURE); // Node Buffer
const fontArrayBuffer = fontBuffer.buffer.slice(
  fontBuffer.byteOffset,
  fontBuffer.byteOffset + fontBuffer.byteLength,
) as ArrayBuffer;
const parsedFont = create(fontBuffer as unknown as Parameters<typeof create>[0]);
const font: Font = 'fonts' in parsedFont ? parsedFont.fonts[0] : parsedFont;

/* ------------------------------- d-string tools ------------------------------ */

interface ParsedContour {
  /** On-curve points only: the M, every L, and each C's endpoint. */
  onCurve: Array<[number, number]>;
}

/** Parse the M/L/C/Z grammar glyphOutline emits (it is the only producer). */
function parseD(d: string): ParsedContour[] {
  const contours: ParsedContour[] = [];
  for (const seg of d.split('M').slice(1)) {
    const onCurve: Array<[number, number]> = [];
    const head = seg.match(/^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/);
    if (head) onCurve.push([Number(head[1]), Number(head[2])]);
    const cmds = seg.match(/(?:L|C)\s*(-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?)*)/g) ?? [];
    for (const cmd of cmds) {
      const nums = (cmd.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const kind = cmd.trim()[0];
      const pairCount = kind === 'C' ? 3 : 1;
      onCurve.push([nums[(pairCount - 1) * 2], nums[(pairCount - 1) * 2 + 1]]);
    }
    contours.push({ onCurve });
  }
  return contours;
}

const onCurve = (d: string) => parseD(d).flatMap((c) => c.onCurve);
const ys = (pts: Array<[number, number]>) => pts.map(([, y]) => y);

/* ------------------------------- jsdom plumbing ------------------------------ */

/** Repo-standard jsdom 2D-context stub (printMarks/textToOutline pattern). */
function stubCtx() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: 40 * text.length }),
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    transform: vi.fn(), setTransform: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    bezierCurveTo: vi.fn(), quadraticCurveTo: vi.fn(), clearRect: vi.fn(),
    fillRect: vi.fn(), strokeRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(255),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
    canvas: document.createElement('canvas'),
  } as unknown as CanvasRenderingContext2D);
}

beforeEach(() => {
  clearFontBytes();
  stubCtx();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearFontBytes();
});

/**
 * Baseline of line i in the text object's local space — fabric's render
 * semantics, read back from the object's own caches (independent of the
 * pipeline's internals only insofar as both must agree with fabric's source).
 */
function expectedBaseline(t: fabric.Text, i: number): number {
  let top = -t.height / 2;
  for (let j = 0; j < i; j++) top += (t.__lineHeights[j] ?? t.fontSize * 1.13) * t.lineHeight;
  return top + (t.__lineHeights[i] ?? t.fontSize * 1.13) * (1 - t._fontSizeFraction);
}

/* ------------------------------- fontkit facts ------------------------------- */

describe('fixture font', () => {
  it('is Gruppo Regular with the pinned metrics the goldens below rely on', () => {
    expect(font.postscriptName).toBe('Gruppo-Regular');
    expect(font.unitsPerEm).toBe(2048);
    expect(font.capHeight).toBeCloseTo(1114, 6);
    expect(font.hasGlyphForCodePoint('A'.codePointAt(0) ?? 0)).toBe(true);
  });
});

/* ------------------------------ glyphOutlinePath ----------------------------- */

describe('glyphOutlinePath', () => {
  it('emits real curves: closed contours and C commands (never pure L)', () => {
    const d = glyphOutlinePath(font, new fabric.IText('A', { fontSize: 100 }));
    expect(d).toBeTruthy();
    const contours = parseD(d ?? '');
    expect(contours.length).toBe(2); // pinned: outer outline + triangular counter
    expect(d).toMatch(/C/); // the raster-trace pipeline could only emit L
    expect(d).toMatch(/Z/); // closed
  });

  it('maps font units through fontSize/unitsPerEm exactly (independent bbox oracle)', () => {
    const fontSize = 100;
    const t = new fabric.IText('A', { fontSize });
    const d = glyphOutlinePath(font, t);
    expect(d).toBeTruthy();
    const g = font.glyphForCodePoint('A'.codePointAt(0) ?? 0);
    const s = fontSize / font.unitsPerEm;
    const y = ys(onCurve(d ?? ''));
    const baseline = expectedBaseline(t, 0);
    // y-UP font space onto y-DOWN local space: extremes are ON-curve in Gruppo's 'A'.
    expect(Math.max(...y)).toBeCloseTo(baseline - g.bbox.minY * s, 1); // overshoot below baseline
    expect(Math.min(...y)).toBeCloseTo(baseline - g.bbox.maxY * s, 1); // cap line above
    // ink height ≡ glyph bbox height scaled; within 2% of the font cap-height
    // ratio ('A' overshoots the baseline by 10/2048 em — the 2% covers it).
    const ink = Math.max(...y) - Math.min(...y);
    expect(Math.abs(ink / fontSize - g.bbox.height / font.unitsPerEm)).toBeLessThan(0.001);
    expect(Math.abs(ink / fontSize - font.capHeight / font.unitsPerEm)).toBeLessThan(0.02);
  });

  it('flips y: the cap line lands ABOVE the baseline, the overshoot below', () => {
    const t = new fabric.IText('A', { fontSize: 100 });
    const y = ys(onCurve(glyphOutlinePath(font, t) ?? ''));
    const baseline = expectedBaseline(t, 0);
    expect(Math.min(...y)).toBeLessThan(baseline); // up
    expect(Math.max(...y)).toBeGreaterThan(baseline); // down
  });

  it('advances by fabric kernedWidth: equal graphemes stay equally spaced', () => {
    const t = new fabric.IText('AAA', { fontSize: 100 });
    const d = glyphOutlinePath(font, t);
    expect(d).toBeTruthy();
    const starts = parseD(d ?? '').map((c) => c.onCurve[0]);
    expect(starts.length).toBe(6); // 2 contours × 3 glyphs
    // One stub advance: measureText 40px at fabric's CACHE_FONT_SIZE (400),
    // scaled to fontSize → 40 · 100/400 = 10 per grapheme.
    const advance = 40 * (100 / t.CACHE_FONT_SIZE);
    // Glyph-to-glyph pen deltas (contour-0 start of each 'A'):
    expect(starts[2][0] - starts[0][0]).toBeCloseTo(advance, 1);
    expect(starts[4][0] - starts[2][0]).toBeCloseTo(advance, 1);
    expect(starts[4][0] - starts[0][0]).toBeCloseTo(2 * advance, 1);
    // …and they equal __charBounds' own pen model (box.left deltas).
    const boxes = t.__charBounds[0];
    expect(starts[2][0] - starts[0][0]).toBeCloseTo(boxes[1].left - boxes[0].left, 1);
  });

  it('honors charSpacing: the pen gap grows by fontSize·charSpacing/1000', () => {
    const plain = new fabric.IText('AA', { fontSize: 100 });
    const spaced = new fabric.IText('AA', { fontSize: 100, charSpacing: 200 });
    const d0 = glyphOutlinePath(font, plain);
    const d1 = glyphOutlinePath(font, spaced);
    expect(d0).toBeTruthy();
    expect(d1).toBeTruthy();
    const gap = (d: string) => {
      const starts = parseD(d).map((c) => c.onCurve[0]);
      return starts[2][0] - starts[0][0];
    };
    // stub advance + spacing 100·200/1000 = 20 → gap grows by exactly 20.
    expect(gap(d1 ?? '')).toBeCloseTo(gap(d0 ?? '') + 20, 1);
  });

  it('pitches lines by implHeight·lineHeight and maps every baseline exactly', () => {
    const one = new fabric.IText('A\nA', { fontSize: 100, lineHeight: 1 });
    const three = new fabric.IText('A\nA', { fontSize: 100, lineHeight: 3 });
    const d1 = glyphOutlinePath(font, one);
    const d3 = glyphOutlinePath(font, three);
    expect(d1).toBeTruthy();
    expect(d3).toBeTruthy();
    const s = 100 / font.unitsPerEm;
    const capTop = (t: fabric.Text, line: number) => expectedBaseline(t, line) - font.capHeight * s;
    // Line-2 cap top minus line-1 cap top = one impl pitch × lineHeight; the
    // pitch scales by 3 between the two objects (on-curve min of each half).
    const split = (d: string) => {
      const y = ys(onCurve(d)).sort((a, b) => a - b);
      return { upper: y.slice(0, y.length / 2), lower: y.slice(y.length / 2) };
    };
    const a = split(d1 ?? '');
    const b = split(d3 ?? '');
    expect(Math.min(...b.lower) - Math.min(...b.upper)).toBeCloseTo(
      3 * (Math.min(...a.lower) - Math.min(...a.upper)),
      0,
    );
    // And the first line's cap line sits exactly where the render baseline
    // formula says it must (independent oracle: font.capHeight).
    expect(Math.min(...a.upper)).toBeCloseTo(capTop(one, 0), 1);
  });

  it('shifts pen start by _getLineLeftOffset for center/right alignment', () => {
    const mk = (align: 'left' | 'center' | 'right') =>
      new fabric.Textbox('AA', { fontSize: 100, width: 200, textAlign: align }) as unknown as fabric.Text;
    const dl = glyphOutlinePath(font, mk('left'));
    const dc = glyphOutlinePath(font, mk('center'));
    const dr = glyphOutlinePath(font, mk('right'));
    expect(dl).toBeTruthy();
    expect(dc).toBeTruthy();
    expect(dr).toBeTruthy();
    const x0 = (d: string) => parseD(d)[0].onCurve[0][0];
    // Line width from the stub: 2 graphemes × (40 · 100/CACHE_FONT_SIZE) = 20.
    const lineWidth = 2 * 40 * (100 / (mk("left") as fabric.Text).CACHE_FONT_SIZE);
    expect(x0(dc ?? '') - x0(dl ?? '')).toBeCloseTo((200 - lineWidth) / 2, 1);
    expect(x0(dr ?? '') - x0(dl ?? '')).toBeCloseTo(200 - lineWidth, 1);
  });

  it('applies the optional output affine (translate/scale) to every point', () => {
    const t = new fabric.IText('A', { fontSize: 100 });
    const plain = onCurve(glyphOutlinePath(font, t) ?? '');
    const moved = onCurve(glyphOutlinePath(font, t, [1, 0, 0, 1, 50, 25]) ?? '');
    const scaled = onCurve(glyphOutlinePath(font, t, [2, 0, 0, 2, 0, 0]) ?? '');
    expect(moved.length).toBe(plain.length);
    for (let i = 0; i < plain.length; i++) {
      expect(moved[i][0]).toBeCloseTo(plain[i][0] + 50, 1);
      expect(moved[i][1]).toBeCloseTo(plain[i][1] + 25, 1);
      expect(scaled[i][0]).toBeCloseTo(plain[i][0] * 2, 1);
      expect(scaled[i][1]).toBeCloseTo(plain[i][1] * 2, 1);
    }
  });

  it('returns null for layout it cannot replay: justify, char styles, tofu, empty', () => {
    expect(glyphOutlinePath(font, new fabric.IText('A', { textAlign: 'justify' }))).toBeNull();
    const styled = new fabric.IText('A', { fontSize: 100 });
    styled.styles = { 0: { 0: { fontSize: 50 } } }; // per-character style
    expect(glyphOutlinePath(font, styled)).toBeNull();
    expect(glyphOutlinePath(font, new fabric.IText('\u4e2d', { fontSize: 100 }))).toBeNull(); // no CJK glyph in Gruppo
    expect(glyphOutlinePath(font, new fabric.IText('', { fontSize: 100 }))).toBeNull(); // no ink
    expect(glyphOutlinePath(font, new fabric.IText(' ', { fontSize: 100 }))).toBeNull(); // whitespace-only
  });
});

/* --------------------------------- fontBytes --------------------------------- */

/** Minimal sfnt with an OS/2 (usWeightClass) and head (macStyle) to sniff. */
function synthSfnt(weight: number, italic: boolean): ArrayBuffer {
  const os2Off = 12 + 2 * 16;
  const headOff = os2Off + 8;
  const buf = new ArrayBuffer(headOff + 46);
  const v = new DataView(buf);
  v.setUint32(0, 0x00010000); // sfntVersion 1.0
  v.setUint16(4, 2); // numTables
  const entry = (i: number, tag: string, off: number, len: number) => {
    const e = 12 + i * 16;
    for (let k = 0; k < 4; k++) v.setUint8(e + k, tag.charCodeAt(k));
    v.setUint32(e + 4, 0); // checksum
    v.setUint32(e + 8, off);
    v.setUint32(e + 12, len);
  };
  entry(0, 'OS/2', os2Off, 8);
  entry(1, 'head', headOff, 46);
  v.setUint16(os2Off + 4, weight); // usWeightClass
  v.setUint16(headOff + 44, italic ? 0b10 : 0); // macStyle italic bit
  return buf;
}

/** A woff1 whose OS/2 is (claimed) zlib-compressed — the sniffer must give up. */
function synthWoffCompressedOs2(): ArrayBuffer {
  const buf = new ArrayBuffer(44 + 20 + 8);
  const v = new DataView(buf);
  v.setUint32(0, 0x774f4646); // 'wOFF'
  v.setUint16(12, 1); // numTables
  const e = 44;
  'OS/2'.split('').forEach((c, k) => v.setUint8(e + k, c.charCodeAt(0)));
  v.setUint32(e + 4, 64); // offset
  v.setUint32(e + 8, 1); // compLength ≠ origLength → compressed
  v.setUint32(e + 12, 8); // origLength
  return buf;
}

describe('sniffFontFaceStyle / resolveFontBytes', () => {
  it('reads the true face of a real TTF (Gruppo: 400, upright)', () => {
    expect(sniffFontFaceStyle(fontArrayBuffer)).toEqual({ weight: 400, italic: false });
  });

  it('serves regular requests and refuses faux bold/italic on a 400 upright face', async () => {
    registerFontBytes('Gruppo-Test', fontArrayBuffer);
    await expect(resolveFontBytes('Gruppo-Test', 'normal', false)).resolves.toBe(fontArrayBuffer);
    await expect(resolveFontBytes('Gruppo-Test', 400, false)).resolves.toBe(fontArrayBuffer);
    await expect(resolveFontBytes('Gruppo-Test', 'bold', false)).resolves.toBe(null);
    await expect(resolveFontBytes('Gruppo-Test', 700, false)).resolves.toBe(null);
    await expect(resolveFontBytes('Gruppo-Test', 'normal', true)).resolves.toBe(null);
  });

  it('resolves a true bold-italic face when that is what was uploaded', async () => {
    registerFontBytes('Synth', synthSfnt(700, true));
    await expect(resolveFontBytes('Synth', 'bold', true)).resolves.toBeTruthy();
    await expect(resolveFontBytes('Synth', 'normal', false)).resolves.toBeTruthy(); // natural face, no synthesis
  });

  it('returns null for families never uploaded (system and Google fonts)', async () => {
    await expect(resolveFontBytes('Arial', 'normal', false)).resolves.toBe(null);
    await expect(resolveFontBytes('Roboto, sans-serif', 400, false)).resolves.toBe(null);
    await expect(resolveFontBytes('Gruppo-Test', 'normal', false)).resolves.toBe(null); // nothing registered at all
  });

  it('treats woff2 / compressed-woff metadata as unknown: regular ok, styled falls back', async () => {
    const woff2 = new ArrayBuffer(16);
    new DataView(woff2).setUint32(0, 0x774f4632); // 'wOF2'
    expect(sniffFontFaceStyle(woff2)).toEqual({ weight: null, italic: null });
    registerFontBytes('W2', woff2);
    await expect(resolveFontBytes('W2', 'normal', false)).resolves.toBeTruthy();
    await expect(resolveFontBytes('W2', 'bold', false)).resolves.toBe(null);
    await expect(resolveFontBytes('W2', 'normal', true)).resolves.toBe(null);

    expect(sniffFontFaceStyle(synthWoffCompressedOs2()).weight).toBeNull();
  });

  it('keeps the LAST upload of a duplicate family authoritative (FontFace order)', async () => {
    registerFontBytes('Dup', synthSfnt(400, false));
    registerFontBytes('Dup', synthSfnt(700, false));
    await expect(resolveFontBytes('Dup', 'bold', false)).resolves.toBeTruthy();
  });
});

/* ------------------------- textToOutline orchestration ------------------------ */

describe('createOutlinesFromText routing (glyph pipeline vs raster trace)', () => {
  function makeCanvas(active: fabric.FabricObject[]) {
    const c = {
      getObjects: () => active,
      getActiveObjects: () => active,
      remove: vi.fn(),
      add: vi.fn(),
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

  it('uses real glyph outlines when uploaded bytes resolve', async () => {
    registerFontBytes('Gruppo-Test', fontArrayBuffer);
    const t = new fabric.IText('A', {
      left: 37.8, top: 18.9, fontSize: 100, fill: '#123456', fontFamily: 'Gruppo-Test',
    });
    const { c } = makeCanvas([t]);
    const trace = vi.spyOn(cutContour, 'traceBitmap');
    await expect(createOutlinesFromText()).resolves.toBe(true);
    expect(trace).not.toHaveBeenCalled(); // vector pipeline ran — no raster
    const path = (c.add as ReturnType<typeof vi.fn>).mock.calls[0][0] as fabric.Path;
    const hasC = (path.path as unknown as Array<[string]>).some(([k]) => k === 'C');
    expect(hasC).toBe(true); // beziers, not traced polylines
    expect(path.fill).toBe('#123456');
    expect(path.fillRule).toBe('evenodd');
  });

  it('falls back to the raster trace for every fallback-matrix branch', async () => {
    const cases: Array<[string, fabric.IText]> = [
      ['faux bold (regular face uploaded)', new fabric.IText('A', { fontFamily: 'Gruppo-Test', fontWeight: 'bold' })],
      ['faux italic', new fabric.IText('A', { fontFamily: 'Gruppo-Test', fontStyle: 'italic' })],
      ['underline', new fabric.IText('A', { fontFamily: 'Gruppo-Test', underline: true })],
      ['justify', new fabric.IText('A', { fontFamily: 'Gruppo-Test', textAlign: 'justify' })],
      ['text-on-path', (() => {
        const t = new fabric.IText('A', { fontFamily: 'Gruppo-Test' });
        return Object.assign(t, { path: new fabric.Path('M0 0 L100 0') } as unknown as Partial<fabric.IText>);
      })()],
      ['unregistered family (system/Google font)', new fabric.IText('A', { fontFamily: 'Times New Roman' })],
    ];
    for (const [name, text] of cases) {
      clearFontBytes();
      registerFontBytes('Gruppo-Test', fontArrayBuffer); // 400 upright — faux territory for bold/italic
      makeCanvas([text]);
      const trace = vi.spyOn(cutContour, 'traceBitmap');
      await expect(createOutlinesFromText(), name).resolves.toBe(true);
      expect(trace, name).toHaveBeenCalled();
      vi.restoreAllMocks();
      stubCtx(); // restore what restoreAllMocks tore down for the next iteration
    }
  });
});

/* ------------------------------ fonts.ts wiring ------------------------------ */

describe('loadCustomFontFile keeps the bytes', () => {
  it('registers the ArrayBuffer under the uploaded family', async () => {
    const seen: unknown[] = [];
    vi.stubGlobal('FontFace', class {
      family: string;
      src: unknown;
      constructor(family: string, src: unknown) {
        this.family = family;
        this.src = src;
        seen.push(src);
      }
      load() { return Promise.resolve(this); }
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn() } });
    // jsdom's File lacks arrayBuffer(), so hand over a minimal stand-in.
    const file = {
      name: 'Gruppo-Test.ttf',
      arrayBuffer: async () => fontArrayBuffer,
    } as unknown as File;
    const def = await loadCustomFontFile(file);
    expect(def.family).toBe('Gruppo-Test');
    // The registry holds the exact bytes FontFace was fed (Object.is —
    // instanceof is realm-sensitive for ArrayBuffers under jsdom).
    await expect(resolveFontBytes('Gruppo-Test', 'normal', false)).resolves.toBe(fontArrayBuffer);
    expect(sniffFontFaceStyle(fontArrayBuffer)).toEqual({ weight: 400, italic: false });
  });
});
