/**
 * Tool registry population.
 *
 * Registers every ToolId as a `ToolHandler` descriptor in the registry from
 * `./types`. First slice of #18's migration plan: descriptor-only — no
 * engine code reads from the registry yet, so this is purely additive (same
 * pattern as `formatRegistration.ts` for the format registry).
 *
 * Once the engine's setTool / mouse-handlers migrate to consult the
 * registry, these descriptors become the single source of truth for cursor
 * / selectable / skipTargetFind / per-tool lifecycle hooks. Today they
 * mirror the engine's switch-case so the migration can happen one tool at
 * a time without changing observable behaviour.
 */

import * as fabric from 'fabric';
import { registerTool } from './types';
import {
  handlePolyClick,
  handlePenMouseDown,
  handlePenMouseMove,
  handlePenMouseUp,
  finishPolyIfAny,
  hasInProgressShape,
  updatePreview,
} from './penPolyTool';
import {
  isEraserActive,
  eraserBegin,
  eraserStroke,
  eraserEnd,
} from './eraserTool';
import {
  isShapeDrawActive,
  shapeDrawBegin,
  shapeDrawUpdate,
  shapeDrawEnd,
} from './shapeDrawTool';
import { useEditor } from '../../store/editor';
import { zoomToPoint } from '../viewport';
import { enterPathEdit, exitPathEdit } from '../pathEdit';
import { PressureBrush } from '../pressureBrush';
import { panBegin } from '../panSession';
import {
  MousePointer2, Square, Circle, Slash, Pentagon, PenTool, Pencil, Eraser, Type, Hand, ZoomIn,
} from 'lucide-react';

let initialized = false;

