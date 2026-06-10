import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

function toD(points: Pt[], closed: boolean): string {
  const parts = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  if (closed) parts.push('Z');
  return parts.join(' ');
}

export function smoothPolyline(points: Pt[], closed: boolean, iterations = 1): Pt[] {
  if (points.length < 3) return points.slice();
  let current = points.slice();
  const count = Math.max(1, Math.min(5, Math.floor(iterations)));
  for (let pass = 0; pass < count; pass++) {
    const next: Pt[] = [];
    const limit = closed ? current.length : current.length - 1;
    if (!closed) next.push(current[0]);
    for (let index = 0; index < limit; index++) {
      const a = current[index];
      const b = current[(index + 1) % current.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

export function canSmoothPathObject(object: fabric.FabricObject): boolean {
  return object.type === 'path' || object.type === 'polygon' || object.type === 'rect' || object.type === 'ellipse';
}

export function smoothPathObject(canvas: fabric.Canvas, object: fabric.FabricObject, iterations = 1): fabric.Path | null {
  if (!canSmoothPathObject(object)) return null;
  const parts: string[] = [];
  for (const cutPath of buildOutlineCutPaths([object], 0, 1)) {
    const points = cutPath.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
    const smoothed = smoothPolyline(points, cutPath.closed, iterations);
    if (smoothed.length >= 2) parts.push(toD(smoothed, cutPath.closed));
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

export function smoothPathSelection(iterations = 1): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getActiveObjects().filter(canSmoothPathObject);
  if (objects.length === 0) return 0;
  let count = 0;
  for (const object of objects) {
    if (smoothPathObject(canvas as fabric.Canvas, object, iterations)) count += 1;
  }
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
