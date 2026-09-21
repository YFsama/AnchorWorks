/**
 * Shape Builder — pure region math for the paint-style merge/erase tool.
 *
 * The interactive tool (src/lib/tools/shapeBuilderTool.ts) turns N source
 * shapes into an "arrangement" of faces: every maximal area that has a
 * distinct set of shapes covering it becomes one face. Two overlapping
 * squares therefore yield three faces — A-only, B-only, and the overlap.
 * A drag stroke sweeps faces; on release the swept faces are either merged
 * (Keep mode) into one path or deleted (Erase mode) from the artwork.
 *
 * The arrangement is derived with subset signatures rather than a full
 * plane-sweep: for every non-empty subset S of the N shapes, the face
 * `⋂S − ⋃(others)` is computed with polygon-clipping. Cost is 2^N boolean
 * ops — fine for the handful of objects an interactive gesture targets
 * (see MAX_ARRANGEMENT_SHAPES), and it reuses exactly the machinery the
 * boolean pathfinder ops already run on.
 *
 * All geometry is polygonal: curves were flattened by the caller (see
 * booleanOps.objectToRings) at ~1px tolerance, and results are refit to
 * beziers by pathOps.ringToBezierPathD — same round-trip as boolean ops,
 * so round inputs stay round to within that tolerance.
 */

import polygonClipping, { type MultiPolygon } from 'polygon-clipping';

/** Faces smaller than this (px²) are numeric noise — dropped. */
export const MIN_FACE_AREA = 1;

/**
 * Arrangement cap. Cost is 2^N clipping ops; beyond this the interactive
 * gesture would stutter, so the tool refuses (with a toast) instead.
 */
export const MAX_ARRANGEMENT_SHAPES = 8;

/** Default stroke-sampling step when hit-testing faces (scene px). */
export const HIT_SAMPLE_STEP = 4;

/** How close (scene px) a face's interior anchor must be to the stroke for
 *  the stroke to count as crossing it — catches sliver-thin faces whose
 *  width is below HIT_SAMPLE_STEP. */
export const HIT_TOLERANCE = 4;

export type Pt = [number, number];

/** One region of the arrangement: a connected area covered by exactly the
 *  subset `sources` of the input shapes. */
export interface BuilderFace {
  /** Stable id within one buildRegions() call. */
  id: number;
  /** Region geometry (polygon-clipping MultiPolygon: outer rings + holes). */
  geom: MultiPolygon;
  /** Indices into the input shapes array that cover this face (sorted). */
  sources: number[];
  /** Area in px² (holes subtracted). */
  area: number;
  /** A point strictly inside the face — representative hit anchor. */
  anchor: Pt;
}

/* --------------------------------- basics ---------------------------------- */

/** Shoelace area of one closed ring (absolute value). */
function ringArea(ring: ReadonlyArray<readonly [number, number]>): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

/** Total area of a MultiPolygon (outer rings minus holes). */
export function multiPolygonArea(mp: MultiPolygon): number {
  let total = 0;
  for (const poly of mp) {
    if (!poly.length) continue;
    total += ringArea(poly[0]);
    for (let h = 1; h < poly.length; h++) total -= ringArea(poly[h]);
  }
  return total;
}

/**
 * A point strictly inside a closed ring: scanline at the bbox's mid-height,
 * midpoint of the widest crossing pair. Correct for any simple polygon
 * (convex or concave); holes are the caller's concern (call on outer rings).
 */
function interiorPoint(ring: ReadonlyArray<readonly [number, number]>): Pt {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of ring) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const y = (minY + maxY) / 2;
  // Collect x-intersections of the horizontal line at y with every edge.
  const xs: number[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);
  if (xs.length >= 2) {
    // Widest even-odd pair [xs[0], xs[1]], [xs[2], xs[3]], ...
    let bestA = xs[0], bestB = xs[1];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > bestB - bestA) { bestA = xs[i]; bestB = xs[i + 1]; }
    }
    if (bestB > bestA) return [(bestA + bestB) / 2, y];
  }
  // Degenerate (e.g. zero-height ring) — fall back to the first vertex.
  return ring.length ? [ring[0][0], ring[0][1]] : [0, 0];
}

/** Even-odd point-in-multipolygon test (winding-agnostic, holes handled). */
export function pointInMultiPolygon(p: Pt, mp: MultiPolygon): boolean {
  for (const poly of mp) {
    let inside = false;
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if ((yi > p[1]) !== (yj > p[1]) &&
            p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
    }
    if (inside) return true;
  }
  return false;
}

/** Min distance from a point to a polyline (point-to-segment, then min). */
function distanceToPolyline(p: Pt, pts: ReadonlyArray<Pt>): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((p[0] - x1) * dx + (p[1] - y1) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx, py = y1 + t * dy;
    const d = Math.hypot(p[0] - px, p[1] - py);
    if (d < best) best = d;
  }
  return best;
}

/** Subdivide a polyline so consecutive samples are ≤ maxStep apart. */
export function densifyStroke(pts: ReadonlyArray<Pt>, maxStep = HIT_SAMPLE_STEP): Pt[] {
  if (pts.length === 0) return [];
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(dist / maxStep));
    for (let s = 1; s <= steps; s++) {
      out.push([x1 + ((x2 - x1) * s) / steps, y1 + ((y2 - y1) * s) / steps]);
    }
  }
  return out;
}

/* ------------------------------- arrangement -------------------------------- */

/**
 * A geometry is usable when it has at least one ring and positive area —
 * zero-size objects and empty subpaths flatten to degenerate rings that
 * would poison (or just waste) the clipping ops, so they're skipped here.
 */
function isValidGeom(mp: MultiPolygon): boolean {
  return mp.length > 0 && multiPolygonArea(mp) > 0;
}

