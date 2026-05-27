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

export type AlignAxis = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom';
export type DistributeDir = 'horizontal' | 'vertical';

/**
 * Align the active selection along the given axis. Requires 2+ objects.
 * Uses each object's bounding rect against the union bounds of the selection.
 */
export function alignSelection(axis: AlignAxis): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (objs.length < 2) return;
  const bounds = objs.map(o => o.getBoundingRect());
  const minLeft = Math.min(...bounds.map(b => b.left));
  const maxRight = Math.max(...bounds.map(b => b.left + b.width));
  const minTop = Math.min(...bounds.map(b => b.top));
  const maxBottom = Math.max(...bounds.map(b => b.top + b.height));
  objs.forEach((o, i) => {
    const b = bounds[i];
    let dx = 0, dy = 0;
    if (axis === 'left') dx = minLeft - b.left;
    else if (axis === 'right') dx = maxRight - (b.left + b.width);
    else if (axis === 'centerH') dx = (minLeft + maxRight) / 2 - (b.left + b.width / 2);
    else if (axis === 'top') dy = minTop - b.top;
    else if (axis === 'bottom') dy = maxBottom - (b.top + b.height);
    else if (axis === 'centerV') dy = (minTop + maxBottom) / 2 - (b.top + b.height / 2);
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
