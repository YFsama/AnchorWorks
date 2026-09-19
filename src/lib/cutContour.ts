/**
 * Vinyl-cutter contour algorithms.
 *
 *  - offsetPolyline     : parallel-offset a single polyline (positive
 *                          distance → outward for closed paths, "to the
 *                          left" for open paths under the standard
 *                          right-hand convention).
 *  - traceBitmap         : marching-squares contour-follow over an
 *                          ImageData luma/alpha threshold, then
 *                          Douglas-Peucker simplification.
 *  - generateRegMarks    : Roland-CutStudio-style 4-corner L-shape
 *                          registration marks for the requested bounding
 *                          box.
 *  - detectRegMarks      : recognise the same 4-corner pattern in an
 *                          imported PLT so we can auto-align the cutter
 *                          to the printed art.
 *
 * Everything works in document mm-space. The PlotterDialog handles
 * mm → plotter-unit conversion at send time so this module stays unit-
 * agnostic.
 */

import polygonClipping from 'polygon-clipping';
import type { CutPath } from '../store/editor';

/* ============================================================ */
/* offsetPolyline                                                */
/* ============================================================ */

interface OffsetOptions {
  /** Miter limit before falling back to a bevel. Default 4 — matches SVG. */
  miterLimit: number;
  /** Polylines with a closing-segment shorter than this (mm) are treated
   *  as already-closed for the purpose of normal calculation. */
  closeTolerance: number;
}

const DEFAULT_OFFSET: OffsetOptions = {
  miterLimit: 4,
  closeTolerance: 0.01,
};

/**
 * Parallel-offset a polyline by `distance` mm. Positive distance walks
 * outward (left of segment direction by the right-hand rule); negative
 * inward. For closed paths the offset is taken outward from the polygon
 * interior — the sign of `distance` then controls expand vs shrink.
 *
 * Implementation:
 *  1. Compute outward normals for each segment.
 *  2. For each interior vertex, intersect the two offset half-lines.
 *     If the intersection is too far (miter > limit), fall back to a
 *     bevel by emitting two points instead of one.
 *  3. For closed paths, fold the first/last vertex through the same
 *     miter logic.
 *  4. Clean up self-intersections via polygon-clipping union of the
 *     offset polygon with itself — for inward offsets that pinch
 *     across a narrow neck, this drops the pinched leg cleanly.
 */
