/**
 * One-click "Make Sticker" geometry.
 *
 * Pro sticker workflow (Sticker Mule defaults: white border 2.54 mm, minimum
 * 1.59 mm; Silhouette Studio's Offset panel and Cricut's Create Sticker both
 * converge on the same UX): union the artwork, round-join offset it outward
 * by the border width, print the offset ring in white UNDER the art, and
 * die-cut along the same ring. The white underlay guarantees no transparent
 * halo once the sticker is peeled, and the round joins give the peel-friendly
 * corners die-cut stickers are known for.
 *
 * Cut paths come out in document mm-space (the CutPath convention); the
 * underlay `d` comes out in canvas px space via the same MM_TO_PX 3.7795
 * divisor contourFromSelection uses, so the ring lands exactly under the art
 * (offset rings are derived from the identical weld/outline pipeline, then
 * scaled back px — no re-transform, so the historical pathOffset shift bug
 * cannot reappear here).
 */

import * as fabric from 'fabric';
import { offsetPolyline } from './cutContour';
import { buildOutlineCutPaths, weldOutline } from './contourFromSelection';
import type { CutPath } from '../store/editor';

const MM_TO_PX = 3.7795; // 96dpi convention shared across the cutter pipeline

/** Sticker Mule's default white border. */
const DEFAULT_BORDER_MM = 2.54;

export interface MakeStickerOptions {
  /** Die-cut border width in mm. Default 2.54 (Sticker Mule white border). */
  borderMm?: number;
  /** Underlay fill drawn under the art out to the die line: 'white' (default),
   *  'none', or any CSS colour string. */
  underlay?: 'white' | 'none' | string;
  /** CutPath kind for the die contours. Default 'outline'. */
  cutKind?: CutPath['kind'];
  /** Cut passes flowed through to CutPath.passes. Default 1. */
  passes?: number;
}

export interface MakeStickerResult {
  /** SVG path `d` (px, canvas space) of the border underlay ring(s) — the
   *  exact die line, filled. Null when underlay is 'none' or there is
   *  nothing to underlay (empty selection). */
  underlayD: string | null;
  /** Resolved underlay fill colour, null when underlay is 'none'. */
  underlayFill: string | null;
  /** Die-cut contour(s), mm space, round-joined outward by borderMm. */
  cutPaths: CutPath[];
}

let stickerSeq = 0;
const idStem = (): string => `sticker-${Date.now().toString(36)}-${stickerSeq++}`;

/**
 * Build the sticker geometry for a selection: welded (union) outlines where
 * possible, each offset outward by `borderMm` with round joins. When the
 * selection welds to nothing usable (no closed rings), falls back to the
 * per-object outlines un-welded, still offset. Degenerate rings whose offset
 * vanishes are skipped rather than crashing.
 */
export function makeSticker(
  objects: fabric.FabricObject[],
  opts: MakeStickerOptions = {},
): MakeStickerResult {
  const borderMm = opts.borderMm ?? DEFAULT_BORDER_MM;
  const underlay = opts.underlay ?? 'white';
  const cutKind = opts.cutKind ?? 'outline';
  const passes = opts.passes ?? 1;

  const welded = weldOutline(objects);
  let sources = welded.filter(p => p.closed && p.points.length >= 4);
  if (sources.length === 0) {
    sources = buildOutlineCutPaths(objects, 0, passes);
  }

  const cutPaths: CutPath[] = [];
  const underlayRings: Array<Array<[number, number]>> = [];
  // Single-object stickers stamp the source object's fabric id so downstream
  // per-object tooling (Production Preview's multi-item partition, cut-by
  // colour grouping) can attribute the contour. A multi-object weld has no
  // single owner and stays unstamped — previews then union the selection.
  const sourceId = objects.length === 1
    ? (objects[0] as fabric.FabricObject & { _id?: string })._id
    : undefined;
  for (const src of sources) {
    const offs = offsetPolyline(src.points, borderMm, src.closed, { join: 'round' });
    for (const ring of offs) {
      if (ring.length < 2) continue; // vanished / degenerate — skip the ring
      cutPaths.push({
        id: idStem(),
        points: ring,
        closed: src.closed,
        kind: cutKind,
        passes,
        ...(sourceId ? { sourceObjectId: sourceId } : {}),
      });
      underlayRings.push(ring);
    }
  }

  const underlayD = underlay === 'none' || underlayRings.length === 0
    ? null
    : underlayRings.map(ring => ringToD(ring)).join(' ');

  return {
    underlayD,
    underlayFill: underlay === 'none' ? null : underlay,
    cutPaths,
  };
}

/** mm ring → SVG `d` in canvas px space. Drops the duplicated closing vertex
 *  (Z re-closes it) so the path stays minimal. */
function ringToD(ring: ReadonlyArray<readonly [number, number]>): string {
  let pts = ring;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length > 1 && Math.hypot(last[0] - first[0], last[1] - first[1]) < 0.01) {
    pts = pts.slice(0, -1);
  }
  const f = (v: number) => String(Math.round(v * 1000) / 1000);
  let d = `M ${f(pts[0][0] * MM_TO_PX)} ${f(pts[0][1] * MM_TO_PX)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${f(pts[i][0] * MM_TO_PX)} ${f(pts[i][1] * MM_TO_PX)}`;
  }
  return `${d} Z`;
}

/**
 * Border presets (Sticker Mule-style starting points):
 *   - stickermule : the 2.54 mm white default
 *   - minimum     : Sticker Mule's 1.59 mm minimum white border
 *   - wide        : chunky 4 mm white border
 *   - full-bleed  : edge-to-edge art, cut on the union itself, no underlay
 *   - black       : 2.54 mm near-black underlay for dark art
 */
export const MAKE_STICKER_PRESETS: { id: string; label: string; borderMm: number; underlay: 'white' | 'none' | string }[] = [
  { id: 'stickermule', label: 'Sticker Mule white 2.54 mm', borderMm: 2.54, underlay: 'white' },
  { id: 'minimum', label: 'Minimum white 1.59 mm', borderMm: 1.59, underlay: 'white' },
  { id: 'wide', label: 'Wide white 4 mm', borderMm: 4, underlay: 'white' },
  { id: 'full-bleed', label: 'Full bleed (no border)', borderMm: 0, underlay: 'none' },
  { id: 'black', label: 'Black 2.54 mm', borderMm: 2.54, underlay: '#111' },
];
