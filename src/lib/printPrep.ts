/**
 * Print prep utilities for commercial printing: crop marks, registration marks,
 * bleed indicators, and a page-info strip. All output is in millimetre units
 * suitable for embedding in an outer SVG sized in mm.
 */

import {
  BARCODE_BAND_PAGE_MARGIN_MM,
  barcodeBandGeometry,
  CORNER_IDS,
  SCALE_CHECK_CAPTION,
  SCALE_CHECK_CAPTION_DY_MM,
  SCALE_CHECK_FONT_MM,
  SCALE_CHECK_GAP_MM,
  SCALE_CHECK_GAP_WITH_INFO_MM,
  SCALE_CHECK_H_MM,
  SCALE_CHECK_W_MM,
  regMarkCornerSegments,
  regMarkExtentMm,
  resolveRegMarkSpec,
  scaleCheckExtentMm,
  type RegMarkStyle,
} from './regMarkGeometry';

export interface PrintPrep {
  /** Bleed in millimetres added on every side of the trim box. */
  bleedMm: number;
  /** Show L-shaped corner crop (trim) marks. */
  cropMarks: boolean;
  /** Show registration marks (target + crosshair) at each edge midpoint. */
  registrationMarks: boolean;
  /** Show the page-info text strip below the trim box. */
  pageInfo: boolean;
  /** Registration-mark geometry style. Unset / 'generic' keeps the classic
   *  concentric-circle + crosshair edge-midpoint targets. */
  regMarkStyle?: RegMarkStyle;
  /** Overrides the vendor style's default L-arm length (mm). */
  regMarkArmMm?: number;
  /** Overrides the vendor style's default stroke width (mm). */
  regMarkStrokeMm?: number;
  /** Adds a solid-black 50 x 9 mm verification rectangle (Graphtec barcode
   *  Start-Mark dimensions) with a caption in the bottom margin, so print
   *  scaling can be checked with a ruler before cutting. */
  scaleCheck?: boolean;
  /** Prints the Graphtec Data-Link barcode band (CODE39 link-info bars +
   *  50 x 9 mm Start Mark, regMarkGeometry.ts) in the TOP margin so a
   *  networked Graphtec can recall this sheet's cut job by scanning it.
   *  Independent of `registrationMarks`. Unset → output unchanged. */
  barcodeBand?: { linkInfo: string };
}

export const defaultPrintPrep: PrintPrep = {
  bleedMm: 0,
  cropMarks: false,
  registrationMarks: false,
  pageInfo: false,
  regMarkStyle: 'generic',
  scaleCheck: false,
};

/**
 * Returns the inner contents of a `<g>` element (no wrapper) drawing all
 * requested marks for a trim box of `pageW` x `pageH` mm whose top-left
 * sits at `(0, 0)` in the parent SVG's coordinate space.
 *
 * Caller is expected to translate the parent so the trim box is centred
 * inside an outer SVG sized `pageW + 2*bleed` x `pageH + 2*bleed`.
 */
