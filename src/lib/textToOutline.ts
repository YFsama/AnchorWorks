/**
 * Create Outlines (Illustrator Type→Create Outlines).
 *
 * Two pipelines, strictly ordered:
 *
 * 1. Glyph vectors (preferred). For fonts whose BYTES we hold — slice 1: fonts
 *    the user uploaded via loadCustomFontFile, which parks the ArrayBuffer in
 *    the fontBytes registry — fontkit decodes the real beziers and
 *    glyphOutline.ts replays fabric's own layout caches to place them where
 *    the canvas paints. True M/L/C/Z outlines, no raster.
 *
 * 2. Raster trace (fallback, byte-for-byte the original behaviour). Browsers
 *    can't hand back the glyph beziers of an arbitrary loaded font (system
 *    fonts have no fetchable bytes; Google fonts ship woff2 behind css2 —
 *    planned for a later slice), so we rasterise the text to a supersampled
 *    offscreen canvas and trace it with the cutter suite's marching-squares
 *    `traceBitmap`.
 *
 * Anything pipeline 1 can't reproduce EXACTLY falls through to 2 with the
 * consumer none the wiser: missing/unresolvable bytes, faux bold/italic (the
 * browser synthesizes those; we only outline true faces), underline and its
 * overline/linethrough siblings, justify, text-on-path, RTL, per-character
 * styles, glyphs the font doesn't cover, and any fontkit/layout error.
 */
import * as fabric from 'fabric';
import type { Font } from 'fontkit';
import { getCanvas, pushHistory } from './canvasEngine';
import { traceBitmap } from './cutContour';
import { resolveFontBytes } from './fontBytes';
import { glyphOutlinePath } from './glyphOutline';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

const isTextType = (t?: string) => ['i-text', 'text', 'textbox'].includes(t ?? '');

/** True when the selection contains at least one text object. */
export function canCreateOutlines(): boolean {
  const c = getCanvas();
  if (!c) return false;
  return c.getActiveObjects().some((o) => isTextType(o.type));
}

function toD(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + ' Z';
}

/** Trace one text object into an even-odd compound fabric.Path (keeping its
 *  fill/position), or null if nothing traceable. */
async function traceTextToPath(text: fabric.FabricObject): Promise<fabric.Path | null> {
  const r = text.getBoundingRect();
  if (r.width < 1 || r.height < 1) return null;

  // Supersample the text onto a transparent offscreen canvas so the trace edges
  // stay smooth, capped so a huge headline can't blow out memory.
  const SS = 4;
  const W = Math.min(4096, Math.max(8, Math.ceil(r.width * SS)));
  const H = Math.min(4096, Math.max(8, Math.ceil(r.height * SS)));
  const el = document.createElement('canvas');
  el.width = W; el.height = H;
  const sc = new fabric.StaticCanvas(el, { width: W, height: H, renderOnAddRemove: false, enableRetinaScaling: false });

  let paths: Pt[][];
  try {
    const clone = await text.clone();
    clone.set({
      left: 0, top: 0, originX: 'left', originY: 'top', angle: 0,
      scaleX: (text.scaleX ?? 1) * SS, scaleY: (text.scaleY ?? 1) * SS,
      fill: '#000000', stroke: '', shadow: null,
    });
    clone.setCoords();
    sc.add(clone);
    sc.renderAll();
    const ctx = el.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, W, H);
    const pixelSizeMm = (r.width / MM_TO_PX) / W; // mm per raster pixel
    paths = traceBitmap(img, { useAlpha: true, threshold: 64, simplifyTolerance: 1.2, pixelSizeMm });
  } finally {
    sc.dispose();
  }
  if (paths.length === 0) return null;

  // Trace coords are mm relative to the text's top-left; offset to the page and
  // convert to px so the rebuilt path lands where the text was.
  const offX = r.left / MM_TO_PX;
  const offY = r.top / MM_TO_PX;
  const d = paths
    .map(c => toD(c.map(([x, y]) => [(x + offX) * MM_TO_PX, (y + offY) * MM_TO_PX] as Pt)))
    .join(' ');

  return new fabric.Path(d, {
    fill: (text.fill as string) ?? '#000000',
    fillRule: 'evenodd',
    stroke: '',
    strokeWidth: 0,
    opacity: text.opacity ?? 1,
  });
}

