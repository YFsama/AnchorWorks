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

export interface SplitGridObjectOptions {
  rows: number;
  cols: number;
  gutterMm: number;
}

export function splitObjectIntoGrid(canvas: fabric.Canvas, object: fabric.FabricObject, options: SplitGridObjectOptions): fabric.Rect[] {
  const bounds = object.getBoundingRect();
  const cells = gridCells({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }, options.rows, options.cols, options.gutterMm * MM_TO_PX);
  if (cells.length === 0) return [];

  const style = useEditor.getState().style;
  const fill = (typeof object.fill === 'string' && object.fill) ? object.fill : (style.fill ?? '');
  const stroke = (typeof object.stroke === 'string' && object.stroke) ? object.stroke : (style.stroke ?? '#0f0f12');
  const strokeWidth = object.strokeWidth ?? 1;

  canvas.remove(object);
  const rects = cells.map((cell) => new fabric.Rect({ left: cell.left, top: cell.top, width: cell.width, height: cell.height, fill, stroke, strokeWidth }));
  rects.forEach((rect) => canvas.add(rect));
  return rects;
}

/** Replace the active object with a rows×cols grid of rectangles. Returns the
 *  number of cells created. */
export function splitIntoGrid(rows: number, cols: number, gutterMm: number): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const obj = canvas.getActiveObject();
  if (!obj || canvas.getActiveObjects().length !== 1) return 0;

  const rects = splitObjectIntoGrid(canvas as fabric.Canvas, obj, { rows, cols, gutterMm });
  if (rects.length === 0) return 0;

  canvas.discardActiveObject();
  canvas.setActiveObject(new fabric.ActiveSelection(rects, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return rects.length;
}
