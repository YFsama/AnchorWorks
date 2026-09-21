/**
 * Interactive Width tool state machine (Illustrator Shift+W / Affinity).
 *
 * Mirrors the knifeTool / shapeBuilderTool pattern: private hover + drag
 * state, three engine entry points (down / move / up), an Esc-cancel hook
 * and a deactivate teardown, all dispatched from the tool registry in
 * registerTools.ts. Station math lives in ../variableWidth.ts (pure).
 *
 * Behaviour:
 *   - Hover a stroked path (or an outline previously produced by the Width
 *     tool / the Width Profile menu — recognised by its `variableWidth`
 *     metadata) → width stations appear: a diamond on the centreline, a
 *     perpendicular bar spanning the local width, dots at both edges.
 *   - Press on a station (or anywhere on the path) and drag across the
 *     stroke → the local width grows / shrinks symmetrically with a live
 *     preview of the expanded outline. Pressing on bare path first inserts
 *     a station at the nearest point, then drags it.
 *   - Alt-click a station deletes it (the t=0 / t=1 endpoints are kept).
 *   - Pointer-up commits: the station set is stored as metadata and the
 *     stroke is expanded to a filled outline via the existing variable-
 *     width machinery (see applyWidthStationsToObject). History is
 *     suspended for the gesture so one drag = one undo entry; Esc (or a
 *     tool switch) mid-drag cancels without touching the document.
 *
 * Targeting follows the eraser/knife convention: top-level objects only,
 * overlays excluded, geometry sampled directly (no fabric hit-testing —
 * we need the nearest point on the path anyway to place stations).
 */

import * as fabric from 'fabric';
import { getCanvas, getHistory } from '../canvasEngine';
import { pushHistory } from '../historyOps';
import { toast } from '../toast';
import { t } from '../i18n';
import { readToken } from '../tokens';
import {
  applyWidthStationsToObject,
  buildVariableWidthOutlineFromStations,
  clampStationWidth,
  cumulativeLengths,
  pathSpaceToScene,
  pointsToD,
  readVariableWidthMeta,
  widthAtT,
  type Pt,
  type VariableWidthMeta,
  type WidthStation,
} from '../variableWidth';

/** Scene-px spacing between centreline samples (bezier curves flattened to
 *  this resolution — fine enough that stations land where they look). */
const SAMPLE_STEP = 6;
/** Screen-px grab halo around a station's diamond / edge dots. */
const STATION_GRAB_PX = 10;
/** Screen-px hover halo around the centreline itself. */
const PATH_HIT_PX = 10;
/** Inserting nearer than this to an existing station grabs it instead. */
const INSERT_T_EPS = 0.01;

/** Live hover session for one target path. */
interface HoverState {
  target: fabric.FabricObject;
  /** Working copy of the stations — cloned from metadata or synthesised
   *  from the object's uniform stroke width. Never the stored array. */
  stations: WidthStation[];
  /** Centreline in scene coordinates (sampled or metadata-mapped). */
  centerline: Pt[];
  cum: number[];
  baseWidth: number;
  /** True when the target already is a variable-width outline (re-edit). */
  isOutline: boolean;
  overlays: fabric.FabricObject[];
}

interface DragState {
  stationIndex: number;
  changed: boolean;
  /** Station values before the drag, restored on Esc / cancel. */
  origStations: WidthStation[];
  /** True when the drag started by inserting a fresh station — cancelling
   *  removes it again so the working set matches what was on screen. */
  freshInsert: boolean;
  /** Hidden-target restoration bookkeeping (see beginDrag). */
  wasVisible: boolean;
  savedStroke: string | null;
  fillColor: string;
}

let hover: HoverState | null = null;
let drag: DragState | null = null;
let preview: fabric.Path | null = null;
let escListener: ((e: KeyboardEvent) => void) | null = null;
/** One usage-hint toast per app session (shapeBuilder convention). */
let hintShown = false;

/** True while a width drag is in progress — engine gates mouseup on this. */
export function isWidthToolActive(): boolean {
  return !!drag;
}

/* --------------------------- pure geometry --------------------------- */

