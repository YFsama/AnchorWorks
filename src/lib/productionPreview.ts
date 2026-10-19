/**
 * Production Preview — impose the selection onto a printable sheet.
 *
 * Sign-shop "print then cut" production step (the last mile between the
 * design canvas and the RIP): take the current artwork selection plus its
 * cut paths, nest as many copies as fit on a fixed sheet (A4/A3/letter) or a
 * roll of the cutter's width, bake the Cricut-style ink bleed in
 * (bleedExpand), overlay the proposed cut contours, add Roland corner
 * registration marks, and hand back one PNG plus the PROPOSED cut-path list.
 * The dialog's Apply turns that preview into real canvas output — the sheet
 * image is inserted at the document origin and the store's cut paths are
 * REPLACED with the imposed copies + regmarks, so what you previewed is
 * exactly what prints and cuts.
 *
 * Composition pipeline (each stage is an existing, tested module):
 *   footprint  — union bounds of the non-regmark cut paths (mm), so cut
 *                contours keep their gap even when they extend past the art;
 *                falls back to the selection bbox when no cut paths exist.
 *   hull       — convexHull of the single closed contour when there is one
 *                (true-shape nesting), else the footprint rectangle.
 *   layout     — nestPolygons (convex-hull skyline packer, 90° rotation).
 *   raster     — buildBleedImage (ring-draw edge smear or HQ nearest mode).
 *   stamp      — the raster pasted at every placement; cut contour overlay
 *                and regmark brackets drawn on top.
 *
 * Rotation-90 alignment math (documented once, used everywhere):
 * nestPolygons reports each item's RAW ROTATED HULL AABB top-left as
 * (x, y) and rotates item points by the quarter-turn [x,y] → [−y,x]
 * (counter-clockwise in the algebraic sense). For a footprint-space point
 * q = (qx, qy), with hull AABB size (hullW × hullH) and the hull AABB's
 * top-left at footprint-space (hullOffX, hullOffY):
 *
 *   rotation 0  → sheet = ( x + qx − hullOffX ,  y + qy − hullOffY )
 *   rotation 90 → sheet = ( x + hullH + hullOffY − qy ,  y + qx − hullOffX )
 *
 * (rotated AABB = hullH wide × hullW tall; the item's footprint origin lands
 * at the rotated AABB's top-right corner.) Canvas stamping uses the same
 * rigid transform: translate to the raster's transformed origin, rotate by
 * +π/2 for turned copies, then drawImage — so art and cut lines always agree.
 */
import * as fabric from 'fabric';
import type { CutPath } from '../store/editor';
import { buildBleedImage } from './bleedExpand';
import { convexHull, nestPolygons, type NestPolyPlacement } from './nesting';
import { bounds } from './cutOptimize';
import { generateRegMarks } from './cutContour';

/** 96dpi mm→px divisor shared across the cutter pipeline (bleedExpand et al). */
const MM_TO_PX = 3.7795;

/** Cut-overlay hairline width in mm (visual only; the plotter uses its own). */
const CUT_OVERLAY_MM = 0.25;
/** Regmark bracket stroke width in mm (Roland prints solid 1 mm lines). */
const MARK_STROKE_MM = 1;
/** Inset of the corner L-brackets from the sheet edge, mm. */
const MARK_INSET_MM = 3;

export interface ProductionPreviewOptions {
  sheetWidthMm: number;
  /** Optional fixed sheet height; omit/0 for roll (auto height). */
  sheetHeightMm?: number;
  gapMm: number;                 // default 2
  copies?: number;               // max copies to place (default 50 roll / fit-to-sheet when sheetHeightMm given)
  bleedMm: number;               // 0 = none
  bleedMode?: 'ring' | 'nearest';// default 'ring'
  allowRotation?: boolean;       // default true
  showCutLines?: boolean;        // preview overlay only, default true
  showMarks?: boolean;           // corner L-brackets, default true
  markArmMm?: number;            // default 10
}

