import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as canvasEngine from '../canvasEngine';
import { useEditor, type CutPath } from '../../store/editor';
import { exportPDFReal } from '../io2';

/**
 * exportPDFReal's includeCutPaths overlay (CutContour RIP convention).
 *
 * jsPDF output is uncompressed text, so the Tauri save branch's bytes can be
 * decoded and inspected for the magenta stroke operator. svg2pdf and the io
 * helpers are mocked: the unit under test is the cut-path overlay math, not
 * the SVG rasteriser.
 */

vi.mock('svg2pdf.js', () => ({ svg2pdf: vi.fn(async () => undefined) }));

const harness = vi.hoisted(() => ({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>',
  saved: [] as Uint8Array[],
}));

vi.mock('../io', () => ({
  exportSVG: () => harness.svg,
  download: vi.fn(),
  saveBytesNative: vi.fn(async (_filename: string, bytes: Uint8Array) => {
    harness.saved.push(bytes);
    return true;
  }),
}));

vi.mock('../runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime')>();
  return { ...actual, isTauri: () => true };
});

const MM_TO_PX = 3.7795;

function stubCanvas(): void {
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
    getWidth: () => 800,
    getHeight: () => 600,
  } as never);
}

beforeEach(() => {
  harness.saved.length = 0;
  stubCanvas();
});

afterEach(() => {
  vi.restoreAllMocks();
  useEditor.getState().setCutPaths([]);
});

describe('exportPDFReal includeCutPaths', () => {
  it('overlays store cut paths as magenta hairlines in the artwork box', async () => {
    useEditor.getState().setCutPaths([
      { id: 'cut-1', points: [[10, 10], [50, 10], [50, 40]], closed: true, kind: 'outline' } satisfies CutPath,
    ]);
    await exportPDFReal({ pageSize: 'A4', orientation: 'portrait', includeCutPaths: true });

    expect(harness.saved).toHaveLength(1);
    const text = new TextDecoder().decode(harness.saved[0]!);
    // Magenta stroke operator (jsPDF emits integers with trailing periods).
    expect(text).toContain('1. 0. 1. RG');
    // Closed 3-point path -> 3 line segments (m/l/S triples).
    expect(text.match(/ l\n/g)).toHaveLength(3);

    // First polyline vertex lands at the artwork origin + mm->px->pdf scale.
    // A4 portrait, 800x600 canvas: scale = min(210/800, 297/600) = 0.2625,
    // artwork x = 0, y = (297 - 600*scale)/2 = 69.75 mm.
    const scale = Math.min(210 / 800, 297 / 600);
    const xMm = 0 + 10 * MM_TO_PX * scale;
    const yMm = (297 - 600 * scale) / 2 + 10 * MM_TO_PX * scale;
    const ptPerMm = 72 / 25.4;
    const first = text.match(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?) m\n/)!;
    // Precision 2: jsPDF's number formatting rounds around the 4th decimal.
    expect(Number(first[1])).toBeCloseTo(xMm * ptPerMm, 2);
    expect(Number(first[2])).toBeCloseTo((297 - yMm) * ptPerMm, 2);
  });

  it('emits no magenta stroke without includeCutPaths', async () => {
    useEditor.getState().setCutPaths([
      { id: 'cut-1', points: [[10, 10], [50, 10], [50, 40]], closed: true, kind: 'outline' } satisfies CutPath,
    ]);
    await exportPDFReal({ pageSize: 'A4', orientation: 'portrait' });

    expect(harness.saved).toHaveLength(1);
    const text = new TextDecoder().decode(harness.saved[0]!);
    expect(text).not.toContain('1. 0. 1. RG');
    expect(text).not.toMatch(/ l\n/);
  });
});

/**
 * ISO 19593-1 processing-steps OCG wiring around the same overlay. jsPDF
 * output is uncompressed, so the layer dictionaries, the catalog
 * /OCProperties entry and the BDC/EMC marked-content pair are all visible in
 * the decoded bytes. Structural tests decode as latin1 so char offsets equal
 * the byte offsets recorded in the xref table (the header comment contains
 * non-ASCII bytes that UTF-8 decoding would expand).
 */
