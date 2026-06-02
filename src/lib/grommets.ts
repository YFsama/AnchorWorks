/**
 * Banner grommets (SignMaster banner finishing) — drop evenly-spaced grommet
 * holes around the inset perimeter of the selection's bounding box: one at each
 * corner and extra holes along each edge so the gap never exceeds the spacing.
 * Output is cut-path circles (mm) the user can cut/print on a vinyl banner.
 */
import { getCanvas } from './canvasEngine';
import type { CutPath } from '../store/editor';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

/** A closed circle polyline (mm). */
function circle(cx: number, cy: number, r: number, segs = 20): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Grommet centres + circles around the selection bbox. `insetMm` is the hole
 * centre's distance from the edge; `maxSpacingMm` caps the gap between holes on
 * an edge; `diameterMm` is the hole size.
 */
export function grommetsFromSelection(insetMm = 20, maxSpacingMm = 500, diameterMm = 10): CutPath[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  const objs = canvas.getActiveObjects();
  if (objs.length === 0) return [];

  const rects = objs.map((o) => o.getBoundingRect());
  const minX = Math.min(...rects.map((r) => r.left)) / MM_TO_PX;
  const minY = Math.min(...rects.map((r) => r.top)) / MM_TO_PX;
  const maxX = Math.max(...rects.map((r) => r.left + r.width)) / MM_TO_PX;
  const maxY = Math.max(...rects.map((r) => r.top + r.height)) / MM_TO_PX;

  // Inset rectangle, clamped so it never crosses itself on small banners.
  const inset = Math.min(insetMm, (maxX - minX) / 2, (maxY - minY) / 2);
  const x0 = minX + inset, x1 = maxX - inset, y0 = minY + inset, y1 = maxY - inset;
  const spacing = Math.max(10, maxSpacingMm);

  const centres: Pt[] = [];
  // Walk each edge, emitting the start corner + interior points (the next edge
  // emits the shared corner), so corners aren't doubled.
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / spacing));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      centres.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
  };
  edge(x0, y0, x1, y0);
  edge(x1, y0, x1, y1);
  edge(x1, y1, x0, y1);
  edge(x0, y1, x0, y0);

  const r = Math.max(0.5, diameterMm / 2);
  const stamp = Date.now().toString(36);
  return centres.map((c, i) => ({
    id: `gr-${stamp}-${i}`,
    points: circle(c[0], c[1], r),
    closed: true,
    kind: 'manual' as const,
    passes: 1,
  }));
}
