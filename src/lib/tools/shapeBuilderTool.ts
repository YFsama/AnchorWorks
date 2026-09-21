/**
 * Shape Builder tool state machine (Illustrator Shift+M / Affinity).
 *
 * Mirrors the knifeTool pattern: private drag state + three engine entry
 * points (begin / stroke / end) plus an Esc-cancel hook, dispatched from the
 * tool registry in registerTools.ts. All region math lives in
 * ../shapeBuilder.ts (pure) and ../booleanOps.ts (object flattening + path
 * refit), reused from the pathfinder ops.
 *
 * Behaviour: activate, then press-drag across the overlapping artwork.
 * The drag paints a translucent accent stroke and every arrangement region
 * it crosses highlights live (accent2 = keep, danger red = erase). On
 * release:
 *   - Keep mode  — the swept regions merge into ONE path (every source that
 *     contributed a swept face unites, Illustrator-style: dragging only the
 *     overlap of two shapes fuses both).
 *   - Erase mode (Alt at drag start) — the swept regions are deleted from
 *     every source covering them; partial remainders rebuild as separate
 *     styled paths.
 * With fewer than 2 objects selected the tool falls back to all top-level
 * objects; below two it toasts and stays inert. History is suspended for
 * the gesture so preview overlays + object swaps bundle into exactly one
 * undo entry. Esc mid-drag cancels without touching the artwork.
 */

import * as fabric from 'fabric';
import type { MultiPolygon, Ring } from 'polygon-clipping';
import { getCanvas, getHistory } from '../canvasEngine';
import { pushHistory } from '../historyOps';
import { toast } from '../toast';
import { t } from '../i18n';
import { readToken, readTokenAlpha } from '../tokens';
import { objectToRings, multiPolygonToPathD } from '../booleanOps';
import {
  buildRegions, hitRegions, mergeFaces, eraseFaces,
  MAX_ARRANGEMENT_SHAPES, HIT_TOLERANCE, HIT_SAMPLE_STEP,
  type BuilderFace, type Pt,
} from '../shapeBuilder';

/** Append a scene point only after the cursor moved this far (scene px). */
const MIN_SAMPLE_DIST = 2;

let active = false;
let eraseMode = false;
/** Source objects for the current gesture, sorted back → front (index 0 =
 *  bottom-most = the style donor for merges, matching booleanOps). */
let objects: fabric.FabricObject[] = [];
let shapes: MultiPolygon[] = [];
let faces: BuilderFace[] = [];
let sweptIds = new Set<number>();
let points: Pt[] = [];
let strokePreview: fabric.Path | null = null;
let highlights = new Map<number, fabric.Path>();
let escListener: ((e: KeyboardEvent) => void) | null = null;
/** One usage-hint toast per app session — enough to teach the Alt modifier
 *  without nagging on every tool switch. */
let hintShown = false;

/** True while a shape-builder drag is in progress. */
export function isShapeBuilderActive(): boolean { return active; }

/* ------------------------------ gesture lifecycle ---------------------------- */

/** mousedown — resolve targets, build the arrangement, suspend history. */
export function shapeBuilderBegin(sp: { x: number; y: number }, erase: boolean): void {
  const canvas = getCanvas();
  if (!canvas || active) return;

  const targets = resolveTargets(canvas);

  // Flatten to polygon rings FIRST, skipping un-flattenable objects
  // (zero-size etc.) gracefully, so the ≥2 / ≤8 guards see real clay.
  const objs: fabric.FabricObject[] = [];
  const geoms: MultiPolygon[] = [];
  for (const o of targets) {
    const rings = objectToRings(o);
    if (!rings) continue;
    objs.push(o);
    geoms.push([rings as Ring[]] as MultiPolygon);
  }
  if (objs.length < 2) {
    toast.warn(t('Shape Builder needs at least two objects. Select overlapping shapes or place more shapes on the canvas.'));
    return;
  }
  if (objs.length > MAX_ARRANGEMENT_SHAPES) {
    toast.warn(t('Shape Builder works on up to 8 objects at once.'));
    return;
  }

  objects = objs;
  shapes = geoms;
  faces = buildRegions(shapes);
  sweptIds = new Set();
  points = [[sp.x, sp.y]];
  eraseMode = erase;
  active = true;
  getHistory()?.suspend();
  armEscape();
  if (!hintShown) {
    hintShown = true;
    toast.info(t('Shape Builder: drag across regions to merge them; Alt-drag to erase.'));
  }
  // A plain click inside a region still acts on it (Illustrator muscle
  // memory: click a region to merge / Alt-click to erase just that one).
  sweepSegment(points[0], points[0]);
  updateStrokePreview(canvas);
}