export function offsetPolyline(
  points: Array<[number, number]>,
  distance: number,
  closed: boolean,
  opts: Partial<OffsetOptions> = {},
): Array<Array<[number, number]>> {
  if (points.length < 2 || Math.abs(distance) < 1e-9) {
    return [points.slice()];
  }
  const { miterLimit, closeTolerance } = { ...DEFAULT_OFFSET, ...opts };

  // Detect "actually closed" — a polyline whose last point matches its
  // first counts as closed even if the caller didn't set the flag.
  const last = points[points.length - 1];
  const first = points[0];
  const reallyClosed = closed ||
    (Math.hypot(last[0] - first[0], last[1] - first[1]) < closeTolerance);

  // Work in a buffer that omits the duplicate closing vertex if present;
  // we'll re-emit it at the end for closed output.
  const pts = reallyClosed && Math.hypot(last[0] - first[0], last[1] - first[1]) < closeTolerance
    ? points.slice(0, -1)
    : points.slice();

  const n = pts.length;
  if (n < 2) return [pts];

  /** Segment direction + outward normal for segment i (pts[i] → pts[i+1]). */
  const segDir: Array<[number, number]> = [];
  const segNor: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    segDir.push([dx / len, dy / len]);
    // Outward normal in SCREEN coords (Y-down). The math-coord
    // right-hand normal [-dy, dx] would point inward for a CCW polygon
    // because the Y axis is flipped. Use [dy, -dx] so positive
    // `distance` consistently means "outward / expand" for the user
    // and negative means "inward / shrink" — matching the dialog's
    // labels and the test expectations.
    segNor.push([dy / len, -dx / len]);
  }

  /** Offset endpoints for segment i, parallel to the original segment. */
  const offSegs: Array<{ a: [number, number]; b: [number, number] }> = [];
  for (let i = 0; i < n; i++) {
    const nor = segNor[i];
    const a = pts[i];
    const b = pts[(i + 1) % n];
    offSegs.push({
      a: [a[0] + nor[0] * distance, a[1] + nor[1] * distance],
      b: [b[0] + nor[0] * distance, b[1] + nor[1] * distance],
    });
  }

  /**
   * Intersect offset-segment i with offset-segment i+1 at vertex i+1.
   * Returns the miter point + miter length (used to fall back to bevel
   * when the join exceeds miterLimit × distance).
   */
  const miterAt = (vi: number): { p: [number, number]; len: number } => {
    const prev = offSegs[(vi - 1 + n) % n];
    const next = offSegs[vi];
    // Line-line intersection: parameterise prev as P + t*d1, next as Q + s*d2.
    const p = prev.b; // end of previous offset segment
    const q = next.a; // start of next offset segment
    const d1 = segDir[(vi - 1 + n) % n];
    const d2 = segDir[vi];
    const denom = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(denom) < 1e-9) {
      // Collinear — keep current p, length 0 (no excess).
      return { p, len: 0 };
    }
    // Solve p + t*d1 = q + s*d2 → use prev.a + t*(d1*segLen) form.
    const qx = q[0] - p[0];
    const qy = q[1] - p[1];
    const t = (qx * d2[1] - qy * d2[0]) / denom;
    const mp: [number, number] = [p[0] + d1[0] * t, p[1] + d1[1] * t];
    // Miter length: distance from the original vertex to the miter point,
    // divided by |distance|. Standard CSS/SVG miter-limit semantics.
    const orig = pts[vi];
    const len = Math.hypot(mp[0] - orig[0], mp[1] - orig[1]) / Math.max(1e-9, Math.abs(distance));
    return { p: mp, len };
  };

  const out: Array<[number, number]> = [];

  if (reallyClosed) {
    // Every vertex gets a miter (or bevel fallback).
    for (let i = 0; i < n; i++) {
      const { p, len } = miterAt(i);
      if (len > miterLimit) {
        // Bevel: emit the two end points of the offset segments
        // adjacent to this vertex instead of the miter point.
        out.push(offSegs[(i - 1 + n) % n].b);
        out.push(offSegs[i].a);
      } else {
        out.push(p);
      }
    }
    out.push(out[0]); // close
  } else {
    // Open polyline: first/last vertices keep their respective offset
    // endpoint; interior vertices get miters.
    out.push(offSegs[0].a);
    for (let i = 1; i < n - 1; i++) {
      const { p, len } = miterAt(i);
      if (len > miterLimit) {
        out.push(offSegs[i - 1].b);
        out.push(offSegs[i].a);
      } else {
        out.push(p);
      }
    }
    out.push(offSegs[n - 2].b);
  }

  // Self-intersection cleanup for closed paths. Use polygon-clipping's
  // union against the empty polygon — that runs the same sweep-line
  // self-intersection cleanup it would apply to a union of two polygons
  // but with only one input, eliminating bowtie/inward-pinch artefacts
  // without altering the unjoined region.
  if (reallyClosed && out.length > 3) {
    try {
      // polygon-clipping wants [[outerRing, ...holes], ...] geometry, with
      // each ring closed (first === last). Make sure that's true.
      const ring = out.slice();
      const cleaned = polygonClipping.union([[ring]]);
      // Each member of `cleaned` is a polygon; multiple polygons mean the
      // offset split into disconnected pieces (e.g. a thin inward offset
      // chopping a U-shape into two). Return each outer ring as its own
      // polyline; holes are discarded for plot-path purposes.
      const polys: Array<Array<[number, number]>> = [];
      for (const polygon of cleaned) {
        const outer = polygon[0];
        polys.push(outer.map(([x, y]) => [x, y] as [number, number]));
      }
      if (polys.length > 0) return polys;
    } catch {
      // Degenerate input — fall through to raw output rather than
      // crashing the whole cut operation.
    }
  }

  return [out];
}

/* ============================================================ */
/* traceBitmap                                                   */
/* ============================================================ */

export interface TraceOptions {
  /** 0..255 luma threshold. Pixels DARKER than this are "ink." */
  threshold: number;
  /** Use the alpha channel instead of luma — useful for transparent PNGs. */
  useAlpha: boolean;
  /** Douglas-Peucker simplification tolerance in **bitmap pixels**. */
  simplifyTolerance: number;
  /** Pixel size in mm. Used to convert pixel-space output to mm. */
  pixelSizeMm: number;
  /** Drop contours whose bounding box is smaller than this (mm). */
  minSizeMm: number;
}

export const defaultTraceOptions: TraceOptions = {
  threshold: 128,
  useAlpha: false,
  simplifyTolerance: 1.5,
  pixelSizeMm: 0.25, // 4 px/mm — a sane default for typical screen art
  minSizeMm: 1,
};

/**
 * Trace the outline of "ink" regions in an ImageData buffer.
 *
 * Uses a Moore-neighbour contour-following walk:
 *  1. Scan rows for the first ink pixel that doesn't already belong to
 *     a known contour.
 *  2. Walk the boundary clockwise around the connected region.
 *  3. Mark visited boundary cells in a parallel `seen` grid so we don't
 *     re-trace the same outline.
 *  4. Push the contour and resume scanning AFTER the start cell.
 *
 * Douglas-Peucker simplifies each contour to keep the cutter from
 * stair-stepping along every pixel. Contours below minSizeMm are dropped
 * as noise.
 */
