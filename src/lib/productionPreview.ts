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
 *   partition  — one item per top-level object (mixed sticker sheets) when
 *                2..MAX_ITEMS objects are selected; the whole selection as
 *                ONE item otherwise (single object = the historical path,
 *                >MAX_ITEMS objects = the documented fallback).
 *   footprint  — per item, union bounds of its cut paths (mm), so cut
 *                contours keep their gap even when they extend past the art;
 *                falls back to the item's own bbox when it has no paths.
 *   hull       — convexHull of the single closed contour when there is one
 *                (true-shape nesting), else the footprint rectangle.
 *   layout     — nestPolygons (convex-hull skyline packer, 90° rotation)
 *                packs ALL items' copies together on one sheet.
 *   raster     — buildBleedImage PER ITEM (N rasters; one per distinct
 *                sticker — ring-draw edge smear or HQ nearest mode).
 *   stamp      — each item's raster pasted at its own placements; cut contour
 *                overlay and regmark brackets drawn on top.
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
import { convexHull, nestPolygons, type NestPolyItem, type NestPolyPlacement } from './nesting';
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
/**
 * Distinct per-object items are capped: a mixed sticker sheet is a handful of
 * designs, not a wall of them, and every extra item is one more bleed raster.
 * Beyond the cap the whole selection imposes as ONE item — the historical
 * multi-object behaviour (union footprint, one raster), documented.
 */
const MAX_ITEMS = 12;

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

export interface ProductionPlacement {
  x: number;
  y: number;
  rotation: 0 | 90;
  /** Which `result.items` entry this placement stamps — always 0 in
   *  single-item runs (additive; index-parallel consumers keep working). */
  itemIndex: number;
}

