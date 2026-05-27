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

import type * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

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
