/**
 * Apply-to-selection style + transform mutations and selection-summary sync.
 *
 * Three closely-related operations:
 *  - updateSelection()          — mirror the active selection's geometry &
 *                                 style into the editor store (drives the
 *                                 PropertiesPanel readouts + StatusBar).
 *  - applyStyleToSelection()    — set fill / stroke / stroke-width / opacity
 *                                 across the active selection.
 *  - applyTransformToSelection() — set left / top / width / height / angle on
 *                                  the active object (width/height resolve to
 *                                  scaleX/scaleY against the object's base
 *                                  dimensions).
 *
 * `updateSelection` is also wired to Fabric's `selection:created` /
 * `selection:updated` events from inside `initCanvas` — keep that wiring in
 * canvasEngine.ts so the event-handler registrations stay near the canvas
 * lifecycle.
 *
 * Re-exported from canvasEngine.ts so the PropertiesPanel + App-skill
 * consumers don't need to change their import paths.
 */

import { getCanvas } from './canvasEngine';
import { pushHistory } from './historyOps';
import { useEditor } from '../store/editor';
import { emitGuides } from './canvasEvents';

/** Drop the selection summary + clear any smart-guide overlays. Wired to
 *  Fabric's `selection:cleared` event in `initCanvas`. Companion to
 *  `updateSelection` so the empty + populated paths live next to each other
 *  rather than being inlined as an arrow in the engine. */
export function clearSelection(): void {
  useEditor.getState().setSelectionIds([]);
  useEditor.getState().setSelectionSummary(null);
  emitGuides([]);
}

/** Push the active selection's summary into the editor store. */
export function updateSelection(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  useEditor.getState().setSelectionIds(objs.map(o => (o as { _id?: string })._id ?? ''));
  if (!objs.length) return;
  const active = canvas.getActiveObject()!;
  useEditor.getState().setSelectionSummary({
    count: objs.length,
    left: Math.round(active.left ?? 0),
    top: Math.round(active.top ?? 0),
    width: Math.round((active.width ?? 0) * (active.scaleX ?? 1)),
    height: Math.round((active.height ?? 0) * (active.scaleY ?? 1)),
    angle: Math.round(active.angle ?? 0),
    fill: (active.fill as string) ?? '',
    stroke: (active.stroke as string) ?? '',
    strokeWidth: active.strokeWidth ?? 0,
    opacity: active.opacity ?? 1,
    type: active.type ?? '',
  });
}

/** Apply a fill / stroke / stroke-width / opacity patch to every object in
 *  the active selection, then push history and refresh the summary. */
export function applyStyleToSelection(
  patch: Partial<{ fill: string; stroke: string; strokeWidth: number; opacity: number }>,
): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  objs.forEach(o => {
    o.set(patch);
    o.setCoords();
  });
  canvas.requestRenderAll();
  pushHistory();
  updateSelection();
}

/** Apply a position / size / angle patch to the active object. Width and
 *  height are converted to scaleX/scaleY against the object's base dims so
 *  Fabric's transform stays consistent. */
export function applyTransformToSelection(
  patch: Partial<{ left: number; top: number; width: number; height: number; angle: number }>,
): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const o = canvas.getActiveObject();
  if (!o) return;
  if (patch.width != null && o.width) o.scaleX = patch.width / o.width;
  if (patch.height != null && o.height) o.scaleY = patch.height / o.height;
  const rest: Record<string, number> = {};
  if (patch.left != null) rest.left = patch.left;
  if (patch.top != null) rest.top = patch.top;
  if (patch.angle != null) rest.angle = patch.angle;
  o.set(rest);
  o.setCoords();
  canvas.requestRenderAll();
  pushHistory();
  updateSelection();
}
