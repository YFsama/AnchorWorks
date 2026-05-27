/**
 * Array transforms — Illustrator "Object > Repeat" analogue.
 *
 * Three flavours of structured cloning, each operating on the current canvas
 * selection: a regular Grid, a Radial array around a centre point, and a
 * Mirror kaleidoscope. Every clone is independently added to the canvas (no
 * "live" linkage) so they can be edited individually afterwards.
 *
 * All entry points are async because Fabric v6's `obj.clone()` returns a
 * Promise — see `duplicateSelection` in canvasEngine for the same pattern.
 * Each function calls `pushHistory()` exactly once at the end so the entire
 * array operation is a single undo step.
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

type FabricObject = fabric.FabricObject;

/**
 * Snapshot the active selection as a stable list of "source" objects we can
 * clone from. When the active object is an ActiveSelection we want each
 * member; when it's a single object (group, path, etc.) we keep it whole.
 */
function selectionSources(): FabricObject[] {
  const c = getCanvas();
  if (!c) return [];
  const active = c.getActiveObject();
  if (!active) return [];
  if (active.type === 'activeselection') {
    return (active as fabric.ActiveSelection).getObjects() as FabricObject[];
  }
  return [active];
}

/**
 * Union bounding rect of the given objects, in scene coordinates. Returned
 * shape mirrors Fabric's `getBoundingRect()` so callers can reuse the same
 * field names (left/top/width/height + derived centerX/centerY).
 */
function unionBounds(objs: FabricObject[]) {
  if (!objs.length) return { left: 0, top: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  const rects = objs.map(o => o.getBoundingRect());
  const left = Math.min(...rects.map(r => r.left));
  const top = Math.min(...rects.map(r => r.top));
  const right = Math.max(...rects.map(r => r.left + r.width));
  const bottom = Math.max(...rects.map(r => r.top + r.height));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

/**
 * Deep-clone a Fabric object and resolve to the cloned instance. Wraps
 * Fabric v6's Promise-returning `clone()` so callers can simply `await`.
 */
async function cloneObject(o: FabricObject): Promise<FabricObject> {
  return o.clone() as Promise<FabricObject>;
}

export interface RepeatGridParams {
  cols: number;
  rows: number;
  dx: number;
  dy: number;
  /** If true, wrap the produced clones into a single fabric.Group. */
  applyAsGroup?: boolean;
}

/**
 * Tile the selection into a `cols × rows` grid, offsetting each instance by
 * `(dx, dy)` per step. The original selection stays put; clones occupy every
 * cell except (0,0). Returns the number of clones added.
 */
export async function repeatGrid({ cols, rows, dx, dy, applyAsGroup = false }: RepeatGridParams): Promise<number> {
  const c = getCanvas();
  if (!c) return 0;
  const sources = selectionSources();
  if (!sources.length) return 0;
  cols = Math.max(1, Math.floor(cols));
  rows = Math.max(1, Math.floor(rows));

  const produced: FabricObject[] = [];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      // Skip the origin cell — the source objects already live there.
      if (col === 0 && r === 0) continue;
      const ox = col * dx;
      const oy = r * dy;
      for (const src of sources) {
        const clone = await cloneObject(src);
        clone.set({
          left: (src.left ?? 0) + ox,
          top: (src.top ?? 0) + oy,
        });
        clone.setCoords();
        produced.push(clone);
      }
    }
  }

  if (applyAsGroup && produced.length > 0) {
    // Group includes the original sources so the whole array reads as one
    // object after creation. We re-add the source objects through Group too.
    const all = [...sources, ...produced];
    // Remove sources from the canvas so Group can take ownership.
    for (const s of sources) c.remove(s);
    const g = new fabric.Group(all);
    c.add(g);
    c.setActiveObject(g);
  } else {
    for (const o of produced) c.add(o);
  }

  c.requestRenderAll();
  pushHistory();
  return produced.length;
}

export interface RepeatRadialParams {
  count: number;
  radius: number;
  /** Degrees. Default 0. */
  startAngle?: number;
  /** Degrees. Default 360. */
  endAngle?: number;
  /** If true, each clone rotates to face outward from the centre. */
  rotateInstances?: boolean;
  /** Scene-space centre X. Defaults to selection centre. */
  centerX?: number;
  /** Scene-space centre Y. Defaults to selection centre. */
  centerY?: number;
}

/**
 * Clone the selection `count` times around a centre point, evenly spaced
 * between `startAngle` and `endAngle`. When the angular span is exactly
 * 360° we treat it as a closed ring (no duplicate at the seam); otherwise
 * the endpoints are both populated.
 */
