/**
 * Numeric transform — move / scale / rotate the selection by exact values, with
 * an optional "copy" (Illustrator Object→Transform). Scale and rotate keep the
 * selection's centre fixed; move is applied after. With `copy`, the selection is
 * cloned first and the transform lands on the clones.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

export interface TransformParams {
  /** Move in px. */ dx: number; dy: number;
  /** Uniform scale factor (1 = 100%). */ scale: number;
  /** Rotation in degrees, added to the current angle. */ rotate: number;
  /** Apply to a clone instead of the original. */ copy: boolean;
}

export async function applyTransform(p: TransformParams): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  if (!active) return false;

  let target: fabric.FabricObject = active;
  if (p.copy) {
    // Clone every selected object, drop them on the canvas, and reselect the
    // clones so the transform applies to the copy (originals stay put).
    const clones: fabric.FabricObject[] = [];
    for (const o of canvas.getActiveObjects()) clones.push(await o.clone());
    canvas.discardActiveObject();
    for (const cl of clones) canvas.add(cl);
    if (clones.length === 1) { canvas.setActiveObject(clones[0]); target = clones[0]; }
    else { const sel = new fabric.ActiveSelection(clones, { canvas }); canvas.setActiveObject(sel); target = sel; }
  }

  const centre = target.getCenterPoint();
  if (p.scale > 0 && p.scale !== 1) {
    target.scaleX = (target.scaleX ?? 1) * p.scale;
    target.scaleY = (target.scaleY ?? 1) * p.scale;
  }
  if (p.rotate) target.set('angle', (target.angle ?? 0) + p.rotate);
  // Re-anchor so scale + rotate pivot on the centre, then apply the move.
  target.setPositionByOrigin(centre, 'center', 'center');
  if (p.dx || p.dy) target.set({ left: (target.left ?? 0) + p.dx, top: (target.top ?? 0) + p.dy });
  target.setCoords();

  canvas.requestRenderAll();
  pushHistory();
  return true;
}
