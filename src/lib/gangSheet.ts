/**
 * Gang Sheet Builder — batch image imposition onto a fixed-width DTF/UV-DTF
 * roll (the "collect dozens of PNGs → nest onto a roll width → export one
 * production PNG" workflow DTFBuild/Antigro sell as their whole product).
 *
 * The heavy lifting reuses the existing nesting engines (nesting.ts /
 * rasterNest.ts); this module is the product-shaped adapter around them:
 *
 *   • px→mm via each file's DPI (px · 25.4 / dpi);
 *   • per-source TRUE-SHAPE footprint — the convex hull of the source's
 *     downsampled alpha mask (cell-corner hull of the ≥128-alpha cells), or
 *     the plain rectangle when no mask survived decoding;
 *   • engine routing: rect-only jobs pack with `nestRects` (no part cap),
 *     jobs with any true-shape file pack with `nestPolygonsRaster`
 *     (occupancy-grid true-shape, RASTER_NEST_MAX_PARTS cap) — and with 90°
 *     rotation disallowed they fall back to `nestPolygons`, the one engine
 *     that honours allowRotate90=false exactly;
 *   • qty expansion (each source becomes N identical parts), unfit reasons
 *     as stable machine keys the dialog translates, and utilization computed
 *     from the parts' own area (hull shoelace / w·h) over the consumed sheet.
 *
 * Split by DOM dependency so vitest (jsdom) never touches the bitmap path:
 * `buildGangSheet` is pure geometry; `loadGangSheetSource` /
 * `composeGangSheetPng` are browser-only and take injectable deps for tests.
 */

import { convexHull, nestPolygons, nestRects, type NestItem, type NestPolyItem } from './nesting';
import { nestPolygonsRaster, RASTER_NEST_MAX_PARTS, type RasterNestItem } from './rasterNest';

// ─── Types ──────────────────────────────────────────────────────────────────

/** One customer artwork file (a PNG/JPEG/WebP dropped into the builder). */
export interface GangSheetSource {
  id: string;
  name: string;
  widthPx: number;
  heightPx: number;
  /** Copies of this artwork on the sheet (UI stepper, 1–99). */
  qty: number;
  /** Downsampled alpha mask (0–255 per cell, row-major). Present = nest the
   *  TRUE SHAPE (convex hull of opaque cells); absent = nest the rectangle. */
  mask?: { w: number; h: number; data: Uint8Array };
}

export interface GangSheetOptions {
  rollWidthMm: number;
  gapMm: number;
  dpi: number;
  allowRotate90: boolean;
  /** Sheet height budget; content beyond it is reported unfit. Default 2000. */
  maxSheetHeightMm?: number;
}

/** One qty-expanded artwork copy, placed in sheet space (mm). */
export interface GangSheetPlacement {
  id: string;
  x: number;
  y: number;
  /** PLACED (post-rotation) footprint — the hull AABB for true-shape parts. */
  widthMm: number;
  heightMm: number;
  /** True when the part was packed turned a quarter-turn. */
  rotated: boolean;
  /** Which copy of the source (0-based); `id` says which source. */
  qtyIndex: number;
}

/** Stable machine keys — the dialog maps them through t(). */
export type GangSheetUnfitReason = 'too-wide' | 'too-tall' | 'engine-cap' | 'invalid-size';

export interface GangSheetResult {
  /** Every expanded part, placed AND unfit (unfit ones overhang their own
   *  row at the bottom, engine semantics — see the unfit list for which). */
  placements: GangSheetPlacement[];
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** Σ placed part area (hull shoelace / w·h) ÷ (sheetW × sheetH), 0–1. */
  utilization: number;
  unfit: Array<{ id: string; reason: GangSheetUnfitReason }>;
}

/** Alpha value at/above which a mask cell counts as artwork (DTF standard). */
export const GANG_SHEET_ALPHA_THRESHOLD = 128;

/** Default sheet-height budget when the caller omits maxSheetHeightMm. */
export const GANG_SHEET_MAX_SHEET_HEIGHT_MM = 2000;

