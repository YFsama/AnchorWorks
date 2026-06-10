import * as fabric from 'fabric';
import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
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
