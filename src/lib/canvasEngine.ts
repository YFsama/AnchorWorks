/**
 * Canvas engine — Fabric wrapper, tool dispatch, mouse-event routing.
 *
 * Once a 1100-line monolith; pulled down to a few hundred lines as part of
 * task #20 via per-concern extractions. Each per-tool state machine
 * (eraser, polygon/pen, shape-draw) lives in `src/lib/tools/`, pure
 * subsystems (smart guides, viewport, history ops, canvas events, etc.)
 * live in sibling modules and are re-exported here for back-compat.
 *
 * What still lives here:
 *   - Canvas lifecycle: initCanvas / disposeCanvas
 *   - Active tool state + setTool (cursor / selectable / etc. switch-case)
 *   - Mouse event routing (4 handlers, each dispatching to a tool module)
 *   - Pointer / scene-pointer / pan-last bookkeeping
 *   - Object id assignment + count sync (private wiring for Fabric events)
 *   - Re-exports of everything other modules already imported from here
 */

import * as fabric from 'fabric';
import { History } from './history';
import { useEditor } from '../store/editor';
import type { ToolId } from '../types';
import { getTool, applyToolToCanvas } from './tools/types';
import { emitGuides, emitViewport } from './canvasEvents';
import { panBegin, panUpdate, panEnd, isPanActive } from './panSession';
import { assignObjectId } from './objectId';

let canvas: fabric.Canvas | null = null;
let history: History | null = null;
let activeTool: ToolId = 'select';

// Re-export the pub/sub channels that anything importing from canvasEngine
// continues to reach for — the actual implementations live in canvasEvents.
export { subscribeGuides, subscribeViewport, type Guide } from './canvasEvents';

function syncObjectCount() {
  if (!canvas) return;
  useEditor.getState().setObjectCount(canvas.getObjects().length);
}

export function getCanvas() { return canvas; }
export function getHistory() { return history; }

// Global Fabric bootstrap (objectCaching default + WebGL filter backend) now
// lives in fabricBootstrap.ts. Imported here for the side-effect that flips
// `objectCaching` to false at module load; `ensureWebGLFilterBackend()` is
// called at the top of initCanvas. resolveAccent2 was removed in favour of
// `readToken('--color-accent2', '#5ac8d8')` from src/lib/tokens.ts.
import { ensureWebGLFilterBackend } from './fabricBootstrap';

export function initCanvas(el: HTMLCanvasElement) {
  ensureWebGLFilterBackend();
  const editor = useEditor.getState();
  canvas = new fabric.Canvas(el, {
    width: editor.doc.width,
    height: editor.doc.height,
    backgroundColor: editor.doc.background,
    preserveObjectStacking: true,
    selection: true,
    fireRightClick: true,
    stopContextMenu: true,
  });

  history = new History({ limit: 80 });
  history.init(canvas);
  refreshHistoryFlags();

  canvas.on('object:added', (e) => { if (e.target) assignObjectId(e.target); pushHistory(); syncObjectCount(); });
  canvas.on('object:modified', () => pushHistory());
  canvas.on('object:removed', () => { pushHistory(); syncObjectCount(); });
  canvas.on('object:moving', (e) => { if (e.target) applySmartSnap(canvas!, e.target); });

  canvas.on('selection:created', updateSelection);
  canvas.on('selection:updated', updateSelection);
  canvas.on('selection:cleared', clearSelection);

  canvas.on('after:render', () => emitViewport());

  // Drawing handlers
  canvas.on('mouse:down', onMouseDown);
  canvas.on('mouse:move', onMouseMove);
  canvas.on('mouse:up', onMouseUp);
  canvas.on('mouse:wheel', handleWheel);

  // Cut-path mutations are first-class history events — without this,
  // accidentally hitting Clear All inside CutContourDialog would be
  // unrecoverable. Subscribe to the slice; on identity change snapshot
  // the canvas + cut paths into the history stack via pushHistory.
  // History.capture compares both canvas + cutPaths so this fires
  // independently of canvas object events.
  let prevCutPaths = useEditor.getState().cutPaths;
  useEditor.subscribe((state) => {
    if (state.cutPaths !== prevCutPaths) {
      prevCutPaths = state.cutPaths;
      pushHistory();
    }
  });

  // Context-menu (right-click) bridge. Fabric's `stopContextMenu: true`
  // (set above) calls BOTH preventDefault AND stopPropagation on the
  // browser-level contextmenu event, so a listener on the wrapping <div>
  // never fires. Fabric still emits its own `contextmenu` event from
  // _basicEventHandler though — rebroadcast it as the custom event
  // CanvasContextMenu already listens for. Single source of truth.
  canvas.on('contextmenu', (opt) => {
    const e = (opt as unknown as { e?: MouseEvent }).e;
    if (!e) return;
    window.dispatchEvent(new CustomEvent('vector:context-menu', {
      detail: { x: e.clientX, y: e.clientY },
    }));
  });

  syncObjectCount();

  return canvas;
}