/**
 * Closest approach of `p` to a sampled centreline. Returns the nearest
 * sample index, the arc-length fraction `t` at that sample (refined by
 * projecting onto the bracketing segment for sub-sample precision), the
 * distance, and the sample point.
 */
export function nearestOnCenterline(
  points: Pt[],
  cum: number[],
  p: { x: number; y: number },
): { index: number; t: number; dist: number; x: number; y: number } {
  let best = { index: 0, t: 0, dist: Infinity, x: 0, y: 0 };
  const total = cum[cum.length - 1] || 1;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i][0] - p.x;
    const dy = points[i][1] - p.y;
    const d = Math.hypot(dx, dy);
    if (d < best.dist) best = { index: i, t: cum[i] / total, dist: d, x: points[i][0], y: points[i][1] };
  }
  // Refine onto the two segments adjacent to the best sample.
  const i = best.index;
  for (const j of [i - 1, i + 1]) {
    if (j < 0 || j >= points.length) continue;
    const a = points[Math.min(i, j)];
    const b = points[Math.max(i, j)];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) continue;
    const k = Math.max(0, Math.min(1, ((p.x - a[0]) * abx + (p.y - a[1]) * aby) / len2));
    const qx = a[0] + abx * k;
    const qy = a[1] + aby * k;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < best.dist) {
      const tLow = cum[Math.min(i, j)] / total;
      const tHigh = cum[Math.max(i, j)] / total;
      best = { index: i, t: tLow + (tHigh - tLow) * k, dist: d, x: qx, y: qy };
    }
  }
  return best;
}

/**
 * Centreline position + unit normal (tangent rotated 90° CCW) at arc-length
 * fraction `t`. Near a vertex the two adjacent segments' normals are
 * averaged so stations sitting on corners bisect them visually.
 */
export function frameAtCenterline(
  points: Pt[],
  cum: number[],
  t: number,
): { x: number; y: number; nx: number; ny: number } {
  const total = cum[cum.length - 1] || 1;
  const target = Math.max(0, Math.min(1, t)) * total;
  let i = 0;
  while (i < points.length - 2 && cum[i + 1] < target) i++;
  const seg = cum[i + 1] - cum[i];
  const k = seg > 0 ? Math.max(0, Math.min(1, (target - cum[i]) / seg)) : 0;
  const x = points[i][0] + (points[i + 1][0] - points[i][0]) * k;
  const y = points[i][1] + (points[i + 1][1] - points[i][1]) * k;
  let nx = 0;
  let ny = 0;
  let count = 0;
  const addSegmentNormal = (a: Pt, b: Pt) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    nx += -dy / len;
    ny += dx / len;
    count++;
  };
  addSegmentNormal(points[i], points[i + 1]);
  // At a vertex (k≈0/1) blend in the neighbouring segment's normal.
  if (k < 0.05 && i > 0) addSegmentNormal(points[i - 1], points[i]);
  if (k > 0.95 && i < points.length - 2) addSegmentNormal(points[i + 1], points[i + 2]);
  if (count === 0) return { x, y, nx: 0, ny: 1 };
  const len = Math.hypot(nx, ny) || 1;
  return { x, y, nx: nx / len, ny: ny / len };
}

/**
 * Insert a station at `t` (or snap to an existing one within
 * INSERT_T_EPS). Returns the new station array and the index the caller
 * should drag. Pure — input array is not mutated.
 */
export function insertStation(stations: WidthStation[], t: number, width: number): {
  stations: WidthStation[];
  index: number;
} {
  const u = Math.max(0, Math.min(1, t));
  const w = clampStationWidth(width);
  for (let i = 0; i < stations.length; i++) {
    if (Math.abs(stations[i].t - u) < INSERT_T_EPS) return { stations, index: i };
  }
  const next = [...stations, { t: u, width: w }].sort((a, b) => a.t - b.t);
  return { stations: next, index: next.findIndex(s => s.t === u) };
}

/**
 * Remove the station at `index`. The t=0 and t=1 endpoints anchor the
 * curve — deleting one would leave the tip width undefined, so the request
 * is refused (null). Pure — input array is not mutated.
 */
export function removeStation(stations: WidthStation[], index: number): WidthStation[] | null {
  if (index <= 0 || index >= stations.length - 1) return null;
  return stations.filter((_, i) => i !== index);
}

