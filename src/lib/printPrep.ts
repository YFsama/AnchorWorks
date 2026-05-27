/**
 * Print prep utilities for commercial printing: crop marks, registration marks,
 * bleed indicators, and a page-info strip. All output is in millimetre units
 * suitable for embedding in an outer SVG sized in mm.
 */

export interface PrintPrep {
  /** Bleed in millimetres added on every side of the trim box. */
  bleedMm: number;
  /** Show L-shaped corner crop (trim) marks. */
  cropMarks: boolean;
  /** Show registration marks (target + crosshair) at each edge midpoint. */
  registrationMarks: boolean;
  /** Show the page-info text strip below the trim box. */
  pageInfo: boolean;
}

export const defaultPrintPrep: PrintPrep = {
  bleedMm: 0,
  cropMarks: false,
  registrationMarks: false,
  pageInfo: false,
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
  // midpoint of the trim box.
  if (prep.registrationMarks) {
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

  return parts.join('');
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
