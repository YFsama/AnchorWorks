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

const MM_TO_PX = 3.7795; // 96dpi

/**
 * Auto-arrange (nest) the selection into rows within the material width,
 * minimising wasted material — SignMaster's Nesting / a shelf bin-pack. Objects
 * are sorted tallest-first and laid left→right; a new row starts when the next
 * object would overflow the width. The material width is the first artboard's
 * width (else the document width); origin is the artboard's top-left. Requires
 * 2+ objects. Returns the number arranged.
 */
export function autoArrangeSelection(gapMm = 5): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  if (objs.length < 2) return 0;
  const gap = Math.max(0, gapMm) * MM_TO_PX;

  const ab = useEditor.getState().artboards[0];
  const doc = useEditor.getState().doc;
  const maxWidth = ab ? ab.width : (doc.width || 800);

  const items = objs.map(o => ({ o, r: o.getBoundingRect() }));
  const startX = ab ? ab.x : Math.min(...items.map(i => i.r.left));
  const startY = ab ? ab.y : Math.min(...items.map(i => i.r.top));
  items.sort((a, b) => b.r.height - a.r.height); // tallest first

  let cx = startX, cy = startY, rowH = 0;
  for (const { o, r } of items) {
    // Wrap to a new row when this item would overflow the width (but never on
    // an empty row, or a single item wider than the material just overhangs).
    if (cx > startX && cx + r.width > startX + maxWidth) {
      cx = startX; cy += rowH + gap; rowH = 0;
    }
    o.set({ left: (o.left ?? 0) + (cx - r.left), top: (o.top ?? 0) + (cy - r.top) });
    o.setCoords();
    cx += r.width + gap;
    rowH = Math.max(rowH, r.height);
  }
  canvas.requestRenderAll();
  pushHistory();
  return objs.length;
}

/**
 * Distribute the selection with an EXACT gap (mm) between consecutive objects,
 * keeping the first object fixed (Illustrator's Align→Distribute Spacing with a
 * value). Great for laying out stickers / labels a precise distance apart for
 * cutting. Requires 2+ objects.
 */
export function distributeSpacing(dir: DistributeDir, gapMm: number): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (objs.length < 2) return;
  const gap = Math.max(0, gapMm) * MM_TO_PX;
  const rects = objs.map(o => ({ obj: o, rect: o.getBoundingRect() }));

  if (dir === 'horizontal') {
    rects.sort((a, b) => a.rect.left - b.rect.left);
    let cursor = rects[0].rect.left + rects[0].rect.width + gap;
    for (let i = 1; i < rects.length; i++) {
      const r = rects[i];
      r.obj.set({ left: (r.obj.left ?? 0) + (cursor - r.rect.left) });
      r.obj.setCoords();
      cursor += r.rect.width + gap;
    }
  } else {
    rects.sort((a, b) => a.rect.top - b.rect.top);
    let cursor = rects[0].rect.top + rects[0].rect.height + gap;
    for (let i = 1; i < rects.length; i++) {
      const r = rects[i];
      r.obj.set({ top: (r.obj.top ?? 0) + (cursor - r.rect.top) });
      r.obj.setCoords();
      cursor += r.rect.height + gap;
    }
  }
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
