/**
 * Group / ungroup operations on the active selection.
 *
 * Two small operations that compose the "make these N objects act as one"
 * primitive every vector editor needs. Pulled out of canvasEngine.ts as part
 * of the task #20 split — both functions are self-contained Fabric API calls
 * on the current selection, no tool state, no mouse handling.
 *
 * Note: neither call `pushHistory()` today (same as the pre-extraction
 * behaviour). The canvas's `object:added` / `object:removed` event handlers
 * inside `initCanvas` push history entries for us when objects move in/out
 * of the canvas root, so an explicit push would double-count. Documented
 * here so a future refactor doesn't add one back inadvertently.
 */

import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';

type FabricObject = fabric.FabricObject;

/** Group the currently-active multi-selection into a single Fabric.Group.
 *  No-op unless the active object is an ActiveSelection (i.e. 2+ items). */
export function groupSelection(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const active = canvas.getActiveObject();
  if (!active || active.type !== 'activeselection') return;
  const sel = active as fabric.ActiveSelection;
  const group = new fabric.Group(sel.removeAll() as FabricObject[]);
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
}

/** Ungroup the currently-active Fabric.Group back into a multi-selection.
 *  No-op unless the active object is a Group. */
export function ungroupSelection(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const active = canvas.getActiveObject();
  if (!active || active.type !== 'group') return;
  const g = active as fabric.Group;
  const items = g.removeAll() as FabricObject[];
  items.forEach(o => canvas.add(o));
  canvas.remove(g);
  const sel = new fabric.ActiveSelection(items, { canvas });
  canvas.setActiveObject(sel);
  canvas.requestRenderAll();
}
