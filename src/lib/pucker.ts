/**
 * Pucker & Bloat (Illustrator Effect→Distort & Transform→Pucker & Bloat) —
 * keep each anchor in place but bow the segments between anchors toward the
 * shape centroid (pucker, negative) or away from it (bloat, positive). Same
 * flatten → rebuild pipeline as Roughen / Zig Zag.
 *
 * `amount` is a fraction: +1 = 100% bloat, -1 = 100% pucker. Each edge is
 * densified and every sub-point pushed radially by a factor of
 * `1 + amount·sin(πt)` (t = 0..1 along the edge), so anchors (t=0/1) stay put
 * and the edge midpoint moves the most.
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

/** Average of the points (dropping a duplicated closing point if present). */
export function centroidOf(pts: Pt[]): Pt {
  let n = pts.length;
  if (n > 1 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1]) n -= 1;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += pts[i][0]; sy += pts[i][1]; }
  return [sx / n, sy / n];
}

/**
 * Bow every edge of the polyline toward/away from the centroid. Anchors stay
 * fixed; the edge midpoints move by `amount` of their radius from the centre.
 */
export function puckerBloatPolyline(pts: Pt[], closed: boolean, amount: number): Pt[] {
  if (pts.length < 2 || amount === 0) return pts.slice();
  const [cx, cy] = centroidOf(pts);

  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(8, Math.ceil(len / 4));
    // Emit [i, i+1) — the final point is added once after the loop so we don't
    // duplicate shared anchors between consecutive edges.
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const bx = a[0] + (b[0] - a[0]) * t;
      const by = a[1] + (b[1] - a[1]) * t;
      const f = 1 + amount * Math.sin(Math.PI * t);
      out.push([cx + (bx - cx) * f, cy + (by - cy) * f]);
    }
  }
  // Close the loop / cap the open end with the original last point (t=1, f=1).
  out.push(pts[pts.length - 1].slice() as Pt);
  if (closed && out.length > 1) out[out.length - 1] = out[0];
  return out;
}

/** True when the selection has a path/shape to pucker. */
export function canPucker(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(o => o.type === 'path' || o.type === 'rect' || o.type === 'polygon' || o.type === 'ellipse');
}

/** Pucker/bloat every selected path/shape. `amount` is -1..1. Returns the count. */
export function puckerSelection(amount: number): number {
  const canvas = getCanvas();
  if (!canvas || amount === 0) return 0;
  const objs = canvas.getActiveObjects().filter(o => o.type === 'path' || o.type === 'rect' || o.type === 'polygon' || o.type === 'ellipse');
  if (objs.length === 0) return 0;
  const amt = Math.max(-1, Math.min(1, amount));

  let count = 0;
  for (const obj of objs) {
    const parts: string[] = [];
    for (const cp of buildOutlineCutPaths([obj], 0, 1)) {
      const px = cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
      const pb = puckerBloatPolyline(px, cp.closed, amt);
      if (pb.length >= 2) parts.push(toD(pb, cp.closed));
    }
    if (parts.length === 0) continue;
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
