import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

function distance(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function splitPolylineAtHalfLength(points: Pt[]): [Pt[], Pt[]] | null {
  if (points.length < 2) return null;
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const length = distance(points[index - 1], points[index]);
    lengths.push(length);
    total += length;
  }
  if (total <= 0) return null;
  const target = total / 2;
  let travelled = 0;
  for (let index = 1; index < points.length; index++) {
    const segmentLength = lengths[index - 1];
    if (travelled + segmentLength >= target) {
      const ratio = segmentLength === 0 ? 0 : (target - travelled) / segmentLength;
      const prev = points[index - 1];
      const next = points[index];
      const cut: Pt = [prev[0] + (next[0] - prev[0]) * ratio, prev[1] + (next[1] - prev[1]) * ratio];
      const first = [...points.slice(0, index), cut];
      const second = [cut, ...points.slice(index)];
      if (first.length < 2 || second.length < 2) return null;
      return [first, second];
    }
    travelled += segmentLength;
  }
  return null;
}

function dFromPoints(points: Pt[]): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
}

function longestOpenPolyline(obj: fabric.FabricObject): Pt[] | null {
  const cuts = buildOutlineCutPaths([obj], 0, 1).filter(cut => !cut.closed && cut.points.length >= 2);
  if (!cuts.length) return null;
  let best = cuts[0];
  for (const cut of cuts) if (cut.points.length > best.points.length) best = cut;
  return best.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
}

export function scissorsSplitObjectAtMidpoint(canvas: fabric.Canvas, obj: fabric.FabricObject): fabric.Path[] {
  if (obj.type !== 'path') return [];
  const points = longestOpenPolyline(obj);
  if (!points) return [];
  const split = splitPolylineAtHalfLength(points);
  if (!split) return [];
  const style = {
    fill: '',
    stroke: (obj.stroke as string) ?? '#111827',
    strokeWidth: obj.strokeWidth ?? 1,
    opacity: obj.opacity ?? 1,
    strokeLineCap: obj.strokeLineCap ?? 'butt',
    strokeLineJoin: obj.strokeLineJoin ?? 'miter',
    strokeDashArray: Array.isArray(obj.strokeDashArray) ? obj.strokeDashArray.slice() : undefined,
  };
  const first = new fabric.Path(dFromPoints(split[0]), style);
  const second = new fabric.Path(dFromPoints(split[1]), style);
  canvas.remove(obj);
  canvas.add(first, second);
  return [first, second];
}

export function scissorsSplitSelectionAtMidpoint(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const paths = canvas.getActiveObjects().filter(obj => obj.type === 'path');
  const created: fabric.FabricObject[] = [];
  let count = 0;
  for (const obj of paths) {
    const pieces = scissorsSplitObjectAtMidpoint(canvas as fabric.Canvas, obj);
    if (pieces.length === 0) continue;
    created.push(...pieces);
    count++;
  }
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