export interface ProductionPreviewResult {
  url: string;                   // PNG dataURL of the composed sheet
  pxPerMm: number;               // raster resolution
  sheetW: number; sheetH: number;         // used extent, mm
  placements: ProductionPlacement[];      // item-hull-bbox top-left, mm
  /** The distinct imposed stickers in partition order — per-item copy counts
   *  (parallel info: `items[i].copies` is how many of placements carry
   *  itemIndex === i). `objectId` is fabric's `_id` when the top-level
   *  object has one. */
  items: Array<{ objectId?: string; copies: number }>;
  copies: number;                // total placements across all items
  utilization: number;           // 0..1, Σ item hull areas / sheet area
  cutPaths: CutPath[];           // PROPOSED cut paths: per-placement transformed copies (kinds/colors preserved; ids `${orig.id}-c${n}` single-item, `${orig.id}-i${itemIndex}-c${n}` multi-item) + regmark paths when marks on
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

/** All fabric `_id`s in an object's subtree (the same stamp walk
 *  cutPathsForSelection uses — contourFromSelection writes fabric `_id`s). */
function subtreeIds(o: fabric.FabricObject): Set<string> {
  const ids = new Set<string>();
  const walk = (x: fabric.FabricObject): void => {
    const id = (x as fabric.FabricObject & { _id?: string })._id;
    if (typeof id === 'string') ids.add(id);
    const group = x as unknown as { getObjects?: () => fabric.FabricObject[] };
    if (typeof group.getObjects === 'function') for (const child of group.getObjects()) walk(child);
  };
  walk(o);
  return ids;
}

/** One distinct sticker's imposition inputs, extracted verbatim from the
 *  former single-item pipeline (footprint → hull → nesting polygon →
 *  footprint-space cut points) so a 1-object run keeps its exact numbers. */
interface ItemGeometry {
  /** fabric `_id` of the item's top-level object, when it has one. */
  objectId?: string;
  /** Footprint top-left in document mm (cut-bbox top-left, or bbox). */
  footOriginX: number;
  footOriginY: number;
  footW: number;
  footH: number;
  /** Hull AABB top-left/size in FOOTPRINT space — the header math offsets. */
  hullOffX: number;
  hullOffY: number;
  hullW: number;
  hullH: number;
  /** |Hull area| mm² (the honest material-coverage unit). */
  hullArea: number;
  /** Strict hull re-based to the hull AABB origin — what nestPolygons packs. */
  nestPoints: Array<[number, number]>;
  /** The item's non-regmark cut paths (source records for proposed copies). */
  paths: CutPath[];
  /** The same paths' points in footprint space. */
  relPaths: Array<Array<[number, number]>>;
}

/** Compute one item's geometry from its objects and its own non-regmark cut
 *  paths (document mm). Null for a degenerate (≤0-side) footprint. */
function itemGeometry(objs: fabric.FabricObject[], nonReg: CutPath[]): ItemGeometry | null {
  // CUT-path bounds drive the footprint (not the object bbox) so contours
  // that extend beyond the art keep their neighbour gap. Document mm-space.
  const cutB = bounds(nonReg);

  // Object bbox in canvas px (the same measurement buildBleedImage uses) —
  // needed for the cut↔art alignment delta and the no-cut-paths fallback.
  const rects = objs.map(o => o.getBoundingRect());
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
    // No cut paths — nest the artwork's own bbox and emit no cut copies for
    // this item (single-item runs signal it via regmarks-only cutPaths).
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
  const id0 = (objs[0] as fabric.FabricObject & { _id?: string })._id;
  return {
    objectId: typeof id0 === 'string' ? id0 : undefined,
    footOriginX,
    footOriginY,
    footW,
    footH,
    hullOffX: hullMinX,
    hullOffY: hullMinY,
    hullW: hullMaxX - hullMinX,
    hullH: hullMaxY - hullMinY,
    hullArea,
    nestPoints: hullPoly.map(([hx, hy]) => [hx - hullMinX, hy - hullMinY] as [number, number]),
    paths: nonReg,
    relPaths,
  };
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
 * user falls back to Ring mode. With MULTIPLE top-level objects selected
 * (2..MAX_ITEMS) each object becomes its OWN item — own footprint (its
 * source-stamped cut paths, falling back to its own bbox), own bleed raster —
 * and `opts.copies` applies PER ITEM (each distinct sticker is imposed N
 * times; unstamped cut paths cannot be attributed per object and are only
 * honoured in single-item runs). One selected object — or more than
 * MAX_ITEMS — imposes the whole selection as one item, exactly as before.
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
  const nonReg = cutPaths.filter(p => p.kind !== 'regmark');

  // ── 1. Item partition + per-item footprint/hull (mm) ──────────────────
  // ONE item for a single object (the historical byte-path) or when the
  // selection exceeds MAX_ITEMS (whole-selection fallback: union footprint,
  // one raster); one item PER top-level object otherwise.
  let multiItem = objects.length >= 2 && objects.length <= MAX_ITEMS;
  if (multiItem) {
    // Any passed contour no object owns (no sourceObjectId match — e.g. a
    // multi-object welded Make Sticker ring) would be silently DROPPED by
    // the per-item partition. Cuts are never expendable: fall back to the
    // single union item so every contour keeps imposing. (flatMapping the
    // Set return would nest Sets — collect the ids explicitly.)
    const allIds = new Set<string>();
    for (const o of objects) for (const id of subtreeIds(o)) allIds.add(id);
    if (nonReg.some(p => !p.sourceObjectId || !allIds.has(p.sourceObjectId))) multiItem = false;
  }
  const partitions: Array<{ objects: fabric.FabricObject[]; paths: CutPath[] }> = multiItem
    ? objects.map(o => {
      const ids = subtreeIds(o);
      return { objects: [o], paths: nonReg.filter(p => !!p.sourceObjectId && ids.has(p.sourceObjectId)) };
    })
    : [{ objects, paths: nonReg }];
  const geoms: ItemGeometry[] = [];
  for (const part of partitions) {
    const g = itemGeometry(part.objects, part.paths);
    if (!g) return null; // degenerate footprint — nothing to impose
    geoms.push(g);
  }

  // ── 2. Copy cap (per item — `copies` counts EACH distinct sticker) ────
  const fixedH = opts.sheetHeightMm && opts.sheetHeightMm > 0 ? opts.sheetHeightMm : 0;
  const caps = geoms.map(g => {
    const areaCap = fixedH
      ? Math.max(1, Math.floor((opts.sheetWidthMm * fixedH * 0.9) / (g.footW * g.footH)))
      : Infinity;
    // The copies field is honoured on BOTH sheet kinds — area-fitted sheets
    // just clamp it from above (a full-imposition A4 run can still ask for 6).
    return Math.max(1, Math.min(opts.copies ?? (fixedH ? Infinity : 50), areaCap));
  });

  // ── 3. Layout ──────────────────────────────────────────────────────────
  // The nesting gap reserves hull-to-hull clearance for the CUT lines; the
  // bleed raster extends bleedMm past the contour on every side, so two
  // neighbours need 2×bleed between them for their ink never to cross.
  // Inflate the nesting gap accordingly (cut clearances only grow). ALL
  // items' copies are packed together by one nestPolygons call.
  const owners: Array<{ itemIdx: number; copyN: number }> = [];
  const nestItems: NestPolyItem[] = [];
  geoms.forEach((g, i) => {
    for (let n = 0; n < caps[i]; n++) {
      owners.push({ itemIdx: i, copyN: n });
      // Item ids drive nestPolygons's deterministic tie-breaks — `c${n}`
      // keeps the single-item packing order byte-identical to the historical
      // input; multi-item ids are prefixed with the partition index.
      nestItems.push({ id: multiItem ? `i${i}-c${n}` : `c${n}`, points: g.nestPoints });
    }
  });
  const nest = nestPolygons(nestItems, opts.sheetWidthMm, Math.max(gapMm, 2 * bleedMm), allowRotation);
  const kept = nest.placements
    .map((p, idx) => ({ p, ...owners[idx] }))
    // Fixed sheets: nestPolygons packs an infinite strip — drop placements
    // whose hull AABB breaks the sheet's bottom edge (they don't fit).
    .filter(({ p, itemIdx }) => p.placed
      && (!fixedH || p.y + (p.rotation === 90 ? geoms[itemIdx].hullW : geoms[itemIdx].hullH) <= fixedH + 1e-6));
  if (kept.length === 0) return null;
  const sheetH = fixedH ? Math.min(fixedH, nest.usedHeight) : nest.usedHeight;

  // Footprint-space point → sheet-space mm, per the rotation-90 algebra in
  // the module header — parameterized by the OWNING item's hull offsets.
  const placePoint = (q: [number, number], p: NestPolyPlacement, g: ItemGeometry): [number, number] =>
    p.rotation === 90
      ? [p.x + g.hullH + g.hullOffY - q[1], p.y + q[0] - g.hullOffX]
      : [p.x + q[0] - g.hullOffX, p.y + q[1] - g.hullOffY];

  // ── 4. Rasters (one per item: object + optional baked bleed) ──────────
  // bleedMm 0 is well-defined for the ring mode: radius-0 offsets + the
  // centered original = a plain multiplier× raster of the item's objects.
  // With bleed on, the item's cut paths (document mm, the same frame
  // relPaths uses, regmarks excluded) ride along so buildBleedImage can mask
  // the smear down to the cut lines — pass-through only, never layout input.
  // Any item's raster failure fails the WHOLE build (same contract as the
  // single-item path). All rasters share the fixed default multiplier, so
  // the sheet composes at one uniform resolution.
  const rasters: Array<{ url: string; rx: number; ry: number; rw: number; rh: number; k: number }> = [];
  for (let i = 0; i < partitions.length; i++) {
    const g = geoms[i];
    const bleed = await buildBleedImage(partitions[i].objects, {
      bleedMm,
      mode: bleedMode,
      cutPaths: bleedMm > 0 ? g.paths : undefined,
    });
    if (!bleed) return null;
    const k = bleed.multiplier * MM_TO_PX;
    // Raster rect in the ITEM's footprint space (mm): bleed.leftPx/topPx are
    // canvas px of the object bbox minus the bleed, so the delta
    // (objectBbox − cutBbox) − bleed lands the raster's top-left relative to
    // the cut-bounds footprint origin and keeps art aligned with cut lines.
    rasters.push({
      url: bleed.url,
      k,
      rx: bleed.leftPx / MM_TO_PX - g.footOriginX,
      ry: bleed.topPx / MM_TO_PX - g.footOriginY,
      rw: bleed.widthPx / MM_TO_PX,
      rh: bleed.heightPx / MM_TO_PX,
    });
  }
  const pxPerMm = rasters[0].k;

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

    const imgs = await Promise.all(rasters.map(r => loadImageEl(r.url)));
    for (const { itemIdx, p } of kept) {
      const g = geoms[itemIdx];
      const r = rasters[itemIdx];
      // Raster-local (0,0) after the placement transform (see header math):
      // rotation 90 mirrors the raster's frame into (tx − v, ty + u), so tx
      // sits at the rotated AABB's RIGHT edge.
      const tx = p.rotation === 90 ? p.x + g.hullH + g.hullOffY - r.ry : p.x + r.rx - g.hullOffX;
      const ty = p.rotation === 90 ? p.y + r.rx - g.hullOffX : p.y + r.ry - g.hullOffY;
      ctx.save();
      ctx.translate(tx * pxPerMm, ty * pxPerMm);
      if (p.rotation === 90) ctx.rotate(Math.PI / 2);
      ctx.drawImage(imgs[itemIdx], 0, 0, r.rw * pxPerMm, r.rh * pxPerMm);
      ctx.restore();
    }

    // ── 6. Proposed cut paths (+ magenta hairline overlay) ───────────────
    const proposed: CutPath[] = [];
    for (const { itemIdx, copyN, p } of kept) {
      const g = geoms[itemIdx];
      for (let j = 0; j < g.paths.length; j++) {
        const src = g.paths[j];
        proposed.push({
          // Multi-item copies carry their partition index so ids stay unique
          // across items (`cut-a-i0-c1` vs `cut-b-i1-c1`); single-item runs
          // keep the historical `-c${n}` suffix.
          id: multiItem ? `${src.id}-i${itemIdx}-c${copyN}` : `${src.id}-c${copyN}`,
          points: g.relPaths[j].map(q => placePoint(q, p, g)),
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
    const hullAreaSum = kept.reduce((sum, { itemIdx }) => sum + geoms[itemIdx].hullArea, 0);
    const utilization = Math.min(1, hullAreaSum / (opts.sheetWidthMm * sheetH));
    return {
      url,
      pxPerMm,
      sheetW: opts.sheetWidthMm,
      sheetH,
      placements: kept.map(({ itemIdx, p }) => ({ x: p.x, y: p.y, rotation: p.rotation, itemIndex: itemIdx })),
      items: geoms.map((g, i) => ({
        objectId: g.objectId,
        copies: kept.reduce((n, { itemIdx }) => n + (itemIdx === i ? 1 : 0), 0),
      })),
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