export interface ProductionPlacement { x: number; y: number; rotation: 0 | 90; }

export interface ProductionPreviewResult {
  url: string;                   // PNG dataURL of the composed sheet
  pxPerMm: number;               // raster resolution
  sheetW: number; sheetH: number;         // used extent, mm
  placements: ProductionPlacement[];      // item-bbox top-left, mm
  copies: number;
  utilization: number;           // 0..1, item footprint area / sheet area
  cutPaths: CutPath[];           // PROPOSED cut paths: per-placement transformed copies (kinds/colors preserved, ids `${orig.id}-c${n}`) + regmark paths when marks on
  bleedUsed: boolean;
}

export const SHEET_PRESETS: Array<{ id: string; label: string; widthMm: number; heightMm?: number }> = [
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  { id: 'a3', label: 'A3', widthMm: 297, heightMm: 420 },
  { id: 'letter', label: 'Letter', widthMm: 216, heightMm: 279 },
  { id: 'roll-300', label: 'Roll 300 mm', widthMm: 300 },
  { id: 'roll-600', label: 'Roll 600 mm', widthMm: 600 },
];

/** Selection-derived cut paths for imposition. Passing the WHOLE store's
 *  paths would fold unrelated contours (another object's contour, a doc-wide
 *  weed border) into every copy — the cutter would then slice empty spots on
 *  the sheet. A path is kept when its `sourceObjectId` matches the selection
 *  (contourFromSelection stamps fabric's object `_id`), or — for paths
 *  without a source stamp — when its bounds intersect the selection bbox
 *  (10 mm pad). Regmarks are never imposition geometry. */
export function cutPathsForSelection(cutPaths: CutPath[], objects: fabric.FabricObject[]): CutPath[] {
  const ids = new Set<string>();
  // Stub/plain objects (tests, deserialized previews) may lack the geometry
  // API — the bbox fallback is skipped rather than crashing.
  const rects = objects.flatMap(o => (typeof o.getBoundingRect === 'function' ? [o.getBoundingRect()] : []));
  const hasBbox = rects.length > 0;
  const selMinX = hasBbox ? Math.min(...rects.map(b => b.left)) / MM_TO_PX - 10 : -Infinity;
  const selMinY = hasBbox ? Math.min(...rects.map(b => b.top)) / MM_TO_PX - 10 : -Infinity;
  const selMaxX = hasBbox ? Math.max(...rects.map(b => b.left + b.width)) / MM_TO_PX + 10 : Infinity;
  const selMaxY = hasBbox ? Math.max(...rects.map(b => b.top + b.height)) / MM_TO_PX + 10 : Infinity;
  const walk = (o: fabric.FabricObject): void => {
    const id = (o as fabric.FabricObject & { _id?: string })._id;
    if (typeof id === 'string') ids.add(id);
    const group = o as unknown as { getObjects?: () => fabric.FabricObject[] };
    if (typeof group.getObjects === 'function') for (const child of group.getObjects()) walk(child);
  };
  for (const o of objects) walk(o);
  return cutPaths.filter(p => {
    if (p.kind === 'regmark') return false;
    if (p.sourceObjectId && ids.has(p.sourceObjectId)) return true;
    if (p.sourceObjectId) return false;
    if (!hasBbox) return true; // no geometry to test against — keep unstamped paths
    const b = bounds([p]);
    return !!b && b.maxX >= selMinX && b.minX <= selMaxX && b.maxY >= selMinY && b.minY <= selMaxY;
  });
}

