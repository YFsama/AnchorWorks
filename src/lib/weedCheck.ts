/**
 * Weedability linter — flags cut geometry a human can't weed by hand.
 *
 * Practical floors (docs/research-sticker-printcut-2026-10.md §5, distilled
 * from USCutter / SignWarehouse / Siser cutter-settings sheets): adhesive
 * vinyl ~1.5 mm stroke / 1 mm gap / 4 mm² islands / 5 mm cap height, HTV
 * ~1.5 / 1 / 6, glitter HTV ~3 / 2.5 / 12. No cutter or design software on
 * the market lints this — operators find out at the weeding table.
 *
 * Regmark paths are excluded from every check (machine alignment markers,
 * not weedable geometry) but still count toward the maxPaths guard. Pure
 * and synchronous over mm-space CutPaths; no canvas/DOM.
 */
import { bounds, pointInPoly, polyArea } from './cutOptimize';
import { offsetPolyline } from './cutContour';
import { fillPolygonMask, interiorEdt } from './rasterEdt';
import type { CutPath } from '../store/editor';

export type WeedProfileId = 'vinyl' | 'htv' | 'glitter-htv' | 'sticker-paper';

export interface WeedProfile {
  /** Narrowest stroke of vinyl that survives being pulled off the carrier. */
  minStrokeMm: number;
  /** Closest two cuts may run before weed pull bridging tears the wrong piece. */
  minGapMm: number;
  /** Enclosed detail below this area (mm²) won't lift out cleanly. */
  minIslandAreaMm2: number;
  /** Letterforms flatter than this (bbox height, mm) lose counters. */
  minCapHeightMm: number;
}

/** Material weeding floors. Glitter flakes demand ~2× everything; sticker
 *  paper follows the 1.59 mm (1/16") kiss-cut gutter hard minimum. */
export const WEED_PROFILES: Record<WeedProfileId, WeedProfile> = {
  vinyl: { minStrokeMm: 1.5, minGapMm: 1, minIslandAreaMm2: 4, minCapHeightMm: 5 },
  htv: { minStrokeMm: 1.5, minGapMm: 1, minIslandAreaMm2: 6, minCapHeightMm: 5 },
  'glitter-htv': { minStrokeMm: 3, minGapMm: 2.5, minIslandAreaMm2: 12, minCapHeightMm: 10 },
  'sticker-paper': { minStrokeMm: 1.59, minGapMm: 1.59, minIslandAreaMm2: 4, minCapHeightMm: 5 },
};

export type WeedIssueKind = 'thin-feature' | 'narrow-gap' | 'small-island';

export interface WeedIssue {
  kind: WeedIssueKind;
  /** Offending measurement in mm (gap distance, stroke width, √area). */
  metricMm: number;
  /** Where to draw the flag: ring centroid, gap midpoint, or island centroid. */
  at: [number, number];
  /** Offending path id(s) — two for narrow-gap. */
  pathIds: string[];
}

export interface WeedReport {
  issues: WeedIssue[];
  /** Non-regmark paths actually analysed (0 when the guard skipped the run). */
  checkedPaths: number;
  skipped: boolean;
}

/** Default O(n²) guard — more input paths than this skips the whole run. */
const DEFAULT_MAX_PATHS = 400;
/** Total segment-pair comparisons the gap scan may spend before degrading
 *  to path-AABB distances only. */
const SEG_PAIR_BUDGET = 200_000;
/** Erosion binary-search budget: bisection steps, plus the convergence
 *  tolerance in mm the steps are aiming for. */
const EROSION_STEPS = 5;
const EROSION_TOL_MM = 0.05;
/** Raster thin-feature probe: mask scale (px/mm — 0.25 mm resolution; the
 *  pixel-quantized width carries up to ±0.25 mm slack, so the flag decision
 *  is fail-closed over the whole borderline band), the background padding
 *  ring the EDT measures into, and the per-ring pixel budget beyond which
 *  the raster path is skipped for the (neck-blind) erosion bisection. */
