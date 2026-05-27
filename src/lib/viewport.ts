/**
 * Viewport zoom + pan helpers.
 *
 * Five public functions that compose into the editor's zoom UX:
 *   - zoomToPoint(x, y, z) — zoom anchored at a screen point (used by wheel)
 *   - zoomBy(factor)       — zoom around the current viewport centre
 *   - zoomFit()            — fit the document (artboard 1) to the visible canvas
 *   - zoomReset()          — alias for zoomFit
 *   - zoomToArtboard(bbox) — fit any artboard's bbox
 *
 * All five clamp into the [0.05, 32] range, write the new zoom into the
 * editor store (so the StatusBar zoom% reading stays live), and emit a
 * viewport event so Rulers / GridOverlay / ArtboardLayer / outlineView
 * re-paint.
 *
 * Lives in its own file so canvasEngine.ts stays focused on tool dispatch
 * and event routing (task #20). Re-exported from canvasEngine for back-compat
 * — call sites in CommandPalette / MenuBar / Toolbar / StatusBar /
 * ArtboardsPanel continue to `import { zoom* } from './canvasEngine'`.
 */

import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { useEditor } from '../store/editor';
import { emitViewport } from './canvasEvents';

/**
 * Fabric `mouse:wheel` handler. Two modes off the same event:
 *   - Ctrl/⌘ + wheel → zoom anchored at the cursor (`zoomToPoint`).
 *   - Wheel alone     → 2D pan via direct viewport-transform translation.
 *
 * Lives here (not in panSession.ts) because there is no session — wheel
 * pans are atomic per-event, no down/move/up cycle to track. The session
 * file is for the drag-style pan owned by the hand tool / middle-click.
 *
 * Extracted from canvasEngine.ts to keep the engine focused on tool
 * dispatch + lifecycle. Bound there as `canvas.on('mouse:wheel', handleWheel)`.
 */
export function handleWheel(e: fabric.TPointerEventInfo<WheelEvent>): void {
  e.e.preventDefault();
  e.e.stopPropagation();
  const canvas = getCanvas();
  if (!canvas) return;
  const delta = e.e.deltaY;
  const vp = canvas.getViewportPoint(e.e);
  if (e.e.ctrlKey || e.e.metaKey) {
    const factor = Math.pow(0.999, delta);
    zoomToPoint(vp.x, vp.y, canvas.getZoom() * factor);
  } else {
    const vt = canvas.viewportTransform!;
    vt[4] -= e.e.deltaX;
    vt[5] -= delta;
    canvas.setViewportTransform(vt);
    emitViewport();
  }
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;
const FIT_PADDING = 0.9; // 90% of viewport so the artwork has visible margin

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/** Zoom anchored at a viewport-space point. The point stays under the cursor
 *  while the rest of the canvas scales around it. */
export function zoomToPoint(x: number, y: number, z: number): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const clamped = clampZoom(z);
  canvas.zoomToPoint(new fabric.Point(x, y), clamped);
  useEditor.getState().setZoom(clamped);
  emitViewport();
}

/** Zoom around the visible-canvas centre. Wraps zoomToPoint so the user-facing
 *  "zoom in / zoom out" buttons feel like they're keeping the scene centred. */
export function zoomBy(factor: number): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const c = canvas.getCenterPoint();
  zoomToPoint(c.x, c.y, canvas.getZoom() * factor);
}

/** Fit the document bounds to the visible canvas with `FIT_PADDING` margin. */
export function zoomFit(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const d = useEditor.getState().doc;
  const cw = canvas.getWidth();
  const ch = canvas.getHeight();
  const z = clampZoom(Math.min(cw / d.width, ch / d.height) * FIT_PADDING);
  canvas.setZoom(z);
  const vt = canvas.viewportTransform!;
  vt[4] = (cw - d.width * z) / 2;
  vt[5] = (ch - d.height * z) / 2;
  canvas.setViewportTransform(vt);
  useEditor.getState().setZoom(z);
  emitViewport();
}

export function zoomReset(): void { zoomFit(); }

/** Pan + zoom the viewport so the given artboard's bbox fits comfortably
 *  inside the visible canvas with the same `FIT_PADDING` margin. Used by
 *  ArtboardsPanel's focus button and the StatusBar page switcher. */
export function zoomToArtboard(bbox: { x: number; y: number; width: number; height: number }): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const cw = canvas.getWidth();
  const ch = canvas.getHeight();
  const z = clampZoom(Math.min(cw / bbox.width, ch / bbox.height) * FIT_PADDING);
  canvas.setZoom(z);
  const vt = canvas.viewportTransform!;
  vt[4] = (cw - bbox.width * z) / 2 - bbox.x * z;
  vt[5] = (ch - bbox.height * z) / 2 - bbox.y * z;
  canvas.setViewportTransform(vt);
  useEditor.getState().setZoom(z);
  emitViewport();
}
