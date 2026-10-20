/**
 * Raster occupancy-grid true-shape nesting (bin packing) — the concavity-aware
 * sibling of `nestPolygons` (nesting.ts).
 *
 * The hull/skyline packer treats every part as its convex hull, which is the
 * right cheap approximation for blob-like decals — but interleaving shapes
 * (Ls, C-channels, lettering with counters, weeded strip offcuts) lock away
 * the material inside their concavities. The robust alternative from
 * docs/research-sticker-printcut-2026-10.md §nesting is raster occupancy-grid
 * nesting: rasterize each part's bitmap at k px/mm, keep a sheet occupancy
 * grid plus the distance transform of its free space, and place a part at the
 * first position where every covered cell is free AND the
 * distance-to-occupied under the part's mask ≥ gap — the "raster penetration
 * map" (Meng et al., 2025). Any concavity is handled for free and there are
 * no NFP edge cases; the cost is pixel work, bounded by the grid cap below.
 *
 * Determinism: parts are packed first-fit-decreasing (mask area desc, id asc)
 * and the position scan is a pure y-major bottom-left sweep (lowest y, then
 * lowest x, rotation 0 on ties — the same tie rules as nestRects/
 * nestPolygons), so identical inputs deep-equal across runs.
 *
 * Resolution & caps (documented contract):
 *   • k defaults to 2 px/mm; the sheet grid is capped at ~4 M px
 *     (W × maxSheetHeight). If the cap forces it, k is lowered adaptively
 *     (continuous, floored at 1); a sheet so large it still overflows at k=1
 *     gets its scan height clamped instead of its width.
 *   • Gap clearance applies BETWEEN parts (pairwise), matching nestRects /
 *     nestPolygons: the first part lands flush at (0, 0) and parts may touch
 *     the sheet edges — the sheet width constraint is x ≥ 0, x + w ≤ W.
 *     The fit test compares mask CELL CENTRES (distance-to-occupied ≥ gapPx
 *     per covered cell), so the physical edge-to-edge clearance is ≈ gap −
 *     1/k mm — one cell-centre slack versus nestPolygons' exact hull gap.
 *   • Part-in-hole: an item may declare `holes` — rings inside `points`
 *     whose fill is cleared from the footprint mask, so smaller parts nest
 *     inside the cut-outs of larger placed parts (Deepnest-style). The
 *     pairwise gap applies to the hole walls too: the EDT fit test measures
 *     distance to the frame's own occupied cells, so a nested part
 *     automatically keeps the gap without any special case.
 *   • At most 60 parts are PLACED per call (RASTER_NEST_MAX_PARTS); anything
 *     beyond that (or wider/taller than the sheet in both orientations) is
 *     reported unfit and overhangs from its own row at the bottom of the
 *     pack, exactly like nestPolygons' unfit placements.
 *   • When the adaptive-k scan-height clamp engages on huge jobs, occupancy
 *     rows past the clamp are not recorded — gap checks for later parts can
 *     read marginally optimistic near the capped bottom edge.
 *
 * All geometry is in the caller's units (mm when driven by cut paths); `gap`
 * is those same units, converted to px via k internally.
 */

import { fillPolygonMask, interiorEdt } from './rasterEdt';

/** A closed polygon ring in the caller's units (mm when driven by cut paths). */
export interface RasterNestItem {
  id: string;
  /** Boundary points; closure is implied (last point joins the first). */
  points: Array<[number, number]>;
  /** Optional hole rings INSIDE `points` — masked free so smaller parts can
   *  nest inside (part-in-hole). Rings share `points`' document-mm space and
   *  are contractually contained by the outer ring; the prepared footprint
   *  clears each hole's fill, and a nested part keeps the pairwise gap from
   *  the hole walls via the same EDT fit test as any other neighbour. */
  holes?: Array<Array<[number, number]>>;
}