const RASTER_SCALE = 4;
const RASTER_PAD = 2;
const RASTER_MAX_PIXELS = 2_000_000;

/** Vertex-average centroid — cheap interior estimate (same convention as
 *  sortInsideFirst in cutOptimize). */
function centroid(pts: ReadonlyArray<[number, number]>): [number, number] {
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  const n = Math.max(1, pts.length);
  return [sx / n, sy / n];
}

/** True when a closed ring still yields ≥1 non-empty ring after a `d` mm
 *  inward offset (deeper than its half-width, it vanishes). */
function survivesErosion(pts: Array<[number, number]>, d: number): boolean {
  return d <= 0 || offsetPolyline(pts, -d, true).length > 0;
}

/** 4-connected components of the r-eroded interior {edt ≥ r} — thresholding
 *  the interior EDT is an exact rounded erosion. Stops after `limit`
 *  components (2 suffices for the connectivity predicate). */
function componentsAt(
  edt: Float32Array,
  w: number,
  h: number,
  r: number,
  limit = Infinity,
): number[][] {
  const n = w * h;
  const seen = new Uint8Array(n);
  const comps: number[][] = [];
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] || edt[s] < r) continue;
    const comp: number[] = [];
    stack.push(s);
    seen[s] = 1;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      comp.push(p);
      const x = p % w;
      if (x > 0 && !seen[p - 1] && edt[p - 1] >= r) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && !seen[p + 1] && edt[p + 1] >= r) { seen[p + 1] = 1; stack.push(p + 1); }
      if (p >= w && !seen[p - w] && edt[p - w] >= r) { seen[p - w] = 1; stack.push(p - w); }
      if (p + w < n && !seen[p + w] && edt[p + w] >= r) { seen[p + w] = 1; stack.push(p + w); }
    }
    comps.push(comp);
    if (comps.length >= limit) break;
  }
  return comps;
}

/** The r-eroded interior is exactly one piece: empty means thinner than 2r
 *  everywhere, two or more pieces means a pinch neck of width < 2r split
 *  the eroded lobes apart. */
function erodedWhole(edt: Float32Array, w: number, h: number, r: number): boolean {
  return componentsAt(edt, w, h, r, 2).length === 1;
}

/** Lobe bound for the all-pairs pinch scan: at or below it every eroded-lobe
 *  centroid pair is probed (10 lobes → 45 pairs, each a bounded segment
 *  walk); above it the scan falls back to the two largest lobes only (the
 *  historic behaviour), so a pathological many-lobe ring can never make the
 *  localization step blow up. */
const PINCH_MAX_LOBES = 10;

/** Flat index of the pinch pixel: the shallowest-EDT inside pixel on the
 *  straight segments joining eroded-lobe centroid PAIRS — every pair while
 *  the lobe count stays ≤ PINCH_MAX_LOBES, else only the two largest. With
 *  ≥3 near-equal lobes the two-largest line alone can miss the true
 *  bottleneck (a multi-bar shape's spine feeds every lobe, but a particular
 *  pair's line may cross only wide corridors), so all pairs' crossings are
 *  probed and the global minimum reported. Null when the erosion simply
 *  emptied (uniformly thin — no neck to localize). */
function pinchPixel(
  edt: Float32Array,
  mask: Uint8Array,
  w: number,
  h: number,
  r: number,
): number | null {
  const comps = componentsAt(edt, w, h, r).sort((a, b) => b.length - a.length);
  if (comps.length < 2) return null;
  const centre = (comp: number[]): [number, number] => {
    let sx = 0, sy = 0;
    for (const p of comp) { sx += p % w; sy += Math.floor(p / w); }
    return [sx / comp.length, sy / comp.length];
  };
  const n = comps.length <= PINCH_MAX_LOBES ? comps.length : 2;
  let best = -1;
  let bestEdt = Infinity;
  for (let a = 0; a < n; a++) {
    const [cax, cay] = centre(comps[a]);
    for (let b = a + 1; b < n; b++) {
      const [cbx, cby] = centre(comps[b]);
      const steps = Math.max(1, Math.ceil(2 * Math.hypot(cbx - cax, cby - cay)));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(cax + ((cbx - cax) * s) / steps);
        const y = Math.round(cay + ((cby - cay) * s) / steps);
        const p = y * w + x;
        if (mask[p] === 1 && edt[p] < bestEdt) {
          bestEdt = edt[p];
          best = p;
        }
      }
    }
  }
  return best >= 0 ? best : null;
}

