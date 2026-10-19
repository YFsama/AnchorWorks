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

/** Absolute polygon area (shoelace) — used to break concentric containment
 *  ties. Shared with weedCheck (island-area lint). */
export function polyArea(pts: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a) / 2;
}

/** Ray-cast point-in-polygon test against a closed ring. Shared with
 *  weedCheck (containment-depth classification). */
export function pointInPoly(pt: [number, number], ring: Array<[number, number]>): boolean {
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

export interface BladeOffsetOptions {
  /** Minimum corner turn angle (degrees) that gets a blade loop. Default 15. */
  minCornerAngleDeg: number;
  /** Bow depth of the corner connector, as a fraction of offsetMm. Default 0.3. */
  bowFactor: number;
}

/** Turn angle (degrees) at which a vertex counts as a "corner" — the drag-
 *  knife loop threshold from the validated Siser corner model. Shared by
 *  `applyBladeOffset` (default) and `cutStats` (corner count). */
const CORNER_TURN_DEG = 15;

const DEFAULT_BLADE_OFFSET: BladeOffsetOptions = {
  minCornerAngleDeg: CORNER_TURN_DEG,
  bowFactor: 0.3,
};

/** Samples tessellating each corner connector (~6, excluding endpoints). */
const BLADE_LOOP_SAMPLES = 6;

/** Rotate a closed ring to start (and end) at the midpoint of its longest
 *  edge — keeps the seam off corners so every corner gets a loop. */
function rotateSeamToLongestEdge(pts: Array<[number, number]>): Array<[number, number]> {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < pts.length; i++) {
    const len = dist(pts[i], pts[(i + 1) % pts.length]);
    if (len > bestLen) { bestLen = len; best = i; }
  }
  const a = pts[best];
  const b = pts[(best + 1) % pts.length];
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return [mid].concat(pts.slice(best + 1), pts.slice(0, best + 1));
}

/** Collapse runs of vertices closer together than `offset` to their
 *  running centroid — digitized font outlines otherwise tangle the loops.
 *  Open-path endpoints are anchors and never move or absorb. */
function mergeCornerClusters(
  pts: Array<[number, number]>,
  offset: number,
  closed: boolean,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const weights: number[] = [];
  if (!closed) {
    out.push(pts[0].slice() as [number, number]);
    weights.push(1);
  }
  const end = closed ? pts.length : pts.length - 1;
  for (let i = closed ? 0 : 1; i < end; i++) {
    const last = out.length - 1;
    const v = pts[i];
    if (last >= 0 && dist(v, out[last]) < offset) {
      const w = weights[last];
      out[last] = [
        (out[last][0] * w + v[0]) / (w + 1),
        (out[last][1] * w + v[1]) / (w + 1),
      ];
      weights[last] = w + 1;
    } else {
      out.push(v.slice() as [number, number]);
      weights.push(1);
    }
  }
  if (!closed) out.push(pts[pts.length - 1].slice() as [number, number]);
  // Never collapse below the minimum vertex count of the path kind.
  if (out.length < (closed ? 3 : 2)) return pts;
  return out;
}

/** Append the drag-knife corner loop at `b`: overshoot O = b + v1·offset,
 *  a bowed cubic connector to R = b + v2·offset (controls at 1/3 and 2/3
 *  along the chord, pushed perpendicular away from the corner), landing
 *  exactly on R. Vertices below the turn threshold pass through verbatim. */