export function traceBitmap(
  img: ImageData,
  opts: Partial<TraceOptions> = {},
): Array<Array<[number, number]>> {
  const o: TraceOptions = { ...defaultTraceOptions, ...opts };
  const { width: W, height: H, data } = img;

  // Pre-compute an ink/no-ink bitmap so the contour walk can lookup in
  // O(1) without re-checking thresholds on every neighbour visit.
  const ink = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3];
    if (o.useAlpha) {
      ink[p] = a > o.threshold ? 1 : 0;
    } else {
      // Luminance via Rec. 709 weights; multiply by alpha so transparent
      // pixels are never "ink" regardless of underlying colour.
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) * (a / 255);
      ink[p] = luma < o.threshold ? 1 : 0;
    }
  }

  return traceInkBitmap(ink, W, H, o.simplifyTolerance, o.pixelSizeMm, o.minSizeMm);
}

/**
 * Shared Moore-neighbour contour walk over a pre-thresholded ink bitmap.
 * Extracted from traceBitmap so the multi-colour tracer can reuse the exact
 * same boundary-following + simplification + min-size pipeline per colour
 * cluster (identical output characteristics for single- and multi-colour).
 */
function traceInkBitmap(
  ink: Uint8Array,
  W: number,
  H: number,
  simplifyTolerance: number,
  pixelSizeMm: number,
  minSizeMm: number,
): Array<Array<[number, number]>> {
  const seen = new Uint8Array(W * H);
  const contours: Array<Array<[number, number]>> = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!ink[y * W + x]) continue;
      if (seen[y * W + x]) continue;
      // Only START a contour from a pixel whose left neighbour is empty
      // — that's the "outer-left" boundary of a region, and Moore-walk
      // from there reliably circumnavigates the outer outline.
      if (x > 0 && ink[y * W + (x - 1)]) {
        // We're inside an already-traced region. Skip the rest of this
        // ink run to the next gap.
        while (x < W && ink[y * W + x]) x++;
        continue;
      }
      const ring = mooreContour(ink, W, H, x, y, seen);
      if (ring.length >= 4) {
        const simplified = douglasPeucker(ring, simplifyTolerance);
        // Convert pixel coords → mm.
        const mm = simplified.map(([px, py]) =>
          [px * pixelSizeMm, py * pixelSizeMm] as [number, number],
        );
        // Drop tiny contours (single-pixel noise).
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [px, py] of mm) {
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
        if (Math.max(maxX - minX, maxY - minY) >= minSizeMm) {
          contours.push(mm);
        }
      }
    }
  }

  return contours;
}

// 8-direction Moore neighbourhood, CW starting from "right". Indexed by
// the previous travel direction so the walk turns the correct way.
const MOORE_DX = [1, 1, 0, -1, -1, -1, 0, 1];
const MOORE_DY = [0, 1, 1, 1, 0, -1, -1, -1];

function mooreContour(
  ink: Uint8Array, W: number, H: number,
  startX: number, startY: number,
  seen: Uint8Array,
): Array<[number, number]> {
  const ring: Array<[number, number]> = [[startX, startY]];
  seen[startY * W + startX] = 1;
  let dir = 6; // "up" — we approached from below in the row scan
  let cx = startX, cy = startY;
  const MAX_STEPS = W * H * 4; // safety bound
  for (let step = 0; step < MAX_STEPS; step++) {
    // Start checking from the position 90° counter-clockwise of the
    // previous direction; this is the Moore "look right" convention.
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) & 7; // (-2 + k) mod 8
      const nx = cx + MOORE_DX[d];
      const ny = cy + MOORE_DY[d];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (!ink[ny * W + nx]) continue;
      cx = nx; cy = ny;
      dir = d;
      seen[ny * W + nx] = 1;
      ring.push([cx, cy]);
      found = true;
      break;
    }
    if (!found) break;
    if (cx === startX && cy === startY && ring.length > 2) break;
  }
  return ring;
}

