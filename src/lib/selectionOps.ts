/**
 * Plain selection operations — delete / duplicate / nudge.
 *
 * Three small commands on the active selection. Pulled out of canvasEngine.ts
 * (task #20) so the engine file keeps shrinking; behaviour identical.
 *
 * History semantics intentionally preserved:
 *   - `deleteSelection` does NOT call pushHistory — Fabric's `object:removed`
 *     handler wired up inside `initCanvas` pushes for us.
 *   - `duplicateSelection` likewise relies on `object:added` to push.
 *   - `nudgeSelection` DOES call pushHistory directly: `.set({ left, top })`
 *     doesn't fire `object:modified`, so without the explicit push, arrow-key
 *     nudges wouldn't land in the undo stack.
 *
 * Re-exported from canvasEngine.ts for back-compat — CanvasContextMenu,
 * CommandPalette, PropertiesPanel, lib/clipboard, App.tsx skills all keep
 * importing from './canvasEngine' unchanged.
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { useEditor } from '../store/editor';

type FabricObject = fabric.FabricObject;

/** Remove every object in the active selection and clear the selection. */
export function deleteSelection(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  canvas.getActiveObjects().forEach(o => canvas.remove(o));
  canvas.discardActiveObject();
  canvas.requestRenderAll();
}

/** Clone the active selection and offset by +20px so the duplicate is
 *  visible. Async because Fabric's `clone()` returns a Promise (it deeply
 *  serialises the object including image data). */
export function duplicateSelection(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const active = canvas.getActiveObject();
  if (!active) return;
  active.clone().then((c: FabricObject) => {
    c.set({ left: (c.left ?? 0) + 20, top: (c.top ?? 0) + 20 });
    canvas.add(c);
    canvas.setActiveObject(c);
    canvas.requestRenderAll();
  });
}

/** Translate every selected object by (dx, dy). Used by arrow-key nudges and
 *  the AI `nudge` skill. */
export function nudgeSelection(dx: number, dy: number): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  objs.forEach(o => {
    o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
    o.setCoords();
  });
  if (objs.length) {
    canvas.requestRenderAll();
    pushHistory();
  }
}

/**
 * Select every object whose `fill` (or `stroke`) matches the active object's —
 * Illustrator's Select → Same → Fill / Stroke Color. Only flat string colours
 * match (gradients/patterns are skipped). Returns the count selected.
 */
export function selectSame(prop: 'fill' | 'stroke'): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const ref = canvas.getActiveObject();
  if (!ref) return 0;
  const refVal = (ref as unknown as Record<string, unknown>)[prop];
  if (typeof refVal !== 'string' || !refVal) return 0;
  const norm = (c: string) => c.trim().toLowerCase();
  const target = norm(refVal);
  const matches = canvas.getObjects().filter((o) => {
    if ((o as { excludeFromExport?: boolean }).excludeFromExport) return false;
    const v = (o as unknown as Record<string, unknown>)[prop];
    return typeof v === 'string' && norm(v) === target;
  });
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  if (matches.length === 1) canvas.setActiveObject(matches[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  return matches.length;
}

/**
 * Lock the active selection — disables move / scale / rotate (Illustrator's
 * Object→Lock). Matches the Layers-panel lock (lockMovementX), so the lock icon
 * there reflects it, and the props serialise with the project. Returns the count.
 */
export function lockSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  for (const o of objs) {
    o.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
  }
  if (objs.length) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return objs.length;
}

/** Unlock every locked object on the canvas (Object→Unlock All). Returns count. */
export function unlockAll(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let n = 0;
  for (const o of canvas.getObjects()) {
    if (o.lockMovementX || o.lockMovementY) {
      o.set({ lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false });
      n++;
    }
  }
  if (n > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return n;
}

/**
 * Hide the active selection (Illustrator Object→Hide). Sets `visible: false`,
 * matching the Layers-panel eye toggle and serialising with the project.
 * Returns the count hidden.
 */
export function hideSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  for (const o of objs) o.set({ visible: false });
  if (objs.length) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return objs.length;
}

/** Reveal every hidden object (Object→Show All). Returns the count revealed. */
export function showAll(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let n = 0;
  for (const o of canvas.getObjects()) {
    if (o.visible === false) { o.set({ visible: true }); n++; }
  }
  if (n > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return n;
}

/**
 * Make guides from the selection (Illustrator View→Guides→Make Guides): drop a
 * persistent ruler guide at each selected object's four bounding-box edges. The
 * objects are kept (not consumed). Returns the number of guides added.
 */
export function makeGuidesFromSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  if (objs.length === 0) return 0;
  const addGuide = useEditor.getState().addUserGuide;
  let n = 0;
  for (const o of objs) {
    const r = o.getBoundingRect();
    addGuide('v', r.left);
    addGuide('v', r.left + r.width);
    addGuide('h', r.top);
    addGuide('h', r.top + r.height);
    n += 4;
  }
  return n;
}

/** Flip every selected object about its own centre. `'x'` mirrors horizontally,
 *  `'y'` vertically (Illustrator's Object→Transform→Reflect). */
export function flipSelection(axis: 'x' | 'y'): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  objs.forEach((o: FabricObject) => {
    if (axis === 'x') o.set('flipX', !o.flipX);
    else o.set('flipY', !o.flipY);
    o.setCoords();
  });
  if (objs.length) {
    canvas.requestRenderAll();
    pushHistory();
  }
}