/** Longest mask edge loadGangSheetSource downsamples to. */
export const GANG_SHEET_MASK_MAX_EDGE = 256;

/** Compose-canvas pixel budget (64 Mpx ≈ 256 MB RGBA) — beyond it the export
 *  resolution is lowered proportionally instead of exploding the tab. */
export const GANG_SHEET_MAX_COMPOSE_PX = 64_000_000;

const MM_PER_IN = 25.4;

// ─── Footprint geometry (pure) ──────────────────────────────────────────────

/**
 * Convex hull of the source's opaque mask cells, in image-local mm — the
 * TRUE-SHAPE footprint handed to the nesting engines. Cell CORNERS (not
 * centres) are used so 1-cell-wide strips stay non-degenerate; only each
 * row's first/last opaque cell contributes corners, which is exact (every
 * interior cell's corners lie on the row rectangle those corners span) and
 * keeps the point count ≤ 4 × mask rows. Null when there is no usable mask
 * (absent / empty / degenerate) — the caller nests the plain rectangle.
 */
export function gangSheetHullMm(src: GangSheetSource, dpi: number): Array<[number, number]> | null {
  const m = src.mask;
  if (!m || m.w < 1 || m.h < 1) return null;
  const sx = (src.widthPx * MM_PER_IN / dpi) / m.w;
  const sy = (src.heightPx * MM_PER_IN / dpi) / m.h;
  const pts: Array<[number, number]> = [];
  for (let y = 0; y < m.h; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < m.w; x++) {
      if (m.data[y * m.w + x] >= GANG_SHEET_ALPHA_THRESHOLD) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first < 0) continue;
    // Corners of the row's extreme cells → the row's full mm extent at both
    // y and y+1: [(first·sx, y·sy) … ((last+1)·sx, (y+1)·sy)].
    pts.push([first * sx, y * sy], [first * sx, (y + 1) * sy], [(last + 1) * sx, y * sy], [(last + 1) * sx, (y + 1) * sy]);
  }
  const hull = convexHull(pts);
  return hull.length >= 3 ? hull : null;
}

/** The part's packing footprint: hull AABB (true shape) or the full image
 *  rectangle. `hull` mirrors gangSheetHullMm for engine routing. */
export interface GangSheetFrame {
  x0: number;
  y0: number;
  w: number;
  h: number;
  hull: Array<[number, number]> | null;
}

export function gangSheetFrameMm(src: GangSheetSource, dpi: number): GangSheetFrame {
  const hull = gangSheetHullMm(src, dpi);
  if (hull) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of hull) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { x0: minX, y0: minY, w: maxX - minX, h: maxY - minY, hull };
  }
  return { x0: 0, y0: 0, w: src.widthPx * MM_PER_IN / dpi, h: src.heightPx * MM_PER_IN / dpi, hull: null };
}

