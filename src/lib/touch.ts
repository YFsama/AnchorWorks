/**
 * Touch / stylus / pen enhancement for the Fabric canvas.
 *
 * Single-finger taps + drags pass through to Fabric naturally (Fabric routes
 * touch events through mouse:* handlers by default). This module adds the
 * pieces Fabric does NOT cover well on tablets:
 *   1) Disables browser pan/zoom on the canvas wrapper (touch-action: none).
 *   2) Two-finger pinch-to-zoom (with `getCanvas()?.zoomToPoint(...)`).
 *   3) Two-finger drag-to-pan (mutates `viewportTransform`).
 *   4) Records the last pressure value from pen Pointer Events (informational).
 *
 * Returns a disposer that removes all attached listeners.
 */
import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';

interface PointerInfo {
  id: number;
  x: number;
  y: number;
}

// Single shared ref for last pen pressure (0..1). Informational — read by
// debug overlays or future stylus-aware features.
let lastPenPressure = 0;
export function getLastPenPressure() {
  return lastPenPressure;
}

export type PressureCallback = (pressure: number) => void;

export function enhanceTouchSupport(
  canvasEl: HTMLCanvasElement,
  onPressure?: PressureCallback,
): () => void {
  // Fabric wraps the <canvas> in a .canvas-container div, which itself sits
  // inside our React wrapper. Both should disallow browser gestures.
  const fabricWrap = canvasEl.parentElement; // .canvas-container
  const outerWrap = fabricWrap?.parentElement ?? null; // .canvas-host (React)
  const targets: HTMLElement[] = [];
  if (fabricWrap) targets.push(fabricWrap as HTMLElement);
  if (outerWrap) targets.push(outerWrap as HTMLElement);
  // The canvas element itself, too, for good measure.
  targets.push(canvasEl);
  for (const el of targets) {
    el.style.touchAction = 'none';
  }

  // ---------------------------------------------------------------- touches
  // Track up to 2 active touches. When we have exactly 2, we drive zoom + pan
  // manually and call preventDefault to keep Fabric from seeing them.
  let t0: PointerInfo | null = null;
  let t1: PointerInfo | null = null;
  let initialDist = 0;
  let initialZoom = 1;
  let lastMidX = 0;
  let lastMidY = 0;

  const dist = (a: PointerInfo, b: PointerInfo) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const a = e.touches[0];
      const b = e.touches[1];
      t0 = { id: a.identifier, x: a.clientX, y: a.clientY };
      t1 = { id: b.identifier, x: b.clientX, y: b.clientY };
      initialDist = dist(t0, t1) || 1;
      lastMidX = (t0.x + t1.x) / 2;
      lastMidY = (t0.y + t1.y) / 2;
      const c = getCanvas();
      initialZoom = c ? c.getZoom() : 1;
      // Suspend Fabric's selection while we drive the gesture.
      if (c) {
        // Cancel any in-progress single-touch handling.
        try {
          c.discardActiveObject();
          c.requestRenderAll();
        } catch {
          /* ignore */
        }
      }
      e.preventDefault();
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !t0 || !t1) return;
    const a = e.touches[0];
    const b = e.touches[1];
    const p0: PointerInfo = { id: a.identifier, x: a.clientX, y: a.clientY };
    const p1: PointerInfo = { id: b.identifier, x: b.clientX, y: b.clientY };

    const c = getCanvas();
    if (!c) return;

    // --- pinch zoom ---
    const newDist = dist(p0, p1) || 1;
    const scale = newDist / initialDist;
    const targetZoom = Math.max(0.05, Math.min(32, initialZoom * scale));
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    // Translate page coords to canvas-local coords.
    const rect = canvasEl.getBoundingClientRect();
    const localX = midX - rect.left;
    const localY = midY - rect.top;
    c.zoomToPoint(new fabric.Point(localX, localY), targetZoom);

    // --- two-finger pan: viewportTransform tx/ty deltas ---
    const dx = midX - lastMidX;
    const dy = midY - lastMidY;
    if (dx || dy) {
      const vt = c.viewportTransform;
      if (vt) {
        vt[4] += dx;
        vt[5] += dy;
        c.setViewportTransform(vt);
      }
    }
    lastMidX = midX;
    lastMidY = midY;

    t0 = p0;
    t1 = p1;
    e.preventDefault();
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      t0 = null;
      t1 = null;
    }
  };

  // -------------------------------------------------------------- pointer (pen)
  const onPointerEvent = (e: PointerEvent) => {
    if (e.pointerType === 'pen') {
      // pressure is 0..1; some browsers report 0.5 when unsupported, so we
      // simply record whatever the device emits.
      lastPenPressure = e.pressure;
      if (onPressure) onPressure(e.pressure);
    }
  };

  canvasEl.addEventListener('touchstart', onTouchStart, { passive: false });
  canvasEl.addEventListener('touchmove', onTouchMove, { passive: false });
  canvasEl.addEventListener('touchend', onTouchEnd);
  canvasEl.addEventListener('touchcancel', onTouchEnd);
  canvasEl.addEventListener('pointerdown', onPointerEvent);
  canvasEl.addEventListener('pointermove', onPointerEvent);

  return () => {
    canvasEl.removeEventListener('touchstart', onTouchStart);
    canvasEl.removeEventListener('touchmove', onTouchMove);
    canvasEl.removeEventListener('touchend', onTouchEnd);
    canvasEl.removeEventListener('touchcancel', onTouchEnd);
    canvasEl.removeEventListener('pointerdown', onPointerEvent);
    canvasEl.removeEventListener('pointermove', onPointerEvent);
  };
}
