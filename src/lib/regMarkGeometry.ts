/**
 * Vendor registration-mark geometry shared by printPrep.ts (SVG string
 * output) and printMarks.ts (fabric objects). All numbers are millimetres in
 * the trim-box coordinate space: origin at the trim box top-left, y down.
 */

export type RegMarkStyle = 'generic' | 'graphtec-arms' | 'silhouette' | 'roland';

export interface RegMarkSpec {
  /** L-arm length in mm (0 for the generic target style). */
  armMm: number;
  /** Stroke width in mm. */
  strokeMm: number;
  /** Gap between the trim-box corner and the arm start (outward styles). */
  offsetMm: number;
  /** True when the L-bracket arms run from the corner into the sheet
   *  (Graphtec Type-2); false when they extend outward from the artwork. */
  inward: boolean;
}

/**
 * Style defaults:
 *  - graphtec-arms : CE7000/FC ARMS Type-2 square marks — L-brackets anchored
 *    on the trim-box corners with 20 mm arms pointing inward along the edges,
 *    0.7 mm stroke.
 *  - silhouette    : inkscape-silhouette TB51,400 SU / TB53,10 SU L marks —
 *    10 mm arms, 0.25 mm stroke, ~3 mm inset from the artwork bounds.
 *  - roland        : VersaWorks-style L crop marks — 25 mm arms, 0.5 mm
 *    stroke at the usual corner positions. Roland cutters need the marks
 *    >=15 mm from the media edge in the feed direction; `regMarkExtentMm`
 *    drives the page margin to 28+ mm so that constraint holds when the
 *    sheet feeds along the page's vertical axis.
 */
export const REG_MARK_DEFAULTS: Record<RegMarkStyle, RegMarkSpec> = {
  generic: { armMm: 0, strokeMm: 0.25, offsetMm: 4, inward: false },
  'graphtec-arms': { armMm: 20, strokeMm: 0.7, offsetMm: 0, inward: true },
  silhouette: { armMm: 10, strokeMm: 0.25, offsetMm: 3, inward: false },
  roland: { armMm: 25, strokeMm: 0.5, offsetMm: 3, inward: false },
};

/** Resolve a style plus caller overrides into concrete mark geometry. */
export function resolveRegMarkSpec(style: RegMarkStyle, armMm?: number, strokeMm?: number): RegMarkSpec {
  const base = REG_MARK_DEFAULTS[style];
  return {
    armMm: armMm ?? base.armMm,
    strokeMm: strokeMm ?? base.strokeMm,
    offsetMm: base.offsetMm,
    inward: base.inward,
  };
}

export type CornerId = 'tl' | 'tr' | 'bl' | 'br';

export const CORNER_IDS: CornerId[] = ['tl', 'tr', 'bl', 'br'];

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The two L-bracket strokes (mm) for one corner of a `pageW` x `pageH` mm
 * trim box. Outward styles leave an `offsetMm` gap at the corner and run
 * the arms away from the sheet; the Graphtec Type-2 style anchors the
 * bracket vertex on the corner itself and runs the arms inward along the
 * trim-box edges.
 */
export function regMarkCornerSegments(pageW: number, pageH: number, corner: CornerId, spec: RegMarkSpec): Segment[] {
  const cx = corner === 'tl' || corner === 'bl' ? 0 : pageW;
  const cy = corner === 'tl' || corner === 'tr' ? 0 : pageH;
  const inX = corner === 'tl' || corner === 'bl' ? 1 : -1;
  const inY = corner === 'tl' || corner === 'tr' ? 1 : -1;
  if (spec.inward) {
    return [
      { x1: cx, y1: cy, x2: cx + inX * spec.armMm, y2: cy },
      { x1: cx, y1: cy, x2: cx, y2: cy + inY * spec.armMm },
    ];
  }
  const o = spec.offsetMm;
  return [
    { x1: cx - inX * o, y1: cy, x2: cx - inX * (o + spec.armMm), y2: cy },
    { x1: cx, y1: cy - inY * o, x2: cx, y2: cy - inY * (o + spec.armMm) },
  ];
}

