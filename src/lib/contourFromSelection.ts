/**
 * Build vinyl-cutter outline cut paths from a set of canvas objects.
 *
 * Extracted from CutContourDialog so the exact same offset pipeline backs both
 * the dialog's "Generate Contour" button AND the right-click "Create Contour"
 * one-click action — no drift between the two surfaces.
 *
 * Coordinates come out in document mm-space (the CutPath convention); the
 * PlotterDialog handles mm → plotter-unit conversion at send time.
 */

import * as fabric from 'fabric';
import polygonClipping from 'polygon-clipping';
import { offsetPolyline, flattenSvgPath } from './cutContour';
import type { CutPath } from '../store/editor';

const MM_TO_PX = 3.7795; // 96dpi convention shared across the cutter pipeline

/** Read a usable source swatch (fill, else stroke) for cut-by-colour. */
function sourceColor(obj: fabric.FabricObject): string | undefined {
  const fillc = typeof obj.fill === 'string' && obj.fill && obj.fill !== 'transparent' ? obj.fill : undefined;
  const strokec = typeof obj.stroke === 'string' && obj.stroke ? obj.stroke : undefined;
  return fillc ?? strokec;
}

/**
 * Parallel-offset every supplied object into outline cut paths. `offsetMm`
 * of 0 returns the object's own outline verbatim (handy for "send the shape
 * as the cut line" and for previewing what a canvas-SVG export will cut).
 */
export function buildOutlineCutPaths(
  objects: fabric.FabricObject[],
  offsetMm: number,
  passes = 1,
): CutPath[] {
  const out: CutPath[] = [];
  for (const obj of objects) {
    const srcColor = sourceColor(obj);
    const svg = obj.toSVG();
    const dMatch = svg.match(/\sd="([^"]+)"/);
    let polylines: Array<{ points: Array<[number, number]>; closed: boolean }>;
    if (dMatch) {
      polylines = flattenSvgPath(dMatch[1], 0.5);
    } else {
      // Primitive (rect/circle/etc.) — derive a bounding box.
      const r = obj.getBoundingRect();
      polylines = [{
        points: [
          [r.left, r.top],
          [r.left + r.width, r.top],
          [r.left + r.width, r.top + r.height],
          [r.left, r.top + r.height],
          [r.left, r.top],
        ],
        closed: true,
      }];
    }
    // Apply the object's own transform, then convert px → mm.
    const matrix = obj.calcTransformMatrix();
    const ax = (obj.width ?? 0) / 2;
    const ay = (obj.height ?? 0) / 2;
    for (const pl of polylines) {
      const transformed: Array<[number, number]> = [];
      for (const [px, py] of pl.points) {
        const cx = px - ax;
        const cy = py - ay;
        const tx = matrix[0] * cx + matrix[2] * cy + matrix[4];
        const ty = matrix[1] * cx + matrix[3] * cy + matrix[5];
        transformed.push([tx / MM_TO_PX, ty / MM_TO_PX]);
      }
      const off = offsetPolyline(transformed, offsetMm, pl.closed);
      for (const polyOut of off) {
        out.push({
          id: `outline-${Date.now().toString(36)}-${out.length}`,
          points: polyOut,
          closed: pl.closed,
          kind: 'outline',
          sourceObjectId: (obj as fabric.FabricObject & { _id?: string })._id,
          passes,
          color: srcColor,
        });
      }
    }
  }
  return out;
}

/**
 * Outline Stroke (Illustrator Object→Path→Outline Stroke, cutter flavour):
 * turn each selected object's stroke into the cut lines a blade would follow
 * along BOTH edges of the stroke band. Closed outlines yield an outer + inner
 * ring (offset ±½ stroke); open outlines yield a single closed band (left edge
 * forward, right edge back). Stroke width is read in px and converted to mm.
 * Objects with no stroke are skipped.
 */
export function outlineStrokeToCutPaths(objects: fabric.FabricObject[]): CutPath[] {
  const out: CutPath[] = [];
  const mk = (points: Array<[number, number]>, color?: string): CutPath => ({
    id: `stroke-${Date.now().toString(36)}-${out.length}`,
    points,
    closed: true,
    kind: 'outline',
    passes: 1,
    color,
  });
  for (const obj of objects) {
    const swPx = (obj.strokeWidth ?? 0) * Math.max(obj.scaleX ?? 1, obj.scaleY ?? 1);
    if (swPx <= 0) continue;
    const halfMm = (swPx / 2) / MM_TO_PX;
    const strokeColor = typeof obj.stroke === 'string' && obj.stroke ? obj.stroke : undefined;
    for (const p of buildOutlineCutPaths([obj], 0, 1)) {
      const pts = p.points;
      if (pts.length < 2) continue;
      if (p.closed) {
        for (const r of offsetPolyline(pts, halfMm, true)) out.push(mk(r, strokeColor));
        for (const r of offsetPolyline(pts, -halfMm, true)) out.push(mk(r, strokeColor));
      } else {
        const left = offsetPolyline(pts, halfMm, false)[0] ?? pts;
        const right = offsetPolyline(pts, -halfMm, false)[0] ?? pts;
        const loop = [...left, ...right.slice().reverse()];
        if (loop.length >= 2) loop.push(loop[0]);
        out.push(mk(loop, strokeColor));
      }
    }
  }
  return out;
}

/**
 * Weld (SignMaster "Weld" / Illustrator Pathfinder Unite, for the cutter):
 * flatten the selection's outlines and boolean-union every closed region into
 * the fewest possible cut paths, so overlapping letters/shapes cut as one
 * continuous line instead of crossing each other. Open polylines (no area)
 * pass through unchanged. Returns mm-space cut paths ready for the store.
 */
export function weldOutline(objects: fabric.FabricObject[]): CutPath[] {
  const flat = buildOutlineCutPaths(objects, 0, 1);
  const closed = flat.filter(p => p.closed && p.points.length >= 4);
  const open = flat.filter(p => !(p.closed && p.points.length >= 4));
  if (closed.length < 1) return flat;

  // Each closed cut path becomes a single-ring Polygon; union folds them into a
  // MultiPolygon whose outer rings are the welded outlines (holes dropped — a
  // cutter follows outlines, not fills).
  const polys = closed.map(p => [p.points.map(([x, y]) => [x, y] as [number, number])]);
  try {
    const merged = polygonClipping.union(polys[0], ...polys.slice(1));
    const welded: CutPath[] = merged.map((polygon, i) => ({
      id: `weld-${Date.now().toString(36)}-${i}`,
      points: polygon[0].map(([x, y]) => [x, y] as [number, number]),
      closed: true,
      kind: 'outline',
      passes: 1,
    }));
    return [...welded, ...open];
  } catch {
    return flat; // degenerate geometry — fall back to the un-welded outlines
  }
}