/** Where a part's (possibly rotated) raster footprint landed. */
export interface RasterNestPlacement {
  id: string;
  /** Left edge of the part's RAW geometry AABB in sheet space (px ÷ k). */
  x: number;
  /** Top edge of the part's RAW geometry AABB in sheet space. */
  y: number;
  /** 90 = the part was packed turned a quarter-turn ([x, y] → [-y, x]). */
  rotation: 0 | 90;
  /** False when the part fits neither rotation within the sheet width /
   *  height cap (or sits past the 60-part cap) — it then overhangs from its
   *  own row at the bottom of the pack, like nestPolygons. */
  placed: boolean;
}

export interface RasterNestResult {
  /** Placements parallel to the input `items` order. */
  placements: RasterNestPlacement[];
  /** Sheet height consumed (bottom of the deepest stamped footprint, px/k). */
  usedHeight: number;
  /** Σ placed mask cells ÷ (W px × usedHeight px), 0–1 — PIXEL-area based
   *  (the rasterized fill of each part, not its hull), so the number is
   *  resolution-dependent by construction; honest true-shape coverage. */
  utilization: number;
  /** How many parts could not be placed (see RasterNestPlacement.placed). */
  unfit: number;
}

/** Hard cap on placed parts per call — each placement costs one O(W·H_used)
 *  distance-transform rebuild plus a position scan, so past this the call
 *  reports the remaining (smallest, FFD tail) parts as unfit. */
export const RASTER_NEST_MAX_PARTS = 60;

/** Soft grid budget: W × maxSheetHeight stays at or under ~4 M px. */
const GRID_CAP_PX = 4_000_000;

/** A rasterized part footprint plus per-row extents for the fast scan. */
interface PreparedMask {
  mask: Uint8Array;
  w: number;
  h: number;
  /** First/last occupied column per mask row; c0[r] = -1 marks empty rows. */
  ext: { c0: Int32Array; c1: Int32Array };
}

/**
 * Rotate a bitmap a quarter-turn counter-clockwise — the exact mask of the
 * point map [x, y] → [-y, x] the placement/rebuild convention uses: cell
 * (i, j) lands at (h-1-j, i) after normalising the rotated cloud to its own
 * origin. Cell count (mask area) is preserved, so FFD area ordering is
 * rotation-independent.
 */
function rotateMaskCCW(mask: Uint8Array, w: number, h: number): PreparedMask {
  const out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (mask[j * w + i]) out[i * h + (h - 1 - j)] = 1;
    }
  }
  return { mask: out, w: h, h: w, ext: maskRowExtents(out, h, w) };
}

/** Per-row occupied-column extents (empty rows get c0 = c1 = -1). */
function maskRowExtents(mask: Uint8Array, w: number, h: number): { c0: Int32Array; c1: Int32Array } {
  const c0 = new Int32Array(h).fill(-1);
  const c1 = new Int32Array(h).fill(-1);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (mask[r * w + c]) {
        if (c0[r] < 0) c0[r] = c;
        c1[r] = c;
      }
    }
  }
  return { c0, c1 };
}

/** Fill `ring` on its own bbox grid and blit the cells into the combined
 *  `into` mask at the ring bbox's ROUNDED cell offset from (originX, originY)
 *  — set when `clear` is false, cleared when true. Grid-aligned geometry
 *  (integer mm at k) blits exactly; otherwise the rounding costs ≤ half a
 *  cell, the same order as the documented cell-centre gap slack. */
function blitFilledRing(
  into: Uint8Array,
  w: number,
  h: number,
  ring: ReadonlyArray<[number, number]>,
  originX: number,
  originY: number,
  k: number,
  clear: boolean,
): void {
  let rMinX = Infinity;
  let rMinY = Infinity;
  for (const [x, y] of ring) {
    if (x < rMinX) rMinX = x;
    if (y < rMinY) rMinY = y;
  }
  const f = fillPolygonMask(ring, k);
  const offX = Math.round((rMinX - originX) * k);
  const offY = Math.round((rMinY - originY) * k);
  for (let j = 0; j < f.h; j++) {
    const tj = j + offY;
    if (tj < 0 || tj >= h) continue;
    for (let i = 0; i < f.w; i++) {
      const ti = i + offX;
      if (ti < 0 || ti >= w) continue;
      if (f.mask[j * f.w + i]) into[tj * w + ti] = clear ? 0 : 1;
    }
  }
}