function pushBladeCorner(
  out: Array<[number, number]>,
  prev: [number, number],
  b: [number, number],
  next: [number, number],
  offset: number,
  o: BladeOffsetOptions,
): void {
  const v1x = b[0] - prev[0], v1y = b[1] - prev[1];
  const v2x = next[0] - b[0], v2y = next[1] - b[1];
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-12 || l2 < 1e-12) {
    out.push([b[0], b[1]]);
    return;
  }
  const u1x = v1x / l1, u1y = v1y / l1;
  const u2x = v2x / l2, u2y = v2y / l2;
  const cosTurn = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
  const turnDeg = (Math.acos(cosTurn) * 180) / Math.PI;
  if (turnDeg < o.minCornerAngleDeg) {
    out.push([b[0], b[1]]);
    return;
  }
  const overshoot: [number, number] = [b[0] + u1x * offset, b[1] + u1y * offset];
  const ret: [number, number] = [b[0] + u2x * offset, b[1] + u2y * offset];
  out.push(overshoot);
  const cx = ret[0] - overshoot[0];
  const cy = ret[1] - overshoot[1];
  const chord = Math.hypot(cx, cy);
  if (chord > 1e-12) {
    let px = -cy / chord, py = cx / chord;
    const away = ((overshoot[0] + ret[0]) / 2 - b[0]) * px +
                 ((overshoot[1] + ret[1]) / 2 - b[1]) * py;
    if (away < 0) { px = -px; py = -py; }
    const bow = offset * o.bowFactor;
    const c1: [number, number] = [overshoot[0] + cx / 3 + px * bow, overshoot[1] + cy / 3 + py * bow];
    const c2: [number, number] = [overshoot[0] + (2 * cx) / 3 + px * bow, overshoot[1] + (2 * cy) / 3 + py * bow];
    for (let s = 1; s < BLADE_LOOP_SAMPLES; s++) {
      const t = s / BLADE_LOOP_SAMPLES;
      const u = 1 - t;
      out.push([
        u * u * u * overshoot[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * ret[0],
        u * u * u * overshoot[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ret[1],
      ]);
    }
  }
  out.push(ret);
}

/**
 * Drag-knife blade-offset compensation (validated in the wild by Siser-
 * Command-v4's siser_pathbuild.py). A swivel blade trails its pivot by
 * `offsetMm`, so corners undercut: at every corner turning at least
 * `minCornerAngleDeg` (default 15°) this overshoots by `offsetMm` along
 * the incoming edge and swings back through a small outward-bowed
 * connector to a point `offsetMm` along the outgoing edge, dropping the
 * blade tip exactly on the corner. Closed paths are re-seamed to the
 * midpoint of their longest edge first so the closing corner loops too;
 * vertices closer together than `offsetMm` collapse to their centroid.
 *
 * Same contract as `applyOvercut`: `PolyLite` in / out, order preserved,
 * open endpoints never looped. Closed outputs re-emit an explicit
 * duplicate closing vertex on the seam. `offsetMm` <= 0 deep-clones.
 */
export function applyBladeOffset(
  polys: PolyLite[],
  offsetMm: number,
  opts: Partial<BladeOffsetOptions> = {},
): PolyLite[] {
  if (offsetMm <= 0) {
    return polys.map(p => ({
      closed: p.closed,
      points: p.points.map(([x, y]) => [x, y] as [number, number]),
    }));
  }
  const o: BladeOffsetOptions = { ...DEFAULT_BLADE_OFFSET, ...opts };
  return polys.map(p => {
    if (p.points.length < 2) {
      return { closed: p.closed, points: p.points.map(([x, y]) => [x, y] as [number, number]) };
    }
    // Drop the duplicate closing vertex before seam/cluster work.
    const dup = p.closed && dist(p.points[0], p.points[p.points.length - 1]) < 1e-9;
    const raw = dup ? p.points.slice(0, -1) : p.points;
    let ring = p.closed && raw.length >= 3 ? rotateSeamToLongestEdge(raw) : raw;
    ring = mergeCornerClusters(ring, offsetMm, p.closed);
    const out: Array<[number, number]> = [];
    if (p.closed && ring.length >= 3) {
      for (let i = 0; i < ring.length; i++) {
        pushBladeCorner(
          out,
          ring[(i - 1 + ring.length) % ring.length],
          ring[i],
          ring[(i + 1) % ring.length],
          offsetMm,
          o,
        );
      }
      out.push([ring[0][0], ring[0][1]]); // close on the seam
    } else {
      out.push([ring[0][0], ring[0][1]]);
      for (let i = 1; i < ring.length - 1; i++) {
        pushBladeCorner(out, ring[i - 1], ring[i], ring[i + 1], offsetMm, o);
      }
      out.push([ring[ring.length - 1][0], ring[ring.length - 1][1]]);
    }
    return { closed: p.closed, points: out };
  });
}

/** Fixed per-path overhead (seconds) modelling the head lifting / dropping
 *  between paths. Shared by the time estimate and the cut simulation so the
 *  animated replay always lands on the same number the estimate shows. */
export const PER_PATH_OVERHEAD_SECONDS = 0.15;

/** Unsigned turn angle (degrees, 0 = collinear) at vertex `b` between the
 *  a→b and b→c directions; null when either leg is degenerate (no turn). */
function turnDeg(a: [number, number], b: [number, number], c: [number, number]): number | null {
  const v1x = b[0] - a[0], v1y = b[1] - a[1];
  const v2x = c[0] - b[0], v2y = c[1] - b[1];
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-12 || l2 < 1e-12) return null;
  const cosTurn = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
  return (Math.acos(cosTurn) * 180) / Math.PI;
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
  /** Vertices turning ≥ `CORNER_TURN_DEG` (15°) — each one needs a drag-knife
   *  blade-offset loop, so this feeds the swing-time term of `estimateSeconds`. */
  corners: number;
  /** Closed polylines — each one gets an overcut retrace, feeding the
   *  overcut term of `estimateSeconds`. */
  closedPaths: number;
}

