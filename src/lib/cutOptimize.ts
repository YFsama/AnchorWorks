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

/** Reverse the point order of every polyline (flips the blade-travel
 *  direction; some materials/blades corner cleaner one way). */
export function reversePolys(polys: PolyLite[]): PolyLite[] {
  return polys.map(p => ({ closed: p.closed, points: p.points.slice().reverse() }));
}

/** Average of a polyline's vertices — a cheap interior estimate for the
 *  containment test (good for the simple, mostly-convex contours stickers have). */
function centroid(pts: Array<[number, number]>): [number, number] {
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  const n = Math.max(1, pts.length);
  return [sx / n, sy / n];
}

/** Absolute polygon area (shoelace) — used to break concentric containment ties. */
function polyArea(pts: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a) / 2;
}

/** Ray-cast point-in-polygon test against a closed ring. */
function pointInPoly(pt: [number, number], ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Order closed paths inside-first: a contour contained inside N others is cut
 * before them (deepest first), so inner holes/detail cut while the material is
 * still anchored — the print-and-cut "cut inside first" rule. Stable, so any
 * prior travel ordering is preserved within each depth band. Open paths keep
 * their relative position (depth 0).
 */
export function sortInsideFirst(polys: PolyLite[]): PolyLite[] {
  const centres = polys.map(p => centroid(p.points));
  const areas = polys.map(p => polyArea(p.points));
  const depth = polys.map((_, i) => {
    let d = 0;
    for (let j = 0; j < polys.length; j++) {
      // j contains i only if i's centre is inside j AND j is the larger shape
      // (the area test breaks the concentric mutual-containment tie).
      if (j === i || !polys[j].closed) continue;
      if (areas[j] > areas[i] && pointInPoly(centres[i], polys[j].points)) d++;
    }
    return d;
  });
  return polys
    .map((p, i) => ({ p, i, d: depth[i] }))
    .sort((a, b) => b.d - a.d || a.i - b.i)
    .map(x => x.p);
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

/** Fixed per-path overhead (seconds) modelling the head lifting / dropping
 *  between paths. Shared by the time estimate and the cut simulation so the
 *  animated replay always lands on the same number the estimate shows. */
export const PER_PATH_OVERHEAD_SECONDS = 0.15;

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
  const overhead = stats.paths * PER_PATH_OVERHEAD_SECONDS;
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

/* ------------------------------------------------------------------ *
 * Cut simulation timeline.
 *
 * The plotter preview replays the optimized job as an animation (Roland
 * CutStudio / FlexiSign both ship a "cut simulator" so operators can watch
 * travel-heavy jobs before feeding material). The helpers below turn an
 * ordered polyline set into a time-parameterised timeline driven by the same
 * feed / travel speeds and per-path overhead as `estimateSeconds`, so the
 * animation clock and the job estimate agree exactly.
 * ------------------------------------------------------------------ */

export interface SimPath {
  /** Pen-up hop into this path: [from, to] endpoints. */
  travelFrom: [number, number];
  travelTo: [number, number];
  /** Travel time plus the per-path tool up/down overhead. */
  travelSeconds: number;
  /** Blade-down run time along the polyline. */
  cutSeconds: number;
  /** The polyline itself, in cut order (already rotated / reversed). */
  points: Array<[number, number]>;
  closed: boolean;
}

export interface SimTimeline {
  paths: SimPath[];
  /** Total replay length in seconds (== estimateSeconds of the same job). */
  totalSeconds: number;
}

/** Polyline length. */
function polyLen(pts: Array<[number, number]>): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/**
 * Build the replay timeline for an ordered polyline set. `polys` should
 * already be in cut order (e.g. `optimizeOrder` output) — this function only
 * measures, it never re-orders.
 */
export function buildSimTimeline(polys: PolyLite[], feedMmMin: number, travelMmMin: number, start: [number, number] = [0, 0]): SimTimeline {
  const paths: SimPath[] = [];
  let cur = start;
  let totalSeconds = 0;
  for (const p of polys) {
    if (p.points.length === 0) continue;
    const len = polyLen(p.points);
    const travel = travelMmMin > 0 ? (dist(cur, p.points[0]) / travelMmMin) * 60 : 0;
    const cut = feedMmMin > 0 ? (len / feedMmMin) * 60 : 0;
    const travelSeconds = travel + PER_PATH_OVERHEAD_SECONDS;
    paths.push({
      travelFrom: cur,
      travelTo: p.points[0],
      travelSeconds,
      cutSeconds: cut,
      points: p.points,
      closed: p.closed,
    });
    totalSeconds += travelSeconds + cut;
    cur = p.points[p.points.length - 1];
  }
  return { paths, totalSeconds };
}

/** Where the simulated head is at time `t` (seconds from job start). */
export interface SimState {
  /** Index of the path being processed (last path once past the end). */
  pathIndex: number;
  /** Head position; the job start point before the first travel. */
  point: [number, number];
  /** True while the blade is down (cutting), false while travelling. */
  cutting: boolean;
  /** Seconds into the job when the sample was taken. */
  seconds: number;
}

/** Interpolate along the segment a→b at the given fraction. */
function lerpPt(a: [number, number], b: [number, number], f: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Sample the head position at time `t`. Clamped to [0, totalSeconds]. */
export function sampleSimTimeline(timeline: SimTimeline, t: number): SimState {
  const paths = timeline.paths;
  if (paths.length === 0) return { pathIndex: 0, point: [0, 0], cutting: false, seconds: 0 };
  const lastPath = paths[paths.length - 1];
  const lastPoint = lastPath.points[lastPath.points.length - 1] ?? lastPath.travelTo;
  // At (or past, modulo float drift) the end the head sits idle on the last
  // vertex — never mid-cut.
  if (t >= timeline.totalSeconds - 1e-9) {
    return { pathIndex: paths.length - 1, point: lastPoint, cutting: false, seconds: t };
  }
  let remaining = Math.max(0, t);
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (remaining < p.travelSeconds) {
      // Mid travel — head moves from the previous end-point to the path start.
      const travelTime = p.travelSeconds - PER_PATH_OVERHEAD_SECONDS;
      const f = travelTime > 0 ? Math.min(1, remaining / travelTime) : 1;
      const at = lerpPt(p.travelFrom, p.travelTo, f);
      return { pathIndex: i, point: at, cutting: false, seconds: t };
    }
    remaining -= p.travelSeconds;
    if (remaining < p.cutSeconds) {
      const f = p.cutSeconds > 0 ? remaining / p.cutSeconds : 1;
      return { pathIndex: i, point: pointAtFraction(p.points, f), cutting: true, seconds: t };
    }
    remaining -= p.cutSeconds;
  }
  return { pathIndex: paths.length - 1, point: lastPoint, cutting: false, seconds: t };
}

/** Point at fraction `f` (0..1) of a polyline's total length. */
function pointAtFraction(pts: Array<[number, number]>, f: number): [number, number] {
  if (pts.length === 0) return [0, 0];
  if (pts.length === 1 || f <= 0) return pts[0];
  const total = polyLen(pts);
  if (total <= 0 || f >= 1) return pts[pts.length - 1];
  let want = total * f;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (seg <= 1e-12) continue;
    if (want <= seg) return lerpPt(pts[i - 1], pts[i], want / seg);
    want -= seg;
  }
  return pts[pts.length - 1];
}

/**
 * The polyline prefix already cut after `seconds` of blade-down time at
 * `feedMmMin`. Always includes the first vertex; when the head is mid-path
 * the final point is the interpolated head position — exactly what the
 * simulation draws as "ink" so far.
 */
export function cutPrefixPoints(pts: Array<[number, number]>, seconds: number, feedMmMin: number): Array<[number, number]> {
  if (pts.length === 0) return [];
  if (pts.length === 1) return [pts[0]];
  let budget = feedMmMin > 0 ? (seconds / 60) * feedMmMin : Infinity;
  const out: Array<[number, number]> = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = dist(a, b);
    if (seg <= 1e-12) continue;
    if (budget >= seg - 1e-12) {
      out.push(b);
      budget -= seg;
    } else {
      out.push(lerpPt(a, b, budget / seg));
      break;
    }
  }
  return out;
}
