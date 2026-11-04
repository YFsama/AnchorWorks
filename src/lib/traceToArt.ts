/**
 * Bitmap → editable vector ART (Kittl Vectorizer / Linearity Auto Trace /
 * Illustrator Image Trace counterpart).
 *
 * cutContour.ts already knows how to quantize an image into k colour
 * clusters (deterministic seeded k-means) and walk each cluster's region
 * boundaries (Moore contour-follow + Douglas-Peucker). That pipeline was
 * built to emit BLADE LINES; this module turns the same geometry into
 * FILLED, editable vector art:
 *
 *   bitmap ─ kmeansQuantize ─▶ per-colour contour rings (mm, source space)
 *          ─▶ one SVG path per colour (all rings as subpaths, evenodd)
 *          ─▶ fabric.Path per colour (fill = cluster hex, no stroke)
 *          ─▶ fabric.Group, positioned/scaled over the source image
 *
 * The key trick (no ring classification needed): the Moore walk emits a
 * region's HOLES as independent rings mixed in with the outer rings. SVG's
 * `evenodd` fill rule renders any ring inside another as a knock-out, so
 * stuffing every ring of one cluster into a single multi-subpath path
 * paints exactly the cluster's pixels — outer boundary filled, holes see
 * through. Non-overlapping rings of the same cluster are unaffected
 * (evenodd crossing count). fabric.Path honours `fillRule: 'evenodd'`.
 *
 * Layering mirrors the physical workflow: pieces are sorted by traced area,
 * largest first, and fabric draws group children in array order — so the
 * biggest colour region sits at the bottom of the stack where a plotter /
 * layered-vinyl build would start.
 */

import * as fabric from 'fabric';
import { traceMultiColor, traceMultiColorAsync, type TraceClusterResult } from './cutContour';

/** 96dpi px↔mm divisor shared by the whole cut/trace pipeline. */
const MM_TO_PX = 3.7795;

/** Cap on the rendered source fed to the tracer (the multi-trace dialog's
 *  320 cap is blade-line oriented; art tracing keeps a little more detail). */
export const TRACE_ART_MAX_DIM = 480;

export interface TraceToArtOptions {
  /** Number of colour clusters (k-means k). 2-8 is the useful art range. */
  colorCount: number;
  /** Douglas-Peucker tolerance in source pixels. Smaller = more detail. */
  simplifyTolerance: number;
  /** Drop rings whose bbox is smaller than this (mm) — speckle filter. */
  minSizeMm: number;
  /** Final artwork width in document mm. Default: the source image's own
   *  on-document size (no rescale). */
  targetWidthMm?: number;
}

export interface TracedArtPiece {
  /** Cluster colour as `#rrggbb` (also the fabric.Path member name). */
  color: string;
  /** SVG path data in SOURCE-image mm coords (pixel×pixelSizeMm). One
   *  subpath per ring, every subpath closed with Z, filled evenodd. */
  pathData: string;
  /** Rings in pathData (outer boundaries + holes, unclassified). */
  ringCount: number;
}

export interface TraceToArtResult {
  /** One piece per surviving colour cluster, largest area first. */
  pieces: TracedArtPiece[];
  /** Union bbox of every ring, source-image mm coords. Zeroed when empty. */
  boundsMm: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Shoelace |area| of one ring (mm²). */
function ringArea(ring: ReadonlyArray<readonly [number, number]>): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

/** Cluster RGB (any 0-255 numeric triple) → `#rrggbb`. */
function rgbToHex(color: readonly [number, number, number] | number[]): string {
  const to2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to2(color[0])}${to2(color[1])}${to2(color[2])}`;
}

/**
 * Ring point arrays → SVG path data. Every ring becomes one `M … L … Z`
 * subpath; subpaths join with a space. The Moore walk's duplicated closing
 * vertex (first == last) is dropped — `Z` re-closes it (makeSticker's
 * ringToD idiom). Rings with fewer than 3 distinct points are skipped:
 * they cannot bound area. Unit-agnostic (mm in → mm out, px in → px out).
 */
export function ringsToPathData(rings: Array<Array<[number, number]>>): string {
  const subpaths: string[] = [];
  const f = (v: number) => String(Math.round(v * 1000) / 1000);
  for (const ring of rings) {
    if (ring.length < 3) continue;
    let pts = ring;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) < 0.01) pts = pts.slice(0, -1);
    if (pts.length < 3) continue;
    let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${f(pts[i][0])} ${f(pts[i][1])}`;
    subpaths.push(`${d} Z`);
  }
  return subpaths.join(' ');
}

/** Empty result singleton values (bounds zeroed, no pieces). */
const EMPTY_BOUNDS = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/**
 * Cluster results → pieces + union bounds. Shared by the sync and worker
 * paths so a preview and an insert always describe the same geometry.
 */
