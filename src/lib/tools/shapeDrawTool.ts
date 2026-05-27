/**
 * Rect / Ellipse / Line shape-draw tool state machine.
 *
 * Drag-to-draw flow shared by the three primitive tools: click+drag creates
 * a new shape at the click point, drag updates its size, release commits and
 * pushes one undo entry. Same shape as eraserTool / penPolyTool — module
 * owns its private state, engine drives it via three lifecycle entry points
 * plus a predicate.
 *
 * History bundling: drawing is multi-event (mousedown adds the shape →
 * object:added fires → mousemove resizes it → mousedown's `history.suspend()`
 * prevents each step from pushing its own undo entry → mouseup resumes and
 * does one explicit pushHistory). Same pattern as eraserTool.
 */

import * as fabric from 'fabric';
import { getCanvas, getHistory } from '../canvasEngine';
import { pushHistory } from '../historyOps';
import { getDrawStyle } from '../drawStyle';
import { maybeSnap } from '../snap';
import { useEditor } from '../../store/editor';

type FabricObject = fabric.FabricObject;
type ShapeTool = 'rect' | 'ellipse' | 'line';

let isDrawing = false;
let drawStart: { x: number; y: number } | null = null;
let drawTarget: FabricObject | null = null;
let drawingTool: ShapeTool | null = null;

/** True iff a shape-draw drag is currently in progress. */
export function isShapeDrawActive(): boolean { return isDrawing && drawTarget != null; }

/** mousedown — start a new shape at `sp` (snapped to grid if enabled),
 *  add it to the canvas, suspend history so the resize drags don't push
 *  per-frame undo entries. */
export function shapeDrawBegin(tool: ShapeTool, sp: { x: number; y: number }): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const start = maybeSnap(sp);
  isDrawing = true;
  drawStart = start;
  drawingTool = tool;
  const s = getDrawStyle();
  if (tool === 'rect') {
    drawTarget = new fabric.Rect({ left: start.x, top: start.y, width: 1, height: 1, ...s });
  } else if (tool === 'ellipse') {
    drawTarget = new fabric.Ellipse({ left: start.x, top: start.y, rx: 1, ry: 1, ...s });
  } else {
    drawTarget = new fabric.Line([start.x, start.y, start.x, start.y], {
      stroke: s.stroke || '#000',
      strokeWidth: s.strokeWidth || 1,
      fill: '',
    });
  }
  getHistory()?.suspend();
  canvas.add(drawTarget);
}

/** mousemove — resize the in-progress shape to span from `drawStart` to
 *  `sp` (snapped). Per-frame mutation; one render request at the end. */
export function shapeDrawUpdate(sp: { x: number; y: number }): void {
  const canvas = getCanvas();
  if (!canvas || !isDrawing || !drawTarget || !drawStart || !drawingTool) return;
  const dp = maybeSnap(sp);
  if (drawingTool === 'rect') {
    const r = drawTarget as fabric.Rect;
    r.set({
      left: Math.min(dp.x, drawStart.x),
      top: Math.min(dp.y, drawStart.y),
      width: Math.abs(dp.x - drawStart.x),
      height: Math.abs(dp.y - drawStart.y),
    });
  } else if (drawingTool === 'ellipse') {
    const e = drawTarget as fabric.Ellipse;
    const rx = Math.abs(dp.x - drawStart.x) / 2;
    const ry = Math.abs(dp.y - drawStart.y) / 2;
    e.set({
      left: Math.min(dp.x, drawStart.x),
      top: Math.min(dp.y, drawStart.y),
      rx, ry,
      width: rx * 2,
      height: ry * 2,
    });
  } else {
    const l = drawTarget as fabric.Line;
    l.set({ x2: dp.x, y2: dp.y });
  }
  drawTarget.setCoords();
  canvas.requestRenderAll();
}

/** mouseup — commit, resume history, push one undo entry, select the new
 *  shape, switch to select tool. */
export function shapeDrawEnd(): void {
  const canvas = getCanvas();
  if (!canvas || !isDrawing || !drawTarget) return;
  isDrawing = false;
  drawStart = null;
  drawingTool = null;
  getHistory()?.resume();
  pushHistory();
  canvas.setActiveObject(drawTarget);
  drawTarget = null;
  useEditor.getState().setTool('select');
}