/**
 * Subdivide N shapes into arrangement faces. Each non-empty subset S of
 * shapes contributes the face `⋂S − ⋃(shapes ∖ S)` when that region has
 * area ≥ MIN_FACE_AREA. Degenerate input shapes (zero area, empty rings)
 * are dropped up front, gracefully — the remaining shapes still arrange.
 * Faces whose subset signature matches but that lie in disjoint pieces
 * (e.g. two separate overlap slivers) stay one face — a sweep selects
 * them together.
 *
 * Returns faces ordered by ascending signature bit count (single-source
 * outer faces first, deeper overlaps later). Throws are swallowed per
 * subset: one degenerate pair never kills the whole arrangement.
 */
export function buildRegions(shapes: MultiPolygon[]): BuilderFace[] {
  // Keep the original indices — faces reference their sources by position
  // in the CALLER's array, not the sanitized one.
  const entries = shapes
    .map((geom, idx) => ({ idx, geom }))
    .filter(e => isValidGeom(e.geom));
  const n = entries.length;
  if (n < 1 || n > MAX_ARRANGEMENT_SHAPES) return [];

  const faces: BuilderFace[] = [];
  const total = 1 << n;
  // Group masks by popcount so single-source faces come first.
  const byPop: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let mask = 1; mask < total; mask++) {
    let pop = 0;
    for (let b = 0; b < n; b++) if (mask & (1 << b)) pop++;
    byPop[pop].push(mask);
  }

  let nextId = 0;
  for (const group of byPop) {
    for (const mask of group) {
      const members: MultiPolygon[] = [];
      const others: MultiPolygon[] = [];
      const sources: number[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) { members.push(entries[i].geom); sources.push(entries[i].idx); }
        else others.push(entries[i].geom);
      }
      let region: MultiPolygon;
      try {
        // First operand passed explicitly — polygon-clipping's variadic
        // signature takes (geom, ...geoms), so spreading into position 1
        // upsets tsc's tuple checking.
        region = polygonClipping.intersection(members[0], ...members.slice(1));
        if (region.length === 0) continue;
        if (others.length > 0) {
          region = polygonClipping.difference(region, ...others);
          if (region.length === 0) continue;
        }
      } catch {
        continue; // degenerate pair — skip this face, keep the arrangement
      }
      const area = multiPolygonArea(region);
      if (area < MIN_FACE_AREA) continue;
      const outer = region[0]?.[0];
      if (!outer || outer.length < 3) continue;
      faces.push({ id: nextId++, geom: region, sources, area, anchor: interiorPoint(outer) });
    }
  }
  return faces;
}

/* -------------------------------- hit-testing ------------------------------- */

/**
 * Which faces a drag stroke touches. A face is hit when any densified
 * stroke sample lies inside it, or when the face's interior anchor lies
 * within `tolerance` of the stroke polyline (catches sliver faces thinner
 * than the sampling step).
 */
export function hitRegions(
  stroke: ReadonlyArray<Pt>,
  faces: ReadonlyArray<BuilderFace>,
  tolerance = HIT_TOLERANCE,
  sampleStep = HIT_SAMPLE_STEP,
): BuilderFace[] {
  const samples = densifyStroke(stroke, sampleStep);
  const hits: BuilderFace[] = [];
  for (const face of faces) {
    let hit = samples.some(s => pointInMultiPolygon(s, face.geom));
    if (!hit && stroke.length >= 2) {
      hit = distanceToPolyline(face.anchor, stroke) <= tolerance;
    }
    if (hit) hits.push(face);
  }
  return hits;
}

/* ------------------------------ gesture results ----------------------------- */

/** Merge result: the union geometry plus the involved source indices. */
export interface MergeResult {
  /** Union of the involved sources' full geometry. Empty when the merge is
   *  a no-op (fewer than two sources involved — Illustrator keeps a
   *  single-source sweep untouched). */
  geom: MultiPolygon;
  /** Sorted indices of every source that contributed a swept face. */
  sources: number[];
}

/**
 * Keep mode: every source that contributed a swept face merges — its FULL
 * geometry, matching Illustrator (dragging only the overlap of two shapes
 * unites both shapes). Sources untouched by the sweep stay untouched.
 */
export function mergeFaces(
  swept: ReadonlyArray<BuilderFace>,
  shapes: ReadonlyArray<MultiPolygon>,
): MergeResult {
  const involved = [...new Set(swept.flatMap(f => f.sources))].sort((a, b) => a - b);
  if (involved.length < 2) return { geom: [], sources: involved };
  try {
    const geoms = involved.map(i => shapes[i]);
    const geom = polygonClipping.union(geoms[0], ...geoms.slice(1));
    return { geom, sources: involved };
  } catch {
    return { geom: [], sources: involved };
  }
}

/**
 * Erase mode: the swept faces are deleted from the artwork. Each source
 * keeps `its geometry − (union of swept faces)`; a source fully covered by
 * the sweep yields an empty remainder and disappears. Index-aligned with
 * `shapes`; on a clipping failure the source's original geometry is kept
 * (fail-soft — erase must never destroy more than asked).
 */
export function eraseFaces(
  swept: ReadonlyArray<BuilderFace>,
  shapes: ReadonlyArray<MultiPolygon>,
): MultiPolygon[] {
  return shapes.map((shape, i) => {
    // Faces whose sources don't include i can't overlap shape i (they lie
    // outside its coverage), so only subtract what actually touches it.
    const touching = swept.filter(f => f.sources.includes(i));
    if (touching.length === 0) return shape;
    try {
      const cut = polygonClipping.union(touching[0].geom, ...touching.slice(1).map(f => f.geom));
      return polygonClipping.difference(shape, cut);
    } catch {
      return shape;
    }
  });
}
