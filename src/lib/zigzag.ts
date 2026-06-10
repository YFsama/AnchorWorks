/**
 * Zig Zag (Illustrator Effect→Distort & Transform→Zig Zag) — densify each path
 * then displace points perpendicular to the local direction by a wave, for a
 * regular zig-zag (corner) or wavy (smooth) edge. `size` is the peak amplitude,
 * `ridges` the number of full waves along the path. Same flatten → rebuild
 * pattern as Roughen and the other path tools.
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

/** Triangle wave in [-1, 1] — the "Corner" (sharp) zig-zag profile. */
function triangle(phase: number): number {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

/**
 * Densify to a fine spacing, then offset each point perpendicular to the path by
 * `size * wave(arcLength)`. `ridges` full waves are spread over the whole path;
 * smooth → sine, otherwise → triangle (sharp corners).
 */
export function zigzagPolyline(pts: Pt[], closed: boolean, sizePx: number, ridges: number, smooth: boolean): Pt[] {
  if (pts.length < 2 || ridges < 1) return pts.slice();

  // Densify so tangents/waves are smooth regardless of the source resolution.
  const dense: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / 2));
    for (let j = 1; j <= n; j++) {
      const tt = j / n;
      dense.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]);
    }
  }

  // Cumulative arc length per dense point.
  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  if (total <= 0) return pts.slice();

  const wave = smooth ? Math.sin : triangle;
  const out: Pt[] = dense.map((p, i) => {
    // Local tangent (central difference), then the left-hand perpendicular.
    const prev = dense[Math.max(0, i - 1)];
    const next = dense[Math.min(dense.length - 1, i + 1)];
    const tx = next[0] - prev[0], ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1;
    const px = -ty / tl, py = tx / tl;
    const phase = (cum[i] / total) * ridges * 2 * Math.PI;
    const off = sizePx * wave(phase);
    return [p[0] + px * off, p[1] + py * off] as Pt;
  });
  if (closed && out.length > 1) out[out.length - 1] = out[0]; // keep the loop closed
  return out;
}

export function canZigzagObject(object: fabric.FabricObject): boolean {
  return object.type === 'path' || object.type === 'rect' || object.type === 'polygon' || object.type === 'ellipse';
}

export function zigzagObject(canvas: fabric.Canvas, object: fabric.FabricObject, sizeMm: number, ridges: number, smooth: boolean): fabric.Path | null {
  if (!canZigzagObject(object) || sizeMm <= 0 || ridges < 1) return null;
  const sizePx = sizeMm * MM_TO_PX;
  const roundedRidges = Math.round(ridges);
  const parts: string[] = [];
  for (const cp of buildOutlineCutPaths([object], 0, 1)) {
    const px = cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
    const zz = zigzagPolyline(px, cp.closed, sizePx, roundedRidges, smooth);
    if (zz.length >= 2) parts.push(toD(zz, cp.closed));
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

/** True when the selection has a path/shape to zig-zag. */
export function canZigzag(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(canZigzagObject);
}

/** Zig-zag every selected path/shape. Returns the number transformed. */
export function zigzagSelection(sizeMm: number, ridges: number, smooth: boolean): number {
  const canvas = getCanvas();
  if (!canvas || sizeMm <= 0 || ridges < 1) return 0;
  const objs = canvas.getActiveObjects().filter(canZigzagObject);
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    if (zigzagObject(canvas, obj, sizeMm, ridges, smooth)) count++;
  }
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