/**
 * Width implied by a cursor position: twice the perpendicular distance
 * from the station's centreline point (the drag is symmetric — the bar
 * grows both ways), clamped to the legal station range.
 */
export function widthFromCursor(cx: number, cy: number, nx: number, ny: number, p: { x: number; y: number }): number {
  return clampStationWidth(2 * Math.abs((p.x - cx) * nx + (p.y - cy) * ny));
}

/* ------------------------------ lifecycle ---------------------------- */

/** mousedown — grab / insert-and-grab a station, or Alt-click to delete. */
export function widthToolDown(canvas: fabric.Canvas, sp: { x: number; y: number }, alt: boolean): void {
  if (drag) return;
  if (!hover) {
    if (!hintShown && !canvasHasEditablePath(canvas)) {
      hintShown = true;
      toast.info(t('Width Tool: hover a stroked path to see its width stations; drag a station across the stroke to taper it. Alt-click a station to remove it.'));
    }
    return;
  }
  const zoom = canvas.getZoom() || 1;
  const grab = STATION_GRAB_PX / zoom;
  for (let i = 0; i < hover.stations.length; i++) {
    const g = stationGeometry(hover, i);
    const dCenter = Math.hypot(sp.x - g.cx, sp.y - g.cy);
    const dLeft = Math.hypot(sp.x - g.lx, sp.y - g.ly);
    const dRight = Math.hypot(sp.x - g.rx, sp.y - g.ry);
    if (Math.min(dCenter, dLeft, dRight) > grab) continue;
    if (alt) {
      deleteStationAt(canvas, i);
      return;
    }
    beginDrag(canvas, i);
    return;
  }
  // Not on a station — a press on the path itself inserts a fresh station
  // at the nearest point (primed with the currently interpolated width)
  // and drags it immediately, Illustrator-style.
  const near = nearestOnCenterline(hover.centerline, hover.cum, sp);
  const localHalf = hover.isOutline
    ? widthAtT(hover.stations, near.t) / 2
    : hover.baseWidth / 2;
  const hitRadius = Math.max(PATH_HIT_PX / zoom, localHalf + 4 / zoom);
  if (near.dist <= hitRadius) {
    const pre = hover.stations;
    const ins = insertStation(pre, near.t, widthAtT(pre, near.t));
    hover.stations = ins.stations;
    renderStationOverlays(canvas);
    // A snap (same array reference) means we grabbed an existing station.
    beginDrag(canvas, ins.index, ins.stations !== pre);
  }
}

/** mousemove — drag update while a gesture is in flight, hover otherwise. */
export function widthToolMove(canvas: fabric.Canvas, sp: { x: number; y: number }): void {
  if (drag) {
    dragMove(canvas, sp);
    return;
  }
  // Target removed by something else mid-hover → drop the stale session.
  if (hover && !hover.target.canvas) {
    clearHover(canvas);
    return;
  }
  const hit = hitTest(canvas, sp);
  if (!hit) {
    if (hover) clearHover(canvas);
    return;
  }
  if (hover && hover.target === hit.target) return; // still hovering the same path
  clearHover(canvas);
  buildHover(canvas, hit);
}

/** mouseup — commit the drag as one history entry. */
export function widthToolUp(canvas: fabric.Canvas): void {
  if (!drag || !hover) return;
  disarmEscape();
  clearPreview();
  const { target, centerline } = hover;
  const changed = drag.changed;
  const stations = hover.stations;
  let applied: fabric.Path | null = null;
  if (changed) {
    applied = applyWidthStationsToObject(canvas, target, stations, centerline);
  }
  if (!applied) {
    restoreHidden(canvas);
  } else if (hover.isOutline) {
    // In-place update: bring the outline back out from under the preview.
    target.visible = drag.wasVisible;
  }
  drag = null;
  getHistory()?.resume();
  if (changed && applied) pushHistory();
  if (applied) {
    // Re-anchor the hover session on the committed result (for a plain
    // stroked path that is the NEW outline path) so the user can keep
    // adjusting stations without re-hovering.
    const meta = readVariableWidthMeta(applied);
    if (meta) {
      retargetHover(canvas, applied, meta);
    }
  } else {
    renderStationOverlays(canvas);
  }
  canvas.requestRenderAll();
}