/** |Shoelace area| of a polygon (0 for degenerate <3-vertex inputs). */
function polyAreaMm2(poly: Array<[number, number]>): number {
  if (poly.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

/** A w×h rectangle as an 8-point polygon (corners + edge midpoints). */
function rectPolygon(w: number, h: number): Array<[number, number]> {
  return [[0, 0], [w / 2, 0], [w, 0], [w, h / 2], [w, h], [w / 2, h], [0, h], [0, h / 2]];
}

/**
 * Load a raster URL into an <img> for canvas stamping, bounded: jsdom never
 * fires `load` for data: URLs (no image decoder), so after `capMs` we resolve
 * with the element anyway — real browsers decode a same-document data URL in
 * well under the cap, and a mocked-ctx test environment only inspects the
 * drawImage geometry, never the pixels.
 */
function loadImageEl(url: string, capMs = 250): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(img); } };
    img.onload = done;
    img.onerror = done;
    img.src = url;
    setTimeout(done, capMs);
  });
}

/**
 * Compose the imposed production sheet. Returns null when there is nothing to
 * impose (empty selection, nothing fits the sheet) or when the raster pipeline
 * fails — the 'nearest' HQ bleed mode needs real canvas pixel access and
 * returns null under a headless ctx, in which case the caller toasts and the
 * user falls back to Ring mode.
 */