export async function repeatRadial({
  count,
  radius,
  startAngle = 0,
  endAngle = 360,
  rotateInstances = false,
  centerX,
  centerY,
}: RepeatRadialParams): Promise<number> {
  const c = getCanvas();
  if (!c) return 0;
  const sources = selectionSources();
  if (!sources.length) return 0;
  count = Math.max(2, Math.floor(count));

  const ub = unionBounds(sources);
  const cx = typeof centerX === 'number' ? centerX : ub.centerX;
  const cy = typeof centerY === 'number' ? centerY : ub.centerY + radius; // place ring below by default

  // Distinguish closed-ring (full 360°) from open-arc cases when deciding
  // how to lerp the angles across instances.
  const closed = Math.abs(((endAngle - startAngle) % 360) || 360) === 0
    || Math.abs(endAngle - startAngle) >= 360 - 1e-6;
  const denom = closed ? count : Math.max(1, count - 1);

  const produced: FabricObject[] = [];
  // i=0 corresponds to the original position — we move the source there too
  // so the radial array is uniformly arranged (Illustrator behaviour).
  for (let i = 0; i < count; i++) {
    const t = i / denom;
    const angleDeg = startAngle + (endAngle - startAngle) * t;
    const angleRad = (angleDeg * Math.PI) / 180;
    // 0° = "up" by convention, matching most polar tools (the default
    // centre is placed below the selection so 0° points back at it).
    const px = cx + radius * Math.sin(angleRad);
    const py = cy - radius * Math.cos(angleRad);

    if (i === 0) {
      // Reposition the originals around the first slot. Each source moves so
      // its centre lands on (px, py). We keep the existing source as the
      // anchor of the array.
      for (const src of sources) {
        const b = src.getBoundingRect();
        const dx = px - (b.left + b.width / 2);
        const dy = py - (b.top + b.height / 2);
        src.set({ left: (src.left ?? 0) + dx, top: (src.top ?? 0) + dy });
        if (rotateInstances) src.set({ angle: (src.angle ?? 0) + angleDeg });
        src.setCoords();
      }
      continue;
    }

    for (const src of sources) {
      const clone = await cloneObject(src);
      const sb = src.getBoundingRect();
      const dx = px - (sb.left + sb.width / 2);
      const dy = py - (sb.top + sb.height / 2);
      clone.set({
        left: (src.left ?? 0) + dx,
        top: (src.top ?? 0) + dy,
      });
      if (rotateInstances) clone.set({ angle: (src.angle ?? 0) + angleDeg });
      clone.setCoords();
      produced.push(clone);
    }
  }

  for (const o of produced) c.add(o);
  c.requestRenderAll();
  pushHistory();
  return produced.length;
}

export interface RepeatMirrorParams {
  axis: 'horizontal' | 'vertical' | 'both';
}

/**
 * Reflect the selection across an axis through the union-bounding-box centre.
 * - 'horizontal' flips X (mirror left/right) → 1 clone.
 * - 'vertical' flips Y (mirror top/bottom) → 1 clone.
 * - 'both' produces 3 clones (X, Y, XY) → 4-instance kaleidoscope.
 *
 * The mirrored clones are positioned so their bounding boxes touch the
 * source's (no overlap, no gap) — i.e. the source and its mirror sit
 * side-by-side / stacked across the chosen axis.
 */
export async function repeatMirror({ axis }: RepeatMirrorParams): Promise<number> {
  const c = getCanvas();
  if (!c) return 0;
  const sources = selectionSources();
  if (!sources.length) return 0;

  const ub = unionBounds(sources);

  // Build the list of flip combinations to produce.
  const variants: { fx: boolean; fy: boolean }[] = [];
  if (axis === 'horizontal') variants.push({ fx: true, fy: false });
  else if (axis === 'vertical') variants.push({ fx: false, fy: true });
  else if (axis === 'both') {
    variants.push({ fx: true, fy: false });
    variants.push({ fx: false, fy: true });
    variants.push({ fx: true, fy: true });
  }

  const produced: FabricObject[] = [];
  for (const v of variants) {
    for (const src of sources) {
      const clone = await cloneObject(src);
      // Toggle flip flags (XOR with existing) so a pre-flipped source still
      // mirrors visually rather than reverting to original orientation.
      clone.set({
        flipX: v.fx ? !(src.flipX ?? false) : (src.flipX ?? false),
        flipY: v.fy ? !(src.flipY ?? false) : (src.flipY ?? false),
      });
      // Reflect each clone's centre across the corresponding axis through
      // the union-bounds centre, then translate so the mirrored bbox abuts
      // the source's bbox (no overlap).
      const b = src.getBoundingRect();
      const srcCx = b.left + b.width / 2;
      const srcCy = b.top + b.height / 2;
      let newCx = srcCx;
      let newCy = srcCy;
      if (v.fx) newCx = 2 * ub.centerX - srcCx + ub.width;
      if (v.fy) newCy = 2 * ub.centerY - srcCy + ub.height;
      const dx = newCx - srcCx;
      const dy = newCy - srcCy;
      clone.set({
        left: (src.left ?? 0) + dx,
        top: (src.top ?? 0) + dy,
      });
      clone.setCoords();
      produced.push(clone);
    }
  }

  for (const o of produced) c.add(o);
  c.requestRenderAll();
  pushHistory();
  return produced.length;
}
