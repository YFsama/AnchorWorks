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

/*
 * ── Polygon (convex-hull) nesting ──────────────────────────────────────────
 *
 * Blob-like cut shapes (lettering, logos, decals) are not rectangles, but a
 * full SVGnest-style NFP + genetic search is heavyweight for an interactive
 * one-click action. The standard cheap approximation — used by most sign-shop
 * RIPs — is to nest each shape's CONVEX HULL as a rectangle-footprint skyline
 * item: a hull + skyline packer with 90° rotation captures roughly 90% of the
 * material savings for blob-like shapes at a fraction of the cost (see
 * docs/research-sticker-printcut-2026-10.md §nesting). The kerf/handle gap is
 * applied by inflating the hull outward — the same trick SVGnest performs via
 * ClipperOffset — so gap clearance is exact, and for convex hulls an
 * edge-normal offset can never self-intersect.
 *
 * Vinyl gaps: kiss-cut sheets 2–3 mm, rolls 1–2 mm (hence the 2 mm default).
 */

/** A closed polygon in the caller's units (mm when driven by cut paths). */
export interface NestPolyItem {
  id: string;
  /** Boundary points; closure is implied (last point joins the first). */
  points: Array<[number, number]>;
}

/** Where a polygon's (possibly rotated) hull AABB landed. */
export interface NestPolyPlacement {
  id: string;
  /** Left edge of the RAW (un-inflated) hull AABB in sheet space. */
  x: number;
  /** Top edge of the RAW hull AABB in sheet space. */
  y: number;
  /** 90 = the item was packed turned a quarter-turn counter-clockwise. */
  rotation: 0 | 90;
  /** False only when the hull is wider than the sheet in BOTH orientations —
   *  it then overhangs from its own row at the bottom, like nestRects. */
  placed: boolean;
}

export interface NestPolyResult {
  /** Placements parallel to the input `items` order. */
  placements: NestPolyPlacement[];
  /** Sheet height consumed (bottom of the deepest raw hull AABB). */
  usedHeight: number;
  /** Σ raw hull area ÷ (sheetWidth × usedHeight), 0–1 — honest material
   *  coverage, computed from the UN-inflated hulls. */
  utilization: number;
  /** How many hulls could not fit the sheet width in either orientation. */
  unfit: number;
}

type Pt = [number, number];

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Convex hull (Andrew monotone chain), strictly convex — collinear points on
 * the boundary are dropped. Returns the hull counter-clockwise starting from
 * the leftmost-lowest point. Degenerate inputs pass through: 0/1 points come
 * back as-is, a fully collinear cloud yields its two endpoints.
 */
export function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 2) return points.map(p => [p[0], p[1]] as Pt);
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Drop exact duplicates (they make the cross-product tests degenerate).
  const uniq = sorted.filter((p, i) => i === 0 || p[0] !== sorted[i - 1][0] || p[1] !== sorted[i - 1][1]);
  if (uniq.length < 2) return [uniq[0]];

  const lower: Pt[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); // last point of each chain is the first point of the other
  upper.pop();
  return [...lower, ...upper];
}

/** |Shoelace area| of a polygon (0 for degenerate <3-vertex "hulls"). */
function polyArea(poly: Pt[]): number {
  if (poly.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

/**
 * Inflate a CONVEX hull outward by `r` via edge-normal offset: every vertex
 * moves along the bisector of its adjacent edge normals. For a convex input
 * this is exact Minkowski-with-disc(r) and cannot self-intersect, so no miter
 * limiting is needed. The AABB of the result is the raw AABB grown by AT
 * LEAST r on every side (exactly r when the extreme corners are axis-aligned;
 * the miter overshoots on skewed corners), so the skyline sees footprints of
 * ≥ w + 2r = w + gap — gap clearance is guaranteed, never shorted.
 */
function inflateHull(hull: Pt[], r: number): Pt[] {
  if (r <= 0 || hull.length < 2) return hull.map(p => [p[0], p[1]] as Pt);
  const n = hull.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = hull[(i - 1 + n) % n];
    const v = hull[i];
    const next = hull[(i + 1) % n];
    // Outward unit normals of the two edges meeting at v (CCW hull → the
    // right-hand normal of each directed edge points outside). Summing them
    // gives the outward bisector direction; scaling by 2r/|sum|² is the exact
    // miter length r/cos(θ/2) that keeps every edge exactly r away.
    const n1 = unitNormal(prev, v);
    const n2 = unitNormal(v, next);
    const sx = n1[0] + n2[0];
    const sy = n1[1] + n2[1];
    const sumSq = sx * sx + sy * sy;
    if (sumSq < EPS) { out.push([v[0], v[1]]); continue; } // 180° reflex — impossible on a strict hull
    const k = (2 * r) / sumSq;
    out.push([v[0] + sx * k, v[1] + sy * k]);
  }
  return out;
}

/** Right-hand (outward for CCW) unit normal of the edge a→b. */
function unitNormal(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS) return [0, 0];
  return [dy / len, -dx / len];
}

