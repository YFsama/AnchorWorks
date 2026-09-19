/**
 * Vector PDF import.
 *
 * pdf.js gives us the page's raw drawing program as an operator list
 * (fnArray + argsArray). This module walks that program and rebuilds the
 * vector geometry as SVG paths — honoring the transformation-matrix stack
 * (q / Q / cm), fill + stroke colours (RGB / CMYK / gray spaces), fill
 * rules (winding vs even-odd), and constructPath's move/line/curve/rect
 * primitives. The result is fed through the existing SVG import pipeline so
 * everything downstream (grouping, history, cut-contour extraction) works
 * on PDFs exactly like SVGs.
 *
 * Text is intentionally SKIPPED — rendering glyph outlines needs font
 * programs we don't ship. Each showText run is counted and surfaced as a
 * toast so the user knows to convert text to outlines in the source app.
 * Embedded images and gradients-in-PDF are likewise skipped (gradients
 * degrade to nothing; the SVG path import handles the rest).
 *
 * The pdf.js dependency is loaded lazily inside `importPdf` so importing
 * this module from unit tests (which exercise the pure transform / color /
 * operator-walk helpers below) never pulls the ~1 MB library or spins up
 * its worker.
 */

import { importSVGString } from './io';
import { toast } from './toast';
import { t } from './i18n';
import { logger } from './debug';

/* ------------------------------------------------------------ */
/* Pure affine-matrix + colour helpers (unit-tested)             */
/* ------------------------------------------------------------ */

/** PDF/SVG affine [a b c d e f] — x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY_MAT: Mat = [1, 0, 0, 1, 0, 0];

/** Compose `m ∘ n` — apply n first, then m (PDF cm premultiplies). */
export function matMul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Apply the matrix to a point. */
export function applyMat(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Naive CMYK → RGB (no ICC profile): r = (1−c)(1−k) etc. Inputs are PDF
 * floats 0..1; output is 0..255, rounded. Perfectly acceptable for
 * previewing spot-colour vinyl art where the cut path is the deliverable.
 */
export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(255 * (1 - v) * (1 - k))));
  return [f(c), f(m), f(y)];
}

