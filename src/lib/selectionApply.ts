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

import type * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { pushHistory } from './historyOps';
import { useEditor } from '../store/editor';
import { emitGuides } from './canvasEvents';

/** Walk an object and any nested group children. */
function* walkObjects(obj: fabric.FabricObject): Generator<fabric.FabricObject> {
  yield obj;
  const kids = (obj as unknown as { _objects?: fabric.FabricObject[] })._objects;
  if (kids) for (const k of kids) yield* walkObjects(k);
}

/** Normalise a paint value for map keys — lowercase, so '#AABBCC' === '#aabbcc'. */
const norm = (c: string) => c.trim().toLowerCase();

/**
 * Distinct solid fill + stroke colours used anywhere in the active selection
 * (recursing into groups). Gradients / patterns / transparent are skipped —
 * Recolor only remaps flat colours. Returns normalised (lowercase) strings.
 */
export function collectSelectionColors(): string[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  const set = new Set<string>();
  for (const top of canvas.getActiveObjects()) {
    for (const o of walkObjects(top)) {
      if (typeof o.fill === 'string' && o.fill && o.fill !== 'transparent') set.add(norm(o.fill));
      if (typeof o.stroke === 'string' && o.stroke && o.stroke !== 'transparent') set.add(norm(o.stroke));
    }
  }
  return [...set];
}

/**
 * Remap every solid fill/stroke in the selection through `map` (source colour →
 * target colour, both lowercase hex/rgb). Returns the number of paints changed.
 */
export function recolorSelection(map: Record<string, string>): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const top of canvas.getActiveObjects()) {
    for (const o of walkObjects(top)) {
      if (typeof o.fill === 'string') { const t = map[norm(o.fill)]; if (t && norm(t) !== norm(o.fill)) { o.set('fill', t); changed++; } }
      if (typeof o.stroke === 'string') { const t = map[norm(o.stroke)]; if (t && norm(t) !== norm(o.stroke)) { o.set('stroke', t); changed++; } }
    }
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

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

/**
 * Swap fill and stroke colours on the selection (Illustrator Shift+X). Only
 * flat string colours swap; if an object had no visible stroke, its width is
 * bumped to 1 so the swapped-in colour shows. Returns the count changed.
 */
export function swapFillStroke(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  let n = 0;
  for (const o of objs) {
    const f = typeof o.fill === 'string' ? o.fill : '';
    const s = typeof o.stroke === 'string' ? o.stroke : '';
    o.set({ fill: s, stroke: f });
    if ((o.strokeWidth ?? 0) === 0 && f) o.set({ strokeWidth: 1 });
    o.setCoords();
    n++;
  }
  if (n > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return n;
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