/** Called once at app boot. Idempotent — safe to call multiple times. */
export function registerBuiltInTools(): void {
  if (initialized) return;
  initialized = true;

  // Pointer / selection — engine-driven (Fabric's built-in selection).
  registerTool({
    id: 'select',
    label: 'Select',
    icon: MousePointer2,
    shortcut: 'V',
    cursor: 'default',
    selectable: true,
    pickable: true,
  });
  registerTool({
    id: 'directSelect',
    label: 'Direct Select',
    cursor: 'crosshair',
    // canvas.selection = false: drag-box-select is disabled in direct-select
    // mode (the user is editing anchor points, not selecting whole objects).
    // Per-object `pickable` stays true so clicking a path can enter the
    // anchor-edit overlay.
    selectable: false,
    pickable: true,
    // Click a path → enter the anchor-edit overlay; click empty space →
    // exit. The Fabric event surfaces the hit target via `raw.target`.
    onMouseDown: (ctx) => {
      const target = (ctx.raw as { target?: fabric.FabricObject }).target;
      if (target && target.type === 'path') {
        enterPathEdit(ctx.canvas, target as fabric.Path);
      } else if (!target) {
        exitPathEdit(ctx.canvas);
      }
    },
    // Leaving direct-select tears down the anchor-edit overlay so the path
    // doesn't keep its blue handles painted on the canvas under, say, the
    // Pen tool. Engine dispatches this via the prevTool's onDeactivate hook.
    onDeactivate: (canvas) => exitPathEdit(canvas),
  });

  // Primitive shapes — drag-to-draw via shapeDrawTool.
  registerTool({
    id: 'rect',
    label: 'Rectangle',
    icon: Square,
    shortcut: 'R',
    cursor: 'crosshair',
    onMouseDown: (ctx) => shapeDrawBegin('rect', ctx.sp),
    onMouseMove: (ctx) => { if (isShapeDrawActive()) shapeDrawUpdate(ctx.sp); },
    onMouseUp: () => { if (isShapeDrawActive()) shapeDrawEnd(); },
  });
  registerTool({
    id: 'ellipse',
    label: 'Ellipse',
    icon: Circle,
    shortcut: 'E',
    cursor: 'crosshair',
    onMouseDown: (ctx) => shapeDrawBegin('ellipse', ctx.sp),
    onMouseMove: (ctx) => { if (isShapeDrawActive()) shapeDrawUpdate(ctx.sp); },
    onMouseUp: () => { if (isShapeDrawActive()) shapeDrawEnd(); },
  });
  registerTool({
    id: 'line',
    label: 'Line',
    icon: Slash,
    shortcut: 'L',
    cursor: 'crosshair',
    onMouseDown: (ctx) => shapeDrawBegin('line', ctx.sp),
    onMouseMove: (ctx) => { if (isShapeDrawActive()) shapeDrawUpdate(ctx.sp); },
    onMouseUp: () => { if (isShapeDrawActive()) shapeDrawEnd(); },
  });
  registerTool({
    id: 'polygon',
    label: 'Polygon',
    icon: Pentagon,
    shortcut: 'G',
    cursor: 'crosshair',
    onDeactivate: () => finishPolyIfAny(),
    onMouseDown: (ctx) => handlePolyClick(ctx.sp),
    onMouseMove: (ctx) => { if (hasInProgressShape('polygon')) updatePreview(ctx.sp, 'polygon'); },
  });

  // Path / drawing — pen via penPolyTool, pencil via Fabric's drawing-mode
  // (no per-tool callbacks needed), eraser via eraserTool.
  registerTool({
    id: 'pen',
    label: 'Pen',
    icon: PenTool,
    shortcut: 'P',
    cursor: 'crosshair',
    onDeactivate: () => finishPolyIfAny(),
    // Bezier authoring — mouse-down places an anchor (or closes the path);
    // dragging on the same press shapes the outgoing tangent handle so the
    // anchor becomes smooth. Shift-click still commits the current path.
    onMouseDown: (ctx) => handlePenMouseDown(ctx.sp, !!ctx.raw.e.shiftKey),
    onMouseMove: (ctx) => {
      // Always re-render the preview while drawing — the bezier-preview
      // path needs continuous updates, not just when there's a "shape in
      // progress" sentinel.
      if (hasInProgressShape('pen')) handlePenMouseMove(ctx.sp);
    },
    onMouseUp: () => handlePenMouseUp(),
  });
  registerTool({
    id: 'pencil',
    label: 'Pencil',
    icon: Pencil,
    shortcut: 'B',
    // The pencil uses Fabric's freeDrawingBrush which has its own cursor;
    // omit `cursor` so the engine's flip to `isDrawingMode = true` controls
    // the UI feedback.
    // Brush wire-up runs on activate so the engine no longer needs a
    // tool-specific branch in setTool. We pick the pressure-aware brush when
    // the device can plausibly deliver pen events; otherwise fall back to
    // Fabric's stock PencilBrush (cheaper, identical output for mouse input).
    onActivate: (canvas) => {
      canvas.isDrawingMode = true;
      const style = useEditor.getState().style;
      const hasPenSupport = typeof window !== 'undefined' && 'PointerEvent' in window && navigator.maxTouchPoints > 0;
      if (hasPenSupport) {
        const pb = new PressureBrush(canvas);
        pb.color = style.stroke;
        pb.baseWidth = Math.max(1, style.strokeWidth) * 3;
        canvas.freeDrawingBrush = pb;
      } else {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = style.stroke;
        canvas.freeDrawingBrush.width = Math.max(1, style.strokeWidth);
      }
    },
  });
  registerTool({
    id: 'eraser',
    label: 'Eraser',
    icon: Eraser,
    keywords: 'rub remove',
    shortcut: 'X',
    cursor: 'none',
    skipTargetFind: true,
    onMouseDown: (ctx) => eraserBegin(ctx.sp),
    onMouseMove: (ctx) => { if (isEraserActive()) eraserStroke(ctx.sp); },
    onMouseUp: () => { if (isEraserActive()) eraserEnd(); },
  });

  // Text + viewport.
  registerTool({
    id: 'text',
    label: 'Text',
    icon: Type,
    shortcut: 'T',
    cursor: 'text',
    // Click anywhere in the canvas to drop a new IText at the click point,
    // enter editing mode, select-all the placeholder so a quick keypress
    // replaces it, and flip back to the select tool so the next click
    // doesn't drop another text.
    onMouseDown: (ctx) => {
      const style = useEditor.getState().style;
      const it = new fabric.IText('Text', {
        left: ctx.sp.x,
        top: ctx.sp.y,
        fill: style.fill,
        fontFamily: 'Inter, sans-serif',
        fontSize: 32,
      });
      ctx.canvas.add(it);
      ctx.canvas.setActiveObject(it);
      it.enterEditing();
      it.selectAll();
      useEditor.getState().setTool('select');
    },
  });
  registerTool({
    id: 'hand',
    label: 'Hand',
    icon: Hand,
    keywords: 'pan',
    shortcut: 'H',
    cursor: 'grab',
    skipTargetFind: true,
    // Left-click pan flows through the registry. Middle-click pan still
    // has its own engine intercept (canvasEngine.onMouseDown) because that
    // path needs to trigger regardless of which tool is currently active.
    onMouseDown: (ctx) => panBegin(ctx.vp, ctx.canvas),
  });
  registerTool({
    id: 'zoom',
    label: 'Zoom',
    icon: ZoomIn,
    shortcut: 'Z',
    cursor: 'zoom-in',
    // Click zooms in; Alt-click zooms out. Anchored at the click point so
    // the spot under the cursor stays stable.
    onMouseDown: (ctx) => {
      const factor = (ctx.raw.e as MouseEvent).altKey ? 1 / 1.25 : 1.25;
      zoomToPoint(ctx.vp.x, ctx.vp.y, ctx.canvas.getZoom() * factor);
    },
  });
}