/** |Shoelace| area of a closed ring (mm², 0 for degenerate rings). */
function ringArea(poly: ReadonlyArray<[number, number]>): number {
  if (poly.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

// ─── buildGangSheet (pure) ──────────────────────────────────────────────────

/** One expanded copy of a source with its prepared footprint. */
interface GangPart {
  src: GangSheetSource;
  qtyIndex: number;
  frame: GangSheetFrame;
  /** Packing area — hull shoelace for true-shape parts, w·h for rects. */
  area: number;
}

/**
 * Nest qty-expanded artwork copies onto a fixed-width roll.
 *
 * Engine routing (see the module header): rect jobs → nestRects; true-shape
 * jobs → nestPolygonsRaster, except with allowRotate90=false → nestPolygons
 * (the raster engine has no rotation switch; nestPolygons honours it
 * exactly). Unfit parts keep their engine placement (own overhang row at the
 * bottom) and are listed in `unfit` with a stable reason key; utilization
 * sums PLACED parts only.
 */
export function buildGangSheet(sources: GangSheetSource[], opts: GangSheetOptions): GangSheetResult {
  const dpi = opts.dpi > 0 ? opts.dpi : 300;
  const gap = Math.max(0, opts.gapMm);
  const rollW = opts.rollWidthMm;
  const maxH = opts.maxSheetHeightMm && opts.maxSheetHeightMm > 0 ? opts.maxSheetHeightMm : GANG_SHEET_MAX_SHEET_HEIGHT_MM;

  const unfit: Array<{ id: string; reason: GangSheetUnfitReason }> = [];
  if (!(rollW > 0) || sources.length === 0) {
    return { placements: [], sheetWidthMm: rollW > 0 ? rollW : 0, sheetHeightMm: 0, utilization: 0, unfit };
  }

  // Prepare + qty-expand. Zero/negative-qty sources contribute no parts
  // (the UI clamps 1–99; the lib stays defensive).
  const parts: GangPart[] = [];
  for (const src of sources) {
    if (!(src.widthPx > 0) || !(src.heightPx > 0)) {
      unfit.push({ id: src.id, reason: 'invalid-size' });
      continue;
    }
    const frame = gangSheetFrameMm(src, dpi);
    const area = frame.hull ? ringArea(frame.hull) : frame.w * frame.h;
    const qty = Math.floor(Number.isFinite(src.qty) ? src.qty : 0);
    for (let q = 0; q < qty; q++) parts.push({ src, qtyIndex: q, frame, area });
  }

  const anyTrueShape = parts.some(p => p.frame.hull !== null);

  const toPlacement = (p: GangPart, x: number, y: number, rotated: boolean): GangSheetPlacement => ({
    id: p.src.id,
    x,
    y,
    widthMm: rotated ? p.frame.h : p.frame.w,
    heightMm: rotated ? p.frame.w : p.frame.h,
    rotated,
    qtyIndex: p.qtyIndex,
  });

  // ── Rect jobs: nestRects (no part cap, exact gap via inflated footprints).
  if (!anyTrueShape) {
    const items: NestItem[] = parts.map(p => ({ w: p.frame.w, h: p.frame.h }));
    const r = nestRects(items, rollW, gap, opts.allowRotate90);
    let placedArea = 0;
    const placements = r.placements.map((pl, i) => {
      const part = parts[i];
      const ph = pl.rotated ? part.frame.w : part.frame.h;
      if (!pl.placed) unfit.push({ id: part.src.id, reason: 'too-wide' });
      else if (pl.y + ph > maxH + 1e-6) unfit.push({ id: part.src.id, reason: 'too-tall' });
      else placedArea += part.area;
      return toPlacement(part, pl.x, pl.y, pl.rotated);
    });
    // nestRects packs an infinite strip — clamp the reported sheet to the
    // height budget; parts past it are already marked unfit above.
    const sheetH = Math.min(r.usedHeight, maxH);
    const utilization = sheetH > 0 && placedArea > 0 ? Math.min(1, placedArea / (rollW * sheetH)) : 0;
    return { placements, sheetWidthMm: rollW, sheetHeightMm: sheetH, utilization, unfit };
  }

  // Engine part id must be unique across copies for the deterministic FFD
  // tie-break (area desc, id asc) — source id + qty index is exactly that.
  // Rect parts in a true-shape job become 4-corner rings so ONE engine call
  // packs the whole mixed job.
  const polyItems = (): Array<RasterNestItem & NestPolyItem> => parts.map((p) => ({
    id: `${p.src.id}:${p.qtyIndex}`,
    points: p.frame.hull ?? [[0, 0], [p.frame.w, 0], [p.frame.w, p.frame.h], [0, p.frame.h]] as Array<[number, number]>,
  }));

  // ── True-shape jobs with rotation allowed: nestPolygonsRaster (concavity/
  //    tuck-aware occupancy grid; rotation follows the engine's rot-0-bias
  //    tie rule, i.e. parts only turn when that packs strictly better).
  if (opts.allowRotate90) {
    const r = nestPolygonsRaster(polyItems(), rollW, gap, { maxSheetHeightMm: maxH });
    const placedCount = r.placements.filter(p => p.placed).length;
    const capHit = placedCount >= RASTER_NEST_MAX_PARTS;
    let placedArea = 0;
    const placements = r.placements.map((pl, i) => {
      const part = parts[i];
      if (!pl.placed) {
        // Width overflow beats every other reason: such a part is unfit in
        // any engine state; then the part cap; what remains hit the height cap.
        const minSide = Math.min(part.frame.w, part.frame.h);
        if (minSide > rollW + 1e-6) unfit.push({ id: part.src.id, reason: 'too-wide' });
        else if (capHit) unfit.push({ id: part.src.id, reason: 'engine-cap' });
        else unfit.push({ id: part.src.id, reason: 'too-tall' });
      } else {
        placedArea += part.area;
      }
      return toPlacement(part, pl.x, pl.y, pl.rotation === 90);
    });
    const sheetH = r.usedHeight; // engine guarantees ≤ maxSheetHeightMm
    const utilization = sheetH > 0 && placedArea > 0 ? Math.min(1, placedArea / (rollW * sheetH)) : 0;
    return { placements, sheetWidthMm: rollW, sheetHeightMm: sheetH, utilization, unfit };
  }

  // ── True-shape jobs WITHOUT rotation: nestPolygons (hull skyline, the one
  //    engine that honours allowRotate90=false exactly). Same unfit mapping
  //    as the rect path, incl. the post-hoc height-budget check.
  const r = nestPolygons(polyItems(), rollW, gap, false);
  let placedArea = 0;
  const placements = r.placements.map((pl, i) => {
    const part = parts[i];
    const ph = pl.rotation === 90 ? part.frame.w : part.frame.h;
    if (!pl.placed) unfit.push({ id: part.src.id, reason: 'too-wide' });
    else if (pl.y + ph > maxH + 1e-6) unfit.push({ id: part.src.id, reason: 'too-tall' });
    else placedArea += part.area;
    return toPlacement(part, pl.x, pl.y, pl.rotation === 90);
  });
  const sheetH = Math.min(r.usedHeight, maxH);
  const utilization = sheetH > 0 && placedArea > 0 ? Math.min(1, placedArea / (rollW * sheetH)) : 0;
  return { placements, sheetWidthMm: rollW, sheetHeightMm: sheetH, utilization, unfit };
}

// ─── File intake (browser-only) ─────────────────────────────────────────────

/**
 * Decode a dropped/selected image file into a GangSheetSource: full pixel
 * size for mm math + a downsampled alpha mask (longest edge ≤ 256) for
 * true-shape nesting. jsdom has no createImageBitmap — tests do not call
 * this; when OffscreenCanvas is unavailable the source simply nests as a
 * rectangle (mask left undefined).
 */
export async function loadGangSheetSource(file: File): Promise<GangSheetSource> {
  const bitmap = await createImageBitmap(file);
  try {
    const wPx = bitmap.width;
    const hPx = bitmap.height;
    const scale = Math.min(1, GANG_SHEET_MASK_MAX_EDGE / Math.max(wPx, hPx));
    const mw = Math.max(1, Math.round(wPx * scale));
    const mh = Math.max(1, Math.round(hPx * scale));
    let mask: GangSheetSource['mask'];
    if (typeof OffscreenCanvas !== 'undefined') {
      const oc = new OffscreenCanvas(mw, mh);
      const ctx = oc.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, mw, mh);
        const rgba = ctx.getImageData(0, 0, mw, mh).data;
        const data = new Uint8Array(mw * mh);
        for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3];
        mask = { w: mw, h: mh, data };
      }
    }
    return {
      id: `gs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      widthPx: wPx,
      heightPx: hPx,
      qty: 1,
      mask,
    };
  } finally {
    bitmap.close();
  }
}

// ─── Sheet composition (browser-only, deps injectable for tests) ────────────

/** The 2D surface composeGangSheetPng draws with — a structural slice of
 *  CanvasRenderingContext2D so tests can pass a recording fake. */
export type GangSheetCtx = Pick<CanvasRenderingContext2D, 'drawImage' | 'save' | 'restore' | 'translate' | 'rotate'>;

export interface GangSheetComposeCanvas {
  width: number;
  height: number;
  ctx: GangSheetCtx;
  /** Present on real DOM canvases; injected fakes may omit it (then inject
   *  `toBlob` too — the default encoder needs the element). */
  element?: HTMLCanvasElement;
}

export interface ComposeGangSheetDeps {
  /** Canvas factory — inject a fake in tests (jsdom has no 2D context). */
  createCanvas?: (width: number, height: number) => GangSheetComposeCanvas;
  /** PNG encoder — inject alongside a fake canvas. */
  toBlob?: (canvas: GangSheetComposeCanvas) => Promise<Blob>;
}

function domCanvas(w: number, h: number): GangSheetComposeCanvas {
  const element = document.createElement('canvas');
  element.width = w;
  element.height = h;
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return { width: w, height: h, ctx, element };
}

async function domToBlob(c: GangSheetComposeCanvas): Promise<Blob> {
  if (!c.element) throw new Error('composeGangSheetPng: inject toBlob for custom canvases');
  return new Promise<Blob>((resolve, reject) => {
    c.element!.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png');
  });
}

/**
 * Compose the gang sheet PNG: white sheet at the sheet's native DPI (px =
 * mm · dpi / 25.4), each placement's source bitmap drawn at its exact mm
 * position — rotated a quarter-turn CCW (the engines' [x, y] → [-y, x] map)
 * when `rotated`, offset by the part's hull origin so the true-shape
 * footprint, not the transparent image padding, lands on the placement.
 * Resolution is lowered proportionally past GANG_SHEET_MAX_COMPOSE_PX.
 * `bitmaps` is keyed by source id; missing entries are skipped.
 */
export async function composeGangSheetPng(
  result: GangSheetResult,
  sources: readonly GangSheetSource[],
  bitmaps: ReadonlyMap<string, CanvasImageSource>,
  opts: { dpi: number; deps?: ComposeGangSheetDeps },
): Promise<Blob> {
  const dpi = opts.dpi > 0 ? opts.dpi : 300;
  const deps = opts.deps ?? {};

  // Native resolution, clamped by the pixel budget (keeps huge rolls from
  // blowing the browser canvas/memory caps; proportional so mm stay true).
  let f = dpi / MM_PER_IN;
  const w0 = Math.max(1, Math.ceil(result.sheetWidthMm * f));
  const h0 = Math.max(1, Math.ceil(result.sheetHeightMm * f));
  const over = (w0 * h0) / GANG_SHEET_MAX_COMPOSE_PX;
  if (over > 1) f /= Math.sqrt(over);
  const w = Math.max(1, Math.ceil(result.sheetWidthMm * f));
  const h = Math.max(1, Math.ceil(result.sheetHeightMm * f));

  const canvas = deps.createCanvas ? deps.createCanvas(w, h) : domCanvas(w, h);
  const ctx = canvas.ctx;
  const byId = new Map(sources.map(s => [s.id, s]));

  for (const p of result.placements) {
    const bmp = bitmaps.get(p.id);
    const src = byId.get(p.id);
    if (!bmp || !src) continue;
    // Source bitmap px → sheet canvas px, both via the SAME mm extent so the
    // drawn size is exact at whatever clamped resolution f ended up being.
    const dw = (src.widthPx * MM_PER_IN / dpi) * f;
    const dh = (src.heightPx * MM_PER_IN / dpi) * f;
    const frame = gangSheetFrameMm(src, dpi);
    ctx.save();
    if (p.rotated) {
      // [x, y] → [-y, x] then translate so the rotated hull AABB min lands
      // at (p.x, p.y): the hull's max local y maps onto the placement's left
      // edge, its min local x onto the top edge (see the module header).
      ctx.translate((p.x + frame.y0 + frame.h) * f, (p.y - frame.x0) * f);
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate((p.x - frame.x0) * f, (p.y - frame.y0) * f);
    }
    ctx.drawImage(bmp, 0, 0, src.widthPx, src.heightPx, 0, 0, dw, dh);
    ctx.restore();
  }

  return deps.toBlob ? deps.toBlob(canvas) : domToBlob(canvas);
}