/** Wave-3 thin-feature probe: rasterize the ring with the pure-TS scanline
 *  fill (no canvas), take the interior chamfer EDT (2·EDT = local
 *  medial-axis width), then binary-search the deepest erosion radius whose
 *  surviving interior is still ONE connected piece. A pinch neck splits the
 *  eroded lobes — exactly what the wave-2 offsetPolyline bisection missed,
 *  because the inward offset survived as the two separate lobe rings.
 *  Returns the width estimate in mm (Infinity when clearly wide) with the
 *  pinch location, or null when the ring exceeds RASTER_MAX_PIXELS (caller
 *  falls back to the erosion bisection). */
function thinWidthRaster(
  pts: ReadonlyArray<[number, number]>,
  bb: { minX: number; minY: number; maxX: number; maxY: number },
  minStrokeMm: number,
): { widthMm: number; at: [number, number] } | null {
  const w = Math.ceil((bb.maxX - bb.minX) * RASTER_SCALE) + 2 * RASTER_PAD;
  const h = Math.ceil((bb.maxY - bb.minY) * RASTER_SCALE) + 2 * RASTER_PAD;
  if (w * h > RASTER_MAX_PIXELS) return null;
  const local = pts.map(([x, y]) => [x - bb.minX, y - bb.minY] as [number, number]);
  const { mask, w: mw, h: mh } = fillPolygonMask(local, RASTER_SCALE, RASTER_PAD);
  const edt = interiorEdt(mask, mw, mh);
  const rT = (minStrokeMm / 2) * RASTER_SCALE;
  // +0.5 px quantization slack: a bar surviving at exactly rT may be up to
  // half a pixel narrower in truth — fail closed (measure it) instead of
  // clearing on the quantized equality.
  if (erodedWhole(edt, mw, mh, rT + 0.5)) return { widthMm: Infinity, at: [0, 0] };
  let lo = 0, hi = rT;
  for (let k = 0; k < EROSION_STEPS && hi - lo > EROSION_TOL_MM * RASTER_SCALE; k++) {
    const mid = (lo + hi) / 2;
    if (erodedWhole(edt, mw, mh, mid)) lo = mid; else hi = mid;
  }
  let at = centroid(pts);
  const pinch = pinchPixel(edt, mask, mw, mh, hi);
  if (pinch !== null) {
    at = [
      bb.minX + ((pinch % mw) - RASTER_PAD + 0.5) / RASTER_SCALE,
      bb.minY + (Math.floor(pinch / mw) - RASTER_PAD + 0.5) / RASTER_SCALE,
    ];
  }
  return { widthMm: (2 * lo) / RASTER_SCALE, at };
}

interface SegClosest {
  d: number;
  pa: [number, number];
  pb: [number, number];
}

/** Closest pair of points between two segments (Ericson, Real-Time
 *  Collision Detection §5.1.9). */
function segSegClosest(
  p1: [number, number], q1: [number, number],
  p2: [number, number], q2: [number, number],
): SegClosest {
  const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1];
  const d2x = q2[0] - p2[0], d2y = q2[1] - p2[1];
  const rx = p1[0] - p2[0], ry = p1[1] - p2[1];
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  const cc = d1x * rx + d1y * ry;
  let s = 0, t = 0;
  if (a > 1e-12 && e > 1e-12) {
    const b = d1x * d2x + d1y * d2y;
    const denom = a * e - b * b;
    s = denom > 1e-12 ? Math.max(0, Math.min(1, (b * f - cc * e) / denom)) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -cc / a)); }
    else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - cc) / a)); }
  } else if (e > 1e-12) {
    t = Math.max(0, Math.min(1, f / e));
  } else if (a > 1e-12) {
    s = Math.max(0, Math.min(1, -cc / a));
  }
  const pa: [number, number] = [p1[0] + d1x * s, p1[1] + d1y * s];
  const pb: [number, number] = [p2[0] + d2x * t, p2[1] + d2y * t];
  return { d: Math.hypot(pa[0] - pb[0], pa[1] - pb[1]), pa, pb };
}

