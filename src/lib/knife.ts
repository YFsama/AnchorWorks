/**
 * Knife — splits canvas objects along a cut line.
 *
 * Two flavours share this module:
 *  - axis cuts through object centres (horizontal / vertical), driven by the
 *    Edit menu + keyboard;
 *  - freehand cuts (Illustrator-style): the user drags a polyline and every
 *    crossed object is sliced along that corridor (see `knifeTool.ts` for
 *    the pointer state machine that feeds these functions).
 */

import * as fabric from 'fabric';
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';
import { ringToBezierPathD } from './pathOps';

const MM_TO_PX = 3.7795;
type Pt = [number, number];
export type KnifeAxis = 'horizontal' | 'vertical';

export interface KnifeBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

function boundsOfRing(ring: Pt[]): KnifeBounds {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { left, top, width: right - left, height: bottom - top };
}

function closeRing(points: Pt[]): Ring {
  const ring = points.map(([x, y]) => [x, y] as Pt);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([first[0], first[1]]);
  return ring as Ring;
}

function halfPlane(bounds: KnifeBounds, axis: KnifeAxis, side: 'start' | 'end'): Ring {
  const pad = Math.max(bounds.width, bounds.height, 1) + 2;
  const left = bounds.left - pad;
  const right = bounds.left + bounds.width + pad;
  const top = bounds.top - pad;
  const bottom = bounds.top + bounds.height + pad;
  if (axis === 'horizontal') {
    const mid = bounds.top + bounds.height / 2;
    return side === 'start'
      ? closeRing([[left, top], [right, top], [right, mid], [left, mid]])
      : closeRing([[left, mid], [right, mid], [right, bottom], [left, bottom]]);
  }
  const mid = bounds.left + bounds.width / 2;
  return side === 'start'
    ? closeRing([[left, top], [mid, top], [mid, bottom], [left, bottom]])
    : closeRing([[mid, top], [right, top], [right, bottom], [mid, bottom]]);
}

function polygonArea(ring: Ring): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

export function knifeSplitRingAtCenter(ring: Pt[], axis: KnifeAxis): MultiPolygon {
  if (ring.length < 4) return [];
  const source: MultiPolygon = [[closeRing(ring)]];
  const bounds = boundsOfRing(ring);
  const first = polygonClipping.intersection(source, [[halfPlane(bounds, axis, 'start')]]) as MultiPolygon;
  const second = polygonClipping.intersection(source, [[halfPlane(bounds, axis, 'end')]]) as MultiPolygon;
  return [...first, ...second].filter((polygon) => polygon[0] && polygonArea(polygon[0]) > 0.01);
}

function pathFromPolygon(polygon: Ring[], source: fabric.FabricObject): fabric.Path | null {
  const parts = polygon
    .map((ring) => ringToBezierPathD(ring.map(([x, y]) => [x, y] as Pt)))
    .filter(Boolean);
  if (!parts.length) return null;
  return new fabric.Path(parts.join(' '), {
    fill: typeof source.fill === 'string' ? source.fill : '',
    stroke: typeof source.stroke === 'string' ? source.stroke : '',
    strokeWidth: source.strokeWidth ?? 0,
    opacity: source.opacity ?? 1,
    fillRule: 'evenodd',
  });
}

function objectClosedRingsPx(object: fabric.FabricObject): Pt[][] {
  return buildOutlineCutPaths([object], 0, 1)
    .filter((cutPath) => cutPath.closed && cutPath.points.length >= 4)
    .map((cutPath) => cutPath.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt));
}

export function knifeSplitObjectAtCenter(canvas: fabric.Canvas, object: fabric.FabricObject, axis: KnifeAxis): fabric.Path[] {
  const rings = objectClosedRingsPx(object);
  if (!rings.length) return [];
  const pieces: fabric.Path[] = [];
  for (const ring of rings) {
    for (const polygon of knifeSplitRingAtCenter(ring, axis)) {
      const path = pathFromPolygon(polygon, object);
      if (path) pieces.push(path);
    }
  }
  if (pieces.length < 2) return [];
  canvas.remove(object);
  pieces.forEach((piece) => canvas.add(piece));
  return pieces;
}

export function knifeSplitSelectionAtCenter(axis: KnifeAxis): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const selected = canvas.getActiveObjects();
  const created: fabric.FabricObject[] = [];
  let count = 0;

  for (const object of selected) {
    const pieces = knifeSplitObjectAtCenter(canvas as fabric.Canvas, object, axis);
    if (pieces.length === 0) continue;
    created.push(...pieces);
    count += 1;
  }

  if (count > 0) {
    canvas.discardActiveObject();
    canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}

/* ============================================================ */
/* Freehand knife — drag a polyline across objects to slice them */
/* ============================================================ */

/**
 * Half-width of the cut corridor in canvas px. The knife models a blade with
 * a physical kerf: the drawn polyline is thickened by ±KNIFE_HALF_WIDTH and
 * the sliver inside the corridor is discarded, so the two surviving pieces
 * carry a visible hairline gap exactly where the user dragged (Illustrator's
 * knife keeps both edges touching; a cutter app wants the kerf).
 */
export const KNIFE_HALF_WIDTH = 0.5;

/** Pieces below this area (px²) are considered kerf slivers and dropped. */
const MIN_PIECE_AREA_PX = 1;