function clustersToResult(clusters: TraceClusterResult[]): TraceToArtResult {
  if (clusters.length === 0) return { pieces: [], boundsMm: { ...EMPTY_BOUNDS } };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cluster of clusters) {
    for (const ring of cluster.contours) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const pieces: TracedArtPiece[] = clusters
    .map((cluster) => {
      const area = cluster.contours.reduce((sum, ring) => sum + ringArea(ring), 0);
      return {
        color: rgbToHex(cluster.color),
        pathData: ringsToPathData(cluster.contours),
        ringCount: cluster.contours.length,
        area,
      };
    })
    // Largest area first → fabric draws children in order, so the dominant
    // colour lands at the BOTTOM of the stack (layered-vinyl build order).
    .sort((a, b) => b.area - a.area)
    .map(({ color, pathData, ringCount }) => ({ color, pathData, ringCount }));

  return { pieces, boundsMm: { minX, minY, maxX, maxY } };
}

/**
 * Bitmap → one evenodd path per colour cluster (source-image mm coords).
 * Pure function — no fabric, no DOM beyond the ImageData payload. Runs the
 * trace synchronously on the calling thread; prefer {@link traceToArtAsync}
 * (worker-backed, same output) from UI code.
 */
export function traceToArtPieces(
  img: ImageData,
  pixelSizeMm: number,
  opts: TraceToArtOptions,
  onProgress?: (done: number, total: number) => void,
): TraceToArtResult {
  const clusters = traceMultiColor(
    img,
    {
      colorCount: opts.colorCount,
      simplifyTolerance: opts.simplifyTolerance,
      pixelSizeMm,
      minSizeMm: opts.minSizeMm,
    },
    onProgress,
  );
  return clustersToResult(clusters);
}

/**
 * Worker-backed flavour of {@link traceToArtPieces} (traceMultiColorAsync's
 * main-thread fallback when Workers are unavailable). Identical output.
 */
export async function traceToArtAsync(
  img: ImageData,
  pixelSizeMm: number,
  opts: TraceToArtOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<TraceToArtResult> {
  const clusters = await traceMultiColorAsync(
    img,
    {
      colorCount: opts.colorCount,
      simplifyTolerance: opts.simplifyTolerance,
      pixelSizeMm,
      minSizeMm: opts.minSizeMm,
    },
    onProgress,
  );
  return clustersToResult(clusters);
}

let artSeq = 0;

/**
 * Trace + build the insertable fabric object: one Path per colour cluster
 * (fill = cluster hex, fillRule evenodd, no stroke) grouped into a single
 * named Group. The `d` strings are emitted in FINAL canvas-px coordinates —
 * `originMm` is where the source image's (0,0) sits in document mm, rings
 * map through the targetWidthMm scale first — so the group lands exactly
 * over the source bitmap with an identity transform (the envelope/repeat
 * grouping idiom; no reliance on group-origin semantics).
 *
 * Rejects with "nothing to trace" when the image has no traceable colour
 * regions (all-transparent, or every ring below minSizeMm).
 */
export async function buildTracedArtGroup(
  img: ImageData,
  pixelSizeMm: number,
  originMm: { x: number; y: number },
  opts: TraceToArtOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<{ group: fabric.Group; result: TraceToArtResult }> {
  const clusters = await traceMultiColorAsync(
    img,
    {
      colorCount: opts.colorCount,
      simplifyTolerance: opts.simplifyTolerance,
      pixelSizeMm,
      minSizeMm: opts.minSizeMm,
    },
    onProgress,
  );
  const result = clustersToResult(clusters);
  if (result.pieces.length === 0) {
    throw new Error('nothing to trace');
  }

  // Source-mm → doc-mm scale (1 unless the caller resizes via targetWidthMm),
  // then doc-mm → canvas-px, all folded into the ring→px mapping.
  const wMm = result.boundsMm.maxX - result.boundsMm.minX;
  const scaleMm = opts.targetWidthMm && wMm > 0 ? opts.targetWidthMm / wMm : 1;
  const toPx = (rings: Array<Array<[number, number]>>): string =>
    ringsToPathData(
      rings.map((ring) =>
        ring.map(([x, y]) =>
          [(originMm.x + x * scaleMm) * MM_TO_PX, (originMm.y + y * scaleMm) * MM_TO_PX] as [number, number],
        ),
      ),
    );

  const paths: fabric.Path[] = clusters
    .map((cluster) => ({
      cluster,
      area: cluster.contours.reduce((s, r) => s + ringArea(r), 0),
    }))
    .sort((a, b) => b.area - a.area) // largest colour at the bottom of the stack
    .map(({ cluster }) => {
      const color = rgbToHex(cluster.color);
      const path = new fabric.Path(toPx(cluster.contours), {
        fill: color,
        stroke: '',
        strokeWidth: 0,
        fillRule: 'evenodd',
        objectCaching: false,
      });
      // `name` is not in fabric's public typings — LayersPanel reads it back
      // through the same narrow cast (its NameHolder).
      (path as fabric.Path & { name?: string }).name = color;
      return path;
    });

  const group = new fabric.Group(paths, { objectCaching: false });
  (group as fabric.Group & { name?: string }).name =
    `Traced Art ${Date.now().toString(36)}-${artSeq++}`;
  group.setCoords();
  return { group, result };
}