/** Cut / travel distances for a polyline set, assuming the head starts at origin. */
export function cutStats(polys: PolyLite[], start: [number, number] = [0, 0]): CutStats {
  let cutLen = 0, travelLen = 0, segments = 0, paths = 0, corners = 0, closedPaths = 0;
  let cur = start;
  for (const p of polys) {
    if (p.points.length === 0) continue;
    paths++;
    if (p.closed) closedPaths++;
    travelLen += dist(cur, p.points[0]);
    for (let i = 1; i < p.points.length; i++) {
      cutLen += dist(p.points[i - 1], p.points[i]);
      segments++;
    }
    // Corner count: every vertex of a closed ring is interior (drop a
    // duplicate closing vertex first); open paths count only 1..n-2 —
    // endpoints have only one leg, so they can't turn.
    const dup = p.closed && dist(p.points[0], p.points[p.points.length - 1]) < 1e-9;
    const pts = dup ? p.points.slice(0, -1) : p.points;
    if (p.closed && pts.length >= 3) {
      for (let i = 0; i < pts.length; i++) {
        const t = turnDeg(pts[(i - 1 + pts.length) % pts.length], pts[i], pts[(i + 1) % pts.length]);
        if (t !== null && t >= CORNER_TURN_DEG) corners++;
      }
    } else if (!p.closed) {
      for (let i = 1; i < pts.length - 1; i++) {
        const t = turnDeg(pts[i - 1], pts[i], pts[i + 1]);
        if (t !== null && t >= CORNER_TURN_DEG) corners++;
      }
    }
    cur = p.points[p.points.length - 1];
  }
  return { cutLen, travelLen, segments, paths, corners, closedPaths };
}

/**
 * Estimate job time in seconds. `feedMmMin` / `travelMmMin` are the
 * blade-down and pen-up speeds in **mm per minute**. A small fixed
 * per-path overhead models the head lifting / dropping between paths.
 *
 * Optional `opts` adds the two drag-knife time sinks the classic estimate
 * ignores (approximations of the validated d·θ corner model, see §3 of
 * docs/research-sticker-printcut-2026-10.md):
 *   • overcut retrace — every closed path re-cuts `overcutMm` at feed
 *     speed: `overcutMm × closedPaths / feedMmMin × 60`.
 *   • corner-loop swing — each of `corners` drag-knife loops swings
 *     roughly a half-circle of diameter `bladeOffsetMm` (θ = π) at
 *     cutting speed: `corners × π × bladeOffsetMm / (feedMmMin / 60)`.
 * Without `opts` the result is identical to the classic 3-arg call.
 */
export function estimateSeconds(
  stats: CutStats,
  feedMmMin: number,
  travelMmMin: number,
  opts?: { bladeOffsetMm?: number; overcutMm?: number },
): number {
  const cut = feedMmMin > 0 ? (stats.cutLen / feedMmMin) * 60 : 0;
  const travel = travelMmMin > 0 ? (stats.travelLen / travelMmMin) * 60 : 0;
  const overhead = stats.paths * PER_PATH_OVERHEAD_SECONDS;
  let extra = 0;
  if (opts && feedMmMin > 0) {
    if (opts.overcutMm) extra += ((opts.overcutMm * stats.closedPaths) / feedMmMin) * 60;
    if (opts.bladeOffsetMm) extra += (stats.corners * Math.PI * opts.bladeOffsetMm) / (feedMmMin / 60);
  }
  return cut + travel + overhead + extra;
}

