/**
 * Pan session — viewport translation state that spans the three pointer
 * events (down → move → up).
 *
 * Extracted from canvasEngine.ts as part of task #20 (split the engine into
 * focused slices). The hand tool and middle-click drag both feed into the
 * same session: down() seeds the anchor point, update() translates the
 * Fabric viewport relative to the last frame, and end() releases and
 * restores the resting cursor.
 *
 * The session is a module-level singleton because Fabric only has one
 * canvas in this app — a multi-canvas future would lift the closure into
 * a per-canvas WeakMap, but that's not needed today.
 */
import type * as fabric from 'fabric';
import { emitViewport } from './canvasEvents';

let panLast: { x: number; y: number } | null = null;

/** Begin a pan session at the given viewport-space pointer. Also flips the
 *  cursor to `grabbing` so the page-level cursor matches the new state. */
export function panBegin(vp: { x: number; y: number }, canvas: fabric.Canvas): void {
  panLast = { x: vp.x, y: vp.y };
  canvas.defaultCursor = 'grabbing';
}

/** True when a pan session is in progress — call from onMouseMove / onMouseUp
 *  to decide whether to route the event into panUpdate / panEnd. */
export function isPanActive(): boolean {
  return panLast !== null;
}

/** Apply the delta from the previous frame to the viewport transform.
 *  No-op when no session is active. */
export function panUpdate(vp: { x: number; y: number }, canvas: fabric.Canvas): void {
  if (!panLast) return;
  const dx = vp.x - panLast.x;
  const dy = vp.y - panLast.y;
  const vt = canvas.viewportTransform!;
  vt[4] += dx;
  vt[5] += dy;
  canvas.setViewportTransform(vt);
  panLast = { x: vp.x, y: vp.y };
  emitViewport();
}

/** End the session and restore the resting cursor. Caller passes the
 *  cursor to settle into (typically `'grab'` when the hand tool stays
 *  active, `'default'` for middle-click pan that started on another tool). */
export function panEnd(canvas: fabric.Canvas, restingCursor: string): void {
  panLast = null;
  canvas.defaultCursor = restingCursor;
}
