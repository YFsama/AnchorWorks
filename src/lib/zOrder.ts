/**
 * Z-order operations on the active selection.
 *
 * Four one-line wrappers around Fabric's stacking methods, each followed by
 * a render request + history push so the editor's undo/redo + viewport stay
 * in sync. Pulled out of canvasEngine.ts (task #20) so the tool-dispatch
 * core can keep shrinking; behaviour identical to the inline versions.
 */

import { getCanvas, pushHistory } from './canvasEngine';

function withActive(fn: (c: NonNullable<ReturnType<typeof getCanvas>>) => void): void {
  const c = getCanvas();
  if (!c) return;
  const active = c.getActiveObject();
  if (!active) return;
  fn(c);
  c.requestRenderAll();
  pushHistory();
}

export function bringForward(): void {
  withActive((c) => c.bringObjectForward(c.getActiveObject()!));
}
export function sendBackward(): void {
  withActive((c) => c.sendObjectBackwards(c.getActiveObject()!));
}
export function bringToFront(): void {
  withActive((c) => c.bringObjectToFront(c.getActiveObject()!));
}
export function sendToBack(): void {
  withActive((c) => c.sendObjectToBack(c.getActiveObject()!));
}