/**
 * How far the style's marks reach beyond the trim box, in mm — the page
 * margin the print wrapper must reserve for them. The generic targets reach
 * 4 mm offset + 3 mm outer circle + 4 mm crosshair = 11 mm, already inside
 * the historical 12 mm mark margin, so 'generic' never grows the page.
 */
export function regMarkExtentMm(style: RegMarkStyle, armMm?: number, strokeMm?: number): number {
  if (style === 'generic') return 11;
  const spec = resolveRegMarkSpec(style, armMm, strokeMm);
  return spec.inward ? spec.strokeMm / 2 : spec.offsetMm + spec.armMm;
}

/** Scale-check block dimensions: a solid-black 50 x 9 mm rectangle (Graphtec
 *  barcode Start-Mark dimensions) plus a ruler caption, placed in the
 *  bottom margin below the trim box. */
export const SCALE_CHECK_W_MM = 50;
export const SCALE_CHECK_H_MM = 9;
export const SCALE_CHECK_GAP_MM = 8;
/** Extra clearance below the page-info strip so the two never collide. */
export const SCALE_CHECK_GAP_WITH_INFO_MM = 16;
export const SCALE_CHECK_CAPTION_DY_MM = 4;
export const SCALE_CHECK_FONT_MM = 3;
export const SCALE_CHECK_CAPTION = '50 × 9 mm — verify with a ruler before cutting';

/** Bottom reach of the scale-check block (mm beyond the trim box). */
export function scaleCheckExtentMm(withPageInfo: boolean): number {
  const gap = withPageInfo ? SCALE_CHECK_GAP_WITH_INFO_MM : SCALE_CHECK_GAP_MM;
  return gap + SCALE_CHECK_H_MM + SCALE_CHECK_CAPTION_DY_MM + SCALE_CHECK_FONT_MM;
}

/* ── Graphtec Data-Link barcode band (print side) ──────────────────────────
 * Roll-media job handoff for networked Graphtecs (CE7000/FC via Data-Link /
 * Cutting Master): besides the ARMS registration marks, the sheet carries a
 * CODE39 barcode band the operator scans (or the machine's barcode reader
 * reads) to recall the matching cut job. Band layout per the Graphtec
 * Barcode Print Layout Specification Rev 1.10 (as summarized in
 * docs/research-sticker-printcut-2026-10.md §2, "Barcode Data-Link job
 * handoff" open item this closes):
 *   - content   : `*` + 9-char link info + position char `F` + mod-43 check
 *                 char + `*`
 *   - band      : 9 mm tall, 20 mm from the media's leading edge
 *   - Start Mark: solid black 50 × 9 mm on the RIGHT of the band (bars are
 *                 scanned right-to-left), flush right minus a 10 mm side
 *                 margin
 *   - bars      : narrow 0.5 mm, wide = 2.5 × narrow (1.25 mm);
 *                 inter-character gap = 1 narrow; 7 mm quiet zones either
 *                 side of the bar run
 *   - link info : first character must not be `G` (reserved prefix in the
 *                 Data-Link protocol) and at most 9 characters.
 * Page-orientation assumption: the media's LEADING edge is the TOP of the
 * page (the sheet feeds top-first through the printer), so bandY counts
 * downward from sheetY = 0. */

/** Mod-43 check alphabet — index = character value. */
export const CODE39_VALUES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

/** Narrow element width (mm). */
export const CODE39_NARROW_MM = 0.5;
/** Wide/narrow ratio (wide = 1.25 mm). */
export const CODE39_WIDE_RATIO = 2.5;

/** Distance from the media's leading (top) edge to the band, mm. */
export const BARCODE_BAND_LEAD_MM = 20;
/** Band height, mm (same 9 mm as the Start-Mark/scale-check block). */
export const BARCODE_BAND_HEIGHT_MM = 9;
/** Solid-black Start Mark width, mm (bars scanned right-to-left). */
export const BARCODE_START_MARK_W_MM = 50;
/** Side margin between the Start Mark and the right media edge, mm. */
export const BARCODE_SIDE_MARGIN_MM = 10;
/** Quiet zone either side of the bar run, mm. */
export const BARCODE_QUIET_MM = 7;
/** Page margin the band needs beyond the trim box: 20 lead + 9 band + 2
 *  clear above the trim box. Drives prepMarkMarginMm. */