/** Esc (or tool switch) — drop the in-flight drag without committing. */
export function widthToolCancel(canvas?: fabric.Canvas): void {
  const c = canvas ?? getCanvas();
  if (!drag || !hover) return;
  hover.stations = drag.origStations;
  // A cancelled insert-and-drag also drops the never-committed station.
  if (drag.freshInsert) {
    hover.stations = removeStation(drag.origStations, drag.stationIndex) ?? drag.origStations;
  }
  restoreHidden(c);
  clearPreview();
  disarmEscape();
  drag = null;
  getHistory()?.resume();
  if (c) renderStationOverlays(c);
}

/** onDeactivate — cancel any drag and tear the hover overlays down. */
export function widthToolDeactivate(canvas: fabric.Canvas): void {
  widthToolCancel(canvas);
  clearHover(canvas);
  canvas.requestRenderAll();
}

/* ------------------------------- hover ------------------------------- */

function canvasHasEditablePath(canvas: fabric.Canvas): boolean {
  return canvas.getObjects().some(o => isEditableTarget(o));
}

/** Editable = top-level visible fabric.Path that either carries variable-
 *  width metadata (tool output) or has a visible stroke to taper. */
function isEditableTarget(o: fabric.FabricObject): boolean {
  if ((o as { excludeFromExport?: boolean }).excludeFromExport) return false;
  if (o.visible === false) return false;
  if (o.type !== 'path') return false;
  if (readVariableWidthMeta(o)) return true;
  return (o.strokeWidth ?? 0) > 0 && typeof o.stroke === 'string' && o.stroke !== '';
}

interface HitResult {
  target: fabric.FabricObject;
  meta: VariableWidthMeta | null;
  centerline: Pt[];
  cum: number[];
  dist: number;
}

/** Nearest editable path under the pointer, or null. Bbox-prefiltered. */
function hitTest(canvas: fabric.Canvas, sp: { x: number; y: number }): HitResult | null {
  const zoom = canvas.getZoom() || 1;
  let best: HitResult | null = null;
  for (const o of canvas.getObjects()) {
    if (!isEditableTarget(o)) continue;
    // Coarse: pointer within the (stroke-inclusive) bbox, padded by the
    // hover halo, before paying for geometry sampling.
    const b = o.getBoundingRect();
    const pad = (PATH_HIT_PX + (o.strokeWidth ?? 0) / 2) / zoom;
    if (sp.x < b.left - pad || sp.x > b.left + b.width + pad) continue;
    if (sp.y < b.top - pad || sp.y > b.top + b.height + pad) continue;

    const meta = readVariableWidthMeta(o);
    const centerline = meta ? pathSpaceToScene(o, meta.centerline) : sampleCenterline(o);
    if (centerline.length < 2) continue;
    const cum = cumulativeLengths(centerline);
    const near = nearestOnCenterline(centerline, cum, sp);
    // Plain strokes grab within half the stroke width (+ halo); outlines
    // scale the halo with the LOCAL width so fat tapered sections stay
    // hoverable, not just the thin tips near the centreline.
    const threshold = meta
      ? Math.max(PATH_HIT_PX / zoom, widthAtT(meta.stations, near.t) / 2 + 4 / zoom)
      : Math.max(PATH_HIT_PX / zoom, (o.strokeWidth ?? 0) / 2 + 4 / zoom);
    if (near.dist > threshold) continue;
    if (!best || near.dist < best.dist) {
      best = { target: o, meta, centerline, cum, dist: near.dist };
    }
  }
  return best;
}

function buildHover(canvas: fabric.Canvas, hit: HitResult): void {
  const target = hit.target;
  const isOutline = !!hit.meta;
  const baseWidth = hit.meta?.baseWidth ?? target.strokeWidth ?? 1;
  const stations: WidthStation[] = hit.meta
    ? hit.meta.stations.map(s => ({ ...s }))
    : [
        { t: 0, width: clampStationWidth(baseWidth) },
        { t: 1, width: clampStationWidth(baseWidth) },
      ];
  hover = {
    target,
    stations,
    centerline: hit.centerline,
    cum: hit.cum,
    baseWidth,
    isOutline,
    overlays: [],
  };
  renderStationOverlays(canvas);
  canvas.requestRenderAll();
}

