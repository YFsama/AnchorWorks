/**
 * Offset Path (Illustrator Object→Path→Offset Path) — add a new path offset
 * outward (+) or inward (−) from each selected path/shape by a distance, keeping
 * the original. Reuses the same offsetPolyline the cut-contour suite uses, then
 * rebuilds a new fabric.Path in absolute space so it lands in the right place.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { offsetPolyline } from './cutContour';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

function toD(pts: Pt[], closed: boolean): string {
  const parts = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  if (closed) parts.push('Z');
  return parts.join(' ');
}

export function canOffsetPathObject(object: fabric.FabricObject): boolean {
  return object.type === 'path' || object.type === 'rect' || object.type === 'polygon' || object.type === 'ellipse' || object.type === 'circle';
}

export function offsetPathObject(canvas: fabric.Canvas, object: fabric.FabricObject, offsetMm: number): fabric.Path | null {
  if (!canOffsetPathObject(object) || !Number.isFinite(offsetMm) || offsetMm === 0) return null;
  const distance = offsetMm * MM_TO_PX;
  const parts: string[] = [];
  for (const cutPath of buildOutlineCutPaths([object], 0, 1)) {
    const points = cutPath.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
    for (const ring of offsetPolyline(points, distance, cutPath.closed)) {
      if (ring.length >= 2) parts.push(toD(ring, cutPath.closed));
    }
  }
  if (parts.length === 0) return null;
  const path = new fabric.Path(parts.join(' '), {
    fill: (object.fill as string) ?? '',
    stroke: (object.stroke as string) ?? '',
    strokeWidth: object.strokeWidth ?? 0,
    opacity: object.opacity ?? 1,
  });
  canvas.add(path);
  return path;
}

/** True when the selection has a path/shape to offset. */
export function canOffsetPath(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(canOffsetPathObject);
}

/** Add an offset copy of every selected path/shape. Returns the count added. */
export function offsetPathSelection(offsetMm: number): number {
  const canvas = getCanvas();
  if (!canvas || offsetMm === 0) return 0;
  const objs = canvas.getActiveObjects();
  if (objs.length === 0) return 0;

  const created: fabric.FabricObject[] = [];
  for (const obj of objs) {
    const path = offsetPathObject(canvas as fabric.Canvas, obj, offsetMm);
    if (path) created.push(path);
  }

  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  if (created.length === 1) canvas.setActiveObject(created[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}