/** mousemove — extend the stroke, sweeping newly crossed regions. */
export function shapeBuilderStroke(sp: { x: number; y: number }): void {
  const canvas = getCanvas();
  if (!canvas || !active) return;
  const last = points[points.length - 1];
  if (Math.hypot(sp.x - last[0], sp.y - last[1]) < MIN_SAMPLE_DIST) return;
  const next: Pt = [sp.x, sp.y];
  sweepSegment(last, next);
  points.push(next);
  updateStrokePreview(canvas);
}

/** mouseup — commit the sweep as one merge or one erase. */
export function shapeBuilderEnd(): void {
  if (!active) return;
  const canvas = getCanvas();
  clearOverlays();
  disarmEscape();
  active = false;
  const swept = faces.filter(f => sweptIds.has(f.id));
  let changed = false;
  if (canvas && swept.length > 0) changed = commit(canvas, swept);
  // Commit runs while history is still suspended so the object swaps below
  // bundle into a single snapshot; resume + push exactly one undo entry.
  faces = [];
  sweptIds = new Set();
  points = [];
  objects = [];
  shapes = [];
  eraseMode = false;
  getHistory()?.resume();
  if (changed) pushHistory();
}

/** Esc (or tool switch) — drop the in-flight sweep without committing. */
export function shapeBuilderCancel(): void {
  if (!active) return;
  clearOverlays();
  disarmEscape();
  active = false;
  faces = [];
  sweptIds = new Set();
  points = [];
  objects = [];
  shapes = [];
  eraseMode = false;
  getHistory()?.resume();
}

/* --------------------------------- internals --------------------------------- */

/**
 * Gesture targets: the active selection when it holds 2+ objects, otherwise
 * every visible top-level object (the Illustrator "all selected shapes"
 * contract inverted — with nothing selected the whole canvas is the clay).
 * Sorted back → front so stacking order drives style inheritance.
 */
function resolveTargets(canvas: fabric.Canvas): fabric.FabricObject[] {
  const all = canvas.getObjects();
  const overlay = (o: fabric.FabricObject) => !!(o as { excludeFromExport?: boolean }).excludeFromExport;
  const selected = canvas.getActiveObjects().filter(o => !overlay(o));
  const source = selected.length >= 2 ? selected : all.filter(o => !overlay(o) && o.visible !== false);
  return [...source].sort((a, b) => all.indexOf(a) - all.indexOf(b));
}

/** Incrementally hit-test the newest stroke segment against unswept faces. */
function sweepSegment(a: Pt, b: Pt): void {
  if (faces.length === 0) return;
  const unswept = faces.filter(f => !sweptIds.has(f.id));
  if (unswept.length === 0) return;
  const hits = hitRegions([a, b], unswept, HIT_TOLERANCE, HIT_SAMPLE_STEP);
  if (hits.length === 0) return;
  const canvas = getCanvas();
  for (const f of hits) {
    sweptIds.add(f.id);
    if (canvas) addHighlight(canvas, f);
  }
  canvas?.requestRenderAll();
}

