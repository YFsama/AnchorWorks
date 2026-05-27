/**
 * Polygon + Pen tool state machines.
 *
 * Polygon stays the simple "click points, auto-close" tool from the original
 * extraction. Pen has grown into a real bezier authoring surface:
 *
 *   - mouse-down places an anchor; if the user drags before mouseup, the
 *     drag distance becomes the outgoing tangent handle (Illustrator-style
 *     curve gesture). Releasing without drag leaves a corner anchor.
 *   - clicking within 8px of the first anchor (after ≥3 anchors) closes the
 *     path; the first anchor grows a hover halo while the cursor is near it.
 *   - Shift-click commits the current path as-is (legacy behaviour kept so
 *     existing onboarding muscle memory still works).
 *   - Esc finishes an open path; Enter closes it.
 *
 * Path emission walks the anchor list and chooses `L` (corner→corner) or `C`
 * (any smooth endpoint) for each segment, so smooth anchors emit real cubic
 * bezier curves rather than approximating with straight lines.
 *
 * On-canvas node editing (drag-anchor / drag-handle / smooth↔corner toggle)
 * is a separate pass that lives in `pathEdit.ts` — this module only owns
 * the authoring path.
 */

import * as fabric from 'fabric';
import { getCanvas } from '../canvasEngine';
import { useEditor } from '../../store/editor';
import { readToken } from '../tokens';
import { getDrawStyle as styleOpts } from '../drawStyle';
import type { ToolId } from '../../types';

type Pt = { x: number; y: number };

/** Anchor with optional tangent handles. Smooth anchors carry mirrored
 *  in/out handles; corner anchors have neither. The pen emits the full
 *  anchor list to `finishPath`, which folds adjacent anchors into bezier
 *  cubic segments when any endpoint is smooth. */
interface Anchor {
  x: number;
  y: number;
  kind: 'corner' | 'smooth';
  /** Outgoing tangent handle (absolute scene coords). null when corner. */
  out: Pt | null;
  /** Incoming tangent — mirrored across the anchor when symmetric (the
   *  default), or independently set after a future Alt-drag breaks the
   *  symmetry. null when corner. */
  in: Pt | null;
}

let polyPoints: Pt[] = [];
let anchors: Anchor[] = [];
/** Set when mouse-down lands; cleared on mouse-up. Used to detect drag-out
 *  on the same press the anchor was placed in (Illustrator's bezier
 *  gesture). */
let activeAnchorIdx: number | null = null;
let dragStarted = false;
let previewLine: fabric.Line | null = null;
let previewCurve: fabric.Path | null = null;
let closeHaloPreview: fabric.Circle | null = null;

const CLOSE_HIT_PX = 8;

/** Polygon click — push point; auto-close when clicking within 8px of the
 *  first vertex (and we already have at least 3 points). */
export function handlePolyClick(sp: Pt): void {
  const canvas = getCanvas();
  if (!canvas) return;
  if (polyPoints.length > 2) {
    const first = polyPoints[0];
    if (Math.hypot(sp.x - first.x, sp.y - first.y) < CLOSE_HIT_PX) {
      finishPolygon();
      return;
    }
  }
  polyPoints.push(sp);
}