export function disposeCanvas() {
  canvas?.dispose();
  canvas = null;
  history = null;
}

export function setTool(t: ToolId) {
  const prevTool = activeTool;
  activeTool = t;
  if (!canvas) return;
  // Tool-leaving cleanup goes through the previous tool's onDeactivate hook.
  // pen / polygon → finishPolyIfAny; directSelect → exitPathEdit. Engine has
  // no per-tool knowledge here. Guarded against same-tool re-set so cycling
  // toolbar buttons doesn't tear down the active session pointlessly.
  if (prevTool !== t) {
    getTool(prevTool)?.onDeactivate?.(canvas);
  }
  canvas.isDrawingMode = false;
  // All per-tool canvas state (cursor / selection flag / skipTargetFind /
  // per-object pickability + onActivate hook) is applied in one place —
  // the registry helper `applyToolToCanvas` lives next to the ToolHandler
  // interface so the descriptor schema and its consumer stay co-located.
  applyToolToCanvas(canvas, getTool(t));
  canvas.requestRenderAll();
}

function getPointer(e: fabric.TPointerEventInfo<fabric.TPointerEvent>) {
  return canvas!.getViewportPoint(e.e);
}

function getScenePointer(e: fabric.TPointerEventInfo<fabric.TPointerEvent>) {
  return canvas!.getScenePoint(e.e);
}

// Smart guides + grid + anchor snap moved to smartGuides.ts (task #20).
// Re-export ANCHOR_SNAP_TOLERANCE for back-compat with any consumer that
// imported it from canvasEngine.
export { ANCHOR_SNAP_TOLERANCE } from './smartGuides';
import { applySmartSnap } from './smartGuides';

function onMouseDown(e: fabric.TPointerEventInfo<fabric.TPointerEvent>) {
  if (!canvas) return;
  const sp = getScenePointer(e);
  const vp = getPointer(e);

  // Middle-click pan: triggers regardless of active tool — the only "engine
  // intercept" that earns its place here. Hand-tool left-click pan flows
  // through the registry (hand's onMouseDown in registerTools.ts).
  //
  // The two preventDefault / stopPropagation calls here suppress browser
  // middle-click side-effects: Chrome's "scroll-with-mouse" anchor icon
  // (the 4-way arrow cursor that opens a drag-to-scroll mode in scrollable
  // pages) and the follow-up `auxclick` event that would otherwise bubble
  // up to any parent menu / context handler.
  const mouseEvt = e.e as MouseEvent;
  if (mouseEvt.button === 1) {
    mouseEvt.preventDefault?.();
    mouseEvt.stopPropagation?.();
    panBegin(vp, canvas);
    return;
  }

  // Everything else routes through the tool registry — including eraser
  // (onMouseDown calls `eraserBegin`) and hand (onMouseDown calls `panBegin`).
  getTool(activeTool)?.onMouseDown?.({ sp, vp, raw: e, canvas });
}

function onMouseMove(e: fabric.TPointerEventInfo<fabric.TPointerEvent>) {
  if (!canvas) return;
  const sp = getScenePointer(e);
  const vp = getPointer(e);

  // expose cursor position in document coords for status bar
  useEditor.getState().setCursor(Math.round(sp.x), Math.round(sp.y));

  // Pan-in-progress takes priority — the registry can't reach the pan
  // closure state.
  if (isPanActive()) {
    panUpdate(vp, canvas);
    return;
  }

  // Tool-specific move handling — eraser stroke, pen / polygon preview line,
  // rect / ellipse / line drag-out preview. Each tool's descriptor in
  // registerTools.ts owns the in-progress check, so the engine just
  // dispatches blindly.
  getTool(activeTool)?.onMouseMove?.({ sp, vp, raw: e, canvas });
}

