/**
 * Rotation-aware nesting (bin packing) for material layout.
 *
 * SignShop nesting = pack the selection's bounding rects onto a fixed-width
 * sheet (the vinyl roll / artboard width), minimising the consumed height —
 * every millimetre saved is uncut material kept. This is the market-gap
 * upgrade over `autoArrangeSelection`'s simple shelf packer:
 *
 *   • skyline packing — later items drop into the gaps left above shorter
 *     earlier items, instead of wasting the rest of every shelf row;
 *   • 90° rotation — an item is tried in both orientations and rotated when
 *     that lets it slot somewhere lower (skewed / lettering shapes often
 *     pack far better turned).
 *
 * Pure geometry, unit-agnostic — the caller decides whether it is handed px
 * or mm (nestSelection hands px). The greedy order never re-orientates an
 * item unless the rotated fit is strictly better position-wise; on ties the
 * upright orientation wins so shapes stay as-drawn unless rotation pays.
 */

/** Input rectangle (width × height in the caller's units). */
export interface NestItem {
  w: number;
  h: number;
}

/** Where an item landed, parallel to the input order. */
export interface NestPlacement {
  /** Left edge of the item's (upright or rotated) bounding box. */
  x: number;
  /** Top edge of the item's bounding box. */
  y: number;
  /** True when the item was packed 90°-rotated (width ↔ height swapped). */
  rotated: boolean;
  /** False only when the item is wider than the sheet in BOTH orientations —
   *  it then overhangs from its own row at the bottom (like the shelf packer,
   *  a single oversized decal just overhangs rather than being dropped). */
  placed: boolean;
}

export interface NestResult {
  /** Placements parallel to the input `items` order. */
  placements: NestPlacement[];
  /** Sheet height consumed (bottom of the deepest item). */
  usedHeight: number;
  /** Packed item area ÷ (sheetWidth × usedHeight), 0–1. */
  utilization: number;
  /** How many items could not fit the sheet width in either orientation. */
  unfit: number;
}

/** Horizontal run of the skyline: the strip [x, x+w) is occupied up to y. */
interface SkySeg { x: number; y: number; w: number }

const EPS = 1e-9;

/** Merge adjacent skyline segments at the same height (keeps the skyline short). */
function mergeSkyline(segs: SkySeg[]): void {
  for (let i = 0; i < segs.length - 1;) {
    if (Math.abs(segs[i].y - segs[i + 1].y) < EPS && Math.abs(segs[i].x + segs[i].w - segs[i + 1].x) < EPS) {
      segs[i] = { x: segs[i].x, y: segs[i].y, w: segs[i].w + segs[i + 1].w };
      segs.splice(i + 1, 1);
    } else i++;
  }
}

/**
 * Raise the skyline over [x, x+w) to `top`. Splits the segments that overlap
 * the placed rect and keeps their left/right remainder intact.
 */
function raiseSkyline(sky: SkySeg[], x: number, w: number, top: number): void {
  const x2 = x + w;
  const next: SkySeg[] = [];
  for (const s of sky) {
    const s2 = s.x + s.w;
    if (s2 <= x + EPS || s.x >= x2 - EPS) { next.push(s); continue; } // untouched
    if (s.x < x - EPS) next.push({ x: s.x, y: s.y, w: x - s.x }); // left remainder
    if (s2 > x2 + EPS) next.push({ x: x2, y: s.y, w: s2 - x2 }); // right remainder
  }
  next.push({ x, y: top, w });
  next.sort((a, b) => a.x - b.x);
  sky.length = 0;
  sky.push(...next);
  mergeSkyline(sky);
}

/**
 * The skyline height an `ow`-wide rect would sit on if placed with its left
 * edge at `x`, or null when [x, x+ow) is not fully covered by / overflows the
 * sheet. The skyline always spans the full sheet width, so full coverage of
 * an in-bounds span is guaranteed.
 */
