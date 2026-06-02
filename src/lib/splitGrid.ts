/**
 * Split Into Grid (Illustrator Object→Path→Split Into Grid) — divide a selected
 * object's bounding box into a rows×cols grid of rectangles with an optional
 * gutter, tiling the original bounds. Handy for label sheets / panel layouts.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { useEditor } from '../store/editor';

const MM_TO_PX = 3.7795;

export interface Box { left: number; top: number; width: number; height: number; }

/** Pure layout: split `box` into rows×cols cells separated by `gutter` (px). */
export function gridCells(box: Box, rows: number, cols: number, gutter: number): Box[] {
  const r = Math.max(1, Math.round(rows));
  const c = Math.max(1, Math.round(cols));
  const g = Math.max(0, gutter);
  const cellW = (box.width - (c - 1) * g) / c;
  const cellH = (box.height - (r - 1) * g) / r;
  if (cellW <= 0 || cellH <= 0) return [];
  const out: Box[] = [];
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      out.push({
        left: box.left + j * (cellW + g),
        top: box.top + i * (cellH + g),
        width: cellW,
        height: cellH,
      });
    }
  }
  return out;
}

/** True when exactly one object is selected to split. */
export function canSplitGrid(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().length === 1;
}

/** Replace the active object with a rows×cols grid of rectangles. Returns the
 *  number of cells created. */
export function splitIntoGrid(rows: number, cols: number, gutterMm: number): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const obj = canvas.getActiveObject();
  if (!obj || canvas.getActiveObjects().length !== 1) return 0;

  const b = obj.getBoundingRect();
  const cells = gridCells({ left: b.left, top: b.top, width: b.width, height: b.height }, rows, cols, gutterMm * MM_TO_PX);
  if (cells.length === 0) return 0;

  const style = useEditor.getState().style;
  const fill = (typeof obj.fill === 'string' && obj.fill) ? obj.fill : (style.fill ?? '');
  const stroke = (typeof obj.stroke === 'string' && obj.stroke) ? obj.stroke : (style.stroke ?? '#0f0f12');
  const strokeWidth = obj.strokeWidth ?? 1;

  canvas.remove(obj);
  canvas.discardActiveObject();
  const rects = cells.map((c) => new fabric.Rect({ left: c.left, top: c.top, width: c.width, height: c.height, fill, stroke, strokeWidth }));
  rects.forEach((r) => canvas.add(r));
  canvas.setActiveObject(new fabric.ActiveSelection(rects, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return rects.length;
}
