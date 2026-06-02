/**
 * Arc Warp (Illustrator Effect→Warp→Arc) — bend the selected artwork into an
 * arc/banner along a shared horizontal frame: each point's Y is shifted by a
 * parabola of its X position, so the whole selection curves as one unit (unlike
 * Text-on-Arc, which only curves a text baseline). Same densify → rebuild
 * pattern as Roughen / Zig Zag / Twist.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

function toD(pts: Pt[], closed: boolean): string {
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return closed ? `${d} Z` : d;
}

/** Shift each point's Y by `bend·width·½·parabola(x)` — peak at the frame centre. */
export function warpArcPoints(pts: Pt[], minX: number, width: number, bend: number): Pt[] {
  if (width <= 0) return pts.slice();
  const depth = bend * width * 0.5;
  return pts.map(([x, y]) => {
    const nx = Math.max(0, Math.min(1, (x - minX) / width));
    const p = 4 * nx * (1 - nx);
    return [x, y - depth * p] as Pt;
  });
}

function densify(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const SHAPES = new Set(['path', 'rect', 'polygon', 'ellipse']);

/** True when the selection has a path/shape to warp. */
export function canWarp(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(o => SHAPES.has(o.type ?? ''));
}

/** Arc-warp every selected path/shape by `bendPct` in [-100, 100]. */
export function warpArcSelection(bendPct: number): number {
  const canvas = getCanvas();
  if (!canvas || bendPct === 0) return 0;
  const objs = canvas.getActiveObjects().filter(o => SHAPES.has(o.type ?? ''));
  if (objs.length === 0) return 0;

  // First pass: gather dense polylines (px) + the selection's shared x-frame.
  const gathered: { obj: fabric.FabricObject; loops: { pts: Pt[]; closed: boolean }[] }[] = [];
  let minX = Infinity, maxX = -Infinity;
  for (const obj of objs) {
    const loops: { pts: Pt[]; closed: boolean }[] = [];
    for (const cp of buildOutlineCutPaths([obj], 0, 1)) {
      const px = densify(cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt));
      for (const [x] of px) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
      loops.push({ pts: px, closed: cp.closed });
    }
    if (loops.length) gathered.push({ obj, loops });
  }
  const width = maxX - minX;
  if (!isFinite(width) || width <= 0) return 0;
  const bend = bendPct / 100;

  let count = 0;
  for (const { obj, loops } of gathered) {
    const parts: string[] = [];
    for (const { pts, closed } of loops) {
      const warped = warpArcPoints(pts, minX, width, bend);
      if (warped.length >= 2) parts.push(toD(warped, closed));
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