/** Rebuild the hover session around a committed object (post-pointerup). */
function retargetHover(canvas: fabric.Canvas, target: fabric.FabricObject, meta: VariableWidthMeta): void {
  const centerline = pathSpaceToScene(target, meta.centerline);
  hover = {
    target,
    stations: meta.stations.map(s => ({ ...s })),
    centerline,
    cum: cumulativeLengths(centerline),
    baseWidth: meta.baseWidth,
    isOutline: true,
    overlays: [],
  };
  renderStationOverlays(canvas);
}

function clearHover(canvas: fabric.Canvas): void {
  if (!hover) return;
  for (const o of hover.overlays) canvas.remove(o);
  hover = null;
  canvas.requestRenderAll();
}

/* ------------------------------- drag -------------------------------- */

function beginDrag(canvas: fabric.Canvas, stationIndex: number, freshInsert = false): void {
  if (!hover) return;
  const fillColor = dragFillOf(hover);
  drag = {
    stationIndex,
    changed: false,
    origStations: hover.stations.map(s => ({ ...s })),
    freshInsert,
    wasVisible: hover.target.visible !== false,
    savedStroke: null,
    fillColor,
  };
  // Hide the original's own paint so the live preview is the only render
  // of the stroke area — otherwise a narrowing drag leaves the old uniform
  // stroke ghosting around the tapered preview.
  if (hover.isOutline) {
    hover.target.visible = false;
  } else {
    const stroke = hover.target.stroke;
    drag.savedStroke = typeof stroke === 'string' && stroke !== '' ? stroke : null;
    hover.target.set({ stroke: '' });
  }
  getHistory()?.suspend();
  armEscape();
  canvas.requestRenderAll();
}

function dragFillOf(h: HoverState): string {
  if (h.isOutline) {
    const fill = h.target.fill;
    if (typeof fill === 'string' && fill !== '') return fill;
  } else {
    const stroke = h.target.stroke;
    if (typeof stroke === 'string' && stroke !== '') return stroke;
  }
  return '#3d9bff';
}

function restoreHidden(canvas: fabric.Canvas | null | undefined): void {
  if (!hover || !drag) return;
  if (hover.isOutline) {
    hover.target.visible = drag.wasVisible;
  } else if (drag.savedStroke != null) {
    hover.target.set({ stroke: drag.savedStroke });
  }
  canvas?.requestRenderAll();
}

function dragMove(canvas: fabric.Canvas, sp: { x: number; y: number }): void {
  if (!drag || !hover) return;
  const g = stationGeometry(hover, drag.stationIndex);
  const w = widthFromCursor(g.cx, g.cy, g.nx, g.ny, sp);
  if (Math.abs(hover.stations[drag.stationIndex].width - w) < 0.01) return;
  hover.stations[drag.stationIndex].width = w;
  drag.changed = true;
  updateDraggedOverlay();
  updatePreview(canvas);
  canvas.requestRenderAll();
}

function deleteStationAt(canvas: fabric.Canvas, index: number): void {
  if (!hover) return;
  const next = removeStation(hover.stations, index);
  if (!next) {
    toast.warn(t('Endpoint stations cannot be deleted.'));
    return;
  }
  hover.stations = next;
  if (hover.isOutline) {
    // The target is already a committed outline — rebuild it in place and
    // record the edit (no drag gesture, so no suspend window needed).
    applyWidthStationsToObject(canvas, hover.target, next, hover.centerline);
    pushHistory();
    toast.success(t('Width station removed.'));
  }
  renderStationOverlays(canvas);
  canvas.requestRenderAll();
}

/* ------------------------------ overlays ----------------------------- */

interface StationGeom {
  cx: number; cy: number;
  nx: number; ny: number;
  lx: number; ly: number;
  rx: number; ry: number;
}