/**
 * Rasterize a part footprint WITH holes at k px/mm (part-in-hole): stamp the
 * outer ring's fill, then CLEAR each hole ring's fill — a frame with a window
 * (outer contour + inner contour) occupies only its walls, so smaller parts
 * can nest inside the cut-out. Holes share the outer ring's document-mm
 * space, so the mask's bbox spans the outer ring ∪ every hole (defensive:
 * contractually holes sit inside, but a stray vertex must still land on the
 * grid, not wrap the blit). `fillPolygonMask` grids each ring on its OWN
 * bbox, hence the rounded-offset blit above.
 */
function fillItemMask(
  points: ReadonlyArray<[number, number]>,
  holes: Array<ReadonlyArray<[number, number]>>,
  k: number,
): { mask: Uint8Array; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of [points, ...holes]) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (points.length === 0 || maxX < minX || maxY < minY) {
    return { mask: new Uint8Array(0), w: 0, h: 0 };
  }
  const w = Math.max(1, Math.ceil((maxX - minX) * k));
  const h = Math.max(1, Math.ceil((maxY - minY) * k));
  const mask = new Uint8Array(w * h);
  blitFilledRing(mask, w, h, points, minX, minY, k, false);
  for (const hole of holes) blitFilledRing(mask, w, h, hole, minX, minY, k, true);
  return { mask, w, h };
}

/**
 * Can `m` stamp at (x, y)? Every occupied mask cell must land on a free sheet
 * cell whose distance to the nearest occupied cell is ≥ gapPx (the raster
 * penetration test — free cells far enough from every neighbour can never
 * overlap or crowd a placed part, whatever the concavities involved). `dist`
 * is null while the sheet is empty, when the gap is trivially honoured.
 * Caller guarantees x + m.w ≤ W and y + m.h ≤ scanRegionH. Early-exits on the
 * first violating cell via the per-row extents.
 */
function fits(
  occ: Uint8Array,
  dist: Float32Array | null,
  W: number,
  m: PreparedMask,
  x: number,
  y: number,
  gapPx: number,
): boolean {
  for (let r = 0; r < m.h; r++) {
    const c0 = m.ext.c0[r];
    if (c0 < 0) continue; // empty mask row
    const rowBase = (y + r) * W + x;
    for (let c = c0; c <= m.ext.c1[r]; c++) {
      if (!m.mask[r * m.w + c]) continue;
      const i = rowBase + c;
      if (occ[i]) return false;
      if (dist !== null && dist[i] < gapPx) return false;
    }
  }
  return true;
}

/** Mark `m`'s cells occupied at (x, y). Clips to the allocated grid (unfit
 *  overhang rows may run past the allocation's bottom); no explicit gap halo
 *  is stamped — future placements' occDist ≥ gapPx test IS the halo. */
function stamp(occ: Uint8Array, W: number, allocH: number, m: PreparedMask, x: number, y: number): void {
  for (let r = 0; r < m.h; r++) {
    const row = y + r;
    if (row < 0 || row >= allocH) continue;
    const c0 = m.ext.c0[r];
    if (c0 < 0) continue;
    for (let c = c0; c <= m.ext.c1[r]; c++) {
      if (!m.mask[r * m.w + c]) continue;
      const col = x + c;
      if (col >= 0 && col < W) occ[row * W + col] = 1;
    }
  }
}