/** Douglas-Peucker polyline simplification. Iterative, no recursion. */
export function douglasPeucker(
  pts: Array<[number, number]>,
  tol: number,
): Array<[number, number]> {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = -1;
    const [x0, y0] = pts[i0];
    const [x1, y1] = pts[i1];
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    for (let i = i0 + 1; i < i1; i++) {
      const [x, y] = pts[i];
      // Perpendicular distance from pts[i] to segment (i0, i1).
      let d: number;
      if (len2 < 1e-12) {
        d = Math.hypot(x - x0, y - y0);
      } else {
        const t = ((x - x0) * dx + (y - y0) * dy) / len2;
        const tc = Math.max(0, Math.min(1, t));
        const px = x0 + tc * dx, py = y0 + tc * dy;
        d = Math.hypot(x - px, y - py);
      }
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > tol && maxIdx >= 0) {
      keep[maxIdx] = 1;
      stack.push([i0, maxIdx], [maxIdx, i1]);
    }
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/* ============================================================ */
/* Trace presets                                                  */
/* ============================================================ */

/**
 * Named trace recipes (Illustrator Image Trace equivalents, cutter-flavoured).
 * Each tuple carries the full TraceOptions override — clicking the preset in
 * the dialog applies every parameter at once rather than nudging one slider.
 */
export interface TracePreset {
  id: string;
  /** i18n key — the English label doubles as the translation key. */
  label: string;
  /** Single-contour parameters (applied to the threshold trace pipeline). */
  options: Partial<TraceOptions>;
  /** Multi-pass preset: runs k-means quantization with this many colours. */
  colorCount?: number;
}

export const TRACE_PRESETS: TracePreset[] = [
  {
    id: 'bw-logo',
    label: 'Black & White logo',
    options: { threshold: 128, useAlpha: false, simplifyTolerance: 1, minSizeMm: 1 },
  },
  {
    id: 'line-art',
    label: 'Line art / sketch',
    options: { threshold: 200, useAlpha: false, simplifyTolerance: 0.5, minSizeMm: 0.5 },
  },
  {
    id: 'photo-cut',
    label: 'Photo cut (multi-pass)',
    options: { threshold: 160, useAlpha: false, simplifyTolerance: 2, minSizeMm: 2 },
    colorCount: 6,
  },
];

/** Look up a preset's TraceOptions tuple by id (undefined when unknown). */
export function tracePresetOptions(id: string): Partial<TraceOptions> | undefined {
  return TRACE_PRESETS.find((p) => p.id === id)?.options;
}

/* ============================================================ */
/* Multi-colour trace — seeded k-means + per-cluster contours     */
/* ============================================================ */

/** One quantized colour: the centroid RGB plus its sampled-pixel weight. */
export interface ColorCluster {
  color: [number, number, number];
  pixels: number;
}

/** One traced colour region: the cluster colour + its mm-space contours. */
export interface TraceClusterResult {
  color: [number, number, number];
  contours: Array<Array<[number, number]>>;
}

export interface KMeansOptions {
  /** Iteration cap. 12 is plenty for image quantization convergence. */
  maxIterations?: number;
  /** Cap on sampled pixels fed to the solver (stride downsampling). */
  maxSamples?: number;
  /** Stop early once every center moves less than this (0–255 scale). */
  epsilon?: number;
}

const DEFAULT_KMEANS: Required<KMeansOptions> = { maxIterations: 12, maxSamples: 20000, epsilon: 0.75 };

/**
 * Deterministic k-means colour quantization over an image's opaque pixels.
 *
 * Seeding is the deterministic part that matters: samples are sorted by
 * luminance and k centers are spread evenly through that ordering, so the
 * same image always yields the same clusters (no RNG, no run-to-run drift —
 * which also keeps unit tests and saved presets reproducible). Lloyd
 * iterations then refine the centers as usual; clusters that lose every
 * pixel are dropped, so the result can contain fewer than k colours.
 */
export function kmeansQuantize(img: ImageData, k: number, opts: KMeansOptions = {}): ColorCluster[] {
  const o = { ...DEFAULT_KMEANS, ...opts };
  const kk = Math.max(1, Math.min(16, Math.floor(k)));
  const { width: W, height: H, data } = img;

  // Stride-sample opaque pixels.
  const total = W * H;
  const stride = Math.max(1, Math.ceil(total / o.maxSamples));
  const samples: Array<[number, number, number]> = [];
  for (let p = 0; p < total; p += stride) {
    const i = p * 4;
    if (data[i + 3] < 128) continue; // transparent pixels belong to no colour
    samples.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (samples.length === 0) return [];
  if (samples.length <= kk) {
    // Fewer distinct samples than colours — dedupe and call it done.
    const unique = new Map<string, [number, number, number]>();
    for (const s of samples) unique.set(s.join(','), s);
    return [...unique.values()].map((color) => ({ color, pixels: 1 }));
  }

  // Deterministic seeding: luminance-sorted evenly spaced samples.
  const luma = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  samples.sort((a, b) => luma(a) - luma(b));
  let centers: Array<[number, number, number]> = [];
  for (let c = 0; c < kk; c++) {
    centers.push(samples[Math.floor(((c + 0.5) / kk) * samples.length)].slice() as [number, number, number]);
  }

  const assign = new Uint16Array(samples.length);
  for (let iter = 0; iter < o.maxIterations; iter++) {
    // Assignment step — nearest center by squared RGB distance.
    let moved = 0;
    for (let s = 0; s < samples.length; s++) {
      assign[s] = nearestClusterIndex(samples[s], centers);
    }
    // Update step — per-cluster mean; empty clusters are dropped here.
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let s = 0; s < samples.length; s++) {
      const a = assign[s];
      const [r, g, b] = samples[s];
      sums[a][0] += r; sums[a][1] += g; sums[a][2] += b; sums[a][3] += 1;
    }
    const next: Array<[number, number, number]> = [];
    for (let c = 0; c < centers.length; c++) {
      const [sr, sg, sb, n] = sums[c];
      if (n === 0) continue; // empty cluster dies
      const mean: [number, number, number] = [sr / n, sg / n, sb / n];
      moved = Math.max(
        moved,
        Math.abs(mean[0] - centers[c][0]) + Math.abs(mean[1] - centers[c][1]) + Math.abs(mean[2] - centers[c][2]),
      );
      next.push(mean);
    }
    centers = next;
    if (centers.length <= 1 || moved < o.epsilon) break;
  }

  // Final pass: count pixels per surviving center.
  const counts = new Map<string, { color: [number, number, number]; pixels: number }>();
  for (let s = 0; s < samples.length; s++) {
    const ci = nearestClusterIndex(samples[s], centers);
    const center = centers[ci];
    const key = center.join(',');
    const entry = counts.get(key) ?? { color: [round8(center[0]), round8(center[1]), round8(center[2])], pixels: 0 };
    entry.pixels += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.pixels - a.pixels);
}

function round8(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Index of the cluster whose color is nearest (squared RGB distance). */
export function nearestClusterIndex(
  color: readonly [number, number, number],
  centers: ReadonlyArray<readonly [number, number, number]>,
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let c = 0; c < centers.length; c++) {
    const dr = color[0] - centers[c][0];
    const dg = color[1] - centers[c][1];
    const db = color[2] - centers[c][2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

export interface MultiTraceOptions {
  /** Number of colours to quantize into (2..8 is the useful cutter range). */
  colorCount: number;
  /** Douglas-Peucker tolerance in bitmap pixels (per cluster contour). */
  simplifyTolerance: number;
  /** Pixel size in mm (same convention as TraceOptions). */
  pixelSizeMm: number;
  /** Drop cluster contours smaller than this (mm). */
  minSizeMm: number;
  /** Pre-computed clusters — when omitted, kmeansQuantize derives them. */
  clusters?: ColorCluster[];
}

/**
 * Multi-colour trace: quantize the image into k colours, then trace each
 * colour's region boundaries with the same marching-squares walk the single
 * contour tracer uses. One cluster can produce many contours (disjoint
 * regions of the same colour); clusters with no surviving contours are
 * dropped. Pure function — the worker runs this off the main thread and the
 * dialog falls back to calling it directly when no Worker is available.
 * `onProgress` fires once per traced cluster (done counts up to total).
 */
export function traceMultiColor(
  img: ImageData,
  opts: MultiTraceOptions,
  onProgress?: (done: number, total: number) => void,
): TraceClusterResult[] {
  const clusters = opts.clusters ?? kmeansQuantize(img, opts.colorCount);
  if (clusters.length === 0) return [];
  const { width: W, height: H, data } = img;

  // Per-pixel cluster assignment (255 = transparent / no cluster). Single
  // pass — the per-cluster loop below only extracts masks.
  const owner = new Uint8Array(W * H).fill(255);
  const centers = clusters.map((c) => c.color);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    if (data[i + 3] < 128) continue;
    const nearest = nearestClusterIndex([data[i], data[i + 1], data[i + 2]], centers);
    if (nearest > 254) continue; // can't happen with <=16 clusters; type guard
    owner[p] = nearest;
  }

  const out: TraceClusterResult[] = [];
  for (let c = 0; c < clusters.length; c++) {
    const ink = new Uint8Array(W * H);
    for (let p = 0; p < owner.length; p++) ink[p] = owner[p] === c ? 1 : 0;
    const contours = traceInkBitmap(ink, W, H, opts.simplifyTolerance, opts.pixelSizeMm, opts.minSizeMm);
    if (contours.length > 0) out.push({ color: clusters[c].color, contours });
    onProgress?.(c + 1, clusters.length);
  }
  return out;
}

/* ----------------------- worker plumbing ----------------------- */

/**
 * Multi-colour trace request sent to the trace worker. Kept structurally
 * distinct from the legacy single-polygon request (`{id, imageData,
 * threshold}`) via the `kind` tag so the worker can dispatch without
 * guessing, and so io3.ts's older RPC continues to work unchanged.
 */
export interface MultiTraceRequest {
  id: number;
  kind: 'multi';
  imageData: ImageData;
  colorCount: number;
  simplifyTolerance: number;
  pixelSizeMm: number;
  minSizeMm: number;
}

export type MultiTraceResponse =
  | { id: number; progress: true; done: number; total: number }
  | { id: number; ok: true; clusters: TraceClusterResult[] }
  | { id: number; ok: false; error: string };

let multiWorker: Worker | null = null;
let multiWorkerFailed = false;
let nextMultiReqId = 1;
interface MultiPending {
  resolve: (clusters: TraceClusterResult[]) => void;
  reject: (err: Error) => void;
  onProgress?: (done: number, total: number) => void;
}
const multiPending = new Map<number, MultiPending>();

function getMultiTraceWorker(): Worker | null {
  if (multiWorkerFailed) return null;
  if (multiWorker) return multiWorker;
  if (typeof Worker === 'undefined') return null; // SSR / test env
  try {
    // Standard Vite worker bootstrap (`new URL` form). Unlike the `?worker`
    // suffix imports used in io3.ts / booleanOps.ts, this only evaluates when
    // the multi-colour trace actually runs, so importing cutContour.ts from
    // unit tests never needs a Worker implementation.
    const w = new Worker(new URL('./workers/trace.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<MultiTraceResponse>): void => {
      const data = ev.data;
      const entry = multiPending.get(data.id);
      if (!entry) return;
      if ('progress' in data) {
        entry.onProgress?.(data.done, data.total);
        return;
      }
      multiPending.delete(data.id);
      if (data.ok) entry.resolve(data.clusters);
      else entry.reject(new Error(data.error));
    };
    w.onerror = (ev: ErrorEvent): void => {
      const err = new Error(ev.message || 'trace worker error');
      for (const p of multiPending.values()) p.reject(err);
      multiPending.clear();
    };
    multiWorker = w;
    return w;
  } catch {
    multiWorkerFailed = true;
    return null;
  }
}

/**
 * Multi-colour trace with progress, off the main thread when possible.
 * Falls back to the synchronous pure implementation when Workers aren't
 * available (SSR, restricted environments, unit tests).
 */
export function traceMultiColorAsync(
  img: ImageData,
  opts: MultiTraceOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<TraceClusterResult[]> {
  const w = getMultiTraceWorker();
  if (!w) {
    // Synchronous fallback — report the clusters as one completed step so
    // progress-driven UIs still get a final tick.
    try {
      const clusters = traceMultiColor(img, opts);
      onProgress?.(clusters.length, clusters.length);
      return Promise.resolve(clusters);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
  return new Promise<TraceClusterResult[]>((resolve, reject) => {
    const id = nextMultiReqId++;
    multiPending.set(id, { resolve, reject, onProgress });
    const req: MultiTraceRequest = {
      id,
      kind: 'multi',
      imageData: img,
      colorCount: opts.colorCount,
      simplifyTolerance: opts.simplifyTolerance,
      pixelSizeMm: opts.pixelSizeMm,
      minSizeMm: opts.minSizeMm,
    };
    w.postMessage(req);
  });
}

/* ============================================================ */
/* Registration marks                                            */
/* ============================================================ */

export interface RegMarkOptions {
  /** Outside bounds (mm) — marks anchor relative to this rectangle. */
  bounds: { x: number; y: number; w: number; h: number };
  /** Length of each L-arm in mm. Roland CutStudio default is 10mm. */
  armLength: number;
  /** Inset from the bounds corner in mm. Roland default is 5mm. */
  inset: number;
  /** Mark shape: `L` (Roland CutStudio corner brackets — default),
   *  `cross` (full + at each corner), `square` / `circle` (ARMS-style
   *  solid-shape marks that cutter camera systems recognise). */
  style?: RegMarkStyle;
}

export type RegMarkStyle = 'L' | 'cross' | 'square' | 'circle';

const REGMARK_LENGTH = 10;
const REGMARK_INSET = 5;

/**
 * 4-corner L-shape registration marks, Roland CutStudio convention.
 *
 *   ┌─       ─┐
 *   │         │
 *
 *   │         │
 *   └─       ─┘
 *
 * Each corner is a separate CutPath so the editor can show/hide or
 * delete individual marks if the user is doing something non-standard.
 * The cutter's optical sensor scans for these to align its head with
 * the printed art before cutting.
 */
export function generateRegMarks(opts: Partial<RegMarkOptions> & {
  bounds: RegMarkOptions['bounds'];
}): CutPath[] {
  const { bounds, armLength = REGMARK_LENGTH, inset = REGMARK_INSET, style = 'L' } = opts;
  const { x, y, w, h } = bounds;
  const make = (id: string, pts: Array<[number, number]>): CutPath => ({
    id, points: pts, closed: false, kind: 'regmark', passes: 1,
  });

  // ARMS-style solid shapes: a closed square / circle centred at each
  // corner anchor. Graphtec ARMS recognises ~4mm squares or circles;
  // armLength doubles as the shape size so existing presets still work.
  if (style === 'square' || style === 'circle') {
    const size = Math.max(2, armLength);
    const anchors: Array<[string, number, number]> = [
      ['tl', x + inset + size / 2, y + inset + size / 2],
      ['tr', x + w - inset - size / 2, y + inset + size / 2],
      ['bl', x + inset + size / 2, y + h - inset - size / 2],
      ['br', x + w - inset - size / 2, y + h - inset - size / 2],
    ];
    return anchors.map(([id, cx, cy]) => {
      if (style === 'square') {
        const h2 = size / 2;
        return make(`regmark-${id}`, [
          [cx - h2, cy - h2], [cx + h2, cy - h2], [cx + h2, cy + h2], [cx - h2, cy + h2], [cx - h2, cy - h2],
        ]);
      }
      const r = size / 2;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return make(`regmark-${id}`, pts);
    }).map(p => ({ ...p, closed: true }));
  }

  if (style === 'cross') {
    // Full + at each corner anchor — easy to eyeball alignment by hand.
    const a = armLength / 2;
    const anchors: Array<[string, number, number]> = [
      ['tl', x + inset + a, y + inset + a],
      ['tr', x + w - inset - a, y + inset + a],
      ['bl', x + inset + a, y + h - inset - a],
      ['br', x + w - inset - a, y + h - inset - a],
    ];
    return anchors.flatMap(([id, cx, cy]) => [
      make(`regmark-${id}-h`, [[cx - a, cy], [cx + a, cy]]),
      make(`regmark-${id}-v`, [[cx, cy - a], [cx, cy + a]]),
    ]);
  }

  return [
    // Top-left ┌
    make('regmark-tl', [
      [x + inset, y + inset + armLength],
      [x + inset, y + inset],
      [x + inset + armLength, y + inset],
    ]),
    // Top-right ┐
    make('regmark-tr', [
      [x + w - inset - armLength, y + inset],
      [x + w - inset, y + inset],
      [x + w - inset, y + inset + armLength],
    ]),
    // Bottom-left └
    make('regmark-bl', [
      [x + inset, y + h - inset - armLength],
      [x + inset, y + h - inset],
      [x + inset + armLength, y + h - inset],
    ]),
    // Bottom-right ┘
    make('regmark-br', [
      [x + w - inset - armLength, y + h - inset],
      [x + w - inset, y + h - inset],
      [x + w - inset, y + h - inset - armLength],
    ]),
  ];
}

/**
 * Scan a list of polylines for the 4-corner L-shape registration-mark
 * pattern. Returns the recovered bounds (in mm) + which polylines are
 * marks (so the caller can drop them from the editable geometry), or
 * `null` when no marks are found.
 *
 * Heuristic: a regmark polyline has 3 points forming a right angle.
 * Find all such polylines whose arm length is roughly equal; if there
 * are at least 4 and their corners cluster near the bounding box of
 * the rest of the geometry, treat them as the regmark set.
 */
export function detectRegMarks(
  polylines: Array<{ points: Array<[number, number]>; closed: boolean }>,
): {
  bounds: { x: number; y: number; w: number; h: number };
  markIndexes: number[];
} | null {
  const lShapes: Array<{ idx: number; corner: [number, number]; armA: number; armB: number }> = [];

  for (let i = 0; i < polylines.length; i++) {
    const p = polylines[i];
    if (p.closed) continue;
    if (p.points.length !== 3) continue;
    const [a, b, c] = p.points;
    // Vectors from corner b to a and c.
    const v1x = a[0] - b[0], v1y = a[1] - b[1];
    const v2x = c[0] - b[0], v2y = c[1] - b[1];
    const armA = Math.hypot(v1x, v1y);
    const armB = Math.hypot(v2x, v2y);
    if (armA < 2 || armB < 2) continue; // too small for a regmark
    if (Math.abs(armA - armB) / Math.max(armA, armB) > 0.25) continue; // arms must be ~equal
    // Right angle test: dot product near zero.
    const dot = v1x * v2x + v1y * v2y;
    if (Math.abs(dot) / (armA * armB) > 0.15) continue;
    lShapes.push({ idx: i, corner: b, armA, armB });
  }

  if (lShapes.length < 4) return null;

  // Bounding box of all corner points.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const l of lShapes) {
    if (l.corner[0] < minX) minX = l.corner[0];
    if (l.corner[0] > maxX) maxX = l.corner[0];
    if (l.corner[1] < minY) minY = l.corner[1];
    if (l.corner[1] > maxY) maxY = l.corner[1];
  }
  const w = maxX - minX, h = maxY - minY;
  if (w < 10 || h < 10) return null;

  // Cluster corners into the 4 expected quadrants. Pick one from each.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const quadrant = (p: [number, number]) =>
    (p[0] < cx ? 0 : 1) | (p[1] < cy ? 0 : 2);
  const byQ: Array<typeof lShapes[number] | undefined> = [undefined, undefined, undefined, undefined];
  for (const l of lShapes) {
    const q = quadrant(l.corner);
    if (!byQ[q]) byQ[q] = l;
  }
  if (byQ.some(q => !q)) return null;

  return {
    bounds: { x: minX, y: minY, w, h },
    markIndexes: byQ.map(q => q!.idx),
  };
}

/* ============================================================ */
/* Weeding helpers                                               */
/* ============================================================ */

/**
 * A rectangular "weed border" around the artwork — the single most-used
 * convenience in sign shops. After cutting, the operator peels the waste
 * vinyl from inside this border in one pull instead of picking at every
 * edge. Sits `marginMm` outside the supplied bounds.
 */
export function generateWeedBorder(
  bounds: { x: number; y: number; w: number; h: number },
  marginMm = 3,
): CutPath {
  const { x, y, w, h } = bounds;
  const m = marginMm;
  return {
    id: `weed-border-${Date.now().toString(36)}`,
    points: [
      [x - m, y - m],
      [x + w + m, y - m],
      [x + w + m, y + h + m],
      [x - m, y + h + m],
      [x - m, y - m],
    ],
    closed: true,
    kind: 'manual',
    passes: 1,
  };
}

/**
 * Internal weed lines: a grid of straight cuts dividing the weed border into
 * panels so large waste areas come off in manageable pieces. `rows`/`cols`
 * are the number of interior dividers (0 = none on that axis).
 */
export function generateWeedLines(
  bounds: { x: number; y: number; w: number; h: number },
  rows: number,
  cols: number,
  marginMm = 3,
): CutPath[] {
  const { x, y, w, h } = bounds;
  const m = marginMm;
  const left = x - m, right = x + w + m, top = y - m, bottom = y + h + m;
  const out: CutPath[] = [];
  for (let c = 1; c <= cols; c++) {
    const cx = left + ((right - left) * c) / (cols + 1);
    out.push({ id: `weed-v-${c}-${Date.now().toString(36)}`, points: [[cx, top], [cx, bottom]], closed: false, kind: 'manual', passes: 1 });
  }
  for (let r = 1; r <= rows; r++) {
    const cy = top + ((bottom - top) * r) / (rows + 1);
    out.push({ id: `weed-h-${r}-${Date.now().toString(36)}`, points: [[left, cy], [right, cy]], closed: false, kind: 'manual', passes: 1 });
  }
  return out;
}

/* ============================================================ */
/* Path flattening helpers                                       */
/* ============================================================ */

/**
 * Flatten an SVG path `d` string to polylines (mm-space). Used by the
 * contour generator to convert fabric path objects into something
 * offsetPolyline can chew on.
 *
 * Recognises M / L / H / V / C / Q / Z (absolute + relative). Arc
 * commands are not flattened — the user should resolve arcs to cubics
 * before generating a contour. (Anchorworks' export pipeline emits no
 * raw arcs, so in practice this never bites.)
 */
export function flattenSvgPath(
  d: string,
  tolerance = 0.5,
): Array<{ points: Array<[number, number]>; closed: boolean }> {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out: Array<{ points: Array<[number, number]>; closed: boolean }> = [];
  let cur: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  let cmd = '';
  let line: Array<[number, number]> = [];
  let i = 0;
  const flush = (closed = false) => {
    if (line.length >= 2) out.push({ points: line, closed });
    line = [];
  };
  const num = () => +tokens[i++];

  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[a-zA-Z]/.test(tk)) { cmd = tk; i++; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M') {
      const x = num(), y = num();
      cur = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      start = [...cur];
      flush();
      line.push([...cur]);
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') {
      const x = num(), y = num();
      cur = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      line.push([...cur]);
    } else if (C === 'H') {
      const x = num();
      cur = [rel ? cur[0] + x : x, cur[1]];
      line.push([...cur]);
    } else if (C === 'V') {
      const y = num();
      cur = [cur[0], rel ? cur[1] + y : y];
      line.push([...cur]);
    } else if (C === 'C') {
      const x1 = num(), y1 = num();
      const x2 = num(), y2 = num();
      const x = num(), y = num();
      const p1: [number, number] = rel ? [cur[0] + x1, cur[1] + y1] : [x1, y1];
      const p2: [number, number] = rel ? [cur[0] + x2, cur[1] + y2] : [x2, y2];
      const p3: [number, number] = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      flattenCubic(cur, p1, p2, p3, tolerance, line);
      cur = p3;
    } else if (C === 'Q') {
      const x1 = num(), y1 = num();
      const x = num(), y = num();
      const p1: [number, number] = rel ? [cur[0] + x1, cur[1] + y1] : [x1, y1];
      const p2: [number, number] = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      flattenQuadratic(cur, p1, p2, tolerance, line);
      cur = p2;
    } else if (C === 'Z') {
      line.push([start[0], start[1]]);
      cur = [...start];
      flush(true);
    } else {
      i++; // unknown — skip a single token to avoid infinite loop
    }
  }
  flush();
  return out;
}

function flattenCubic(
  p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number],
  tol: number, out: Array<[number, number]>,
) {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
              Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
              Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const steps = Math.max(4, Math.ceil(len / tol));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function flattenQuadratic(
  p0: [number, number], p1: [number, number], p2: [number, number],
  tol: number, out: Array<[number, number]>,
) {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
              Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const steps = Math.max(4, Math.ceil(len / tol));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
}
