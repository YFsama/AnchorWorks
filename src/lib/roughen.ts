/**
 * Roughen (Illustrator Effect→Distort & Transform→Roughen) — densify each path
 * to a detail spacing, then jitter every point by a random amount up to `size`,
 * for a hand-drawn / distressed / weathered edge. Same flatten → rebuild
 * pattern the other path tools use.
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

/** Densify to ~`detailPx` spacing then jitter each point by up to `sizePx`. */
export function roughenPolyline(pts: Pt[], closed: boolean, sizePx: number, detailPx: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const dense: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / Math.max(0.5, detailPx)));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  const jitter = () => (Math.random() * 2 - 1) * sizePx;
  const out = dense.map(([x, y]) => [x + jitter(), y + jitter()] as Pt);
  if (closed && out.length > 1) out[out.length - 1] = out[0]; // keep the loop closed
  return out;
}

export function canRoughenObject(object: fabric.FabricObject): boolean {
  return object.type === 'path' || object.type === 'rect' || object.type === 'polygon' || object.type === 'ellipse';
}

export function roughenObject(canvas: fabric.Canvas, object: fabric.FabricObject, sizeMm: number, detailMm: number): fabric.Path | null {
  if (!canRoughenObject(object) || sizeMm <= 0) return null;
  const sizePx = sizeMm * MM_TO_PX;
  const detailPx = Math.max(0.5, detailMm) * MM_TO_PX;
  const parts: string[] = [];
  for (const cp of buildOutlineCutPaths([object], 0, 1)) {
    const px = cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
    const rough = roughenPolyline(px, cp.closed, sizePx, detailPx);
    if (rough.length >= 2) parts.push(toD(rough, cp.closed));
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

/** True when the selection has a path/shape to roughen. */
export function canRoughen(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(canRoughenObject);
}

/** Roughen every selected path/shape. `detailMm` is the point spacing. */
export function roughenSelection(sizeMm: number, detailMm: number): number {
  const canvas = getCanvas();
  if (!canvas || sizeMm <= 0) return 0;
  const objs = canvas.getActiveObjects().filter(canRoughenObject);
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    if (roughenObject(canvas, obj, sizeMm, detailMm)) count++;
  }
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
