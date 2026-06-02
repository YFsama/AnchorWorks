/**
 * Arrowheads — append a filled triangular arrowhead to the endpoint(s) of each
 * selected open path/line (sign annotations, dimension arrows, diagrams). The
 * head is sized from the object's stroke width and painted in its stroke colour.
 * Closed shapes (no endpoints) are skipped.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

/** Build the three points of an arrowhead (mm): apex at `tip`, pointing along
 *  the unit direction `dir`, `len` long and `width` wide at the base. */
export function arrowTriangle(tip: Pt, dir: Pt, len: number, width: number): Pt[] {
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / dl, uy = dir[1] / dl;       // unit direction
  const px = -uy, py = ux;                          // left perpendicular
  const bx = tip[0] - ux * len, by = tip[1] - uy * len; // base centre
  return [
    [tip[0], tip[1]],
    [bx + px * (width / 2), by + py * (width / 2)],
    [bx - px * (width / 2), by - py * (width / 2)],
  ];
}

function toClosedD(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(x * MM_TO_PX).toFixed(2)} ${(y * MM_TO_PX).toFixed(2)}`).join(' ') + ' Z';
}

/** True when the selection has an open path/line to point. */
export function canAddArrowheads(): boolean {
  const c = getCanvas();
  if (!c) return false;
  return c.getActiveObjects().some(o => buildOutlineCutPaths([o], 0, 1).some(p => !p.closed && p.points.length >= 2));
}

/** Add arrowheads to the chosen end(s) of each selected open path. Returns the
 *  number of heads added. */
export function addArrowheads(ends: 'start' | 'end' | 'both'): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    const swPx = (obj.strokeWidth ?? 0) * Math.max(obj.scaleX ?? 1, obj.scaleY ?? 1);
    const swMm = swPx > 0 ? swPx / MM_TO_PX : 1;
    const len = Math.max(3, swMm * 4);
    const width = Math.max(2.4, swMm * 3.2);
    const colour = (typeof obj.stroke === 'string' && obj.stroke) ? obj.stroke
      : (typeof obj.fill === 'string' && obj.fill) ? obj.fill : '#0f0f12';

    for (const p of buildOutlineCutPaths([obj], 0, 1)) {
      if (p.closed || p.points.length < 2) continue;
      const pts = p.points;
      const tris: Pt[][] = [];
      if (ends === 'end' || ends === 'both') {
        const tip = pts[pts.length - 1], prev = pts[pts.length - 2];
        tris.push(arrowTriangle(tip, [tip[0] - prev[0], tip[1] - prev[1]], len, width));
      }
      if (ends === 'start' || ends === 'both') {
        const tip = pts[0], next = pts[1];
        tris.push(arrowTriangle(tip, [tip[0] - next[0], tip[1] - next[1]], len, width));
      }
      for (const tri of tris) {
        const head = new fabric.Path(toClosedD(tri), { fill: colour, stroke: '', strokeWidth: 0 });
        canvas.add(head);
        count++;
      }
    }
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
