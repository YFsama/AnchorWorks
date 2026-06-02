/**
 * Add Anchor Points (Illustrator Object→Path→Add Anchor Points) — insert a new
 * anchor at the midpoint of every segment of each selected path, doubling its
 * editable points without changing the shape (curves are split faithfully).
 */
import type * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { subdivideAllSegments } from './pathEdit';

/** True when the selection has at least one editable path. */
export function canAddAnchors(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some(o => o.type === 'path');
}

/** Subdivide every selected path. Returns the number of paths affected. */
export function addAnchorsToSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const paths = canvas.getActiveObjects().filter(o => o.type === 'path') as fabric.Path[];
  if (paths.length === 0) return 0;

  let count = 0;
  for (const p of paths) {
    if (subdivideAllSegments(p) > 0) { p.setCoords(); count++; }
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
