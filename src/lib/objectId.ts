/**
 * Stable object id assignment.
 *
 * Fabric.js doesn't ship a per-object id by default — its identity model is
 * "the same JS reference". That falls apart the moment we serialise and
 * round-trip via `loadFromJSON` (history undo/redo, project save/open),
 * because every restore produces fresh Fabric instances and any UI state
 * keyed on object identity (LayersPanel rows, selection summaries, AI
 * skill bindings) breaks.
 *
 * `assignObjectId(o)` stamps a string id `o1` / `o2` / … the first time
 * we see an object. The counter is module-level so the sequence stays
 * monotonic across the session, which is enough for our consumers — none
 * of them need cross-session stable ids today.
 *
 * Wired from canvasEngine.ts's `object:added` handler. Extracted as part
 * of task #20 so the engine module stops carrying its own scratch state.
 */
import type * as fabric from 'fabric';

let nextObjectId = 1;

/** Stamp an `_id` on the object if it doesn't already have one. */
export function assignObjectId(o: fabric.FabricObject): void {
  if (!(o as { _id?: string })._id) {
    (o as { _id?: string })._id = `o${nextObjectId++}`;
  }
}