export function renderTrimMarksSVG(pageW: number, pageH: number, prep: PrintPrep): string {
  const parts: string[] = [];

  // Crop marks: L-shaped marks at each corner, 5mm long, 0.25mm wide,
  // offset 3mm outside the trim box.
  if (prep.cropMarks) {
    const OFFSET = 3;
    const LEN = 5;
    const STROKE = 0.25;
    const style = `stroke="#000" stroke-width="${STROKE}" stroke-linecap="butt" fill="none"`;
    // Each corner gets two perpendicular strokes that do NOT touch the trim
    // box (they sit OFFSET mm away and extend outward by LEN).
    // Top-left corner
    parts.push(
      `<line x1="${-OFFSET - LEN}" y1="0" x2="${-OFFSET}" y2="0" ${style} />`,
      `<line x1="0" y1="${-OFFSET - LEN}" x2="0" y2="${-OFFSET}" ${style} />`,
    );
    // Top-right corner
    parts.push(
      `<line x1="${pageW + OFFSET}" y1="0" x2="${pageW + OFFSET + LEN}" y2="0" ${style} />`,
      `<line x1="${pageW}" y1="${-OFFSET - LEN}" x2="${pageW}" y2="${-OFFSET}" ${style} />`,
    );
    // Bottom-left corner
    parts.push(
      `<line x1="${-OFFSET - LEN}" y1="${pageH}" x2="${-OFFSET}" y2="${pageH}" ${style} />`,
      `<line x1="0" y1="${pageH + OFFSET}" x2="0" y2="${pageH + OFFSET + LEN}" ${style} />`,
    );
    // Bottom-right corner
    parts.push(
      `<line x1="${pageW + OFFSET}" y1="${pageH}" x2="${pageW + OFFSET + LEN}" y2="${pageH}" ${style} />`,
      `<line x1="${pageW}" y1="${pageH + OFFSET}" x2="${pageW}" y2="${pageH + OFFSET + LEN}" ${style} />`,
    );
  }

  // Registration marks: a 6mm diameter target (outer + inner concentric
  // circles) with a crosshair through it, placed 4mm outside each edge
  // midpoint of the trim box. A vendor `regMarkStyle` swaps the geometry for
  // L-brackets at the four trim-box corners (see regMarkGeometry.ts).
  if (prep.registrationMarks) {
    const style: RegMarkStyle = prep.regMarkStyle ?? 'generic';
    if (style === 'generic') {
      const OFFSET = 4;
      const R_OUTER = 3;
      const R_INNER = 1.5;
      const CROSS = 4;
      const STROKE = 0.25;
      const targets: Array<[number, number]> = [
        [pageW / 2, -OFFSET - R_OUTER], // top
        [pageW / 2, pageH + OFFSET + R_OUTER], // bottom
        [-OFFSET - R_OUTER, pageH / 2], // left
        [pageW + OFFSET + R_OUTER, pageH / 2], // right
      ];
      for (const [cx, cy] of targets) {
        parts.push(
          `<circle cx="${cx}" cy="${cy}" r="${R_OUTER}" stroke="#000" stroke-width="${STROKE}" fill="none" />`,
          `<circle cx="${cx}" cy="${cy}" r="${R_INNER}" stroke="#000" stroke-width="${STROKE}" fill="none" />`,
          `<line x1="${cx - CROSS}" y1="${cy}" x2="${cx + CROSS}" y2="${cy}" stroke="#000" stroke-width="${STROKE}" />`,
          `<line x1="${cx}" y1="${cy - CROSS}" x2="${cx}" y2="${cy + CROSS}" stroke="#000" stroke-width="${STROKE}" />`,
        );
      }
    } else {
      const spec = resolveRegMarkSpec(style, prep.regMarkArmMm, prep.regMarkStrokeMm);
      for (const corner of CORNER_IDS) {
        for (const seg of regMarkCornerSegments(pageW, pageH, corner, spec)) {
          parts.push(
            `<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}" stroke="#000" stroke-width="${spec.strokeMm}" stroke-linecap="butt" />`,
          );
        }
      }
    }
  }

  // Bleed indicator: a dashed red line along the trim box itself, drawn
  // inside the bleed area so the operator sees where to trim. Only useful
  // when there is bleed beyond the trim box.
  if (prep.bleedMm > 0) {
    parts.push(
      `<rect x="0" y="0" width="${pageW}" height="${pageH}" fill="none" stroke="#e11d48" stroke-width="0.25" stroke-dasharray="1.5,1.5" />`,
    );
  }

  // Page info strip: a small text line below the bottom-left crop mark.
  if (prep.pageInfo) {
    const tx = 0;
    const ty = pageH + 10; // 10mm below trim
    const info = `trim ${round1(pageW)}mm x ${round1(pageH)}mm` +
      (prep.bleedMm > 0 ? `  bleed ${round1(prep.bleedMm)}mm` : '');
    parts.push(
      `<text x="${tx}" y="${ty}" font-family="Helvetica, Arial, sans-serif" font-size="3" fill="#000">${escapeXML(info)}</text>`,
    );
  }

  // Scale-check block: solid-black 50 x 9 mm rectangle plus caption, placed
  // in the bottom margin (below the page-info strip when both are shown) so
  // the operator can verify print scaling with a ruler before cutting.
  if (prep.scaleCheck) {
    const gap = prep.pageInfo ? SCALE_CHECK_GAP_WITH_INFO_MM : SCALE_CHECK_GAP_MM;
    const top = pageH + gap;
    parts.push(
      `<rect x="0" y="${top}" width="${SCALE_CHECK_W_MM}" height="${SCALE_CHECK_H_MM}" fill="#000" />`,
      `<text x="0" y="${top + SCALE_CHECK_H_MM + SCALE_CHECK_CAPTION_DY_MM}" font-family="Helvetica, Arial, sans-serif" font-size="${SCALE_CHECK_FONT_MM}" fill="#000">${escapeXML(SCALE_CHECK_CAPTION)}</text>`,
    );
  }

  // Graphtec Data-Link barcode band: CODE39 link-info bars + the 50 x 9 mm
  // Start Mark in the TOP margin, independent of the mark style. The band's
  // contract is MEDIA space (barcodeBandGeometry docs): 20 mm below the
  // media's leading edge, Start Mark 10 mm from the right media edge — and
  // the media is the grown page (trim + bleed + mark margin on every side,
  // which prepMarkMarginMm grows to >= 31 mm for exactly this band). So the
  // geometry is computed on the grown page and mapped back into trim space
  // by subtracting (margin + bleed) from both axes. Throws through
  // barcodeBandGeometry on an invalid linkInfo (leading 'G', > 9 chars,
  // non-CODE39 character).
  if (prep.barcodeBand) {
    const margin = prepMarkMarginMm(prep);
    const shift = margin + (prep.bleedMm ?? 0);
    const band = barcodeBandGeometry(pageW + 2 * shift, pageH + 2 * shift, {
      linkInfo: prep.barcodeBand.linkInfo,
    });
    for (const r of band.rects) {
      parts.push(
        `<rect x="${r.x - shift}" y="${r.y - shift}" width="${r.w}" height="${r.h}" fill="#000" />`,
      );
    }
  }

  return parts.join('');
}

