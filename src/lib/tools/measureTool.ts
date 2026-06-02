/**
 * Measure tool — click-drag to read distance + angle between two points, like
 * Illustrator's Measure tool / SignMaster's dimension readout. The live
 * segment lives in the editor store (`measure`, scene coords) and is drawn by
 * MeasureLayer; the numeric readout is shown on the segment + in the overlay.
 * Nothing is added to the document — measuring never mutates the artwork.
 */
import * as fabric from 'fabric';
import { useEditor } from '../../store/editor';
import { getCanvas, pushHistory } from '../canvasEngine';
import { arrowTriangle } from '../arrowheads';

const MM_TO_PX = 3.7795;

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

/**
 * Commit the live measurement as a persistent dimension annotation — a grouped
 * line + mm label dropped on the canvas (selectable, exportable), so a shop
 * drawing keeps its measurements. Clears the live segment. Returns false when
 * there's nothing to commit.
 */
export function commitDimension(): boolean {
  const m = useEditor.getState().measure;
  const canvas = getCanvas();
  if (!m || !canvas) return false;
  const distMm = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) / MM_TO_PX;
  if (distMm < 0.1) return false;

  const line = new fabric.Line([m.x1, m.y1, m.x2, m.y2], { stroke: '#22d3ee', strokeWidth: 1 });
  // Arrowheads at both ends so it reads as a proper dimension line.
  const dir: [number, number] = [m.x2 - m.x1, m.y2 - m.y1];
  const mkHead = (tri: [number, number][]) =>
    new fabric.Polygon(tri.map(([x, y]) => ({ x, y })), { fill: '#22d3ee', stroke: '', strokeWidth: 0 });
  const headEnd = mkHead(arrowTriangle([m.x2, m.y2], dir, 10, 7));
  const headStart = mkHead(arrowTriangle([m.x1, m.y1], [-dir[0], -dir[1]], 10, 7));
  const label = new fabric.Text(`${distMm.toFixed(1)} mm`, {
    left: (m.x1 + m.x2) / 2, top: (m.y1 + m.y2) / 2 - 12,
    originX: 'center', originY: 'center',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12,
    fill: '#22d3ee', backgroundColor: 'rgba(11,18,32,0.85)',
  });
  const group = new fabric.Group([line, headStart, headEnd, label]);
  canvas.add(group);
  canvas.setActiveObject(group);
  useEditor.getState().setMeasure(null);
  dragging = false;
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