/* ------------------------------------------------------------------ *
 * Physics-based time model (trapezoidal velocity profiles).
 *
 * The classic estimate above is length-based with compensation
 * surcharges; this block implements the finer model from §6 of
 * docs/research-sticker-printcut-2026-10.md (backlog item "physics-based
 * trapezoidal time model", constants in §3): per-segment accel / cruise /
 * decel profiles with chained junction speeds, exactly the way CutTime /
 * grbl-class planners compute job time. It exists so the plotter dialog can
 * show a second, geometry-honest number next to the classic one.
 * ------------------------------------------------------------------ */

/**
 * Cruise-speed multiplier for a vertex from its unsigned turn angle — the
 * documented turn-angle PROXY for CutTime's radius→speed corner table
 * (docs/research-sticker-printcut-2026-10.md §3/§6). We operate on
 * flattened polylines that no longer carry arc radii, so the turn angle at
 * each vertex stands in for curvature: the sharper the turn, the slower it
 * must be taken.
 */
function cornerSpeedFactor(turn: number | null): number {
  if (turn === null) return 1;
  if (turn >= 60) return 0.25;
  if (turn >= 30) return 0.4;
  if (turn >= 15) return 0.6; // CORNER_TURN_DEG band floor
  return 1;
}

/**
 * Time (seconds) to travel `d` mm from speed `v0` to `v1` (mm/s) under a
 * trapezoidal velocity profile with acceleration `accel` (mm/s²) and a
 * cruise ceiling `vMax`.
 *
 * accelDist = (vPeak² − v0²)/2a, decelDist = (vPeak² − v1²)/2a; the
 * unconstrained triangular peak is √((2·a·d + v0² + v1²)/2) and the actual
 * peak is min(vMax, that). When the ends differ, the peak sits closer to
 * the slower end (the "asymmetric-end peak shift") — it falls out of the
 * formulas because accel/decel distances are computed from v0 / v1
 * respectively. When `d` is too short to bridge v0→v1 at `accel` (only
 * possible without a backward reachability pass, see `estimateJobSeconds`),
 * the whole move runs under the binding constraint — decelerate (or
 * accelerate) for the entire distance — and the neighbour segment absorbs
 * the speed mismatch.
 */
function moveSeconds(d: number, v0: number, v1: number, vMax: number, accel: number): number {
  if (d <= 1e-9 || vMax <= 0) return 0;
  v0 = Math.min(v0, vMax);
  v1 = Math.min(v1, vMax);
  const vPeak = Math.min(vMax, Math.sqrt((2 * accel * d + v0 * v0 + v1 * v1) / 2));
  if (vPeak >= v0 - 1e-9 && vPeak >= v1 - 1e-9) {
    const dAcc = (vPeak * vPeak - v0 * v0) / (2 * accel);
    const dDec = (vPeak * vPeak - v1 * v1) / (2 * accel);
    return (vPeak - v0) / accel + (vPeak - v1) / accel + Math.max(0, d - dAcc - dDec) / vPeak;
  }
  // Over-constrained bridge (can't decelerate to v1, or can't accelerate to
  // it, within d): monotone full-move profile, no cruise.
  if (v0 >= v1) {
    const vEnd = Math.sqrt(Math.max(0, v0 * v0 - 2 * accel * d));
    return (v0 - vEnd) / accel;
  }
  const vEnd = Math.sqrt(v0 * v0 + 2 * accel * d);
  return (vEnd - v0) / accel;
}

/**
 * Blade-down time for one polyline under the trapezoidal model. Speeds are
 * chained per segment: the head starts and ends at rest (blade drop /
 * lift), and each interior vertex's junction speed is capped by the turn AT
 * that vertex (arrive at the corner already pre-slowed). For closed paths
 * the closing segment is always traversed (matching cutStats' segment
 * convention) and the seam turn — the last→first corner — additionally caps
 * the final segment's cruise ceiling, mirroring how cutStats counts the
 * seam corner.
 */