function onMouseUp(e: fabric.TPointerEventInfo<fabric.TPointerEvent>) {
  if (!canvas) return;
  emitGuides([]); // clear any smart guide overlays
  // Pan session has engine-internal state, settle first. Cursor restores to
  // the active tool's declared cursor — `grab` for hand, `crosshair` for rect /
  // ellipse / line / polygon / pen / directSelect, `none` for eraser, etc.
  // Previously hardcoded `'default'` for everything-but-hand, which left the
  // eraser cursor stuck on default after a middle-click pan instead of the
  // hidden cursor the eraser HUD assumes.
  if (isPanActive()) {
    panEnd(canvas, getTool(activeTool)?.cursor ?? 'default');
    return;
  }
  // Eraser-end / shape-draw-end flow through the registry's onMouseUp.
  const sp = getScenePointer(e);
  const vp = getPointer(e);
  getTool(activeTool)?.onMouseUp?.({ sp, vp, raw: e, canvas });
}

// Zoom + viewport helpers extracted to viewport.ts (task #20). Re-exported
// for back-compat; every existing call site imports from './canvasEngine'.
// `handleWheel` is the `mouse:wheel` event handler (zoom + 2D pan) — it
// also lives in viewport.ts now, wired above as `canvas.on('mouse:wheel', …)`.
export { zoomToPoint, zoomBy, zoomFit, zoomReset, zoomToArtboard } from './viewport';
import { handleWheel } from './viewport';

// Polygon / Pen tool helpers live in src/lib/tools/penPolyTool.ts and flow
// entirely through the ToolHandler registry's lifecycle hooks
// (onMouseDown / onMouseMove / onDeactivate). The engine no longer imports
// any pen/poly symbols directly.

// Selection sync + apply-style/transform ops extracted to selectionApply.ts
// (task #20). updateSelection + clearSelection are imported back for the
// canvas selection:created / :updated / :cleared event-handler
// registrations inside initCanvas above.
export { applyStyleToSelection, applyTransformToSelection } from './selectionApply';
import { updateSelection, clearSelection } from './selectionApply';

// Selection ops (delete / duplicate / nudge) extracted to selectionOps.ts
// (task #20). Re-exported for back-compat.
export { deleteSelection, duplicateSelection, nudgeSelection } from './selectionOps';

// Z-order ops extracted to zOrder.ts (task #20). Re-exported for back-compat.
export { bringForward, sendBackward, bringToFront, sendToBack } from './zOrder';

// Group / ungroup operations extracted to grouping.ts (task #20).
// Re-exported for back-compat: CanvasContextMenu, PropertiesPanel,
// CommandPalette, App.tsx skills keep importing from './canvasEngine'.
export { groupSelection, ungroupSelection } from './grouping';

// Document-level ops (resize / background) extracted to docOps.ts (task #20).
// Re-exported for back-compat: App.tsx, DocSettingsDialog, templates.ts,
// projectFile.ts all import from './canvasEngine'.
export { resizeCanvas, setBackground } from './docOps';

// History ops (push / refresh / undo / redo) extracted to historyOps.ts
// (task #20). Re-exported for back-compat; also imported below for the
// internal call sites in canvasEngine (event handlers + mouse-up + etc.).
export { pushHistory, refreshHistoryFlags, undo, redo } from './historyOps';
import { pushHistory, refreshHistoryFlags } from './historyOps';

// Eraser tool — state machine + eraseAt now in src/lib/tools/eraserTool.ts.
// Pure hit-test helpers remain in src/lib/eraserHitTest.ts (consumed by the
// tool module).

// Align + distribute operations extracted to alignDistribute.ts (task #20).
// Re-exported here so AlignPanel + App.tsx imports stay unchanged.
export { alignSelection, distributeSelection, type AlignAxis, type DistributeDir } from './alignDistribute';