/* ------------------------- glyph-vector pipeline ------------------------- */

/** Lazy fontkit module — keeps its (brotli-carrying) weight out of startup. */
let fontkitModule: Promise<typeof import('fontkit')> | null = null;
const loadFontkit = () => (fontkitModule ??= import('fontkit'));

/** Parsed-font cache keyed by the registry's ArrayBuffer identity. */
const parsedFonts = new Map<ArrayBuffer, Font | null>();

/** Parse bytes with fontkit (cached); null when the bytes won't decode. */
async function parseFontBytes(bytes: ArrayBuffer): Promise<Font | null> {
  if (parsedFonts.has(bytes)) return parsedFonts.get(bytes) ?? null;
  let font: Font | null;
  try {
    const { create } = await loadFontkit();
    // fontkit's create() takes a typed-array view of the bytes.
    let parsed = create(new Uint8Array(bytes) as unknown as Parameters<typeof create>[0]);
    if ('fonts' in parsed) parsed = parsed.fonts[0]; // .ttc → first face
    font = parsed && parsed.unitsPerEm ? parsed : null;
  } catch {
    font = null; // undecodable bytes — caller falls back to the raster trace
  }
  parsedFonts.set(bytes, font);
  return font;
}

/**
 * True-glyph outline of one text object, or null whenever the glyph pipeline
 * can't land within its equivalence budget (≤1 css px of the canvas render) —
 * the fallback matrix lives here so no consumer ever sees a worse outline.
 */
async function vectorizeTextToPath(text: fabric.FabricObject): Promise<fabric.Path | null> {
  const t = text as fabric.Text;
  try {
    // Decorations painted by the browser around the glyphs (not part of any
    // glyph outline) — underline stands in for overline/linethrough too.
    if (t.underline || t.overline || t.linethrough) return null;
    if (t.textAlign.includes('justify')) return null; // space stretching ≠ pen placement
    if (t.path) return null; // text-on-path rotates every glyph individually
    const style = String(t.fontStyle ?? '').toLowerCase();
    const italic = style === 'italic' || style === 'oblique';
    const bytes = await resolveFontBytes(String(t.fontFamily ?? ''), t.fontWeight, italic);
    if (!bytes) return null; // no uploaded bytes / not a true face for this style
    const font = await parseFontBytes(bytes);
    if (!font) return null;
    // Map through the object's own matrix — the identical transform canvas
    // rendering applies — so the outline lands on the painted ink.
    const d = glyphOutlinePath(font, t, t.calcTransformMatrix());
    if (!d) return null; // RTL / char styles / missing glyphs / empty text
    return new fabric.Path(d, {
      fill: (t.fill as string) ?? '#000000',
      fillRule: 'evenodd',
      stroke: '',
      strokeWidth: 0,
      opacity: t.opacity ?? 1,
    });
  } catch {
    return null; // the vector pipeline must never break the feature
  }
}

/**
 * Replace every selected text object with traced outline paths (one even-odd
 * compound fabric.Path each, keeping the text's fill). Returns true if any were
 * converted.
 */
export async function createOutlinesFromText(): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  const texts = canvas.getActiveObjects().filter((o) => isTextType(o.type));
  if (texts.length === 0) return false;

  const made: fabric.FabricObject[] = [];
  for (const text of texts) {
    const outline = (await vectorizeTextToPath(text)) ?? (await traceTextToPath(text));
    if (outline) { canvas.remove(text); canvas.add(outline); made.push(outline); }
  }
  if (made.length === 0) return false;
  canvas.discardActiveObject();
  canvas.setActiveObject(made.length === 1 ? made[0] : new fabric.ActiveSelection(made, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