function pathCutSeconds(p: PolyLite, vMax: number, accel: number, cornerSlow: boolean): number {
  // Collapse coincident consecutive vertices (degenerate segments carry no
  // turn and take no time); closed rings drop a duplicate closing vertex
  // and re-append it so the closing leg is measured exactly once.
  const pts: Array<[number, number]> = [];
  for (const v of p.points) {
    if (pts.length === 0 || dist(pts[pts.length - 1], v) > 1e-9) pts.push(v);
  }
  if (p.closed && pts.length > 1 && dist(pts[0], pts[pts.length - 1]) <= 1e-9) pts.pop();
  const t = p.closed && pts.length > 1 ? pts.concat([pts[0]]) : pts;
  const n = t.length;
  if (n < 2) return 0;
  const junction: number[] = new Array(n);
  junction[0] = 0;
  junction[n - 1] = 0;
  for (let j = 1; j < n - 1; j++) {
    junction[j] = vMax * (cornerSlow ? cornerSpeedFactor(turnDeg(t[j - 1], t[j], t[j + 1])) : 1);
  }
  let seconds = 0;
  for (let i = 0; i < n - 1; i++) {
    let ceiling = vMax;
    if (cornerSlow && p.closed && i === n - 2) {
      ceiling = vMax * cornerSpeedFactor(turnDeg(t[n - 2], t[n - 1], t[1]));
    }
    seconds += moveSeconds(dist(t[i], t[i + 1]), junction[i], junction[i + 1], ceiling, accel);
  }
  return seconds;
}

/** Options for `estimateJobSeconds` — the physics-model twin of the
 *  feed/travel speeds `estimateSeconds` takes, plus the two machine
 *  constants the classic estimate has no place for. */
export interface PhysicsEstimateOptions {
  /** Blade-down speed, mm/min (same unit as `estimateSeconds`). */
  feedMmMin: number;
  /** Pen-up rapid speed, mm/min. */
  travelMmMin: number;
  /** Acceleration, mm/s². Values ≤ 0 are clamped to 1 rather than throwing
   *  (a garbage preset must never crash the estimate dialog). Research
   *  bands: sign vinyl ~1500, HTV ~1000, cardstock ~800. */
  accelMmS2: number;
  /** Per-path head-lift + blade-drop settle delay in seconds. Defaults to
   *  `PER_PATH_OVERHEAD_SECONDS`; research band 0.15–0.35 s (AxiDraw
   *  150 ms, CutTime carton 0.25 s). Negative values clamp to 0. */
  headUpS?: number;
  /** Apply the turn-angle corner-speed caps (default true). false → vMax
   *  at every junction. */
  cornerSlow?: boolean;
}

/**
 * Trapezoidal-profile job-time estimate over (already post-processed)
 * polylines: cut legs at chained junction speeds, pen-up travel legs
 * between path starts at `travelMmMin` (same trapezoid math, shared
 * accel), head-up delay per path.
 *
 * Unlike `estimateSeconds` this does NOT take corner-swing or overcut
 * extras — the geometry passed in already contains the loops and retrace
 * (`applyBladeOffset` / `applyOvercut` output), and the per-vertex
 * slowdowns model the swing cost. Chaining is a single forward pass
 * (v_start[i] = v_end[i−1], v_end[last] = 0) without a backward
 * reachability pass, so on very short segments the model under-counts the
 * decel blend — a documented approximation, deterministic and pure.
 *
 * Speeds ≤ 0 contribute 0 s for their leg kind, mirroring
 * `estimateSeconds`' convention. Model + constants:
 * docs/research-sticker-printcut-2026-10.md §3 and §6 (CutTime).
 */
export function estimateJobSeconds(
  polys: PolyLite[],
  start: [number, number],
  opts: PhysicsEstimateOptions,
): number {
  const accel = Math.max(1, opts.accelMmS2);
  const feed = opts.feedMmMin > 0 ? opts.feedMmMin / 60 : 0;
  const travel = opts.travelMmMin > 0 ? opts.travelMmMin / 60 : 0;
  const headUp = Math.max(0, opts.headUpS ?? PER_PATH_OVERHEAD_SECONDS);
  const cornerSlow = opts.cornerSlow !== false;
  let total = 0;
  let cur = start;
  for (const p of polys) {
    if (p.points.length === 0) continue;
    if (travel > 0) total += moveSeconds(dist(cur, p.points[0]), 0, 0, travel, accel);
    total += headUp;
    if (feed > 0) total += pathCutSeconds(p, feed, accel, cornerSlow);
    cur = p.points[p.points.length - 1];
  }
  return total;
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
