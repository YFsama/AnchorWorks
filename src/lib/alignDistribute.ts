/**
 * Align + distribute operations on the active selection.
 *
 * Both work on the bounding rects of the currently selected objects:
 *  - alignSelection(axis)  — snap edges/centres to the union extent (2+ objs)
 *  - distributeSelection() — equalise gaps between consecutive shapes (3+ objs)
 *
 * Pure operations on Fabric's active-selection rects — no tool state, no
 * mouse handling, no DOM. Extracted out of canvasEngine.ts (task #20) so
 * the tool-dispatch core can shrink further.
 *
 * Re-exported from canvasEngine for back-compat: AlignPanel and App.tsx
 * keep importing from `./canvasEngine` without change.
 */

import { getCanvas, pushHistory } from './canvasEngine';
import { useEditor } from '../store/editor';

export type AlignAxis = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom';
export type DistributeDir = 'horizontal' | 'vertical';
/** What the alignment snaps to — the selection's own bounds, or the artboard. */
export type AlignRef = 'selection' | 'artboard';

/**
 * Align the active selection along the given axis. `ref` chooses the reference
 * frame (Illustrator's "Align To"):
 *   - 'selection' — the union bounds of the selected objects (needs 2+).
 *   - 'artboard'  — the first artboard's rect (works on a single object too).
 */
export function alignSelection(axis: AlignAxis, ref: AlignRef = 'selection'): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (objs.length === 0) return;

  let refLeft: number, refRight: number, refTop: number, refBottom: number;
  if (ref === 'artboard') {
    const abs = useEditor.getState().artboards;
    if (abs.length === 0) return;
    const a = abs[0];
    refLeft = a.x; refRight = a.x + a.width; refTop = a.y; refBottom = a.y + a.height;
  } else {
    if (objs.length < 2) return;
    const b = objs.map(o => o.getBoundingRect());
    refLeft = Math.min(...b.map(r => r.left));
    refRight = Math.max(...b.map(r => r.left + r.width));
    refTop = Math.min(...b.map(r => r.top));
    refBottom = Math.max(...b.map(r => r.top + r.height));
  }

  objs.forEach((o) => {
    const b = o.getBoundingRect();
    let dx = 0, dy = 0;
    if (axis === 'left') dx = refLeft - b.left;
    else if (axis === 'right') dx = refRight - (b.left + b.width);
    else if (axis === 'centerH') dx = (refLeft + refRight) / 2 - (b.left + b.width / 2);
    else if (axis === 'top') dy = refTop - b.top;
    else if (axis === 'bottom') dy = refBottom - (b.top + b.height);
    else if (axis === 'centerV') dy = (refTop + refBottom) / 2 - (b.top + b.height / 2);
    o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
    o.setCoords();
  });
  canvas.requestRenderAll();
  pushHistory();
}

/**
 * Distribute the active selection so the gaps between consecutive objects
 * (along the given axis) are equal. Requires 3+ objects.
 *
 * "horizontal" distributes left→right, "vertical" distributes top→bottom.
 */
export function distributeSelection(dir: DistributeDir): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (objs.length < 3) return;
  const rects = objs.map(o => ({ obj: o, rect: o.getBoundingRect() }));
  if (dir === 'horizontal') {
    rects.sort((a, b) => a.rect.left - b.rect.left);
    const first = rects[0].rect;
    const last = rects[rects.length - 1].rect;
    const totalSpan = (last.left + last.width) - first.left;
    const totalWidth = rects.reduce((s, r) => s + r.rect.width, 0);
    const gap = (totalSpan - totalWidth) / (rects.length - 1);
    let cursor = first.left;
    rects.forEach((r, i) => {
      if (i === 0 || i === rects.length - 1) { cursor = r.rect.left + r.rect.width + gap; return; }
      const dx = cursor - r.rect.left;
      r.obj.set({ left: (r.obj.left ?? 0) + dx });
      r.obj.setCoords();
      cursor += r.rect.width + gap;
    });
  } else {
    rects.sort((a, b) => a.rect.top - b.rect.top);
    const first = rects[0].rect;
    const last = rects[rects.length - 1].rect;
    const totalSpan = (last.top + last.height) - first.top;
    const totalHeight = rects.reduce((s, r) => s + r.rect.height, 0);
    const gap = (totalSpan - totalHeight) / (rects.length - 1);
    let cursor = first.top;
    rects.forEach((r, i) => {
      if (i === 0 || i === rects.length - 1) { cursor = r.rect.top + r.rect.height + gap; return; }
      const dy = cursor - r.rect.top;
      r.obj.set({ top: (r.obj.top ?? 0) + dy });
      r.obj.setCoords();
      cursor += r.rect.height + gap;
    });
  }
  canvas.requestRenderAll();
  pushHistory();
}