/**
 * Thicken a drag polyline into a closed "cut corridor" polygon. Each segment
 * contributes a quad offset ±halfWidth along its left normal; each vertex
 * (including both endpoints, which act as round-ish caps) contributes an
 * octagon so turns and reversals don't leave notches. Everything is merged
 * with a polygon union, which also cleans up self-intersections when the
 * user scribbles back over their own stroke.
 */
export function buildCutCorridor(points: Pt[], halfWidth: number): MultiPolygon {
  if (points.length === 0) return [];
  const w = Math.max(0.05, halfWidth);
  const polys: Polygon[] = [];

  const octagon = (cx: number, cy: number): Polygon => {
    const ring: Pt[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ring.push([cx + Math.cos(a) * w, cy + Math.sin(a) * w]);
    }
    ring.push(ring[0]);
    return [ring as Ring];
  };

  // Vertex caps/joins — covers endpoints (caps) and interior turns (round joins).
  for (const [x, y] of points) polys.push(octagon(x, y));

  // Segment quads.
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const nx = (dy / len) * w;
    const ny = (-dx / len) * w;
    const quad: Pt[] = [
      [ax + nx, ay + ny],
      [bx + nx, by + ny],
      [bx - nx, by - ny],
      [ax - nx, ay - ny],
      [ax + nx, ay + ny],
    ];
    polys.push([quad as Ring]);
  }

  try {
    return polygonClipping.union(polys[0], ...polys.slice(1));
  } catch {
    return [polys[0]];
  }
}

/**
 * Split one closed ring by the cut corridor: everything OUTSIDE the corridor
 * survives, in however many connected pieces the cut carved (2 for a simple
 * slice; more when the polyline zig-zags). The kerf sliver inside the
 * corridor is intentionally dropped.
 */
export function knifeSplitRingByCorridor(ring: Pt[], corridor: MultiPolygon): MultiPolygon {
  if (ring.length < 4 || corridor.length === 0) return [];
  const source: MultiPolygon = [[closeRing(ring)]];
  try {
    const remainder = polygonClipping.difference(source, corridor) as MultiPolygon;
    return remainder.filter((polygon) => polygon[0] && polygonArea(polygon[0]) > MIN_PIECE_AREA_PX);
  } catch {
    return [];
  }
}

/**
 * Split one canvas object along a freehand polyline (scene/canvas coords).
 * Returns the replacement fabric.Path pieces (empty when the corridor didn't
 * actually divide the object — a graze that produces <2 pieces leaves the
 * original untouched, matching the axis-knife behaviour above).
 */
export function knifeSplitObjectAlongPolyline(
  object: fabric.FabricObject,
  polyline: Pt[],
  halfWidth = KNIFE_HALF_WIDTH,
): fabric.Path[] {
  if (polyline.length < 2) return [];
  const corridor = buildCutCorridor(polyline, halfWidth);
  if (corridor.length === 0) return [];

  // Coarse reject: corridor bbox vs object bbox — a drag nowhere near the
  // object shouldn't pay for ring extraction + boolean difference.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polyline) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const b = object.getBoundingRect();
  const pad = halfWidth * 2;
  if (maxX < b.left - pad || minX > b.left + b.width + pad ||
      maxY < b.top - pad || minY > b.top + b.height + pad) return [];

  const rings = objectClosedRingsPx(object);
  if (!rings.length) return [];
  const pieces: fabric.Path[] = [];
  for (const ring of rings) {
    for (const polygon of knifeSplitRingByCorridor(ring, corridor)) {
      const path = pathFromPolygon(polygon, object);
      if (path) pieces.push(path);
    }
  }
  // Only a real division replaces the object — a corridor that touches an
  // edge or clips a corner sliver smaller than the whole doesn't count.
  if (pieces.length < 2) return [];
  return pieces;
}

/**
 * Freehand-knife entry point (called from knifeTool on pointer-up). Slices
 * every object the drawn corridor crosses: the active selection when one
 * exists, otherwise all top-level objects (same targeting rule as the
 * eraser). Returns the number of objects that were actually divided.
 */
export function knifeCutAlongPolyline(polyline: Pt[], halfWidth = KNIFE_HALF_WIDTH): number {
  const canvas = getCanvas();
  if (!canvas) return 0;

  const selected = canvas.getActiveObjects().filter(o => !isOverlayObject(o));
  const targets = selected.length > 0
    ? selected
    : canvas.getObjects().filter(o => !isOverlayObject(o));

  const created: fabric.FabricObject[] = [];
  let splitCount = 0;
  for (const object of targets) {
    const pieces = knifeSplitObjectAlongPolyline(object, polyline, halfWidth);
    if (pieces.length === 0) continue;
    canvas.remove(object);
    pieces.forEach((piece) => canvas.add(piece));
    created.push(...pieces);
    splitCount += 1;
  }

  if (splitCount > 0) {
    canvas.discardActiveObject();
    canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
    canvas.requestRenderAll();
    pushHistory();
  }
  return splitCount;
}

/** Overlay/painter objects (path-edit handles, tool previews) are never cut. */
function isOverlayObject(o: fabric.FabricObject): boolean {
  return !!(o as { excludeFromExport?: boolean }).excludeFromExport;
}