function stationGeometry(h: HoverState, i: number): StationGeom {
  const st = h.stations[i];
  const f = frameAtCenterline(h.centerline, h.cum, st.t);
  const half = st.width / 2;
  return {
    cx: f.x, cy: f.y, nx: f.nx, ny: f.ny,
    lx: f.x + f.nx * half, ly: f.y + f.ny * half,
    rx: f.x - f.nx * half, ry: f.y - f.ny * half,
  };
}

function makeStationOverlayOpts(): {
  selectable: false;
  evented: false;
  excludeFromExport: true;
  objectCaching: false;
  hasControls: false;
  hasBorders: false;
  hoverCursor: 'default';
} {
  return {
    selectable: false,
    evented: false,
    excludeFromExport: true,
    objectCaching: false,
    hasControls: false,
    hasBorders: false,
    hoverCursor: 'default',
  };
}

function renderStationOverlays(canvas: fabric.Canvas): void {
  if (!hover) return;
  for (const o of hover.overlays) canvas.remove(o);
  hover.overlays = [];
  const s = 1 / (canvas.getZoom() || 1);
  const accent = readToken('--color-accent2', '#5ac8d8');
  for (let i = 0; i < hover.stations.length; i++) {
    const g = stationGeometry(hover, i);
    const diamond = new fabric.Rect({
      left: g.cx,
      top: g.cy,
      width: 7 * s,
      height: 7 * s,
      angle: 45,
      fill: '#ffffff',
      stroke: accent,
      strokeWidth: 1 * s,
      originX: 'center',
      originY: 'center',
      ...makeStationOverlayOpts(),
    });
    const bar = new fabric.Line([g.lx, g.ly, g.rx, g.ry], {
      stroke: accent,
      strokeWidth: 1.5 * s,
      selectable: false,
      evented: false,
      excludeFromExport: true,
      objectCaching: false,
    });
    const dotL = new fabric.Circle({
      left: g.lx, top: g.ly, radius: 3.5 * s,
      fill: accent, stroke: '#ffffff', strokeWidth: 1 * s,
      originX: 'center', originY: 'center',
      ...makeStationOverlayOpts(),
    });
    const dotR = new fabric.Circle({
      left: g.rx, top: g.ry, radius: 3.5 * s,
      fill: accent, stroke: '#ffffff', strokeWidth: 1 * s,
      originX: 'center', originY: 'center',
      ...makeStationOverlayOpts(),
    });
    hover.overlays.push(diamond, bar, dotL, dotR);
  }
  for (const o of hover.overlays) {
    canvas.add(o);
    canvas.bringObjectToFront(o);
  }
  canvas.requestRenderAll();
}

/** Update just the dragged station's bar + dots (diamond never moves). */
function updateDraggedOverlay(): void {
  if (!hover || !drag) return;
  const g = stationGeometry(hover, drag.stationIndex);
  // Overlay layout: 4 objects per station, in push order.
  const base = drag.stationIndex * 4;
  const bar = hover.overlays[base + 1] as fabric.Line | undefined;
  const dotL = hover.overlays[base + 2] as fabric.Circle | undefined;
  const dotR = hover.overlays[base + 3] as fabric.Circle | undefined;
  if (bar) {
    bar.set({ x1: g.lx, y1: g.ly, x2: g.rx, y2: g.ry });
    bar.setCoords();
  }
  if (dotL) {
    dotL.set({ left: g.lx, top: g.ly });
    dotL.setCoords();
  }
  if (dotR) {
    dotR.set({ left: g.rx, top: g.ry });
    dotR.setCoords();
  }
}

function updatePreview(canvas: fabric.Canvas): void {
  if (!hover || !drag) return;
  const outline = buildVariableWidthOutlineFromStations(hover.centerline, hover.stations);
  if (outline.length < 3) {
    clearPreview();
    return;
  }
  const d = pointsToD(outline);
  if (!preview) {
    preview = new fabric.Path(d, {
      fill: drag.fillColor,
      stroke: '',
      strokeWidth: 0,
      opacity: hover.target.opacity ?? 1,
      selectable: false,
      evented: false,
      excludeFromExport: true,
      objectCaching: false,
    });
    canvas.add(preview);
    canvas.bringObjectToFront(preview);
  } else {
    preview.set({ path: new fabric.Path(d).path });
    preview.setCoords();
  }
}

