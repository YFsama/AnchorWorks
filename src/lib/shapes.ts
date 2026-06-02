/**
 * Parametric shape generators (Illustrator / SignMaster shape tools). Each
 * builds a fabric.Path centred on the document and drops it on the canvas as the
 * new active selection. `object:added` already pushes history + assigns an id.
 */
import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { useEditor } from '../store/editor';

type Pt = [number, number];

function toClosedD(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + ' Z';
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

function addCentred(d: string): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const path = new fabric.Path(d, newShapeStyle());
  const doc = useEditor.getState().doc;
  // fabric.Path positions by the path's own bbox; recentre on the document.
  path.set({ left: doc.width / 2 - (path.width ?? 0) / 2, top: doc.height / 2 - (path.height ?? 0) / 2 });
  path.setCoords();
  canvas.add(path);
  canvas.setActiveObject(path);
  canvas.requestRenderAll();
  return true;
}

/**
 * Insert a star with `points` tips, alternating an outer radius and an inner
 * radius (`innerRatio` × outer) — Illustrator's Star tool. `points` is clamped
 * to 3–60, `innerRatio` to 0.05–0.95.
 */
export function insertStar(points: number, innerRatio: number, outerR = 90): boolean {
  const n = Math.max(3, Math.min(60, Math.round(points)));
  const ratio = Math.max(0.05, Math.min(0.95, innerRatio));
  const innerR = outerR * ratio;
  const verts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    // Start at the top tip (−90°) and go clockwise.
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    verts.push([outerR + r * Math.cos(a), outerR + r * Math.sin(a)]);
  }
  return addCentred(toClosedD(verts));
}

/** Insert a regular polygon with `sides` sides — Illustrator's Polygon tool. */
export function insertRegularPolygon(sides: number, outerR = 90): boolean {
  const n = Math.max(3, Math.min(60, Math.round(sides)));
  const verts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    verts.push([outerR + outerR * Math.cos(a), outerR + outerR * Math.sin(a)]);
  }
  return addCentred(toClosedD(verts));
}
