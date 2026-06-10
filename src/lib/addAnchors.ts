/**
 * Add Anchor Points (Illustrator Object→Path→Add Anchor Points) — insert a new
 * anchor at the midpoint of every segment of each selected path, doubling its
 * editable points without changing the shape (curves are split faithfully).
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { subdivideAllSegments } from './pathEdit';

export function canAddAnchorsToObject(object: fabric.FabricObject): object is fabric.Path {
  return object.type === 'path';
}

export function addAnchorsToObject(object: fabric.FabricObject): boolean {
  if (!canAddAnchorsToObject(object)) return false;
  const changed = subdivideAllSegments(object) > 0;
  if (changed) object.setCoords();
  return changed;
}

/** True when the selection has at least one editable path. */
export function canAddAnchors(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(canAddAnchorsToObject);
}

/** Subdivide every selected path. Returns the number of paths affected. */
export function addAnchorsToSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const paths = canvas.getActiveObjects().filter(canAddAnchorsToObject);
  if (paths.length === 0) return 0;

  let count = 0;
  for (const path of paths) {
    if (addAnchorsToObject(path)) count++;
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
