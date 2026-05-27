/**
 * Eraser tool state machine.
 *
 * Mirrors the penPolyTool extraction pattern: this module owns the eraser's
 * private state and exposes three engine entry points — one each for
 * mousedown / mousemove / mouseup. The engine no longer touches eraser
 * state directly.
 *
 * The eraser's job is to remove every object it scrubs over while bundling
 * the entire drag into a single undo entry. That requires suspending the
 * history system on mousedown (so individual `object:removed` events don't
 * each push a snapshot), letting `eraseAt` mutate the canvas freely on
 * mousedown + every mousemove, then on mouseup resuming history and
 * pushing exactly one snapshot if anything was actually removed.
 */

import type * as fabric from 'fabric';
import { getCanvas, getHistory } from '../canvasEngine';
import { useEditor } from '../../store/editor';
import { pushHistory } from '../historyOps';
import { eraserHitsObject } from '../eraserHitTest';

let active = false;
let dirty = false;

/** True when an eraser drag is currently in progress. Engine's onMouseMove
 *  and onMouseUp both gate their eraser branches on this. */
export function isEraserActive(): boolean { return active; }

/** mousedown handler — start the drag, suspend history, erase the first
 *  point so a single click also removes objects. */
export function eraserBegin(sp: { x: number; y: number }): void {
  const canvas = getCanvas();
  if (!canvas) return;
  active = true;
  dirty = false;
  getHistory()?.suspend();
  eraseAt(canvas, sp);
}

/** mousemove handler — continue erasing under the cursor. */
export function eraserStroke(sp: { x: number; y: number }): void {
  const canvas = getCanvas();
  if (!canvas || !active) return;
  eraseAt(canvas, sp);
}

/** mouseup handler — finish the drag, resume history, push exactly one
 *  undo entry if anything was removed. */
export function eraserEnd(): void {
  if (!active) return;
  active = false;
  getHistory()?.resume();
  if (dirty) pushHistory();
  dirty = false;
}

function eraseAt(canvas: fabric.Canvas, sp: { x: number; y: number }): void {
  const size = useEditor.getState().eraserSize || 20;
  const r = size / 2;
  const objs = canvas.getObjects().filter(o => !(o as { excludeFromExport?: boolean }).excludeFromExport);
  let removed = 0;
  for (const o of objs) {
    if (!eraserHitsObject(o, sp, r)) continue;
    canvas.remove(o);
    removed++;
  }
  if (removed > 0) {
    dirty = true;
    canvas.requestRenderAll();
  }
}
