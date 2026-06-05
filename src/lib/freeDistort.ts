import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;
const PREVIEW_FLAG = '__freeDistortPreview';

type Pt = [number, number];
export type FreeDistortCorner = 'tl' | 'tr' | 'br' | 'bl';
export type FreeDistortCorners = Record<FreeDistortCorner, Pt>;

function toD(pts: Pt[], closed: boolean): string {
  const parts = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  if (closed) parts.push('Z');
  return parts.join(' ');
}

function boundsOfLoops(loops: { pts: Pt[] }[]): { left: number; top: number; width: number; height: number } | null {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const loop of loops) for (const [x, y] of loop.pts) {
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function transformPoint([x, y]: Pt, bounds: { left: number; top: number; width: number; height: number }, corners: FreeDistortCorners): Pt {
  const u = (x - bounds.left) / bounds.width;
  const v = (y - bounds.top) / bounds.height;
  const topX = corners.tl[0] * (1 - u) + corners.tr[0] * u;
  const topY = corners.tl[1] * (1 - u) + corners.tr[1] * u;
  const bottomX = corners.bl[0] * (1 - u) + corners.br[0] * u;
  const bottomY = corners.bl[1] * (1 - u) + corners.br[1] * u;
  return [topX * (1 - v) + bottomX * v, topY * (1 - v) + bottomY * v];
}

function sourceLoops(obj: fabric.FabricObject): { pts: Pt[]; closed: boolean }[] {
  return buildOutlineCutPaths([obj], 0, 1)
    .map(cp => ({ pts: cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt), closed: cp.closed }))
    .filter(loop => loop.pts.length >= 2);
}

function objectCorners(bounds: { left: number; top: number; width: number; height: number }, offsets: FreeDistortCorners): FreeDistortCorners {
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  return {
    tl: [bounds.left + offsets.tl[0], bounds.top + offsets.tl[1]],
    tr: [right + offsets.tr[0], bounds.top + offsets.tr[1]],
    br: [right + offsets.br[0], bottom + offsets.br[1]],
    bl: [bounds.left + offsets.bl[0], bottom + offsets.bl[1]],
  };
}

function distortedParts(obj: fabric.FabricObject, offsets: FreeDistortCorners): string[] {
  const loops = sourceLoops(obj);
  const bounds = boundsOfLoops(loops);
  if (!bounds) return [];
  const corners = objectCorners(bounds, offsets);
  return loops.map(loop => toD(loop.pts.map(pt => transformPoint(pt, bounds, corners)), loop.closed));
}

export function clearFreeDistortPreview(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const previews = canvas.getObjects().filter(o => (o as unknown as Record<string, unknown>)[PREVIEW_FLAG]);
  if (!previews.length) return;
  previews.forEach(o => canvas.remove(o));
  canvas.requestRenderAll();
}

export function updateFreeDistortPreview(offsets: FreeDistortCorners): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  clearFreeDistortPreview();
  const objs = canvas.getActiveObjects().filter(o => o.type === 'path' || o.type === 'rect' || o.type === 'polygon' || o.type === 'ellipse');
  let count = 0;
  for (const obj of objs) {
    const parts = distortedParts(obj, offsets);
    if (!parts.length) continue;
    const preview = new fabric.Path(parts.join(' '), {
      fill: 'rgba(90, 200, 216, 0.12)',
      stroke: '#5ac8d8',
      strokeDashArray: [5, 4],
      strokeWidth: 1.5,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    (preview as unknown as Record<string, unknown>)[PREVIEW_FLAG] = true;
    canvas.add(preview);
    canvas.bringObjectToFront(preview);
    count++;
  }
  canvas.requestRenderAll();
  return count;
}

export function freeDistortSelection(offsets: FreeDistortCorners): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  clearFreeDistortPreview();
  const objs = canvas.getActiveObjects().filter(o => o.type === 'path' || o.type === 'rect' || o.type === 'polygon' || o.type === 'ellipse');
  if (!objs.length) return 0;
  let count = 0;
  for (const obj of objs) {
    const parts = distortedParts(obj, offsets);
    if (!parts.length) continue;
    const np = new fabric.Path(parts.join(' '), {
      fill: (obj.fill as string) ?? '',
      stroke: (obj.stroke as string) ?? '',
      strokeWidth: obj.strokeWidth ?? 0,
      opacity: obj.opacity ?? 1,
    });
    canvas.remove(obj);
    canvas.add(np);
    count++;
  }
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