function clearPreview(): void {
  const canvas = getCanvas();
  if (preview && canvas) canvas.remove(preview);
  preview = null;
}

/* ------------------------- centreline sampling ----------------------- */

/**
 * Flatten a Path's geometry into a scene-space polyline: walks M/L/C/Q/Z
 * commands (H/V folded into L; S/T/A skipped like the eraser sampler —
 * pen/pencil/knife output never emits them), subdividing each segment to
 * ~SAMPLE_STEP resolution. Same transform math as pathEdit's handles.
 */
export function sampleCenterline(object: fabric.FabricObject): Pt[] {
  const path = object as fabric.Path;
  const cmds = (path.path ?? []) as Array<[string, ...number[]]>;
  if (cmds.length === 0) return [];
  const m = object.calcTransformMatrix();
  const apply = (lx: number, ly: number): Pt => {
    const px = lx - path.pathOffset.x;
    const py = ly - path.pathOffset.y;
    return [
      m[0] * px + m[2] * py + m[4],
      m[1] * px + m[3] * py + m[5],
    ];
  };
  const out: Pt[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  const pushSegment = (ax: number, ay: number, bx: number, by: number, quad?: [number, number], cubic?: [number, number, number, number]) => {
    const chord = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.min(64, Math.ceil(chord / SAMPLE_STEP)));
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const w = 1 - u;
      let x: number;
      let y: number;
      if (cubic) {
        x = w * w * w * ax + 3 * w * w * u * cubic[0] + 3 * w * u * u * cubic[2] + u * u * u * bx;
        y = w * w * w * ay + 3 * w * w * u * cubic[1] + 3 * w * u * u * cubic[3] + u * u * u * by;
      } else if (quad) {
        x = w * w * ax + 2 * w * u * quad[0] + u * u * bx;
        y = w * w * ay + 2 * w * u * quad[1] + u * u * by;
      } else {
        x = ax + (bx - ax) * u;
        y = ay + (by - ay) * u;
      }
      out.push(apply(x, y));
    }
  };
  for (const cmd of cmds) {
    const op = cmd[0];
    if (op === 'M') {
      cx = cmd[1];
      cy = cmd[2];
      startX = cx;
      startY = cy;
      if (out.length === 0) out.push(apply(cx, cy));
    } else if (op === 'L') {
      pushSegment(cx, cy, cmd[1], cmd[2]);
      cx = cmd[1];
      cy = cmd[2];
    } else if (op === 'H') {
      pushSegment(cx, cy, cmd[1], cy);
      cx = cmd[1];
    } else if (op === 'V') {
      pushSegment(cx, cy, cx, cmd[1]);
      cy = cmd[1];
    } else if (op === 'Q') {
      pushSegment(cx, cy, cmd[3], cmd[4], [cmd[1], cmd[2]]);
      cx = cmd[3];
      cy = cmd[4];
    } else if (op === 'C') {
      pushSegment(cx, cy, cmd[5], cmd[6], undefined, [cmd[1], cmd[2], cmd[3], cmd[4]]);
      cx = cmd[5];
      cy = cmd[6];
    } else if (op === 'Z' || op === 'z') {
      pushSegment(cx, cy, startX, startY);
      cx = startX;
      cy = startY;
    }
    // S / T / A: skipped (see doc comment) — the bbox prefilter in
    // hitTest keeps such paths hoverable only via their straight parts.
  }
  return out;
}

/* --------------------------------- Esc -------------------------------- */

/**
 * Esc cancels the in-flight drag. Window CAPTURE phase so it runs before
 * App.tsx's bubble-phase Escape handler (which deselects — mid-drag, the
 * station edit is what Esc means) and can swallow the key entirely. Same
 * contract as knifeTool / shapeBuilderTool.
 */
function armEscape(): void {
  if (escListener || typeof window === 'undefined') return;
  escListener = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !drag) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    widthToolCancel();
  };
  window.addEventListener('keydown', escListener, { capture: true });
}

function disarmEscape(): void {
  if (escListener && typeof window !== 'undefined') {
    window.removeEventListener('keydown', escListener, { capture: true });
  }
  escListener = null;
}
