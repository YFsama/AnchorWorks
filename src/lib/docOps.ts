/**
 * Document-level operations — resize canvas + set background.
 *
 * Two small ops that touch the canvas's "page" properties (dimensions,
 * background colour) rather than its objects. Pulled out of canvasEngine.ts
 * (task #20) so the engine file keeps shrinking; behaviour identical.
 *
 * Both deliberately skip `pushHistory()`. Resize is usually paired with a
 * separate `setDoc()` store call (which lives outside the undo stack since
 * it's a document-meta change, not an object change), and the upstream
 * call sites (DocSettingsDialog Apply, templates.applyTemplate, projectFile
 * load) handle their own history strategy. Adding a push here would create
 * spurious undo entries for every Apply click and every template insert.
 */

import { getCanvas } from './canvasEngine';

/** Resize the underlying Fabric canvas surface to (w, h) pixels. Caller is
 *  responsible for updating the editor store's `doc.width`/`doc.height` if
 *  needed (most call sites do this just before via `setDoc`). */
export function resizeCanvas(w: number, h: number): void {
  const canvas = getCanvas();
  if (!canvas) return;
  canvas.setDimensions({ width: w, height: h });
}

/** Replace the canvas background colour and re-render. Accepts any CSS
 *  colour string Fabric understands. */
export function setBackground(color: string): void {
  const canvas = getCanvas();
  if (!canvas) return;
  canvas.backgroundColor = color;
  canvas.requestRenderAll();
}
