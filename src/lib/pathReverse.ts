/**
 * Reverse Path Direction (Illustrator Object→Path→Reverse Path Direction).
 *
 * Flips the winding of every selected path's sub-paths and rebuilds it. Visible
 * effect is on compound paths (even-odd holes that show as solid flip back) and
 * on cut direction for the plotter; a simple single path keeps its shape. Same
 * flatten → rebuild-as-fabric.Path pattern the other path tools use.
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

/** True when the selection contains a path to reverse. */
export function canReversePath(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(o => o.type === 'path');
}

/** Reverse the direction of every selected path. Returns the count. */
export function reversePathSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects().filter(o => o.type === 'path');
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    const parts: string[] = [];
    for (const cp of buildOutlineCutPaths([obj], 0, 1)) {
      const px = cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt).reverse();
      if (px.length >= 2) parts.push(toD(px, cp.closed));
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