interface PathInfo {
  path: CutPath;
  bb: { minX: number; minY: number; maxX: number; maxY: number };
  segs: Array<[a: [number, number], b: [number, number]]>;
}

/**
 * Lint mm-space cut paths for weedability against a material profile.
 *
 *   • thin-feature (closed rings only) — rasterize each ring at 4 px/mm
 *     with a pure scanline fill (no canvas), take the interior chamfer EDT
 *     (2·EDT = local medial-axis width), and binary-search (5 steps,
 *     0.05 mm tolerance) the deepest erosion whose surviving interior is
 *     still ONE connected piece — a pinch neck splits it, which the wave-2
 *     offsetPolyline erosion missed (the offset survived as the separate
 *     lobe rings). Rings past a 2M-px raster budget fall back to that
 *     erosion bisection (neck-blind). Open paths are skipped — no interior.
 *   • narrow-gap — minimum distance between segments of DIFFERENT paths,
 *     AABB-prefiltered (expanded by minGapMm, swept by x-min). Past
 *     SEG_PAIR_BUDGET total comparisons the scan degrades to path-AABB
 *     distances only, which over-reports overlapping boxes as 0 mm —
 *     coarse but conservative, never silently clean.
 *   • small-island — closed paths nested inside another closed path
 *     (containment depth 1 = counter to weed out, depth ≥ 2 = solid
 *     island inside a hole) whose area < minIslandAreaMm2 (~4 mm²
 *     counters/details won't weed cleanly) or whose bbox is flatter than
 *     minCapHeightMm. metricMm is √area (comparable mm scale).
 *
 * `maxPaths` (default 400) guards the O(n²) passes: more input paths →
 * `{ issues: [], checkedPaths: 0, skipped: true }`. Regmarks count toward
 * the guard but are never checked.
 */
