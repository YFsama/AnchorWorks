/**
 * Cut-path post-processing shared by the plotter output pipeline and the
 * preview / stats UI. Everything here is pure and unit-agnostic — it works
 * on `{ points, closed }` polylines in whatever coordinate space the caller
 * hands it (mm for the editor, plotter-units after conversion).
 *
 * Market cutter software (Roland CutStudio, Silhouette Studio, FlexiSign)
 * all do three things Vector Studio was missing:
 *   • mirror for heat-transfer vinyl (cut from the back → flip horizontally)
 *   • cut-order optimisation to minimise wasted pen-up travel
 *   • a job estimate (cut length / travel / time) before committing material
 * These functions provide all three.
 */

export interface PolyLite {
  points: Array<[number, number]>;
  closed: boolean;
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Bounding box of a polyline set; null when empty. */
export function bounds(polys: PolyLite[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys) for (const [x, y] of p.points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * Mirror a polyline set horizontally (HTV) or vertically about the centre
 * of its own bounding box, so coordinates stay in the same positive region —
 * the cutter still sees the art in the same place, just flipped.
 */
export function mirrorPolys(polys: PolyLite[], axis: 'h' | 'v'): PolyLite[] {
  const b = bounds(polys);
  if (!b) return polys;
  const mx = b.minX + b.maxX;
  const my = b.minY + b.maxY;
  return polys.map(p => ({
    closed: p.closed,
    points: p.points.map(([x, y]) => (axis === 'h' ? [mx - x, y] : [x, my - y]) as [number, number]),
  }));
}

/** Hard cap above which we skip the O(n²) ordering pass to stay responsive. */
export const OPTIMIZE_LIMIT = 1500;

/**
 * Greedy nearest-neighbour ordering that minimises pen-up travel between
 * polylines. Open polylines may be reversed to start from whichever end is
 * closer; closed polylines are rotated so the cut begins at the vertex
 * nearest the previous end-point. Starts from the origin, mimicking a head
 * parked at (0,0).
 *
 * O(n²) in the polyline count — fine for the hundreds of paths a real job
 * has, skipped entirely past `OPTIMIZE_LIMIT` so a giant raster trace can't
 * freeze the UI.
 */
export function optimizeOrder(polys: PolyLite[], start: [number, number] = [0, 0]): PolyLite[] {
  const usable = polys.filter(p => p.points.length > 0);
  if (usable.length > OPTIMIZE_LIMIT) return polys.slice();
  const remaining = usable.map((_, i) => i);
  const out: PolyLite[] = [];
  let cur = start;

  while (remaining.length) {
    let best = -1, bestD = Infinity, bestRev = false, bestRot = -1, bestPos = 0;
    for (let r = 0; r < remaining.length; r++) {
      const p = usable[remaining[r]];
      if (p.closed) {
        for (let k = 0; k < p.points.length; k++) {
          const d = dist(cur, p.points[k]);
          if (d < bestD) { bestD = d; best = remaining[r]; bestRev = false; bestRot = k; bestPos = r; }
        }
      } else {
        const dStart = dist(cur, p.points[0]);
        const dEnd = dist(cur, p.points[p.points.length - 1]);
        if (dStart < bestD) { bestD = dStart; best = remaining[r]; bestRev = false; bestRot = -1; bestPos = r; }
        if (dEnd < bestD) { bestD = dEnd; best = remaining[r]; bestRev = true; bestRot = -1; bestPos = r; }
      }
    }
    if (best < 0) break;

    const p = usable[best];
    let pts = p.points.slice();
    if (p.closed && bestRot > 0) {
      // Rotate the ring to begin at bestRot, preserving closure. Drop a
      // duplicate closing vertex before rotating, re-add it after.
      const closedDup = pts.length > 1 &&
        pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
      const ring = closedDup ? pts.slice(0, -1) : pts;
      const rot = ring.slice(bestRot).concat(ring.slice(0, bestRot));
      rot.push(rot[0]);
      pts = rot;
    } else if (!p.closed && bestRev) {
      pts.reverse();
    }
    out.push({ points: pts, closed: p.closed });
    cur = pts[pts.length - 1];
    remaining.splice(bestPos, 1);
  }
  return out;
}

/**
 * Overcut: extend each CLOSED polyline a short distance past its start point,
 * retracing the beginning of the path. This is the standard fix for tags
 * left at the closing corner ("my circles won't weed out") and is what
 * Silhouette/Roland call overcut / overlap. `mm` is the extra blade-down
 * distance; open polylines are left untouched.
 */
export function applyOvercut(polys: PolyLite[], mm: number): PolyLite[] {
  if (mm <= 0) return polys;
  return polys.map(p => {
    if (!p.closed || p.points.length < 2) return p;
    const pts = p.points;
    const extra: Array<[number, number]> = [];
    let remaining = mm;
    // Walk forward from the start vertex, re-tracing segments until `mm`
    // of additional path has been laid down.
    for (let i = 1; i < pts.length && remaining > 1e-9; i++) {
      const a = pts[i - 1], b = pts[i];
      const segLen = dist(a, b);
      if (segLen <= 1e-9) continue;
      if (segLen >= remaining) {
        const tn = remaining / segLen;
        extra.push([a[0] + (b[0] - a[0]) * tn, a[1] + (b[1] - a[1]) * tn]);
        remaining = 0;
      } else {
        extra.push([b[0], b[1]]);
        remaining -= segLen;
      }
    }
    return { closed: p.closed, points: pts.concat(extra) };
  });
}

export interface CutStats {
  /** Total blade-down distance. */
  cutLen: number;
  /** Total pen-up travel between polylines. */
  travelLen: number;
  /** Number of line segments cut. */
  segments: number;
  /** Number of separate polylines. */
  paths: number;
}

/** Cut / travel distances for a polyline set, assuming the head starts at origin. */
export function cutStats(polys: PolyLite[], start: [number, number] = [0, 0]): CutStats {
  let cutLen = 0, travelLen = 0, segments = 0, paths = 0;
  let cur = start;
  for (const p of polys) {
    if (p.points.length === 0) continue;
    paths++;
    travelLen += dist(cur, p.points[0]);
    for (let i = 1; i < p.points.length; i++) {
      cutLen += dist(p.points[i - 1], p.points[i]);
      segments++;
    }
    cur = p.points[p.points.length - 1];
  }
  return { cutLen, travelLen, segments, paths };
}

/**
 * Estimate job time in seconds. `feedMmMin` / `travelMmMin` are the
 * blade-down and pen-up speeds in **mm per minute**. A small fixed
 * per-path overhead models the head lifting / dropping between paths.
 */
export function estimateSeconds(stats: CutStats, feedMmMin: number, travelMmMin: number): number {
  const cut = feedMmMin > 0 ? (stats.cutLen / feedMmMin) * 60 : 0;
  const travel = travelMmMin > 0 ? (stats.travelLen / travelMmMin) * 60 : 0;
  const overhead = stats.paths * 0.15; // ~150ms tool up/down per path
  return cut + travel + overhead;
}

/** Format seconds as `m:ss` (or `h:mm:ss` past an hour). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
