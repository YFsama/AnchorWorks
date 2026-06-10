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
  /** Horizontal scale factor (1 = 100%); also vertical when `scaleY` is unset. */ scale: number;
  /** Optional vertical scale factor for non-uniform scaling (defaults to `scale`). */ scaleY?: number;
  /** Rotation in degrees, added to the current angle. */ rotate: number;
  /** Apply to a clone instead of the original. */ copy: boolean;
  /** Transform Each — pivot every object on its OWN centre instead of the
   *  selection's shared centre (Illustrator Object→Transform→Transform Each). */
  each: boolean;
  /** Scale strokes and effects alongside geometry (Illustrator Transform option). */
  scaleStrokesEffects?: boolean;
}

function transformScaleFactor(p: TransformParams): number {
  const sx = p.scale > 0 ? p.scale : 1;
  const sy = (p.scaleY ?? p.scale) > 0 ? (p.scaleY ?? p.scale) : sx;
  return Math.sqrt(Math.abs(sx * sy));
}

function scaleShadowEffect(target: fabric.FabricObject, factor: number): void {
  const shadow = target.shadow;
  if (!shadow || typeof shadow !== 'object') return;
  const source = shadow as { color?: unknown; blur?: unknown; offsetX?: unknown; offsetY?: unknown };
  target.set('shadow', new fabric.Shadow({
    color: typeof source.color === 'string' ? source.color : 'rgba(0,0,0,0.3)',
    blur: (Number(source.blur) || 0) * factor,
    offsetX: (Number(source.offsetX) || 0) * factor,
    offsetY: (Number(source.offsetY) || 0) * factor,
  }));
}

function scaleStrokeAndEffects(target: fabric.FabricObject, factor: number): void {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
  const strokeWidth = Number(target.strokeWidth);
  if (Number.isFinite(strokeWidth) && strokeWidth > 0) target.set('strokeWidth', strokeWidth * factor);
  scaleShadowEffect(target, factor);
}

/** Scale + rotate about the target's own centre, then move. */
function transformAboutCentre(target: fabric.FabricObject, p: TransformParams): void {
  const centre = target.getCenterPoint();
  const sx = p.scale;
  const sy = p.scaleY ?? p.scale;
  if (sx > 0 && sx !== 1) target.scaleX = (target.scaleX ?? 1) * sx;
  if (sy > 0 && sy !== 1) target.scaleY = (target.scaleY ?? 1) * sy;
  if (p.scaleStrokesEffects) scaleStrokeAndEffects(target, transformScaleFactor(p));
  if (p.rotate) target.set('angle', (target.angle ?? 0) + p.rotate);
  target.setPositionByOrigin(centre, 'center', 'center');
  if (p.dx || p.dy) target.set({ left: (target.left ?? 0) + p.dx, top: (target.top ?? 0) + p.dy });
  target.setCoords();
}

/** Rotate the selection about its centre by a fixed angle (quick 90°/180°
 *  rotate). Thin wrapper over applyTransform so it also feeds Transform Again. */
export function rotateSelection(deg: number): Promise<boolean> {
  return applyTransform({ dx: 0, dy: 0, scale: 1, rotate: deg, copy: false, each: false });
}

function reflectObjectAcrossAxis(target: fabric.FabricObject, angleDeg: number): void {
  const centre = target.getCenterPoint();
  const angle = ((angleDeg % 180) + 180) % 180;
  target.rotate((target.angle ?? 0) - angle);
  target.set('flipY', !target.flipY);
  target.rotate((target.angle ?? 0) + angle);
  target.setPositionByOrigin(centre, 'center', 'center');
  target.setCoords();
}

export function reflectSelection(angleDeg: number): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objects = canvas.getActiveObjects();
  if (objects.length === 0) return false;
  for (const object of objects) reflectObjectAcrossAxis(object, angleDeg);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}

/**
 * Shear (Illustrator Object→Transform→Shear) — skew the active selection by
 * `angleDeg` along the given axis, about its centre. Returns true on success.
 */
export function shearSelection(angleDeg: number, axis: 'horizontal' | 'vertical'): boolean {
  const canvas = getCanvas();
  const a = canvas?.getActiveObject();
  if (!canvas || !a || angleDeg === 0) return false;
  const ang = Math.max(-85, Math.min(85, angleDeg));
  const centre = a.getCenterPoint();
  if (axis === 'horizontal') a.skewX = Math.max(-85, Math.min(85, (a.skewX ?? 0) + ang));
  else a.skewY = Math.max(-85, Math.min(85, (a.skewY ?? 0) + ang));
  a.setPositionByOrigin(centre, 'center', 'center');
  a.setCoords();
  canvas.requestRenderAll();
  pushHistory();
  return true;
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
