import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';

const MM_TO_PX = 3.7795;

type Pt = [number, number];
export type WidthProfile = 'uniform' | 'taper-start' | 'taper-end' | 'taper-both' | 'bulge' | 'hourglass';

export const WIDTH_PROFILES: WidthProfile[] = ['uniform', 'taper-start', 'taper-end', 'taper-both', 'bulge', 'hourglass'];

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function normalAt(points: Pt[], index: number): Pt {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const dx = next[0] - prev[0];
  const dy = next[1] - prev[1];
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

export function widthScaleAt(t: number, profile: WidthProfile): number {
  const u = Math.max(0, Math.min(1, t));
  switch (profile) {
    case 'taper-start': return 0.08 + 0.92 * u;
    case 'taper-end': return 1 - 0.92 * u;
    case 'taper-both': return 0.08 + 0.92 * Math.sin(Math.PI * u);
    case 'bulge': return 0.55 + 0.75 * Math.sin(Math.PI * u);
    case 'hourglass': return 0.35 + 0.65 * Math.abs(2 * u - 1);
    default: return 1;
  }
}

export function buildVariableWidthOutline(points: Pt[], baseWidth: number, profile: WidthProfile): Pt[] {
  if (points.length < 2 || baseWidth <= 0) return [];
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) lengths[i] = lengths[i - 1] + dist(points[i - 1], points[i]);
  const total = lengths[lengths.length - 1] || 1;
  const left: Pt[] = [];
  const right: Pt[] = [];
  points.forEach((point, index) => {
    const t = lengths[index] / total;
    const half = (baseWidth * widthScaleAt(t, profile)) / 2;
    const [nx, ny] = normalAt(points, index);
    left.push([point[0] + nx * half, point[1] + ny * half]);
    right.push([point[0] - nx * half, point[1] - ny * half]);
  });
  return [...left, ...right.reverse()];
}

function pointsToD(points: Pt[]): string {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + ' Z';
}

function longestOpenPolyline(obj: fabric.FabricObject): Pt[] | null {
  const cuts = buildOutlineCutPaths([obj], 0, 1).filter(cut => !cut.closed && cut.points.length >= 2);
  if (!cuts.length) return null;
  let best = cuts[0];
  for (const cut of cuts) if (cut.points.length > best.points.length) best = cut;
  return best.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt);
}

export function applyWidthProfileToObject(canvas: fabric.Canvas, object: fabric.FabricObject, profile: WidthProfile): fabric.Path | null {
  if ((object.strokeWidth ?? 0) <= 0 || typeof object.stroke !== 'string') return null;
  const points = longestOpenPolyline(object);
  if (!points) return null;
  const outline = buildVariableWidthOutline(points, object.strokeWidth ?? 1, profile);
  if (outline.length < 3) return null;
  const path = new fabric.Path(pointsToD(outline), {
    fill: object.stroke as string,
    stroke: '',
    strokeWidth: 0,
    opacity: object.opacity ?? 1,
    name: `Width Profile: ${profile}`,
  });
  object.set({ stroke: '', strokeWidth: 0 });
  object.setCoords();
  canvas.add(path);
  return path;
}

export function applyWidthProfileToSelection(profile: WidthProfile): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  const created: fabric.FabricObject[] = [];
  for (const obj of objs) {
    const path = applyWidthProfileToObject(canvas, obj, profile);
    if (path) created.push(path);
  }
  if (created.length > 0) {
    canvas.discardActiveObject();
    canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
    canvas.requestRenderAll();
    pushHistory();
  }
  return created.length;
}