/** Apply the sweep: merge (keep) or subtract (erase) and rebuild paths. */
function commit(canvas: fabric.Canvas, swept: BuilderFace[]): boolean {
  if (eraseMode) {
    const remainders = eraseFaces(swept, shapes);
    const created: fabric.Path[] = [];
    for (let i = 0; i < objects.length; i++) {
      // Only sources actually touched by the sweep are rebuilt; the rest
      // keep their object identity (no churn in the layers panel).
      if (!swept.some(f => f.sources.includes(i))) continue;
      canvas.remove(objects[i]);
      const d = remainders[i].length ? multiPolygonToPathD(remainders[i]) : '';
      if (!d) continue;
      created.push(new fabric.Path(d, styleOf(objects[i])));
    }
    for (const p of created) canvas.add(p);
    if (created.length > 0) selectResults(canvas, created);
    canvas.requestRenderAll();
    toast.success(t('Erased selected regions.'));
    return true;
  }

  const { geom, sources } = mergeFaces(swept, shapes);
  // A sweep confined to one source merges it with itself — leave the
  // artwork untouched (Illustrator keeps such regions as they are).
  if (sources.length < 2 || geom.length === 0) return false;
  const d = multiPolygonToPathD(geom);
  if (!d) return false;
  const path = new fabric.Path(d, styleOf(objects[sources[0]]));
  for (const i of sources) canvas.remove(objects[i]);
  canvas.add(path);
  selectResults(canvas, [path]);
  canvas.requestRenderAll();
  toast.success(t('Merged regions into one shape.'));
  return true;
}

/** Visual style inherited from a source object — same fields booleanOps copies. */
function styleOf(src: fabric.FabricObject) {
  return {
    fill: (src.fill as string) ?? '#3d9bff',
    stroke: (src.stroke as string) ?? '',
    strokeWidth: src.strokeWidth ?? 0,
    opacity: src.opacity ?? 1,
  };
}

/** Replace the selection with the gesture result(s). */
function selectResults(canvas: fabric.Canvas, objs: fabric.FabricObject[]): void {
  canvas.discardActiveObject();
  canvas.setActiveObject(objs.length === 1 ? objs[0] : new fabric.ActiveSelection(objs, { canvas }));
}

/* -------------------------------- overlays ----------------------------------- */

function modeFill(): string {
  return eraseMode
    ? readTokenAlpha('--color-danger', 0.35, 'rgba(224,85,107,0.35)')
    : readTokenAlpha('--color-accent2', 0.35, 'rgba(90,200,216,0.35)');
}

function modeStroke(): string {
  return eraseMode ? readToken('--color-danger', '#e0556b') : readToken('--color-accent2', '#5ac8d8');
}

/** Translucent accent wash over a swept region (kept out of export + hit tests). */
function addHighlight(canvas: fabric.Canvas, face: BuilderFace): void {
  const d = multiPolygonToPathD(face.geom);
  if (!d) return;
  const wash = new fabric.Path(d, {
    fill: modeFill(),
    stroke: modeStroke(),
    strokeWidth: 1,
    selectable: false,
    evented: false,
    excludeFromExport: true,
  });
  highlights.set(face.id, wash);
  canvas.add(wash);
}

function updateStrokePreview(canvas: fabric.Canvas): void {
  if (points.length < 2) return;
  const stroke = modeStroke();
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i][0]} ${points[i][1]}`;
  if (!strokePreview) {
    strokePreview = new fabric.Path(d, {
      stroke,
      strokeWidth: 1,
      fill: '',
      selectable: false,
      evented: false,
      excludeFromExport: true,
      strokeDashArray: [5, 4],
    });
    canvas.add(strokePreview);
  } else {
    strokePreview.set({ path: new fabric.Path(d).path, stroke });
    strokePreview.setCoords();
  }
  canvas.requestRenderAll();
}

function clearOverlays(): void {
  const canvas = getCanvas();
  if (canvas) {
    if (strokePreview) canvas.remove(strokePreview);
    for (const wash of highlights.values()) canvas.remove(wash);
  }
  strokePreview = null;
  highlights = new Map();
}

/* ---------------------------------- Esc -------------------------------------- */

/**
 * Esc cancels the in-flight sweep. Window capture phase so it beats App.tsx's
 * bubble-phase Escape handler (which deselects — mid-drag, the sweep is what
 * Esc means) and can swallow the key entirely. Same contract as knifeTool.
 */
function armEscape(): void {
  if (escListener || typeof window === 'undefined') return;
  escListener = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    shapeBuilderCancel();
  };
  window.addEventListener('keydown', escListener, { capture: true });
}

function disarmEscape(): void {
  if (escListener && typeof window !== 'undefined') {
    window.removeEventListener('keydown', escListener, { capture: true });
  }
  escListener = null;
}
