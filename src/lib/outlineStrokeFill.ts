/**
 * Outline Stroke → filled shape (Illustrator Object→Path→Outline Stroke). The
 * cutter-flavoured outlineStrokeToCutPaths() yields the stroke band as cut
 * lines; this turns the same band into a *filled* even-odd fabric.Path (painted
 * with the original stroke colour) so the stroke becomes an editable, fillable,
 * boolean-able shape. The source object keeps its fill but loses its stroke,
 * matching Illustrator's fill-shape + outlined-stroke result.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { outlineStrokeToCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

function ringToD(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(x * MM_TO_PX).toFixed(2)} ${(y * MM_TO_PX).toFixed(2)}`).join(' ') + ' Z';
}

/** True when the selection has a stroked object to outline. */
export function canOutlineStrokeFill(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(o => (o.strokeWidth ?? 0) > 0 && typeof o.stroke === 'string' && !!o.stroke);
}

/** Replace each selected object's stroke with a filled outline shape. Returns
 *  the number of objects outlined. */
export function outlineStrokeToFillSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects().filter(o => (o.strokeWidth ?? 0) > 0 && typeof o.stroke === 'string' && !!o.stroke);
  if (objs.length === 0) return 0;

  let count = 0;
  for (const obj of objs) {
    const cps = outlineStrokeToCutPaths([obj]);
    if (cps.length === 0) continue;
    const d = cps.map(cp => ringToD(cp.points)).join(' ');
    const fillPath = new fabric.Path(d, {
      fill: obj.stroke as string,
      stroke: '',
      strokeWidth: 0,
      opacity: obj.opacity ?? 1,
      fillRule: 'evenodd',
    });
    // Drop the stroke from the source so the new shape isn't doubled.
    obj.set({ stroke: '', strokeWidth: 0 });
    obj.setCoords();
    canvas.add(fillPath);
    count++;
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