/**
 * Skyline-pack CONVEX HULLS of arbitrary cut shapes onto a fixed-width sheet,
 * minimising consumed height — the polygon sibling of `nestRects`.
 *
 * Per item: convex hull → AABB. Gap handling mirrors SVGnest's offset trick:
 * the hull is inflated by gap/2 per side (edge-normal offset, exact for
 * convex hulls), which for the AABB-driven skyline is a (w+gap)×(h+gap)
 * footprint, so every neighbour keeps ≥ gap clearance. Items are packed
 * online in decreasing hull-area order (ties by id — deterministic); at
 * placement time each item tries BOTH orientations' footprints against the
 * current skyline and lands at the bottom-left-most spot found, with
 * nestRects's tie rules (lowest y, then lowest x, rotation 0 on a full tie —
 * shapes only rotate when that is strictly better position-wise).
 *
 * Reported placement x/y is the top-left of the item's RAW (un-inflated)
 * rotated hull AABB; `utilization` sums the raw hull areas, so it is honest
 * material coverage, not inflated footprint coverage. Items whose footprint
 * is wider than the sheet in both orientations get their own overhang row at
 * the bottom (placed: false, unfit++), exactly like nestRects.
 */
export function nestPolygons(items: NestPolyItem[], sheetWidth: number, gap = 2, allowRotate90 = true): NestPolyResult {
  const placements: NestPolyPlacement[] = items.map(it => ({ id: it.id, x: 0, y: 0, rotation: 0 as 0 | 90, placed: true }));
  if (items.length === 0 || sheetWidth <= 0) {
    return { placements, usedHeight: 0, utilization: 0, unfit: 0 };
  }
  const g = Math.max(0, gap);

  // Per item: hull, raw hull AABB (rw/rh) + raw hull area, and the inflated
  // hull's AABB (ew/eh — raw grown by gap/2 per side) which the skyline
  // consumes as the packing footprint.
  const prepared = items.map((item, i) => {
    const hull = convexHull(item.points);
    const aabb = (poly: Pt[]) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return { w: maxX - minX, h: maxY - minY };
    };
    const raw = aabb(hull);
    const inflated = aabb(inflateHull(hull, g / 2));
    return { i, id: item.id, area: polyArea(hull), rw: raw.w, rh: raw.h, ew: inflated.w, eh: inflated.h };
  });

  // Deterministic decreasing order: hull area desc, then id asc.
  const order = [...prepared].sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const sky: SkySeg[] = [{ x: 0, y: 0, w: sheetWidth }];
  let usedHeight = 0;
  let unfit = 0;
  let packedArea = 0;

  for (const it of order) {
    // Footprints: the inflated AABB (raw + gap on each axis). For rotation 90
    // the rotated inflated AABB is (eh × ew) — identical to swapping raw dims
    // and re-inflating, since inflation is symmetric.
    const canRotate = allowRotate90 && Math.abs(it.ew - it.eh) > EPS;
    const orientations = canRotate
      ? [{ ow: it.ew, oh: it.eh, rot: 0 as 0 | 90 }, { ow: it.eh, oh: it.ew, rot: 90 as 0 | 90 }]
      : [{ ow: it.ew, oh: it.eh, rot: 0 as 0 | 90 }];

    let bestY = Infinity, bestX = Infinity, bestRot: 0 | 90 = 0, found = false;
    for (const o of orientations) {
      for (const s of sky) {
        const y = skylineY(sky, s.x, o.ow, sheetWidth);
        if (y == null) continue;
        if (y < bestY - EPS || (Math.abs(y - bestY) < EPS && (s.x < bestX - EPS || (Math.abs(s.x - bestX) < EPS && o.rot === 0 && bestRot === 90)))) {
          bestY = y; bestX = s.x; bestRot = o.rot; found = true;
        }
      }
    }

    if (!found) {
      // Wider than the sheet both ways — own row at the bottom, overhanging,
      // exactly like the shelf packer does for oversized decals.
      unfit++;
      const y = usedHeight > 0 ? usedHeight + g : 0;
      placements[it.i] = { id: it.id, x: 0, y, rotation: 0, placed: false };
      raiseSkyline(sky, 0, Math.min(it.rw, sheetWidth), y + it.rh + g);
      usedHeight = Math.max(usedHeight, y + it.rh);
      continue;
    }

    placements[it.i] = { id: it.id, x: bestX, y: bestY, rotation: bestRot, placed: true };
    // Raise the skyline over the FULL inflated footprint; usedHeight reports
    // the raw geometric bottom (no trailing gap).
    raiseSkyline(sky, bestX, bestRot === 90 ? it.eh : it.ew, bestY + (bestRot === 90 ? it.ew : it.eh));
    usedHeight = Math.max(usedHeight, bestY + (bestRot === 90 ? it.rw : it.rh));
    packedArea += it.area;
  }

  const utilization = usedHeight > 0 ? Math.min(1, packedArea / (sheetWidth * usedHeight)) : 0;
  return { placements, usedHeight, utilization, unfit };
}
