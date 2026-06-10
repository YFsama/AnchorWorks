/**
 * Reverse Path Direction (Illustrator Object→Path→Reverse Path Direction).
 *
 * Flips the winding of every selected path's sub-paths and rebuilds it. Visible
 * effect is on compound paths (even-odd holes that show as solid flip back) and
 * on cut direction for the plotter; a simple single path keeps its shape. Same
 * flatten → rebuild-as-fabric.Path pattern the other path tools use.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

function toD(pts: Pt[], closed: boolean): string {
  const parts = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  if (closed) parts.push('Z');
  return parts.join(' ');
}

export function canReversePathObject(object: fabric.FabricObject): boolean {
  return object.type === 'path';
}

export function reversePathObject(canvas: fabric.Canvas, object: fabric.FabricObject): fabric.Path | null {
  if (!canReversePathObject(object)) return null;
  const parts: string[] = [];
  for (const cutPath of buildOutlineCutPaths([object], 0, 1)) {
    const points = cutPath.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt).reverse();
    if (points.length >= 2) parts.push(toD(points, cutPath.closed));
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

/** True when the selection contains a path to reverse. */
export function canReversePath(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(canReversePathObject);
}

/** Reverse the direction of every selected path. Returns the count. */
export function reversePathSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects().filter(canReversePathObject);
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    if (reversePathObject(canvas as fabric.Canvas, obj)) count++;
  }
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
