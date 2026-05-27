/**
 * History operations — push / refresh-flags / undo / redo.
 *
 * Thin wrappers around the History instance that the canvas owns, plus the
 * editor-store sync that keeps the undo / redo button state live. Extracted
 * from canvasEngine.ts (task #20) so the engine file shrinks further; the
 * actual `History` class still lives in src/lib/history.ts and the
 * `history` instance still lives inside canvasEngine (created in
 * `initCanvas`). We just talk to it through canvasEngine's `getHistory()` +
 * `getCanvas()` getters here.
 *
 * Re-exported from canvasEngine.ts for back-compat — every module that
 * imports `pushHistory` / `undo` / `redo` from `./canvasEngine` continues to
 * resolve through the re-export.
 */

import { getCanvas, getHistory } from './canvasEngine';
import { useEditor } from '../store/editor';

/** Snapshot the current canvas state into the history stack and refresh the
 *  store's can-undo / can-redo flags. Called by every mutating operation. */
export function pushHistory(): void {
  const canvas = getCanvas();
  const history = getHistory();
  if (!canvas || !history) return;
  history.capture(canvas);
  refreshHistoryFlags();
}

/** Mirror the History instance's canUndo / canRedo bits into the editor
 *  store so the MenuBar / Toolbar undo + redo buttons can disable themselves
 *  at the right times. */
export function refreshHistoryFlags(): void {
  const history = getHistory();
  useEditor.getState().setHistoryFlags(!!history?.canUndo(), !!history?.canRedo());
}

/** Step one entry back in the history stack and replay the snapshot onto
 *  the canvas. Async because History.undo deserialises the snapshot. */
export async function undo(): Promise<void> {
  const canvas = getCanvas();
  const history = getHistory();
  if (!canvas || !history) return;
  await history.undo(canvas);
  refreshHistoryFlags();
}

/** Step one entry forward in the history stack. */
export async function redo(): Promise<void> {
  const canvas = getCanvas();
  const history = getHistory();
  if (!canvas || !history) return;
  await history.redo(canvas);
  refreshHistoryFlags();
}
