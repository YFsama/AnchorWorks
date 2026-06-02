/**
 * Measure tool — click-drag to read distance + angle between two points, like
 * Illustrator's Measure tool / SignMaster's dimension readout. The live
 * segment lives in the editor store (`measure`, scene coords) and is drawn by
 * MeasureLayer; the numeric readout is shown on the segment + in the overlay.
 * Nothing is added to the document — measuring never mutates the artwork.
 */
import { useEditor } from '../../store/editor';

let dragging = false;
let startX = 0;
let startY = 0;

export function measureBegin(x: number, y: number): void {
  dragging = true;
  startX = x; startY = y;
  useEditor.getState().setMeasure({ x1: x, y1: y, x2: x, y2: y });
}

export function measureUpdate(x: number, y: number): void {
  if (!dragging) return;
  useEditor.getState().setMeasure({ x1: startX, y1: startY, x2: x, y2: y });
}

export function measureEnd(): void {
  dragging = false; // keep the last segment visible until the tool changes
}

/** Tool deactivation — drop the segment so it doesn't linger under other tools. */
export function measureClear(): void {
  dragging = false;
  useEditor.getState().setMeasure(null);
}