export function weedCheck(
  paths: CutPath[],
  profile: WeedProfile = WEED_PROFILES.vinyl,
  opts?: { maxPaths?: number },
): WeedReport {
  const maxPaths = opts?.maxPaths ?? DEFAULT_MAX_PATHS;
  if (paths.length > maxPaths) return { issues: [], checkedPaths: 0, skipped: true };

  const checked = paths.filter(p => p.kind !== 'regmark' && p.points.length > 0);
  const info: PathInfo[] = checked.map(p => {
    const bb = bounds([p]) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const n = p.points.length;
    const segCount = p.closed ? n : n - 1;
    const segs: PathInfo['segs'] = [];
    for (let i = 0; i < segCount; i++) {
      segs.push([p.points[i], p.points[(i + 1) % n]]);
    }
    return { path: p, bb, segs };
  });
  const issues: WeedIssue[] = [];

  // thin-feature: raster-EDT width probe of closed rings (wave-3), with the
  // wave-2 erosion bisection kept as the fallback for over-budget rings.
  for (const { path, bb } of info) {
    if (!path.closed || path.points.length < 3) continue;
    const pts = path.points;
    const raster = thinWidthRaster(pts, bb, profile.minStrokeMm);
    if (raster) {
      // Fail-closed decision: the pixel-quantized width carries up to one
      // half-pixel-radius (0.25 mm at 4 px/mm) of upward slack, so a bar
      // measuring "exactly" the floor may truly be below it — flag the whole
      // borderline band rather than silently clearing it.
      if (raster.widthMm < profile.minStrokeMm + 0.25) {
        issues.push({ kind: 'thin-feature', metricMm: raster.widthMm, at: raster.at, pathIds: [path.id] });
      }
      continue;
    }
    // Fallback (ring over the raster budget): erosion bisection — neck-blind,
    // a pinched ring's inward offset survives as its two lobes.
    if (survivesErosion(pts, profile.minStrokeMm)) continue; // wide throughout
    let lo = 0, hi = profile.minStrokeMm;
    for (let k = 0; k < EROSION_STEPS && hi - lo > EROSION_TOL_MM; k++) {
      const mid = (lo + hi) / 2;
      if (survivesErosion(pts, mid)) lo = mid; else hi = mid;
    }
    if (2 * lo < profile.minStrokeMm) {
      issues.push({ kind: 'thin-feature', metricMm: 2 * lo, at: centroid(pts), pathIds: [path.id] });
    }
  }

  // small-island: nested closed contours too small / flat to weed.
  const rings = info
    .filter(i => i.path.closed && i.path.points.length >= 3)
    .map(i => ({ i, c: centroid(i.path.points), area: polyArea(i.path.points) }));
  for (const r of rings) {
    let depth = 0;
    for (const q of rings) {
      // The area tie-break keeps concentric rings from counting each other.
      if (q === r || q.area <= r.area) continue;
      if (pointInPoly(r.c, q.i.path.points)) depth++;
    }
    if (depth < 1) continue;
    const height = r.i.bb.maxY - r.i.bb.minY;
    if (r.area < profile.minIslandAreaMm2 || height < profile.minCapHeightMm) {
      issues.push({ kind: 'small-island', metricMm: Math.sqrt(r.area), at: r.c, pathIds: [r.i.path.id] });
    }
  }

  // narrow-gap: closest approach between different paths, x-swept AABBs.
  const byX = info.slice().sort((a, b) => a.bb.minX - b.bb.minX);
  let budget = SEG_PAIR_BUDGET;
  for (let i = 0; i < byX.length; i++) {
    const A = byX[i];
    for (let j = i + 1; j < byX.length; j++) {
      const B = byX[j];
      if (B.bb.minX - A.bb.maxX >= profile.minGapMm) break; // sorted by x-min
      if (B.bb.minY - A.bb.maxY >= profile.minGapMm ||
          A.bb.minY - B.bb.maxY >= profile.minGapMm) continue;
      if (budget > 0) {
        let best = Infinity;
        let bestAt: [number, number] = [0, 0];
        let over = false;
        for (let si = 0; si < A.segs.length && !over; si++) {
          for (let sj = 0; sj < B.segs.length; sj++) {
            if (--budget < 0) { over = true; break; }
            const cp = segSegClosest(A.segs[si][0], A.segs[si][1], B.segs[sj][0], B.segs[sj][1]);
            if (cp.d < best) {
              best = cp.d;
              bestAt = [(cp.pa[0] + cp.pb[0]) / 2, (cp.pa[1] + cp.pb[1]) / 2];
            }
          }
        }
        if (!over) {
          if (best < profile.minGapMm) {
            issues.push({ kind: 'narrow-gap', metricMm: best, at: bestAt, pathIds: [A.path.id, B.path.id] });
          }
          continue;
        }
      }
      // Comparison budget spent — coarse AABB distance for the rest.
      const dx = Math.max(A.bb.minX - B.bb.maxX, B.bb.minX - A.bb.maxX, 0);
      const dy = Math.max(A.bb.minY - B.bb.maxY, B.bb.minY - A.bb.maxY, 0);
      const d = Math.hypot(dx, dy);
      if (d < profile.minGapMm) {
        const at: [number, number] = [
          (A.bb.minX + A.bb.maxX + B.bb.minX + B.bb.maxX) / 4,
          (A.bb.minY + A.bb.maxY + B.bb.minY + B.bb.maxY) / 4,
        ];
        issues.push({ kind: 'narrow-gap', metricMm: d, at, pathIds: [A.path.id, B.path.id] });
      }
    }
  }

  return { issues, checkedPaths: checked.length, skipped: false };
}
