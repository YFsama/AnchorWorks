/**
 * Freehand Knife tool state machine.
 *
 * Mirrors the eraserTool extraction pattern: this module owns the knife's
 * private drag state and exposes three engine entry points (begin / stroke /
 * end) plus an Esc-cancel hook. The engine's registry dispatch in
 * registerTools.ts routes pointer events here; all geometry lives in
 * ../knife.ts.
 *
 * Behaviour: press-drag draws a dashed accent polyline across the canvas;
 * releasing the pointer commits the cut (each crossed object is split along
 * the corridor, kerf discarded — see KNIFE_HALF_WIDTH). Esc mid-drag cancels
 * without cutting. History is suspended for the duration of the drag so the
 * live preview path and the piece-by-piece object swaps bundle into exactly
 * one undo entry.
 */

import * as fabric from 'fabric';
import { getCanvas, getHistory } from '../canvasEngine';
import { pushHistory } from '../historyOps';
import { knifeCutAlongPolyline, KNIFE_HALF_WIDTH } from '../knife';
import { readToken } from '../tokens';

type Pt = { x: number; y: number };

/** Append a scene point only after the cursor moved at least this far —
 *  keeps the corridor geometry (and the preview path) small. */
const MIN_SAMPLE_DIST = 2;

let active = false;
let points: Array<[number, number]> = [];
let preview: fabric.Path | null = null;
let escListener: ((e: KeyboardEvent) => void) | null = null;

/** True while a knife drag is in progress. */
export function isKnifeActive(): boolean { return active; }

/** mousedown — start the drag, suspend history, arm the Esc cancel. */
export function knifeBegin(sp: Pt): void {
  const canvas = getCanvas();
  if (!canvas) return;
  active = true;
  points = [[sp.x, sp.y]];
  getHistory()?.suspend();
  armEscape();
}

/** mousemove — extend the drawn polyline + live dashed preview. */
export function knifeStroke(sp: Pt): void {
  const canvas = getCanvas();
  if (!canvas || !active) return;
  const last = points[points.length - 1];
  if (Math.hypot(sp.x - last[0], sp.y - last[1]) < MIN_SAMPLE_DIST) return;
  points.push([sp.x, sp.y]);
  updatePreview(canvas);
}

/** mouseup — commit the cut along the drawn corridor. */
export function knifeEnd(): void {
  if (!active) return;
  const canvas = getCanvas();
  clearPreview();
  disarmEscape();
  active = false;
  const stroke = points;
  points = [];
  // Commit while history is still suspended — the piece-by-piece object
  // swaps inside knifeCutAlongPolyline fire object:added/:removed events
  // that would otherwise snapshot mid-cut. Resume afterwards and push
  // exactly one undo entry when something was actually divided (needs a
  // real drag: ≥2 sampled points; a plain click is a no-op).
  const cut = canvas && stroke.length >= 2 ? knifeCutAlongPolyline(stroke, KNIFE_HALF_WIDTH) : 0;
  getHistory()?.resume();
  if (cut > 0) pushHistory();
}

/** Esc (or tool switch) — drop the in-flight stroke without cutting. */
export function knifeCancel(): void {
  if (!active) return;
  clearPreview();
  disarmEscape();
  active = false;
  points = [];
  getHistory()?.resume();
}

/* ------------------------------ preview ------------------------------- */

function updatePreview(canvas: fabric.Canvas): void {
  if (points.length < 2) return;
  const stroke = readToken('--color-accent2', '#5ac8d8');
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i][0]} ${points[i][1]}`;
  if (!preview) {
    preview = new fabric.Path(d, {
      stroke,
      strokeWidth: 1,
      fill: '',
      selectable: false,
      evented: false,
      excludeFromExport: true,
      strokeDashArray: [5, 4],
    });
    canvas.add(preview);
  } else {
    preview.set({ path: new fabric.Path(d).path });
    preview.setCoords();
  }
  canvas.requestRenderAll();
}

function clearPreview(): void {
  const canvas = getCanvas();
  if (preview && canvas) canvas.remove(preview);
  preview = null;
}

/* -------------------------------- Esc --------------------------------- */

/**
 * Esc cancels the in-flight cut. Registered on window in the CAPTURE phase
 * so it runs before App.tsx's bubble-phase Escape handler (which would
 * deselect the selection the knife is about to cut) and can swallow the key
 * entirely — the drag, not the selection, is what Esc means mid-stroke.
 */
function armEscape(): void {
  if (escListener || typeof window === 'undefined') return;
  escListener = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    knifeCancel();
  };
  window.addEventListener('keydown', escListener, { capture: true });
}

function disarmEscape(): void {
  if (escListener && typeof window !== 'undefined') {
    window.removeEventListener('keydown', escListener, { capture: true });
  }
  escListener = null;
}