export const BARCODE_BAND_PAGE_MARGIN_MM = BARCODE_BAND_LEAD_MM + BARCODE_BAND_HEIGHT_MM + 2;

/** One CODE39 element: a bar (`bar: true`) or the space/gap after it. */
export interface Code39Element {
  wMm: number;
  bar: boolean;
}

/**
 * The 43 CODE39 character patterns, in CODE39_VALUES order: nine N/W
 * elements per character, alternating bar/space and STARTING WITH A BAR
 * (odd 1-based positions are bars, even are spaces). Each character has
 * exactly three wide elements (standard characters: two wide bars + one
 * wide space; `$/+/%`: all-narrow bars + three wide spaces). This is the
 * canonical ANSI/AIM BC1 table as reproduced by zint/bwip-js.
 */
const CODE39_PATTERNS: readonly string[] = [
  'NNNWWNWNN', // 0
  'WNNWNNNNW', // 1
  'NNWWNNNNW', // 2
  'WNWWNNNNN', // 3
  'NNNWWNNNW', // 4
  'WNNWWNNNN', // 5
  'NNWWWNNNN', // 6
  'NNNWNNWNW', // 7
  'WNNWNNWNN', // 8
  'NNWWNNWNN', // 9
  'WNNNNWNNW', // A
  'NNWNNWNNW', // B
  'WNWNNWNNN', // C
  'NNNNWWNNW', // D
  'WNNNWWNNN', // E
  'NNWNWWNNN', // F
  'NNNNNWWNW', // G
  'WNNNNWWNN', // H
  'NNWNNWWNN', // I
  'NNNNWWWNN', // J
  'WNNNNNNWW', // K
  'NNWNNNNWW', // L
  'WNWNNNNWN', // M
  'NNNNWNNWW', // N
  'WNNNWNNWN', // O
  'NNWNWNNWN', // P
  'NNNNNNWWW', // Q
  'WNNNNNWWN', // R
  'NNWNNNWWN', // S
  'NNNNWNWWN', // T
  'WWNNNNNNW', // U
  'NWWNNNNNW', // V
  'WWWNNNNNN', // W
  'NWNNWNNNW', // X
  'WWNNWNNNN', // Y
  'NWWNWNNNN', // Z
  'NWNNNNWNW', // -
  'WWNNNNWNN', // .
  'NWWNNNWNN', // (space)
  'NWNWNWNNN', // $
  'NWNWNNNWN', // /
  'NWNNNWNWN', // +
  'NNNWNWNWN', // %
];

/** Start/stop `*` — two wide bars (3rd + 4th) + one wide leading space. */
const CODE39_START_STOP = 'NWNNWNWNN';

/**
 * Mod-43 check character of `data`: sum the CODE39_VALUES index of every
 * character, mod 43. Throws when `data` contains a character outside the
 * CODE39 set (callers compose the message first, `*` delimiters excluded —
 * the checksum never covers them).
 */
export function code39CheckChar(data: string): string {
  let sum = 0;
  for (const ch of data) {
    const v = CODE39_VALUES.indexOf(ch);
    if (v < 0) {
      throw new Error(`CODE39 check character: ${JSON.stringify(ch)} is not in the CODE39 set`);
    }
    sum += v;
  }
  return CODE39_VALUES[sum % 43];
}

/**
 * Bar/space width sequence (mm) of the CODE39 symbol `text` — the caller
 * passes the FULL framing `*…*` (e.g. `'*1FG*'`); this function is a pure
 * table encoder and adds nothing. Nine elements per character (odd
 * positions bars, even spaces) with one NARROW inter-character gap between
 * consecutive characters. `*` encodes via the start/stop pattern; any other
 * character outside CODE39_VALUES throws.
 */
