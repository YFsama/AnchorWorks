/**
 * Twist (Illustrator Effect→Distort & Transform→Twist) — densify each path then
 * rotate every point around the selection's centre by an angle that grows with
 * its distance from the centre, swirling the artwork into a spiral. `angle` is
 * the maximum twist (at the outer edge), in degrees. Same flatten → rebuild
 * pattern as Roughen / Zig Zag.
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

/** Densify a polyline to ~2px spacing so the spiral stays smooth. */
function densify(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts.slice();
  const dense: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / 2));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return dense;
}

/**
 * Rotate each point around `cx,cy` by `maxRad * (dist/R)` — the centre barely
 * moves while the outer edge rotates the full angle, producing the twist.
 */
export function twistPolyline(pts: Pt[], closed: boolean, cx: number, cy: number, r: number, maxRad: number): Pt[] {
  if (pts.length < 2 || r <= 0) return pts.slice();
  const out = pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const a = maxRad * (dist / r);
    const cos = Math.cos(a), sin = Math.sin(a);
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as Pt;
  });
  if (closed && out.length > 1) out[out.length - 1] = out[0]; // keep the loop closed
  return out;
}

export function canTwistObject(object: fabric.FabricObject): boolean {
  return object.type === 'path' || object.type === 'rect' || object.type === 'polygon' || object.type === 'ellipse';
}

export function twistObject(canvas: fabric.Canvas, object: fabric.FabricObject, angleDeg: number): fabric.Path | null {
  if (!canTwistObject(object) || angleDeg === 0) return null;
  const maxRad = (angleDeg * Math.PI) / 180;
  const loops: { pts: Pt[]; closed: boolean }[] = [];
  let cx = 0, cy = 0, total = 0;
  for (const cp of buildOutlineCutPaths([object], 0, 1)) {
    const px = densify(cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt));
    loops.push({ pts: px, closed: cp.closed });
    for (const [x, y] of px) { cx += x; cy += y; total++; }
  }
  if (total === 0) return null;
  cx /= total; cy /= total;
  let r = 0;
  for (const { pts } of loops) for (const [x, y] of pts) r = Math.max(r, Math.hypot(x - cx, y - cy));

  const parts: string[] = [];
  for (const { pts, closed } of loops) {
    const tw = twistPolyline(pts, closed, cx, cy, r, maxRad);
    if (tw.length >= 2) parts.push(toD(tw, closed));
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

/** True when the selection has a path/shape to twist. */
export function canTwist(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(canTwistObject);
}

/** Twist every selected path/shape about the selection's centre. */
export function twistSelection(angleDeg: number): number {
  const canvas = getCanvas();
  if (!canvas || angleDeg === 0) return 0;
  const objs = canvas.getActiveObjects().filter(canTwistObject);
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    if (twistObject(canvas, obj, angleDeg)) count++;
  }
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
