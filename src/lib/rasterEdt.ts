/**
 * Raster distance-transform kernel — pure TypedArray math, zero DOM.
 *
 * Shared engine for the weedability thin-feature probe (weedCheck.ts) and
 * the nearest-colour bleed smear (bleedExpand.ts): a raster EDT of a
 * polygon's interior approximates the medial-axis width pipeline (2·EDT =
 * local width; Remy & Thiel, "Exact Medial Axis with Euclidean Distance",
 * and docs/research-sticker-printcut-2026-10.md §6). A label-carrying
 * chamfer (nearest-feature transform) is the pixel-perfect form of Cricut's
 * edge-pixel bleed smear: every transparent pixel adopts the colour of the
 * nearest opaque source pixel (help.cricut.com Print Then Cut).
 */

/** Chamfer weights: axial 3, diagonal 4 — ratio 3/4 ≈ 1/√2 in integer
 *  space. Raw scores are divided by the axial weight 3 to yield pixels. */
const W_AXIAL = 3;
const W_DIAG = 4;

/** Sentinel left on unreachable pixels (no target anywhere in the mask). */
export const EDT_INF = 1e9;

/** In-place two-pass (forward raster + backward) chamfer; `labels`, when
 *  given, ride along with the argmin neighbour so every pixel ends up
 *  carrying the flat index of its nearest source pixel. */
function chamfer(
  dist: Float32Array,
  labels: Int32Array | null,
  w: number,
  h: number,
): void {
  const relax = (i: number, j: number, weight: number): void => {
    const nd = dist[j] + weight;
    if (nd < dist[i]) {
      dist[i] = nd;
      if (labels) labels[i] = labels[j];
    }
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) relax(i, i - 1, W_AXIAL);
      if (y > 0) {
        relax(i, i - w, W_AXIAL);
        if (x > 0) relax(i, i - w - 1, W_DIAG);
        if (x < w - 1) relax(i, i - w + 1, W_DIAG);
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) relax(i, i + 1, W_AXIAL);
      if (y < h - 1) {
        relax(i, i + w, W_AXIAL);
        if (x < w - 1) relax(i, i + w + 1, W_DIAG);
        if (x > 0) relax(i, i + w - 1, W_DIAG);
      }
    }
  }
}

/** Two-pass chamfer EDT (weights 3/4 ≈ 1/√2 in integer space) of the
 *  INTERIOR distance to the nearest background pixel. mask: 1 = inside,
 *  0 = outside (background pixels measure 0). Returns distance in PIXELS
 *  (raw integer score ÷ the axial weight 3 to undo the weighting),
 *  Float32Array; an all-inside mask with no background keeps EDT_INF. */
export function interiorEdt(mask: Uint8Array, w: number, h: number): Float32Array {
  const dist = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) dist[i] = mask[i] ? EDT_INF : 0;
  chamfer(dist, null, w, h);
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < EDT_INF) dist[i] /= W_AXIAL;
  }
  return dist;
}

/** Same transform but carrying the SOURCE LABEL of the nearest mask pixel
 *  (its flat index), so callers can colour dilate: labels[i] = index of
 *  the nearest inside-pixel for EVERY pixel (inside pixels label
 *  themselves, dist 0). Distance is measured from any pixel to the nearest
 *  mask=1 pixel, in pixels (same ÷3 scaling). All-zero mask → dist stays
 *  EDT_INF, labels −1. */
export function labelledChamfer(
  mask: Uint8Array,
  w: number,
  h: number,
): { dist: Float32Array; labels: Int32Array } {
  const n = mask.length;
  const dist = new Float32Array(n);
  const labels = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (mask[i]) {
      dist[i] = 0;
      labels[i] = i;
    } else {
      dist[i] = EDT_INF;
      labels[i] = -1;
    }
  }
  chamfer(dist, labels, w, h);
  for (let i = 0; i < n; i++) {
    if (dist[i] < EDT_INF) dist[i] /= W_AXIAL;
  }
  return { dist, labels };
}

/** Scanline even-odd polygon fill → binary mask (1 = pixel centre inside
 *  the polygon). Grid: ceil(bbox·scale) + 2·pad px per axis; pixel (i, j)
 *  centre sits at ((i − pad + 0.5)/scale, (j − pad + 0.5)/scale) relative
 *  to the polygon's own bbox origin. Pure TS — the headless rasterizer
 *  weedCheck uses instead of a canvas, so jsdom needs no 2D context.
 *  Degenerate (zero-area) input → all-zero mask. */
export function fillPolygonMask(
  points: ReadonlyArray<[number, number]>,
  scale: number,
  pad = 0,
): { mask: Uint8Array; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (points.length === 0 || maxX < minX || maxY < minY) {
    return { mask: new Uint8Array(0), w: 0, h: 0 };
  }
  const w = Math.max(1, Math.ceil((maxX - minX) * scale)) + 2 * pad;
  const h = Math.max(1, Math.ceil((maxY - minY) * scale)) + 2 * pad;
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = minY + (j - pad + 0.5) / scale;
    // Half-open edge rule (y1 ≤ y < y2) counts each vertex crossing once;
    // horizontal edges never cross.
    const xs: number[] = [];
    for (let e = 0; e < points.length; e++) {
      const [x1, y1] = points[e];
      const [x2, y2] = points[(e + 1) % points.length];
      if (y1 === y2) continue;
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    // Parity is guaranteed for closed rings; drop a stray odd tail so a
    // numeric artifact can never run a span off the far edge.
    const pairs = xs.length - (xs.length % 2);
    for (let k = 0; k + 1 < pairs; k += 2) {
      // Pixel i centre inside [enter, exit) ⇔ enter·scale ≤ i − pad + 0.5 < exit·scale.
      const enter = Math.max(0, Math.ceil((xs[k] - minX) * scale + pad - 0.5));
      const exit = Math.min(w - 1, Math.ceil((xs[k + 1] - minX) * scale + pad - 0.5) - 1);
      for (let i = enter; i <= exit; i++) mask[j * w + i] = 1;
    }
  }
  return { mask, w, h };
}