export function code39BarWidths(text: string): Code39Element[] {
  const out: Code39Element[] = [];
  const emitChar = (ch: string): void => {
    const pattern = ch === '*'
      ? CODE39_START_STOP
      : CODE39_PATTERNS[CODE39_VALUES.indexOf(ch)];
    if (!pattern) {
      throw new Error(`CODE39 encoding: ${JSON.stringify(ch)} is not in the CODE39 set`);
    }
    for (let i = 0; i < pattern.length; i++) {
      out.push({
        wMm: pattern[i] === 'W' ? CODE39_NARROW_MM * CODE39_WIDE_RATIO : CODE39_NARROW_MM,
        bar: i % 2 === 0,
      });
    }
  };
  for (let i = 0; i < text.length; i++) {
    emitChar(text[i]);
    if (i < text.length - 1) out.push({ wMm: CODE39_NARROW_MM, bar: false });
  }
  return out;
}

/** Data-Link band content: the job's link info plus which panel it is. */
export interface BarcodeBandSpec {
  /** 1–9 CODE39 characters identifying the cut job on the networked
   *  cutter. The FIRST character must not be `G` (reserved prefix) and the
   *  length must not exceed 9 — both throw. */
  linkInfo: string;
  /** Position marker in the band message. Default `'F'` (first/only panel). */
  positionChar?: string;
}

export interface BarcodeBandRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Geometry (mm, sheet space, origin at the media's top-left) of the
 * Graphtec Data-Link barcode band for a `sheetW × sheetH` sheet:
 *
 *   [ … 7 mm left quiet | bar run | 7 mm quiet | 50 mm Start Mark | 10 mm margin ]
 *
 * laid out right-to-left from the Start Mark (the scanner reads the bars
 * right-to-left behind it). `bandY = 20` (leading edge at the top — see the
 * page-orientation note in the section header). Every rect is the full
 * 9 mm band tall; `startX` is the Start Mark's left edge. `sheetH` only
 * gates the sanity check that the sheet is tall enough to carry the band.
 * Throws on an invalid `linkInfo` (empty, > 9 chars, leading `G`, or any
 * non-CODE39 character).
 */
export function barcodeBandGeometry(
  sheetW: number,
  sheetH: number,
  spec: BarcodeBandSpec,
): { rects: BarcodeBandRect[]; startX: number; bandY: number } {
  if (spec.linkInfo.length < 1 || spec.linkInfo.length > 9) {
    throw new Error(`Data-Link link info must be 1–9 CODE39 characters (got ${spec.linkInfo.length})`);
  }
  if (spec.linkInfo[0] === 'G') {
    throw new Error("Data-Link link info must not start with 'G' (reserved prefix)");
  }
  if (sheetH < BARCODE_BAND_LEAD_MM + BARCODE_BAND_HEIGHT_MM) {
    throw new Error(`Sheet height ${sheetH} mm cannot carry the barcode band (needs >= ${BARCODE_BAND_LEAD_MM + BARCODE_BAND_HEIGHT_MM} mm)`);
  }
  const message = spec.linkInfo + (spec.positionChar ?? 'F');
  const elements = code39BarWidths(`*${message}${code39CheckChar(message)}*`);
  const runW = elements.reduce((sum, e) => sum + e.wMm, 0);

  const bandY = BARCODE_BAND_LEAD_MM;
  const startX = sheetW - BARCODE_SIDE_MARGIN_MM - BARCODE_START_MARK_W_MM;
  const rects: BarcodeBandRect[] = [
    { x: startX, y: bandY, w: BARCODE_START_MARK_W_MM, h: BARCODE_BAND_HEIGHT_MM },
  ];
  let x = startX - BARCODE_QUIET_MM - runW;
  for (const e of elements) {
    if (e.bar) rects.push({ x, y: bandY, w: e.wMm, h: BARCODE_BAND_HEIGHT_MM });
    x += e.wMm;
  }
  return { rects, startX, bandY };
}
