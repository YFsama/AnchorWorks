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
  /** Transform Each — pivot every object on its OWN centre instead of the
   *  selection's shared centre (Illustrator Object→Transform→Transform Each). */
  each: boolean;
}

/** Scale + rotate about the target's own centre, then move. */
function transformAboutCentre(target: fabric.FabricObject, p: TransformParams): void {
  const centre = target.getCenterPoint();
  if (p.scale > 0 && p.scale !== 1) {
    target.scaleX = (target.scaleX ?? 1) * p.scale;
    target.scaleY = (target.scaleY ?? 1) * p.scale;
  }
  if (p.rotate) target.set('angle', (target.angle ?? 0) + p.rotate);
  target.setPositionByOrigin(centre, 'center', 'center');
  if (p.dx || p.dy) target.set({ left: (target.left ?? 0) + p.dx, top: (target.top ?? 0) + p.dy });
  target.setCoords();
}

/** The last transform applied, for Transform Again (Illustrator's step-and-repeat). */
let lastTransform: TransformParams | null = null;

/** True once a numeric transform has been applied this session. */
export function canRepeatTransform(): boolean {
  return lastTransform !== null;
}

/**
 * Re-apply the most recent transform to the current selection — Illustrator's
 * Transform Again. With `copy` on the remembered params this step-and-repeats a
 * row/ring of clones; otherwise it re-nudges/scales/rotates the live selection.
 */
export async function repeatTransform(): Promise<boolean> {
  if (!lastTransform) return false;
  return applyTransform(lastTransform);
}

export async function applyTransform(p: TransformParams): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  if (!active) return false;

  // Transform Each — operate on the individual objects, each about its own
  // centre. (Also the natural path for a single object.)
  if (p.each) {
    let objs = canvas.getActiveObjects().slice();
    if (objs.length === 0) return false;
    if (p.copy) {
      const clones: fabric.FabricObject[] = [];
      for (const o of objs) clones.push(await o.clone());
      canvas.discardActiveObject();
      for (const cl of clones) canvas.add(cl);
      objs = clones;
    } else {
      canvas.discardActiveObject();
    }
    for (const o of objs) transformAboutCentre(o, p);
    if (objs.length === 1) canvas.setActiveObject(objs[0]);
    else canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
    canvas.requestRenderAll();
    pushHistory();
    lastTransform = { ...p };
    return true;
  }

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

  transformAboutCentre(target, p);
  canvas.requestRenderAll();
  pushHistory();
  lastTransform = { ...p };
  return true;
}