/**
 * First-fit-decreasing RASTER true-shape packer against a fixed-width sheet,
 * minimising consumed height.
 *
 * 1. Every item is rasterized with `fillPolygonMask` at k px/mm in both
 *    rotations (rotation 90 = the rotateMaskCCW bitmap of the [-y, x] point
 *    map) and sorted mask-area desc, id asc. Items with `holes` stamp the
 *    outer ring's fill then clear each hole's fill (part-in-hole), and the
 *    FFD area is the holed footprint — the true material area.
 * 2. The sheet occupancy grid (W = ceil(sheetWidth·k) px wide, generously
 *    preallocated to the worst-case vertical stack of all parts, never
 *    taller than the height cap) starts empty. After each placement the
 *    distance transform `interiorEdt` of the FREE cells is recomputed over
 *    the rows that can still matter (deepest content + one gap + the current
 *    part) — a placement is valid where every covered cell is free AND its
 *    distance-to-occupied ≥ gap·k px.
 * 3. Each part takes the bottom-left-most valid position (y-major, then x,
 *    rotation 0 before 90), then stamps its mask into the grid.
 * 4. No valid position within the height cap (or wider than the sheet in
 *    both rotations, or past the 60-part cap) → placed: false, unfit++,
 *    own overhang row at the bottom — nestPolygons semantics.
 *
 * Reported placement x/y is the top-left of the part's RAW (possibly
 * rotated) geometry AABB in the caller's units, so `nestCutPathsRaster` can
 * rebuild cut paths with the exact transform convention `nestCutPathsVinyl`
 * uses. `utilization` sums placed mask CELLS (pixel-area based).
 */
