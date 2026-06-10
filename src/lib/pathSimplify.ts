/**
 * Simplify Path (Illustrator Object→Path→Simplify, polyline flavour).
 *
 * Flattens each selected path to absolute-space polylines, reduces the anchor
 * count with Douglas–Peucker at the given pixel tolerance, and rebuilds the
 * object as a new fabric.Path — the same absolute-`d` → new-Path replacement
 * pattern boolean ops use, so position is preserved automatically. Curves
 * become simplified line segments (the cutter-friendly DP simplify the backlog
 * specified), which is also what keeps the path light for plotting.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { douglasPeucker } from './cutContour';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795; // buildOutlineCutPaths returns mm; convert back to px

type Pt = [number, number];

function toD(points: Pt[], closed: boolean): string {
  const parts = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  if (closed) parts.push('Z');
  return parts.join(' ');
}

export function canSimplifyPathObject(object: fabric.FabricObject): boolean {
  return object.type === 'path';
}

export function simplifyPathObject(canvas: fabric.Canvas, object: fabric.FabricObject, tolerancePx = 1.5): fabric.Path | null {
  if (!canSimplifyPathObject(object)) return null;
  const parts: string[] = [];
  for (const cutPath of buildOutlineCutPaths([object], 0, 1)) {
    const points = cutPath.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
    const simplified = douglasPeucker(points, Math.max(0.1, tolerancePx));
    if (simplified.length >= 2) parts.push(toD(simplified, cutPath.closed));
  }
  if (parts.length === 0) return null;
  const path = new fabric.Path(parts.join(' '), {
    fill: (object.fill as string) ?? '',
    stroke: (object.stroke as string) ?? '',
    strokeWidth: object.strokeWidth ?? 0,
    opacity: object.opacity ?? 1,
  });
  canvas.remove(object);
  canvas.add(path);
  return path;
}

/** True when the selection contains at least one path to simplify. */
export function canSimplify(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(canSimplifyPathObject);
}

/** Simplify every selected path at `tolerancePx`. Returns the count simplified. */
export function simplifySelection(tolerancePx = 1.5): number {
  const c = getCanvas();
  if (!c) return 0;
  const objs = c.getActiveObjects().filter(canSimplifyPathObject);
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    if (simplifyPathObject(c as fabric.Canvas, obj, tolerancePx)) count++;
  }

  if (count > 0) {
    c.discardActiveObject();
    c.requestRenderAll();
    pushHistory();
  }
  return count;
}
