/**
 * Parametric shape generators (Illustrator / SignMaster shape tools). Each
 * builds a fabric.Path centred on the document and drops it on the canvas as the
 * new active selection. `object:added` already pushes history + assigns an id.
 *
 * The vertex math is split into pure `*Vertices` helpers so it can be unit
 * tested without a canvas.
 */
import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { useEditor } from '../store/editor';

type Pt = [number, number];

function toD(pts: Pt[], closed: boolean): string {
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return closed ? `${d} Z` : d;
}

/** Star outline: `points` tips alternating outer radius and `innerRatio`×outer.
 *  Vertices are laid out in a [0, 2·outerR] box, starting at the top tip. */
export function starVertices(points: number, innerRatio: number, outerR = 90): Pt[] {
  const n = Math.max(3, Math.min(60, Math.round(points)));
  const ratio = Math.max(0.05, Math.min(0.95, innerRatio));
  const innerR = outerR * ratio;
  const verts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    verts.push([outerR + r * Math.cos(a), outerR + r * Math.sin(a)]);
  }
  return verts;
}

/** Regular N-gon outline in a [0, 2·outerR] box, first vertex at the top. */
export function polygonVertices(sides: number, outerR = 90): Pt[] {
  const n = Math.max(3, Math.min(60, Math.round(sides)));
  const verts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    verts.push([outerR + outerR * Math.cos(a), outerR + outerR * Math.sin(a)]);
  }
  return verts;
}

/** Logarithmic spiral (open) of `turns` winds, each `decay`× the previous
 *  wind's radius. Sampled 48×/turn, centred in a [0, 2·outerR] box. */
export function spiralVertices(turns: number, decay: number, outerR = 90): Pt[] {
  const t = Math.max(0.5, Math.min(20, turns));
  const d = Math.max(0.1, Math.min(0.99, decay));
  const totalA = t * 2 * Math.PI;
  const steps = Math.max(8, Math.round(t * 48));
  const verts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * totalA;
    const r = outerR * Math.pow(d, a / (2 * Math.PI));
    verts.push([outerR + r * Math.cos(a - Math.PI / 2), outerR + r * Math.sin(a - Math.PI / 2)]);
  }
  return verts;
}

/** Default style for inserted shapes — mirror the store's current paint. */
function newShapeStyle() {
  const st = useEditor.getState().style;
  return {
    fill: st.fill ?? '#3d9bff',
    stroke: st.stroke ?? '',
    strokeWidth: st.strokeWidth ?? 0,
  };
}

function addCentred(d: string, style?: Partial<ReturnType<typeof newShapeStyle>>): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const path = new fabric.Path(d, { ...newShapeStyle(), ...style });
  const doc = useEditor.getState().doc;
  // fabric.Path positions by the path's own bbox; recentre on the document.
  path.set({ left: doc.width / 2 - (path.width ?? 0) / 2, top: doc.height / 2 - (path.height ?? 0) / 2 });
  path.setCoords();
  canvas.add(path);
  canvas.setActiveObject(path);
  canvas.requestRenderAll();
  return true;
}

/** Insert a star — Illustrator's Star tool. */
export function insertStar(points: number, innerRatio: number, outerR = 90): boolean {
  return addCentred(toD(starVertices(points, innerRatio, outerR), true));
}

/** Insert a regular polygon — Illustrator's Polygon tool. */
export function insertRegularPolygon(sides: number, outerR = 90): boolean {
  return addCentred(toD(polygonVertices(sides, outerR), true));
}

/** Insert a spiral — Illustrator's Spiral tool. Open path, so force a visible
 *  stroke and no fill (a filled spiral fills the implied chord region). */
export function insertSpiral(turns: number, decay: number, outerR = 90): boolean {
  const st = useEditor.getState().style;
  return addCentred(toD(spiralVertices(turns, decay, outerR), false), {
    fill: '',
    stroke: st.stroke && st.stroke !== '' ? st.stroke : '#0f0f12',
    strokeWidth: st.strokeWidth && st.strokeWidth > 0 ? st.strokeWidth : 2,
  });
}