/** Commit the in-progress polygon as a fabric.Polygon and clear state. */
export function finishPolygon(): void {
  const canvas = getCanvas();
  if (!canvas || polyPoints.length < 3) { polyPoints = []; clearPreview(); return; }
  const s = styleOpts();
  const xs = polyPoints.map(p => p.x), ys = polyPoints.map(p => p.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  const poly = new fabric.Polygon(polyPoints.map(p => ({ x: p.x - left, y: p.y - top })), {
    left, top, ...s,
  });
  canvas.add(poly);
  canvas.setActiveObject(poly);
  polyPoints = [];
  clearPreview();
  useEditor.getState().setTool('select');
}

/** Pen mouse-down — place an anchor (or close the path if near the first
 *  anchor). The `finish` flag mirrors the legacy shift-to-commit gesture
 *  and is preserved so existing tutorials/screenshots still apply. */
export function handlePenMouseDown(sp: Pt, finish: boolean): void {
  const canvas = getCanvas();
  if (!canvas) return;

  if (finish) {
    finishPath(false);
    return;
  }

  // Close-path gesture: clicking near the first anchor on a path with at
  // least 3 anchors closes it.
  if (anchors.length >= 3) {
    const first = anchors[0];
    if (Math.hypot(sp.x - first.x, sp.y - first.y) < CLOSE_HIT_PX) {
      finishPath(true);
      return;
    }
  }

  anchors.push({ x: sp.x, y: sp.y, kind: 'corner', out: null, in: null });
  activeAnchorIdx = anchors.length - 1;
  dragStarted = false;
}

/** Pen mouse-move — during the same press that placed an anchor, the cursor
 *  position becomes the outgoing tangent handle (and `in` is mirrored).
 *  After mouse-up, the move just updates the dashed preview from the last
 *  anchor's outgoing tangent (or itself, if corner) to the cursor. */
export function handlePenMouseMove(sp: Pt): void {
  if (activeAnchorIdx !== null) {
    const a = anchors[activeAnchorIdx];
    const dx = sp.x - a.x;
    const dy = sp.y - a.y;
    // Threshold to distinguish "click" (corner) from "drag" (smooth). 3px
    // matches the canvas's general click-tolerance feel.
    if (dragStarted || (dx * dx + dy * dy) > 9) {
      dragStarted = true;
      a.kind = 'smooth';
      a.out = { x: sp.x, y: sp.y };
      a.in = { x: a.x - dx, y: a.y - dy };
      updateAuthoringPreview(sp);
    }
    return;
  }
  updateAuthoringPreview(sp);
}

/** Pen mouse-up — close out the press. Anchor stays in the list; the next
 *  mouse-down either appends another anchor, closes the path, or commits. */
export function handlePenMouseUp(): void {
  activeAnchorIdx = null;
  dragStarted = false;
}

/** Commit the in-progress pen path. `close` true emits a `Z` and lets the
 *  path carry a fill; false leaves the path open (stroke-only). */
export function finishPath(close: boolean): void {
  const canvas = getCanvas();
  if (!canvas || anchors.length < 2) { anchors = []; clearPreview(); return; }
  const s = styleOpts();
  const d = anchorsToSvgPath(anchors, close);
  const path = new fabric.Path(d, close
    ? { fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth, opacity: s.opacity }
    : { fill: '', stroke: s.stroke, strokeWidth: s.strokeWidth, opacity: s.opacity });
  canvas.add(path);
  canvas.setActiveObject(path);
  anchors = [];
  activeAnchorIdx = null;
  dragStarted = false;
  clearPreview();
  useEditor.getState().setTool('select');
}

/** Walk anchors, emitting `L` between two corner anchors and `C` whenever
 *  either endpoint of a segment is smooth (using the matching tangents). */
function anchorsToSvgPath(list: Anchor[], close: boolean): string {
  if (list.length === 0) return '';
  const first = list[0];
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < list.length; i++) {
    d += ` ${segmentCommand(list[i - 1], list[i])}`;
  }
  if (close) {
    // Closing segment: from last anchor back to first. Mirror smoothness
    // logic so the closing arc curves correctly when either endpoint is
    // smooth (a closed bezier with all-smooth anchors becomes a real
    // rounded shape).
    d += ` ${segmentCommand(list[list.length - 1], list[0])}`;
    d += ' Z';
  }
  return d;
}

function segmentCommand(a: Anchor, b: Anchor): string {
  const aSmooth = a.kind === 'smooth' && a.out;
  const bSmooth = b.kind === 'smooth' && b.in;
  if (!aSmooth && !bSmooth) return `L ${b.x} ${b.y}`;
  const cp1 = a.out ?? { x: a.x, y: a.y };
  const cp2 = b.in ?? { x: b.x, y: b.y };
  return `C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${b.x} ${b.y}`;
}

/** Remove the dashed preview line / preview curve / close halo from the
 *  canvas, if any. Idempotent. */
export function clearPreview(): void {
  const canvas = getCanvas();
  if (!canvas) {
    previewLine = null;
    previewCurve = null;
    closeHaloPreview = null;
    return;
  }
  if (previewLine) canvas.remove(previewLine);
  if (previewCurve) canvas.remove(previewCurve);
  if (closeHaloPreview) canvas.remove(closeHaloPreview);
  previewLine = null;
  previewCurve = null;
  closeHaloPreview = null;
}

/** Called by setTool when the user switches tools mid-shape. Commits a
 *  polygon ≥3 / path ≥2 if there's enough to draw; otherwise clears. */
export function finishPolyIfAny(): void {
  if (polyPoints.length >= 3) finishPolygon();
  else if (anchors.length >= 2) finishPath(false);
  else {
    polyPoints = [];
    anchors = [];
    activeAnchorIdx = null;
    dragStarted = false;
    clearPreview();
  }
}

/** True when there's an in-progress polygon or pen shape worth previewing. */
export function hasInProgressShape(tool: ToolId): boolean {
  return (tool === 'polygon' && polyPoints.length > 0) ||
         (tool === 'pen' && anchors.length > 0);
}

/** Esc handler — finishes an open path (or just clears if too few anchors).
 *  Returns true when it consumed the key, so the App-level handler can
 *  short-circuit the deselect-or-fallthrough branch. */
export function penEscape(): boolean {
  if (anchors.length >= 2) { finishPath(false); return true; }
  if (anchors.length > 0) { anchors = []; clearPreview(); return true; }
  return false;
}

