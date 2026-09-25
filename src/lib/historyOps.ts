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
 *
 * Capture coalescing (P1-2)
 * -------------------------
 * History.capture serialises the ENTIRE canvas (JSON.stringify of
 * canvas.toJSON()). Fabric fires object:added / modified / removed per
 * object, and every mutating op calls pushHistory, so placing 1,000
 * rhinestones in one programmatic burst used to cost 1,000 full-document
 * serialisations — O(n²) work for an n-object document.
 *
 * Semantics implemented here: captures triggered within the same macrotask
 * COALESCE into ONE snapshot of the final state. The first pushHistory in a
 * burst schedules the actual History.capture via queueMicrotask; subsequent
 * calls before the microtask drains are skipped (the scheduled flush
 * re-reads the LIVE canvas when it runs, so the single snapshot always
 * reflects the burst's end state). One undo step per user gesture /
 * programmatic burst — Illustrator-style batching. Captures requested in
 * later macrotasks each get their own snapshot exactly as before.
 *
 * Correctness edge: undo/redo invoked synchronously right after an edit in
 * the same tick must land the pending capture BEFORE the cursor moves. That
 * is handled by History's `beforeNavigate` seam (see history.ts), which we
 * assign our flushPendingCapture to on first contact with the instance —
 * canvasEngine constructs the History instance itself, so the hook is wired
 * lazily from every entry point below rather than at construction time.
 */

import { getCanvas, getHistory } from './canvasEngine';
import type { History } from './history';
import { useEditor } from '../store/editor';

/** True while a deferred History.capture is queued in the microtask queue. */
let captureScheduled = false;

/** Land the pending coalesced capture immediately, if one is scheduled.
 *  Called (a) by the queueMicrotask timer scheduled in pushHistory and
 *  (b) synchronously from History.undo / History.redo via the
 *  `beforeNavigate` seam, so an edit followed by an immediate undo still
 *  becomes its own undo step before the cursor advances. Reads the LIVE
 *  canvas + history instances at call time — a stale reference from a
 *  disposed session is never captured. Safe to call unconditionally. */
export function flushPendingCapture(): void {
  if (!captureScheduled) return;
  captureScheduled = false;
  const canvas = getCanvas();
  const history = getHistory();
  if (!canvas || !history) return;
  history.capture(canvas);
  refreshHistoryFlags();
}

/** Attach flushPendingCapture to the History instance's beforeNavigate seam
 *  (idempotent — re-assigning the same function identity is skipped). Wired
 *  from every historyOps entry point because canvasEngine, which is the
 *  only place the instance is constructed, must not change call sites. */
function wireFlushHook(history: History): void {
  if (history.beforeNavigate !== flushPendingCapture) {
    history.beforeNavigate = flushPendingCapture;
  }
}

/** Snapshot the current canvas state into the history stack and refresh the
 *  store's can-undo / can-redo flags. Called by every mutating operation.
 *
 *  Same-macrotask coalescing: the first call schedules ONE capture via
 *  queueMicrotask; every later call before it drains is a no-op. The flush
 *  reads the live canvas, so N fabric events in one burst produce exactly
 *  one full-document serialisation and one undo step (see file header). */
export function pushHistory(): void {
  const canvas = getCanvas();
  const history = getHistory();
  if (!canvas || !history) return;
  wireFlushHook(history);
  if (captureScheduled) return; // scheduled flush will already see this edit
  captureScheduled = true;
  queueMicrotask(flushPendingCapture);
}

/** Mirror the History instance's canUndo / canRedo bits into the editor
 *  store so the MenuBar / Toolbar undo + redo buttons can disable themselves
 *  at the right times. */
export function refreshHistoryFlags(): void {
  const history = getHistory();
  useEditor.getState().setHistoryFlags(!!history?.canUndo(), !!history?.canRedo());
}

/** Step one entry back in the history stack and replay the snapshot onto
 *  the canvas. Async because History.undo deserialises the snapshot. Any
 *  pending coalesced capture is flushed first via the beforeNavigate seam
 *  inside History.undo, so a same-tick edit+undo still records the edit. */
export async function undo(): Promise<void> {
  const canvas = getCanvas();
  const history = getHistory();
  if (!canvas || !history) return;
  wireFlushHook(history);
  await history.undo(canvas);
  refreshHistoryFlags();
}

/** Step one entry forward in the history stack. A pending coalesced capture
 *  landing here is an edit — it truncates the redo stack before the redo
 *  proceeds (see History.redo). */
export async function redo(): Promise<void> {
  const canvas = getCanvas();
  const history = getHistory();
  if (!canvas || !history) return;
  wireFlushHook(history);
  await history.redo(canvas);
  refreshHistoryFlags();
}
