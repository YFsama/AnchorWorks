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

/**
 * Recursively ungroup every group (and nested group) in the selection down to
 * leaf objects — flattening before cutting / boolean ops. Returns the number of
 * groups broken.
 */
export function ungroupAll(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects().slice();
  if (objs.length === 0) return 0;
  canvas.discardActiveObject(); // groups back to absolute coords before breaking

  let broken = 0;
  const leaves: FabricObject[] = [];
  const queue = [...objs];
  while (queue.length) {
    const o = queue.shift() as FabricObject;
    if (o.type === 'group') {
      const kids = (o as fabric.Group).removeAll() as FabricObject[];
      canvas.remove(o);
      kids.forEach((k) => canvas.add(k));
      queue.push(...kids);
      broken++;
    } else {
      leaves.push(o);
    }
  }
  if (broken === 0) { canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas })); return 0; }
  canvas.setActiveObject(leaves.length === 1 ? leaves[0] : new fabric.ActiveSelection(leaves, { canvas }));
  canvas.requestRenderAll();
  return broken;
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