/** Enter handler — closes the in-progress path. */
export function penEnter(): boolean {
  if (anchors.length >= 2) { finishPath(true); return true; }
  return false;
}

/** Render the authoring preview: dashed line from the last anchor's
 *  outgoing tangent (or the anchor itself, if corner) to the cursor; or a
 *  proper bezier preview when the last anchor is smooth. Also shows the
 *  close-path halo when the cursor is near the first anchor. */
function updateAuthoringPreview(sp: Pt, tool: ToolId = 'pen'): void {
  const canvas = getCanvas();
  if (!canvas) return;
  if (tool === 'polygon') {
    legacyPolygonPreview(sp);
    return;
  }
  if (anchors.length === 0) return;
  const last = anchors[anchors.length - 1];
  const stroke = readToken('--color-accent2', '#5ac8d8');

  // When the last anchor is smooth, preview the bezier curve from the
  // last anchor to the cursor using the anchor's outgoing tangent for cp1
  // and the cursor itself as cp2 (the user hasn't dragged out the next
  // tangent yet, so the simplest accurate preview is a "no incoming
  // tangent" cubic).
  if (last.kind === 'smooth' && last.out) {
    if (previewLine) { canvas.remove(previewLine); previewLine = null; }
    const d = `M ${last.x} ${last.y} C ${last.out.x} ${last.out.y} ${sp.x} ${sp.y} ${sp.x} ${sp.y}`;
    if (!previewCurve) {
      previewCurve = new fabric.Path(d, {
        stroke, strokeWidth: 1, fill: '',
        selectable: false, evented: false, strokeDashArray: [4, 4],
      });
      canvas.add(previewCurve);
    } else {
      previewCurve.set({ path: new fabric.Path(d).path });
      previewCurve.setCoords();
    }
  } else {
    if (previewCurve) { canvas.remove(previewCurve); previewCurve = null; }
    if (!previewLine) {
      previewLine = new fabric.Line([last.x, last.y, sp.x, sp.y], {
        stroke, strokeWidth: 1, selectable: false, evented: false, strokeDashArray: [4, 4],
      });
      canvas.add(previewLine);
    } else {
      previewLine.set({ x1: last.x, y1: last.y, x2: sp.x, y2: sp.y });
      previewLine.setCoords();
    }
  }

  // Close-path hover halo on the first anchor (only when there are enough
  // anchors to make closing meaningful).
  if (anchors.length >= 3) {
    const first = anchors[0];
    const nearFirst = Math.hypot(sp.x - first.x, sp.y - first.y) < CLOSE_HIT_PX;
    if (nearFirst) {
      if (!closeHaloPreview) {
        closeHaloPreview = new fabric.Circle({
          left: first.x - 6, top: first.y - 6, radius: 6, fill: '',
          stroke, strokeWidth: 1.5, selectable: false, evented: false, originX: 'left', originY: 'top',
        });
        canvas.add(closeHaloPreview);
      } else {
        closeHaloPreview.set({ left: first.x - 6, top: first.y - 6 });
        closeHaloPreview.setCoords();
      }
    } else if (closeHaloPreview) {
      canvas.remove(closeHaloPreview);
      closeHaloPreview = null;
    }
  }

  canvas.requestRenderAll();
}

function legacyPolygonPreview(sp: Pt): void {
  const canvas = getCanvas();
  if (!canvas || polyPoints.length === 0) return;
  const last = polyPoints[polyPoints.length - 1];
  const stroke = readToken('--color-accent2', '#5ac8d8');
  if (!previewLine) {
    previewLine = new fabric.Line([last.x, last.y, sp.x, sp.y], {
      stroke, strokeWidth: 1, selectable: false, evented: false, strokeDashArray: [4, 4],
    });
    canvas.add(previewLine);
  } else {
    previewLine.set({ x1: last.x, y1: last.y, x2: sp.x, y2: sp.y });
    previewLine.setCoords();
  }
  canvas.requestRenderAll();
}

/** Back-compat shim — the engine's onMouseMove called this for both tools.
 *  Polygon keeps its identical behaviour; pen forwards to the richer
 *  `updateAuthoringPreview` so the bezier preview kicks in once the user
 *  starts shaping smooth anchors. */
export function updatePreview(sp: Pt, tool: ToolId): void {
  updateAuthoringPreview(sp, tool);
}

/** Back-compat shim for the old `handlePenClick(sp, finish)` signature
 *  some external callers might still hold. New pen path goes through
 *  `handlePenMouseDown` so press-and-drag can detect tangent gestures. */
export function handlePenClick(sp: Pt, finish: boolean): void {
  handlePenMouseDown(sp, finish);
  handlePenMouseUp();
}