describe('exportPDFReal includeCutPaths ISO 19593-1 OCG layers', () => {
  it('wraps outline-kind cut paths in a Cutting processing-steps OCG', async () => {
    useEditor.getState().setCutPaths([
      { id: 'cut-1', points: [[10, 10], [50, 10]], closed: false, kind: 'outline' } satisfies CutPath,
    ]);
    await exportPDFReal({ pageSize: 'A4', orientation: 'portrait', includeCutPaths: true });

    expect(harness.saved).toHaveLength(1);
    const text = new TextDecoder('latin1').decode(harness.saved[0]!);
    expect(text).toContain('/Type /OCG');
    expect(text).toContain('/GTS_ProcStepsType /Cutting');
    expect(text).toContain('/GTS_ProcStepsGroup /Structural');
    expect(text).toContain('/OCProperties');
    expect(text).toContain('/OFF [');
    // The magenta hairline itself is unchanged, and the marked-content pair
    // brackets its stroke operators in the page content stream.
    expect(text).toContain('1. 0. 1. RG');
    const rgIdx = text.indexOf('1. 0. 1. RG');
    const bdcIdx = text.indexOf('>> BDC');
    const emcIdx = text.indexOf('EMC');
    expect(bdcIdx).toBeGreaterThan(rgIdx);
    expect(emcIdx).toBeGreaterThan(bdcIdx);
    expect(text.slice(bdcIdx, emcIdx)).toMatch(/ l\n/);
    // No /Properties name resolution — the BDC operand is the full inline
    // OCG dictionary, so the shared /Resources dict stays untouched.
    expect(text).not.toContain('/Properties');
  });

  it('labels kiss cuts as a PartialCutting OCG', async () => {
    useEditor.getState().setCutPaths([
      { id: 'kiss-1', points: [[5, 5], [25, 5]], closed: false, kind: 'kiss' } satisfies CutPath,
    ]);
    await exportPDFReal({ pageSize: 'A4', orientation: 'portrait', includeCutPaths: true });

    expect(harness.saved).toHaveLength(1);
    const text = new TextDecoder('latin1').decode(harness.saved[0]!);
    expect(text).toContain('/GTS_ProcStepsType /PartialCutting');
    expect(text).toContain('/GTS_ProcStepsType /PartialCutting >> >> BDC');
    expect(text).toContain('1. 0. 1. RG');
    expect(text).not.toContain('/GTS_ProcStepsType /Cutting');
  });

  it('emits no OCG machinery without cut paths', async () => {
    useEditor.getState().setCutPaths([]);
    await exportPDFReal({ pageSize: 'A4', orientation: 'portrait', includeCutPaths: true });

    expect(harness.saved).toHaveLength(1);
    const text = new TextDecoder('latin1').decode(harness.saved[0]!);
    for (const s of ['/Type /OCG', '/GTS_ProcStepsType', '/GTS_ProcStepsGroup', '/OCProperties', '/Properties', 'BDC', 'EMC']) {
      expect(text).not.toContain(s);
    }
  });

  it('registers each OCG object exactly once with a resolvable xref offset', async () => {
    useEditor.getState().setCutPaths([
      { id: 'cut-1', points: [[0, 0], [10, 0]], closed: false, kind: 'outline' } satisfies CutPath,
      { id: 'kiss-1', points: [[0, 5], [10, 5]], closed: false, kind: 'kiss' } satisfies CutPath,
    ]);
    await exportPDFReal({ pageSize: 'A4', orientation: 'portrait', includeCutPaths: true });

    expect(harness.saved).toHaveLength(1);
    const text = new TextDecoder('latin1').decode(harness.saved[0]!);
    // Object ids are read back from the catalog's /OCGs array, not
    // hard-coded, so the assertions track whatever ids jsPDF minted.
    const ocprops = text.match(/\/OCProperties <<[^\n]+/)![0]!;
    const oids = [...ocprops.matchAll(/(?<![\d/])(\d+) 0 R/g)].map((m) => Number(m[1]));
    expect(new Set(oids).size).toBe(2);

    // '\nxref\n' (not lastIndexOf('xref'), which would land on startxref);
    // +1 skips the leading newline so lines are [xref, count, free, obj1..].
    const xrefLines = text.slice(text.indexOf('\nxref\n') + 1).split('\n');
    for (const oid of oids) {
      // Exactly one `N 0 obj` definition; the newline anchors avoid substring
      // hits such as `12 0 obj` inside `112 0 obj`.
      expect([...text.matchAll(new RegExp(`(?<=\\n)${oid} 0 obj(?=\\n)`, 'g'))]).toHaveLength(1);
      // Referenced exactly once per /OCGs, /OFF and /Order array.
      expect([...ocprops.matchAll(new RegExp(`(?<![\\d/])${oid} 0 R`, 'g'))]).toHaveLength(3);
      // xref table: `xref` line, count line, free entry, then object n.
      const entry = xrefLines[2 + oid]!;
      const offset = Number(entry.slice(0, 10));
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThan(text.length);
      expect(text.slice(offset).startsWith(`${oid} 0 obj\n`)).toBe(true);
    }
  });

  it('keeps the shared /Resources dictionary balanced and untouched', async () => {
    useEditor.getState().setCutPaths([
      { id: 'cut-1', points: [[0, 0], [10, 0]], closed: false, kind: 'outline' } satisfies CutPath,
    ]);
    await exportPDFReal({ pageSize: 'A4', orientation: 'portrait', includeCutPaths: true });

    expect(harness.saved).toHaveLength(1);
    const text = new TextDecoder('latin1').decode(harness.saved[0]!);
    // The shared Resources dict is the object containing /ProcSet. Strict
    // prepress parsers reject an unbalanced dict — regression guard for the
    // retired putXobjectDict injection that left a stray `>>` behind.
    const procIdx = text.indexOf('/ProcSet');
    expect(procIdx).toBeGreaterThan(0);
    const objStart = text.lastIndexOf(' obj\n', procIdx);
    const objEnd = text.indexOf('endobj', procIdx);
    expect(objStart).toBeGreaterThan(0);
    expect(objEnd).toBeGreaterThan(procIdx);
    const body = text.slice(objStart, objEnd);
    const depth = (body.match(/<</g) ?? []).length - (body.match(/>>/g) ?? []).length;
    expect(depth).toBe(0);
    expect(body).not.toContain('/Properties');
  });
});
