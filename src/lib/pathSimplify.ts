/**
 * Simplify Path (Illustrator Object→Path→Simplify, polyline flavour).
 *
 * Flattens each selected path to absolute-space polylines, reduces the anchor
 * count with Douglas–Peucker at the given pixel tolerance, and rebuilds the
 * object as a new fabric.Path — the same absolute-`d` → new-Path replacement
 * pattern boolean ops use, so position is preserved automatically. Curves
 * become simplified line segments (the cutter-friendly DP simplify the backlog
 * specified), which is also what keeps the path light for plotting.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { douglasPeucker } from './cutContour';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795; // buildOutlineCutPaths returns mm; convert back to px

/** True when the selection contains at least one path to simplify. */
export function canSimplify(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(o => o.type === 'path');
}

/** Simplify every selected path at `tolerancePx`. Returns the count simplified. */
export function simplifySelection(tolerancePx = 1.5): number {
  const c = getCanvas();
  if (!c) return 0;
  const objs = c.getActiveObjects().filter(o => o.type === 'path');
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    // Absolute-space polylines (px): mm from buildOutlineCutPaths × MM_TO_PX.
    const cuts = buildOutlineCutPaths([obj], 0, 1);
    const parts: string[] = [];
    for (const cp of cuts) {
      const px = cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as [number, number]);
      const simp = douglasPeucker(px, Math.max(0.1, tolerancePx));
      if (simp.length < 2) continue;
      simp.forEach(([x, y], i) => parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`));
      if (cp.closed) parts.push('Z');
    }
    if (parts.length === 0) continue;

    const np = new fabric.Path(parts.join(' '), {
      fill: (obj.fill as string) ?? '',
      stroke: (obj.stroke as string) ?? '',
      strokeWidth: obj.strokeWidth ?? 0,
      opacity: obj.opacity ?? 1,
    });
    c.remove(obj);
    c.add(np);
    count++;
  }

  if (count > 0) {
    c.discardActiveObject();
    c.requestRenderAll();
    pushHistory();
  }
  return count;
}
