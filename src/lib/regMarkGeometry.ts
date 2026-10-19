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
