import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { buildOutlineCutPaths } from './contourFromSelection';
import { roughenPolyline } from './roughen';
import { zigzagPolyline } from './zigzag';
import { puckerBloatPolyline } from './pucker';
import { twistPolyline } from './twist';

const MM_TO_PX = 3.7795;
type Pt = [number, number];
type DistortPreviewKind = 'roughen' | 'zigzag' | 'pucker' | 'twist';

type PreviewParams =
  | { kind: 'roughen'; sizeMm: number; detailMm: number }
  | { kind: 'zigzag'; sizeMm: number; ridges: number; smooth: boolean }
  | { kind: 'pucker'; amount: number }
  | { kind: 'twist'; angleDeg: number };

const PREVIEW_FLAG = '__distortPreview';

function toD(pts: Pt[], closed: boolean): string {
  const parts = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  if (closed) parts.push('Z');
  return parts.join(' ');
}

function densify(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts.slice();
  const dense: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / 2));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return dense;
}

function collectSourceLoops(obj: fabric.FabricObject): { pts: Pt[]; closed: boolean }[] {
  return buildOutlineCutPaths([obj], 0, 1)
    .map(cp => ({ pts: cp.points.map(([x, y]) => [x * MM_TO_PX, y * MM_TO_PX] as Pt), closed: cp.closed }))
    .filter(loop => loop.pts.length >= 2);
}

function previewLoops(obj: fabric.FabricObject, params: PreviewParams): { pts: Pt[]; closed: boolean }[] {
  const loops = collectSourceLoops(obj);
  if (params.kind === 'twist') {
    const denseLoops = loops.map(loop => ({ ...loop, pts: densify(loop.pts) }));
    let cx = 0, cy = 0, total = 0;
    for (const loop of denseLoops) for (const [x, y] of loop.pts) { cx += x; cy += y; total++; }
    if (total === 0) return [];
    cx /= total; cy /= total;
    let radius = 0;
    for (const loop of denseLoops) for (const [x, y] of loop.pts) radius = Math.max(radius, Math.hypot(x - cx, y - cy));
    const maxRad = (params.angleDeg * Math.PI) / 180;
    return denseLoops.map(loop => ({ ...loop, pts: twistPolyline(loop.pts, loop.closed, cx, cy, radius, maxRad) }));
  }
  return loops.map(loop => {
    if (params.kind === 'roughen') {
      return { ...loop, pts: roughenPolyline(loop.pts, loop.closed, params.sizeMm * MM_TO_PX, Math.max(0.5, params.detailMm) * MM_TO_PX) };
    }
    if (params.kind === 'zigzag') {
      return { ...loop, pts: zigzagPolyline(loop.pts, loop.closed, params.sizeMm * MM_TO_PX, Math.round(params.ridges), params.smooth) };
    }
    return { ...loop, pts: puckerBloatPolyline(loop.pts, loop.closed, Math.max(-1, Math.min(1, params.amount))) };
  });
}

export function clearDistortPreview(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const previews = canvas.getObjects().filter(o => (o as unknown as Record<string, unknown>)[PREVIEW_FLAG]);
  if (!previews.length) return;
  previews.forEach(o => canvas.remove(o));
  canvas.requestRenderAll();
}

export function updateDistortPreview(params: PreviewParams): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  clearDistortPreview();
  const objs = canvas.getActiveObjects().filter(o => o.type === 'path' || o.type === 'rect' || o.type === 'polygon' || o.type === 'ellipse');
  let count = 0;
  for (const obj of objs) {
    const parts: string[] = [];
    for (const loop of previewLoops(obj, params)) {
      if (loop.pts.length >= 2) parts.push(toD(loop.pts, loop.closed));
    }
    if (!parts.length) continue;
    const preview = new fabric.Path(parts.join(' '), {
      fill: 'rgba(255, 46, 154, 0.12)',
      stroke: '#ff2e9a',
      strokeDashArray: [6, 4],
      strokeWidth: 1.5,
      selectable: false,
      evented: false,
      opacity: 0.95,
      excludeFromExport: true,
    });
    (preview as unknown as Record<string, unknown>)[PREVIEW_FLAG] = params.kind satisfies DistortPreviewKind;
    canvas.add(preview);
    canvas.bringObjectToFront(preview);
    count++;
  }
  canvas.requestRenderAll();
  return count;
}
