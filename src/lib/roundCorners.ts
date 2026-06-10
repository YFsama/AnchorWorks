/**
 * Round Corners (Illustrator Effect→Stylize→Round Corners) — fillet a path's
 * corners by a radius. Each corner is replaced by a quadratic-bezier arc that
 * starts/ends `r` back along the two adjacent edges (clamped to half the
 * shorter edge so neighbouring fillets never overlap). Like the other path
 * tooling it flattens to polylines and rebuilds a new fabric.Path in absolute
 * space, so position is preserved.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

const eq = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** Round every corner of one polyline by radius `r` (px). */
function roundPolyline(pts: Pt[], closed: boolean, r: number): Pt[] {
  if (pts.length < 3 || r <= 0) return pts.slice();
  const ring = closed && pts.length > 1 && eq(pts[0], pts[pts.length - 1]) ? pts.slice(0, -1) : pts;
  const n = ring.length;
  const out: Pt[] = [];
  const STEPS = 6;
  const start = closed ? 0 : 1;
  const end = closed ? n : n - 1;
  if (!closed) out.push(ring[0]);
  for (let i = start; i < end; i++) {
    const V = ring[i % n];
    const A = ring[(i - 1 + n) % n];
    const B = ring[(i + 1) % n];
    const ax = A[0] - V[0], ay = A[1] - V[1], lenA = Math.hypot(ax, ay);
    const bx = B[0] - V[0], by = B[1] - V[1], lenB = Math.hypot(bx, by);
    if (lenA < 1e-6 || lenB < 1e-6) { out.push(V); continue; }
    const rEff = Math.min(r, lenA / 2, lenB / 2);
    const P1: Pt = [V[0] + (ax / lenA) * rEff, V[1] + (ay / lenA) * rEff];
    const P2: Pt = [V[0] + (bx / lenB) * rEff, V[1] + (by / lenB) * rEff];
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS, u = 1 - t;
      out.push([
        u * u * P1[0] + 2 * u * t * V[0] + t * t * P2[0],
        u * u * P1[1] + 2 * u * t * V[1] + t * t * P2[1],
      ]);
    }
  }
  if (!closed) out.push(ring[n - 1]);
  return out;
}

function toD(pts: Pt[], closed: boolean): string {
  const parts = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  if (closed) parts.push('Z');
  return parts.join(' ');
}

export function canRoundCornersObject(object: fabric.FabricObject): boolean {
  return object.type === 'path' || object.type === 'rect' || object.type === 'polygon';
}

export function roundCornersObject(canvas: fabric.Canvas, object: fabric.FabricObject, radiusMm: number): fabric.Path | null {
  if (!canRoundCornersObject(object) || radiusMm <= 0) return null;
  const r = radiusMm * MM_TO_PX;
  const cuts = buildOutlineCutPaths([object], 0, 1);
  const parts: string[] = [];
  for (const cp of cuts) {
    const px = cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
    const rounded = roundPolyline(px, cp.closed, r);
    if (rounded.length < 2) continue;
    parts.push(toD(rounded, cp.closed));
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

/** True when the selection has a path to round. */
export function canRoundCorners(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(canRoundCornersObject);
}

/** Round the corners of every selected path/shape by `radiusMm`. Returns count. */
export function roundCornersOnSelection(radiusMm: number): number {
  const canvas = getCanvas();
  if (!canvas || radiusMm <= 0) return 0;
  const objs = canvas.getActiveObjects().filter(canRoundCornersObject);
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    if (roundCornersObject(canvas, obj, radiusMm)) count++;
  }
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