/** pdf.js float components (0..1) → `#rrggbb`. */
export function rgbToCss(r: number, g: number, b: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Gray component (0..1) → `#rrggbb` (PDF gray is additive: 0 = black). */
export function grayToCss(g: number): string {
  return rgbToCss(g, g, g);
}

/* ------------------------------------------------------------ */
/* Operator-list → SVG path elements                             */
/* ------------------------------------------------------------ */

/** One painted path: SVG `d` data in page-canvas (y-down) coordinates. */
export interface PdfPathElement {
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillRule: 'nonzero' | 'evenodd';
}

/** Summary of one walk: painted elements + skipped text runs. */
export interface PdfOpWalkResult {
  elements: PdfPathElement[];
  textRuns: number;
}

/**
 * The operator codes this walker understands, keyed by their pdf.js OPS
 * names. Injected rather than hard-coded so the walker is decoupled from
 * any specific pdfjs-dist version's numeric assignments (they're stable in
 * practice, but "stable in practice" is how importers rot).
 */
export interface PdfOpsMap {
  save: number; restore: number; transform: number;
  constructPath: number;
  rectangle: number; moveTo: number; lineTo: number;
  curveTo: number; curveTo2: number; curveTo3: number; closePath: number;
  setFillRGBColor: number; setStrokeRGBColor: number;
  setFillCMYKColor: number; setStrokeCMYKColor: number;
  setFillGray: number; setStrokeGray: number;
  setLineWidth: number;
  fill: number; eoFill: number; stroke: number; closeStroke: number;
  fillStroke: number; eoFillStroke: number; closeFillStroke: number; closeEOFillStroke: number;
  endPath: number;
  showText: number; showSpacedText: number;
}

const fmt = (n: number): string => {
  const r = Math.abs(n) < 1e-4 ? 0 : Math.round(n * 100) / 100;
  return String(r);
};

/**
 * Walk a pdf.js operator list and convert every painted path into an SVG
 * path element. Pure: no DOM, no pdfjs import — the caller supplies the
 * numeric op codes and the base matrix (page viewport transform; pass
 * IDENTITY_MAT for user-space output).
 *
 * Semantics kept deliberately conservative:
 *  - path coordinates are transformed by the CTM captured at the
 *    constructPath op (PDF transforms the geometry at construction time);
 *  - colours + line width apply at paint time (fill/stroke/eoFill…);
 *  - q/Q push/pop the tracked graphics state (ctm + colours + width);
 *  - showText/showSpacedText count toward the warning tally;
 *  - anything unrecognised is skipped silently (images, shadings, clips).
 */
export function opListToPathElements(
  fnArray: number[],
  argsArray: unknown[][],
  ops: PdfOpsMap,
  baseMatrix: Mat = IDENTITY_MAT,
): PdfOpWalkResult {
  const elements: PdfPathElement[] = [];
  let textRuns = 0;
  let ctm = baseMatrix;
  let fill = '#000000';
  let stroke = '#000000';
  let lineWidth = 1;
  // Saved graphics states (q … Q). The PDF spec saves the whole state; we
  // track the four pieces we actually consume.
  const stack: Array<{ ctm: Mat; fill: string; stroke: string; lineWidth: number }> = [];

  // Current subpath under construction — SVG commands in page coords.
  let d = '';
  // Current point in USER space (needed by curveTo2/curveTo3 control math).
  let curX = 0;
  let curY = 0;
  let started = false;

  const pt = (x: number, y: number): [number, number] => applyMat(ctm, x, y);

  const move = (x: number, y: number): void => {
    const [tx, ty] = pt(x, y);
    d += `M${fmt(tx)} ${fmt(ty)}`;
    curX = x; curY = y;
    started = true;
  };
  const line = (x: number, y: number): void => {
    if (!started) { move(x, y); return; }
    const [tx, ty] = pt(x, y);
    d += `L${fmt(tx)} ${fmt(ty)}`;
    curX = x; curY = y;
  };
  const curve = (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void => {
    if (!started) { move(c1x, c1y); }
    const [t1x, t1y] = pt(c1x, c1y);
    const [t2x, t2y] = pt(c2x, c2y);
    const [tx, ty] = pt(x, y);
    d += `C${fmt(t1x)} ${fmt(t1y)} ${fmt(t2x)} ${fmt(t2y)} ${fmt(tx)} ${fmt(ty)}`;
    curX = x; curY = y;
  };
  const closeSubpath = (): void => {
    if (started) d += 'Z';
  };

  const emit = (doFill: boolean, doStroke: boolean, fillRule: 'nonzero' | 'evenodd', preClose: boolean): void => {
    if (!started || !d) return;
    const dd = preClose ? `${d}Z` : d;
    elements.push({ d: dd, fill: doFill ? fill : 'none', stroke: doStroke ? stroke : 'none', strokeWidth: doStroke ? lineWidth : 0, fillRule });
    d = '';
    started = false;
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] ?? [];
    if (fn === ops.save) {
      stack.push({ ctm, fill, stroke, lineWidth });
    } else if (fn === ops.restore) {
      const s = stack.pop();
      if (s) { ({ ctm, fill, stroke, lineWidth } = s); }
    } else if (fn === ops.transform) {
      const [a, b, c, dd, e, f] = args as number[];
      ctm = matMul([a, b, c, dd, e, f], ctm);
    } else if (fn === ops.constructPath) {
      const pathOps = args[0] as ArrayLike<number>;
      const coords = args[1] as ArrayLike<number>;
      let ci = 0;
      for (let k = 0; k < pathOps.length; k++) {
        const op = pathOps[k];
        if (op === ops.rectangle) {
          const [x, y, w, h] = [coords[ci++], coords[ci++], coords[ci++], coords[ci++]];
          move(x, y);
          line(x + w, y);
          line(x + w, y + h);
          line(x, y + h);
          closeSubpath();
        } else if (op === ops.moveTo) {
          move(coords[ci++], coords[ci++]);
        } else if (op === ops.lineTo) {
          line(coords[ci++], coords[ci++]);
        } else if (op === ops.curveTo) {
          const c1x = coords[ci++], c1y = coords[ci++], c2x = coords[ci++], c2y = coords[ci++], x = coords[ci++], y = coords[ci++];
          curve(c1x, c1y, c2x, c2y, x, y);
        } else if (op === ops.curveTo2) {
          // One control point + endpoint; first control mirrors the current point.
          const c2x = coords[ci++], c2y = coords[ci++], x = coords[ci++], y = coords[ci++];
          curve(curX, curY, c2x, c2y, x, y);
        } else if (op === ops.curveTo3) {
          // One control point + endpoint; second control equals the endpoint.
          const c1x = coords[ci++], c1y = coords[ci++], x = coords[ci++], y = coords[ci++];
          curve(c1x, c1y, x, y, x, y);
        } else if (op === ops.closePath) {
          closeSubpath();
        }
        // Unknown path op — coords pointer can't be advanced safely; stop
        // walking this constructPath rather than mis-align the stream.
        else break;
      }
    } else if (fn === ops.setFillRGBColor) {
      fill = rgbToCss(args[0] as number, args[1] as number, args[2] as number);
    } else if (fn === ops.setStrokeRGBColor) {
      stroke = rgbToCss(args[0] as number, args[1] as number, args[2] as number);
    } else if (fn === ops.setFillCMYKColor) {
      const [r, g, b] = cmykToRgb(args[0] as number, args[1] as number, args[2] as number, args[3] as number);
      fill = rgbToCss(r / 255, g / 255, b / 255);
    } else if (fn === ops.setStrokeCMYKColor) {
      const [r, g, b] = cmykToRgb(args[0] as number, args[1] as number, args[2] as number, args[3] as number);
      stroke = rgbToCss(r / 255, g / 255, b / 255);
    } else if (fn === ops.setFillGray) {
      fill = grayToCss(args[0] as number);
    } else if (fn === ops.setStrokeGray) {
      stroke = grayToCss(args[0] as number);
    } else if (fn === ops.setLineWidth) {
      lineWidth = args[0] as number;
    } else if (fn === ops.fill) {
      emit(true, false, 'nonzero', false);
    } else if (fn === ops.eoFill) {
      emit(true, false, 'evenodd', false);
    } else if (fn === ops.stroke) {
      emit(false, true, 'nonzero', false);
    } else if (fn === ops.closeStroke) {
      emit(false, true, 'nonzero', true);
    } else if (fn === ops.fillStroke) {
      emit(true, true, 'nonzero', false);
    } else if (fn === ops.eoFillStroke) {
      emit(true, true, 'evenodd', false);
    } else if (fn === ops.closeFillStroke) {
      emit(true, true, 'nonzero', true);
    } else if (fn === ops.closeEOFillStroke) {
      emit(true, true, 'evenodd', true);
    } else if (fn === ops.endPath) {
      // Path set but never painted — discard.
      d = '';
      started = false;
    } else if (fn === ops.showText || fn === ops.showSpacedText) {
      textRuns += 1;
    }
    // Everything else (images, shadings, clips, fonts…) is skipped.
  }
  return { elements, textRuns };
}

/* ------------------------------------------------------------ */
/* SVG assembly                                                  */
/* ------------------------------------------------------------ */

/** Vertical gap between multi-page groups (canvas px). */
export const PDF_PAGE_GAP_PX = 48;

/** Escape a string for safe inclusion in an XML attribute. */
export function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Assemble walked path elements from N pages into one importable SVG.
 * Pages stack top-to-bottom as separate `<g>` groups with a gap, so the
 * placed result reads as artboards-per-page (matching how the app treats
 * multi-root SVG imports).
 */
export function buildSvgFromPages(
  pages: Array<{ elements: PdfPathElement[]; width: number; height: number }>,
): string {
  const totalWidth = Math.max(...pages.map((p) => p.width), 1);
  const totalHeight = pages.reduce((sum, p) => sum + p.height + PDF_PAGE_GAP_PX, 0) - PDF_PAGE_GAP_PX;
  const groups = pages.map((page, index) => {
    const offsetY = pages.slice(0, index).reduce((sum, p) => sum + p.height + PDF_PAGE_GAP_PX, 0);
    const paths = page.elements
      .map((el) => {
        const attrs = [
          `d="${escapeXmlAttr(el.d)}"`,
          `fill="${el.fill}"`,
          `fill-rule="${el.fillRule}"`,
        ];
        if (el.stroke !== 'none') {
          attrs.push(`stroke="${el.stroke}"`, `stroke-width="${fmt(el.strokeWidth)}"`);
        } else {
          attrs.push('stroke="none"');
        }
        return `<path ${attrs.join(' ')} />`;
      })
      .join('');
    return `<g transform="translate(0 ${fmt(offsetY)})" data-pdf-page="${index + 1}">${paths}</g>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(totalWidth)} ${fmt(Math.max(totalHeight, 1))}" width="${fmt(totalWidth)}" height="${fmt(Math.max(totalHeight, 1))}">`,
    `<rect x="0" y="0" width="${fmt(totalWidth)}" height="${fmt(Math.max(totalHeight, 1))}" fill="#ffffff" />`,
    ...groups,
    '</svg>',
  ].join('');
}

/* ------------------------------------------------------------ */
/* importPdf — the pdf.js-backed entry point                      */
/* ------------------------------------------------------------ */

/**
 * Import a PDF file's vector content onto the canvas. Returns the number
 * of pages imported and text runs skipped. Throws on unreadable files;
 * callers surface the message.
 */
export async function importPdf(bytes: ArrayBuffer): Promise<{ pages: number; textRuns: number; paths: number }> {
  // Lazy-load pdf.js + its worker URL so this module stays cheap to import
  // (tests never trigger this path) and the worker asset is code-split.
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const ops: PdfOpsMap = {
    save: pdfjs.OPS.save, restore: pdfjs.OPS.restore, transform: pdfjs.OPS.transform,
    constructPath: pdfjs.OPS.constructPath,
    rectangle: pdfjs.OPS.rectangle, moveTo: pdfjs.OPS.moveTo, lineTo: pdfjs.OPS.lineTo,
    curveTo: pdfjs.OPS.curveTo, curveTo2: pdfjs.OPS.curveTo2, curveTo3: pdfjs.OPS.curveTo3,
    closePath: pdfjs.OPS.closePath,
    setFillRGBColor: pdfjs.OPS.setFillRGBColor, setStrokeRGBColor: pdfjs.OPS.setStrokeRGBColor,
    setFillCMYKColor: pdfjs.OPS.setFillCMYKColor, setStrokeCMYKColor: pdfjs.OPS.setStrokeCMYKColor,
    setFillGray: pdfjs.OPS.setFillGray, setStrokeGray: pdfjs.OPS.setStrokeGray,
    setLineWidth: pdfjs.OPS.setLineWidth,
    fill: pdfjs.OPS.fill, eoFill: pdfjs.OPS.eoFill, stroke: pdfjs.OPS.stroke,
    closeStroke: pdfjs.OPS.closeStroke, fillStroke: pdfjs.OPS.fillStroke,
    eoFillStroke: pdfjs.OPS.eoFillStroke, closeFillStroke: pdfjs.OPS.closeFillStroke,
    closeEOFillStroke: pdfjs.OPS.closeEOFillStroke,
    endPath: pdfjs.OPS.endPath,
    showText: pdfjs.OPS.showText, showSpacedText: pdfjs.OPS.showSpacedText,
  };

  const pages: Array<{ elements: PdfPathElement[]; width: number; height: number }> = [];
  let textRuns = 0;
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const opList = await page.getOperatorList();
    const walked = opListToPathElements(opList.fnArray, opList.argsArray, ops, viewport.transform as Mat);
    textRuns += walked.textRuns;
    pages.push({ elements: walked.elements, width: viewport.width, height: viewport.height });
  }

  const pathCount = pages.reduce((sum, p) => sum + p.elements.length, 0);
  if (pathCount === 0) {
    throw new Error(t('The PDF has no drawable vector content on its pages.'));
  }

  await importSVGString(buildSvgFromPages(pages));

  if (textRuns > 0) {
    toast.warn(
      t('{0} text runs skipped; convert text to outlines in the source app').replace('{0}', String(textRuns)),
    );
  }
  return { pages: pages.length, textRuns, paths: pathCount };
}

/**
 * File-facing wrapper used by the format registry: reads the File, shows a
 * progress toast for large documents, and reports success/failure.
 */
export async function importPdfFile(file: File): Promise<void> {
  const bytes = await file.arrayBuffer();
  const toastId = toast.info(t('Importing PDF…'));
  try {
    const result = await importPdf(bytes);
    toast.dismiss(toastId);
    toast.success(
      `${result.pages} ${t('page(s) imported')} · ${result.paths} ${t('paths')}`,
      { title: t('PDF imported') },
    );
  } catch (err) {
    toast.dismiss(toastId);
    const message = err instanceof Error ? err.message : String(err);
    logger.error('pdf', `import failed: ${message}`);
    toast.error(message, { title: t('PDF import failed') });
    throw err;
  }
}