/**
 * Mark margin (mm) a print wrapper must reserve outside trim + bleed for
 * `prep`: the historical 12 mm, grown only when a vendor mark style or the
 * scale-check block physically reaches further (Roland's 25 mm arms need
 * >=28 mm, which also satisfies their >=15 mm feed-direction offset rule).
 * The Data-Link barcode band forces at least 31 mm (20 mm lead + 9 mm band
 * + 2 mm clear above the trim box) so the band really lands 20 mm from the
 * media's leading edge; a larger extent (e.g. scale-check + page-info at
 * 33 mm) still wins.
 */
export function prepMarkMarginMm(prep: PrintPrep): number {
  let extent = 8; // crop marks: 3mm offset + 5mm arm
  if (prep.registrationMarks) {
    extent = Math.max(extent, regMarkExtentMm(prep.regMarkStyle ?? 'generic', prep.regMarkArmMm, prep.regMarkStrokeMm));
  }
  if (prep.scaleCheck) {
    extent = Math.max(extent, scaleCheckExtentMm(prep.pageInfo === true));
  }
  // The band is a flat media-space requirement (not extent+1 like the
  // stroke-based marks) — clamp the final result directly.
  return Math.max(12, extent + 1, prep.barcodeBand ? BARCODE_BAND_PAGE_MARGIN_MM : 0);
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function escapeXML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