export async function buildProductionPreview(
  objects: fabric.FabricObject[],
  cutPaths: CutPath[],
  opts: ProductionPreviewOptions,
): Promise<ProductionPreviewResult | null> {
  if (objects.length === 0) return null;
  const gapMm = Math.max(0, opts.gapMm ?? 2);
  const bleedMm = Math.max(0, opts.bleedMm ?? 0);
  const bleedMode = opts.bleedMode ?? 'ring';
  const allowRotation = opts.allowRotation ?? true;
  const showCutLines = opts.showCutLines ?? true;
  const showMarks = opts.showMarks ?? true;
  const markArmMm = opts.markArmMm ?? 10;

  // ── 1. Item footprint (mm) ─────────────────────────────────────────────
  // CUT-path bounds drive the footprint (not the selection bbox) so contours
  // that extend beyond the art keep their neighbour gap. Document mm-space.
  const nonReg = cutPaths.filter(p => p.kind !== 'regmark');
  const cutB = bounds(nonReg);

  // Selection bbox in canvas px (same measurement buildBleedImage uses) —
  // needed for the cut↔art alignment delta and the no-cut-paths fallback.
  const rects = objects.map(o => o.getBoundingRect());
  const selLeftPx = Math.min(...rects.map(b => b.left));
  const selTopPx = Math.min(...rects.map(b => b.top));

  let footOriginX: number; // document mm of the footprint's top-left
  let footOriginY: number;
  let footW: number;
  let footH: number;
  let hull: Array<[number, number]>;          // footprint-space nesting polygon
  let relPaths: Array<Array<[number, number]>>; // cut-path points, footprint space

  if (cutB) {
    footOriginX = cutB.minX;
    footOriginY = cutB.minY;
    footW = cutB.maxX - cutB.minX;
    footH = cutB.maxY - cutB.minY;
    relPaths = nonReg.map(p => p.points.map(([x, y]) => [x - cutB.minX, y - cutB.minY] as [number, number]));
    const contours = nonReg.filter(p => p.closed && p.points.length >= 3);
    hull = contours.length === 1
      ? contours[0].points.map(([x, y]) => [x - cutB.minX, y - cutB.minY] as [number, number])
      : rectPolygon(footW, footH);
  } else {
    // No cut paths — nest the artwork's own bbox and say so via cutPaths
    // carrying only regmarks (the dialog hints on Apply).
    footOriginX = selLeftPx / MM_TO_PX;
    footOriginY = selTopPx / MM_TO_PX;
    const selRightPx = Math.max(...rects.map(b => b.left + b.width));
    const selBottomPx = Math.max(...rects.map(b => b.top + b.height));
    footW = (selRightPx - selLeftPx) / MM_TO_PX;
    footH = (selBottomPx - selTopPx) / MM_TO_PX;
    relPaths = [];
    hull = rectPolygon(footW, footH);
  }
  if (footW <= 0 || footH <= 0) return null;

  // The strict hull (collinear midpoints dropped) + its AABB, normalised to
  // the hull's own origin — nestPolygons reports placement top-lefts in the
  // HULL frame, so we remember the hull's offset inside the footprint.
  const hullPoly = convexHull(hull);
  const hullArea = Math.max(polyAreaMm2(hullPoly), 1e-6);
  let hullMinX = Infinity, hullMinY = Infinity, hullMaxX = -Infinity, hullMaxY = -Infinity;
  for (const [hx, hy] of hullPoly) {
    if (hx < hullMinX) hullMinX = hx;
    if (hx > hullMaxX) hullMaxX = hx;
    if (hy < hullMinY) hullMinY = hy;
    if (hy > hullMaxY) hullMaxY = hy;
  }
  const hullOffX = hullMinX;
  const hullOffY = hullMinY;
  const hullW = hullMaxX - hullMinX;
  const hullH = hullMaxY - hullMinY;
  // Hull points re-based to the hull AABB origin — what nestPolygons packs.
  const nestPoints = hullPoly.map(([hx, hy]) => [hx - hullMinX, hy - hullMinY] as [number, number]);

  // ── 2. Copy cap ────────────────────────────────────────────────────────
  const fixedH = opts.sheetHeightMm && opts.sheetHeightMm > 0 ? opts.sheetHeightMm : 0;
  const areaCap = fixedH
    ? Math.max(1, Math.floor((opts.sheetWidthMm * fixedH * 0.9) / (footW * footH)))
    : Infinity;
  // The copies field is honoured on BOTH sheet kinds — area-fitted sheets
  // just clamp it from above (a full-imposition A4 run can still ask for 6).
  const cap = Math.max(1, Math.min(opts.copies ?? (fixedH ? Infinity : 50), areaCap));

  // ── 3. Layout ──────────────────────────────────────────────────────────
  // The nesting gap reserves hull-to-hull clearance for the CUT lines; the
  // bleed raster extends bleedMm past the contour on every side, so two
  // neighbours need 2×bleed between them for their ink never to cross.
  // Inflate the nesting gap accordingly (cut clearances only grow).
  const items = Array.from({ length: cap }, (_, i) => ({ id: `c${i}`, points: nestPoints }));
  const nest = nestPolygons(items, opts.sheetWidthMm, Math.max(gapMm, 2 * bleedMm), allowRotation);
  const hullBottom = (p: NestPolyPlacement) => p.y + (p.rotation === 90 ? hullW : hullH);
  const kept = nest.placements
    .map((p, n) => ({ p, n }))
    // Fixed sheets: nestPolygons packs an infinite strip — drop placements
    // whose hull AABB breaks the sheet's bottom edge (they don't fit).
    .filter(({ p }) => p.placed && (!fixedH || hullBottom(p) <= fixedH + 1e-6));
  if (kept.length === 0) return null;
  const sheetH = fixedH ? Math.min(fixedH, nest.usedHeight) : nest.usedHeight;

  // Footprint-space point → sheet-space mm, per the rotation-90 algebra in
  // the module header.
  const placePoint = (q: [number, number], p: NestPolyPlacement): [number, number] =>
    p.rotation === 90
      ? [p.x + hullH + hullOffY - q[1], p.y + q[0] - hullOffX]
      : [p.x + q[0] - hullOffX, p.y + q[1] - hullOffY];

  // ── 4. Raster (selection + optional baked bleed) ───────────────────────
  // bleedMm 0 is well-defined for the ring mode: radius-0 offsets + the
  // centered original = a plain multiplier× raster of the selection.
  const bleed = await buildBleedImage(objects, { bleedMm, mode: bleedMode });
  if (!bleed) return null;
  const pxPerMm = bleed.multiplier * MM_TO_PX;

  // Raster rect in FOOTPRINT space (mm): bleed.leftPx/topPx are canvas px of
  // the selection bbox minus the bleed, so the delta
  // (selectionBbox − cutBbox) − bleed lands the raster's top-left relative to
  // the cut-bounds footprint origin and keeps art aligned with cut lines.
  const rx = bleed.leftPx / MM_TO_PX - footOriginX;
  const ry = bleed.topPx / MM_TO_PX - footOriginY;
  const rw = bleed.widthPx / MM_TO_PX;
  const rh = bleed.heightPx / MM_TO_PX;

  // ── 5. Sheet canvas + stamping ─────────────────────────────────────────
  const W = Math.max(1, Math.ceil(opts.sheetWidthMm * pxPerMm));
  const H = Math.max(1, Math.ceil(sheetH * pxPerMm));
  try {
    const sheetEl = document.createElement('canvas');
    sheetEl.width = W;
    sheetEl.height = H;
    const ctx = sheetEl.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff'; // paper/vinyl base so the PNG previews honestly
    ctx.fillRect(0, 0, W, H);

    const img = await loadImageEl(bleed.url);
    for (const { p } of kept) {
      // Raster-local (0,0) after the placement transform (see header math):
      // rotation 90 mirrors the raster's frame into
      // (tx − v, ty + u), so tx sits at the rotated AABB's RIGHT edge.
      const tx = p.rotation === 90 ? p.x + hullH + hullOffY - ry : p.x + rx - hullOffX;
      const ty = p.rotation === 90 ? p.y + rx - hullOffX : p.y + ry - hullOffY;
      ctx.save();
      ctx.translate(tx * pxPerMm, ty * pxPerMm);
      if (p.rotation === 90) ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, rw * pxPerMm, rh * pxPerMm);
      ctx.restore();
    }

    // ── 6. Proposed cut paths (+ magenta hairline overlay) ───────────────
    const proposed: CutPath[] = [];
    for (const { p, n } of kept) {
      for (let i = 0; i < nonReg.length; i++) {
        const src = nonReg[i];
        proposed.push({
          id: `${src.id}-c${n}`,
          points: relPaths[i].map(q => placePoint(q, p)),
          closed: src.closed,
          kind: src.kind,
          passes: src.passes,
          color: src.color,
        });
      }
    }
    if (showCutLines && proposed.length) {
      ctx.strokeStyle = '#ff2e9a';
      ctx.lineWidth = Math.max(1, CUT_OVERLAY_MM * pxPerMm);
      for (const path of proposed) drawPoly(ctx, path.points, path.closed, pxPerMm);
    }

    // ── 7. Registration marks (preview lines + real CutPaths for Apply) ──
    const regmarks = showMarks
      ? generateRegMarks({
        bounds: { x: 0, y: 0, w: opts.sheetWidthMm, h: sheetH },
        armLength: markArmMm,
        inset: MARK_INSET_MM,
      })
      : [];
    if (regmarks.length) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, MARK_STROKE_MM * pxPerMm);
      for (const m of regmarks) drawPoly(ctx, m.points, m.closed, pxPerMm);
    }

    const url = sheetEl.toDataURL('image/png');

    // ── 8. Utilization + result ──────────────────────────────────────────
    const utilization = Math.min(1, (kept.length * hullArea) / (opts.sheetWidthMm * sheetH));
    return {
      url,
      pxPerMm,
      sheetW: opts.sheetWidthMm,
      sheetH,
      placements: kept.map(({ p }) => ({ x: p.x, y: p.y, rotation: p.rotation })),
      copies: kept.length,
      utilization,
      cutPaths: [...proposed, ...regmarks],
      bleedUsed: bleedMm > 0,
    };
  } catch {
    // Raster pipeline failure (encode etc.) — caller toasts.
    return null;
  }
}

/** Stroke one mm-space polyline on the sheet ctx (scaled to raster px). */
function drawPoly(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  closed: boolean,
  pxPerMm: number,
): void {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0] * pxPerMm, points[0][1] * pxPerMm);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0] * pxPerMm, points[i][1] * pxPerMm);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
}