export function nestPolygonsRaster(
  items: RasterNestItem[],
  sheetWidth: number,
  gap = 2,
  opts?: { pxPerMm?: number; maxSheetHeightMm?: number },
): RasterNestResult {
  const placements: RasterNestPlacement[] = items.map(it => ({ id: it.id, x: 0, y: 0, rotation: 0 as 0 | 90, placed: true }));
  if (items.length === 0 || sheetWidth <= 0) {
    return { placements, usedHeight: 0, utilization: 0, unfit: 0 };
  }
  const g = Math.max(0, gap);

  // Resolve the grid resolution under the ~4 Mpx budget: default 2 px/mm;
  // lower k adaptively (floor 1) when W × Hcap would overflow, and clamp the
  // scan height only for sheets that still overflow at k = 1.
  let k = opts?.pxPerMm && opts.pxPerMm > 0 ? opts.pxPerMm : 2;
  const maxSheetHeightMm = opts?.maxSheetHeightMm && opts.maxSheetHeightMm > 0 ? opts.maxSheetHeightMm : 2000;
  let W = Math.max(1, Math.ceil(sheetWidth * k));
  let Hcap = Math.max(1, Math.ceil(maxSheetHeightMm * k));
  if (W * Hcap > GRID_CAP_PX) {
    k = Math.max(1, Math.floor(Math.sqrt(GRID_CAP_PX / (sheetWidth * maxSheetHeightMm)) * 1000) / 1000);
    W = Math.max(1, Math.ceil(sheetWidth * k));
    Hcap = Math.max(1, Math.ceil(maxSheetHeightMm * k));
    if (W * Hcap > GRID_CAP_PX) Hcap = Math.max(1, Math.floor(GRID_CAP_PX / W));
  }
  const gapPx = g * k;

  // Both rotations per item, rasterized once. Mask area is rotation-
  // invariant, so the FFD key (area desc, id asc) uses the rot-0 count.
  // Items with `holes` take the part-in-hole fill (outer ring stamped, hole
  // fills cleared — smaller parts may then nest inside the cut-outs, with
  // the EDT fit test enforcing the gap to the hole walls); holeless items
  // keep the plain single-ring fill, bit-identical to before.
  const prepared = items.map((item, i) => {
    const r0 = item.holes && item.holes.length > 0
      ? fillItemMask(item.points, item.holes, k)
      : fillPolygonMask(item.points, k);
    let area = 0;
    for (let c = 0; c < r0.mask.length; c++) area += r0.mask[c];
    const m0: PreparedMask = { mask: r0.mask, w: r0.w, h: r0.h, ext: maskRowExtents(r0.mask, r0.w, r0.h) };
    const m1 = rotateMaskCCW(r0.mask, r0.w, r0.h);
    return { i, id: item.id, area, m0, m1 };
  });
  const order = [...prepared].sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Generous preallocation: the worst case is every part stacked vertically
  // (each contributing its taller rotation + one gap), never above the cap.
  const contentBoundPx = prepared.reduce((s, p) => s + Math.max(p.m0.h, p.m1.h) + Math.ceil(gapPx), 0) + 4;
  const allocH = Math.min(Hcap, contentBoundPx);
  const occ = new Uint8Array(W * allocH);

  let maxY = 0; // px, exclusive bottom row of the deepest stamped footprint
  let anyStamped = false; // occupancy non-empty (placed part OR unfit overhang)
  let placedCells = 0;
  let placedCount = 0;
  let unfit = 0;

  for (const it of order) {
    // Degenerate (zero-area) rings are trivially "placed" at the origin.
    if (it.area === 0) continue;

    if (placedCount >= RASTER_NEST_MAX_PARTS) {
      // Cap-excluded parts get the unfit semantics — their own overhang row
      // at the bottom — never (0,0), where the rebuild would pile them on
      // top of the first placed part.
      unfit++;
      const yPx = maxY > 0 ? maxY + Math.ceil(gapPx) : 0;
      maxY = Math.max(maxY, Math.min(allocH, yPx + it.m0.h));
      placements[it.i] = { id: it.id, x: 0, y: yPx / k, rotation: 0, placed: false };
      continue;
    }

    // Rows that can hold the first valid position: the deepest content plus
    // one gap plus this part (anything lower only exists below all content,
    // where the first free row region starts at maxY + gapPx).
    const maxHCur = Math.max(it.m0.h, it.m1.h);
    const regionH = Math.min(allocH, (anyStamped ? maxY : 0) + maxHCur + Math.ceil(gapPx) + 2);

    // Distance-to-occupied for the free cells of the region (chamfer EDT of
    // the inverted occupancy). Null while nothing is stamped.
    let dist: Float32Array | null = null;
    if (anyStamped) {
      const free = new Uint8Array(W * regionH);
      for (let i = 0; i < free.length; i++) free[i] = occ[i] ? 0 : 1;
      dist = interiorEdt(free, W, regionH);
    }

    // Greedy first-fit, bottom-left bias: lowest y, then lowest x, upright on
    // ties — a part only rotates when that puts it strictly lower/left.
    let px = -1;
    let py = -1;
    let chosen: PreparedMask | null = null;
    let rot: 0 | 90 = 0;
    scan:
    for (let y = 0; y < regionH; y++) {
      for (let x = 0; x < W; x++) {
        // x + m.w <= W guards the RIGHT edge: fits()' flat-index lookup wraps
        // columns past W into the next row, which once "placed" a part up to
        // a part-width off the sheet's right edge (found by the wave-6 review
        // in a pre-existing holeless case — 29 beside 60 on a 62 sheet).
        if (it.m0.w <= W && x + it.m0.w <= W && y + it.m0.h <= regionH && fits(occ, dist, W, it.m0, x, y, gapPx)) {
          px = x; py = y; chosen = it.m0; rot = 0; break scan;
        }
        if (it.m1.w <= W && x + it.m1.w <= W && y + it.m1.h <= regionH && fits(occ, dist, W, it.m1, x, y, gapPx)) {
          px = x; py = y; chosen = it.m1; rot = 90; break scan;
        }
      }
    }

    if (chosen) {
      stamp(occ, W, allocH, chosen, px, py);
      maxY = Math.max(maxY, py + chosen.h);
      placedCells += it.area;
      anyStamped = true;
      placedCount++;
      placements[it.i] = { id: it.id, x: px / k, y: py / k, rotation: rot, placed: true };
    } else {
      // Unfit: own overhang row at the bottom, overhanging like the shelf
      // packer does for oversized decals (nestPolygons semantics).
      unfit++;
      const yPx = maxY > 0 ? maxY + Math.ceil(gapPx) : 0;
      stamp(occ, W, allocH, it.m0, 0, yPx);
      anyStamped = true; // later parts pack above the overhang row, like nestRects
      maxY = Math.max(maxY, Math.min(allocH, yPx + it.m0.h));
      placements[it.i] = { id: it.id, x: 0, y: yPx / k, rotation: 0, placed: false };
    }
  }

  const usedHeight = maxY > 0 ? maxY / k : 0;
  const utilization = maxY > 0 ? Math.min(1, placedCells / (W * maxY)) : 0;
  return { placements, usedHeight, utilization, unfit };
}