function skylineY(sky: SkySeg[], x: number, ow: number, sheetWidth: number): number | null {
  if (x < -EPS || x + ow > sheetWidth + EPS) return null;
  const x2 = x + ow;
  let y = 0;
  let covered = 0;
  for (const s of sky) {
    const ov = Math.min(s.x + s.w, x2) - Math.max(s.x, x);
    if (ov > EPS) { y = Math.max(y, s.y); covered += ov; }
  }
  return covered >= ow - EPS ? y : null;
}

/**
 * First-fit-decreasing SKYLINE packer with optional 90° rotation against a
 * fixed-width, infinitely-tall sheet.
 *
 * Items are sorted largest-first (max side, then area) so big decals claim
 * the floor early. Each item is tried in both orientations (when rotation is
 * allowed) at every skyline segment's left edge, and lands at the
 * bottom-left-most spot found: lowest y, then lowest x, upright on ties — so
 * an item only rotates when that puts it strictly further down the sheet.
 * `gap` is kept clear on every side of each item (it inflates the packed
 * footprint right/down).
 */
export function nestRects(items: NestItem[], sheetWidth: number, gap = 0, allowRotate90 = true): NestResult {
  const placements: NestPlacement[] = items.map(() => ({ x: 0, y: 0, rotated: false, placed: true }));
  if (items.length === 0 || sheetWidth <= 0) {
    return { placements, usedHeight: 0, utilization: 0, unfit: 0 };
  }
  const g = Math.max(0, gap);

  // Decreasing order (stable) — remember source indices to map back.
  const order = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => Math.max(b.item.w, b.item.h) - Math.max(a.item.w, a.item.h)
      || a.item.w * a.item.h - b.item.w * b.item.h
      || a.i - b.i);

  const sky: SkySeg[] = [{ x: 0, y: 0, w: sheetWidth }];
  let usedHeight = 0;
  let unfit = 0;
  let packedArea = 0;

  for (const { item, i } of order) {
    const ew = item.w + g; // inflated footprint consumes the gap right/down
    const eh = item.h + g;
    const canRotate = allowRotate90 && Math.abs(item.w - item.h) > EPS;
    const orientations = canRotate ? [
      { ow: ew, oh: eh, rot: false },
      { ow: eh, oh: ew, rot: true },
    ] : [{ ow: ew, oh: eh, rot: false }];

    // Best bottom-left placement across orientations × skyline edges.
    let bestY = Infinity, bestX = Infinity, bestRot = false, found = false;
    for (const o of orientations) {
      for (const s of sky) {
        const y = skylineY(sky, s.x, o.ow, sheetWidth);
        if (y == null) continue;
        if (y < bestY - EPS || (Math.abs(y - bestY) < EPS && (s.x < bestX - EPS || (Math.abs(s.x - bestX) < EPS && !o.rot && bestRot)))) {
          bestY = y; bestX = s.x; bestRot = o.rot; found = true;
        }
      }
    }

    if (!found) {
      // Wider than the sheet both ways — give it its own row and let it
      // overhang, exactly like the shelf packer does for oversized decals.
      unfit++;
      const y = usedHeight > 0 ? usedHeight + g : 0;
      placements[i] = { x: 0, y, rotated: false, placed: false };
      raiseSkyline(sky, 0, Math.min(item.w, sheetWidth), y + item.h + g);
      usedHeight = Math.max(usedHeight, y + item.h);
      continue;
    }

    placements[i] = { x: bestX, y: bestY, rotated: bestRot, placed: true };
    // Raise the skyline over the FULL inflated footprint (height + gap), so
    // nothing above can come within `gap` of this item; `usedHeight` reports
    // the raw geometric bottom (no trailing gap).
    raiseSkyline(sky, bestX, bestRot ? eh : ew, bestY + (bestRot ? ew : eh));
    usedHeight = Math.max(usedHeight, bestY + (bestRot ? item.w : item.h));
    packedArea += item.w * item.h;
  }

  const utilization = usedHeight > 0 ? Math.min(1, packedArea / (sheetWidth * usedHeight)) : 0;
  return { placements, usedHeight, utilization, unfit };
}
