import { describe, expect, it } from 'vitest';
import {
  BARCODE_QUIET_MM,
  BARCODE_SIDE_MARGIN_MM,
  BARCODE_START_MARK_W_MM,
  CODE39_NARROW_MM,
  barcodeBandGeometry,
  code39BarWidths,
  code39CheckChar,
} from '../regMarkGeometry';

describe('code39CheckChar (mod-43)', () => {
  it('pins "123" → "6" (values 1+2+3 = 6)', () => {
    expect(code39CheckChar('123')).toBe('6');
  });

  it('pins "AB" → "L" (values 10+11 = 21 → index 21 of the CODE39 alphabet)', () => {
    expect(code39CheckChar('AB')).toBe('L');
  });

  it('wraps at 43: "Z9" → "1" (35+9 = 44 → 44 mod 43 = 1)', () => {
    expect(code39CheckChar('Z9')).toBe('1');
  });

  it('throws on characters outside the CODE39 set', () => {
    expect(() => code39CheckChar('ab')).toThrow(/not in the CODE39 set/);
    expect(() => code39CheckChar('A*b')).toThrow(/not in the CODE39 set/);
  });
});

describe('code39BarWidths', () => {
  it('pins the "*" start/stop pattern: N W N N W N W N N, bars on odd positions', () => {
    const els = code39BarWidths('*');
    // Canonical asterisk: 9 elements, wide at 2/5/7 — two wide bars (3rd +
    // 4th bar) and one wide leading space. Narrow 0.5 mm, wide 1.25 mm.
    expect(els).toHaveLength(9);
    expect(els).toEqual([
      { wMm: 0.5, bar: true }, { wMm: 1.25, bar: false }, { wMm: 0.5, bar: true },
      { wMm: 0.5, bar: false }, { wMm: 1.25, bar: true }, { wMm: 0.5, bar: false },
      { wMm: 1.25, bar: true }, { wMm: 0.5, bar: false }, { wMm: 0.5, bar: true },
    ]);
    // Wide is exactly the 2.5× narrow ratio.
    expect(els[1].wMm).toBe(CODE39_NARROW_MM * 2.5);
  });

  it('pins "1": W N N W N N N N W (wide bars 1+5, wide space 2)', () => {
    const els = code39BarWidths('1');
    expect(els.map((e) => [e.wMm, e.bar])).toEqual([
      [1.25, true], [0.5, false], [0.5, true], [1.25, false], [0.5, true],
      [0.5, false], [0.5, true], [0.5, false], [1.25, true],
    ]);
  });

  it('emits exactly one narrow inter-character gap between characters', () => {
    const els = code39BarWidths('**');
    expect(els).toHaveLength(9 + 1 + 9);
    expect(els[9]).toEqual({ wMm: CODE39_NARROW_MM, bar: false });
    // …and no trailing gap after the final character.
    const one = code39BarWidths('*');
    expect(one[one.length - 1]).toEqual({ wMm: 0.5, bar: true });
  });

  it('throws for characters outside the CODE39 set (except the * delimiter)', () => {
    expect(() => code39BarWidths('a')).toThrow(/not in the CODE39 set/);
    expect(() => code39BarWidths('*1!')).toThrow(/not in the CODE39 set/);
  });
});

describe('barcodeBandGeometry', () => {
  // 10 mm-side-margin sheet per the Graphtec band layout: the Start Mark's
  // left edge sits sheetW − 10 − 50.
  const SHEET_W = 300;
  const SHEET_H = 1000;

  it('places the 50×9 Start Mark at sheetW−10−50 with the band 20 mm from the leading edge', () => {
    const g = barcodeBandGeometry(SHEET_W, SHEET_H, { linkInfo: 'A12345678' });
    expect(g.startX).toBe(SHEET_W - BARCODE_SIDE_MARGIN_MM - BARCODE_START_MARK_W_MM);
    expect(g.startX).toBe(240);
    expect(g.bandY).toBe(20);
    expect(g.rects[0]).toEqual({ x: 240, y: 20, w: 50, h: 9 });
    // Every rect is a full-band-height black block on the band line.
    for (const r of g.rects) {
      expect(r.y).toBe(20);
      expect(r.h).toBe(9);
    }
    // The bar run sits LEFT of the start mark with the 7 mm quiet zone
    // between, and its first bar starts exactly at start-mark edge − quiet −
    // run width (composition pinned against the exported code39 primitives).
    const full = `*A12345678F${code39CheckChar('A12345678F')}*`;
    const runW = code39BarWidths(full).reduce((s, e) => s + e.wMm, 0);
    const bars = g.rects.slice(1);
    expect(Math.min(...bars.map((r) => r.x))).toBe(240 - BARCODE_QUIET_MM - runW);
    for (const r of bars) {
      expect(r.x + r.w).toBeLessThanOrEqual(240 - BARCODE_QUIET_MM);
    }
  });

  it('composes the message as * + linkInfo + positionChar "F" (default) + check + *', () => {
    // linkInfo '1', default position 'F' → check('1F') = 1+15 = 16 → 'G',
    // so the emitted bar run is exactly code39BarWidths('*1FG*').
    const g = barcodeBandGeometry(SHEET_W, SHEET_H, { linkInfo: '1' });
    const els = code39BarWidths('*1FG*');
    const runW = els.reduce((s, e) => s + e.wMm, 0);
    let x = 240 - BARCODE_QUIET_MM - runW;
    const expected: Array<[number, number]> = [];
    for (const e of els) {
      if (e.bar) expected.push([x, e.wMm]);
      x += e.wMm;
    }
    expect(g.rects.slice(1).map((r) => [r.x, r.w])).toEqual(expected);
  });

  it('rejects a linkInfo starting with "G"', () => {
    expect(() => barcodeBandGeometry(SHEET_W, SHEET_H, { linkInfo: 'G12345678' }))
      .toThrow(/must not start with 'G'/);
  });

  it('rejects linkInfo longer than 9 characters (or empty)', () => {
    expect(() => barcodeBandGeometry(SHEET_W, SHEET_H, { linkInfo: 'A123456789' }))
      .toThrow(/1–9 CODE39 characters \(got 10\)/);
    expect(() => barcodeBandGeometry(SHEET_W, SHEET_H, { linkInfo: '' }))
      .toThrow(/1–9 CODE39 characters \(got 0\)/);
  });

  it('rejects non-CODE39 link characters and sheets too short for the band', () => {
    expect(() => barcodeBandGeometry(SHEET_W, SHEET_H, { linkInfo: 'a1234567' }))
      .toThrow(/not in the CODE39 set/);
    expect(() => barcodeBandGeometry(SHEET_W, 28, { linkInfo: 'A12345678' }))
      .toThrow(/cannot carry the barcode band/);
  });
});
