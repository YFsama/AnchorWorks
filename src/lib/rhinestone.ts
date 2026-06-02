/**
 * Rhinestone / hotfix templates (SignMaster Rhinestone).
 *
 * Walks each selected object's outline and drops an evenly-spaced ring of
 * "stones" — small circles — along it at a set centre-to-centre spacing. The
 * result is cut paths (one closed circle per stone) ready to cut a template or
 * print placement marks. Everything is mm-space, matching the cutter pipeline.
 */
import type * as fabric from 'fabric';
import { buildOutlineCutPaths } from './contourFromSelection';
import type { CutPath } from '../store/editor';

/** Resample a polyline to points spaced `spacing` mm apart along its length. */
function resampleByLength(
  pts: Array<[number, number]>,
  spacing: number,
  closed: boolean,
): Array<[number, number]> {
  if (pts.length < 2 || spacing <= 0) return pts.slice(0, 1);
  const out: Array<[number, number]> = [pts[0]];
  let carry = 0; // length accumulated since the last placed stone
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segLen < 1e-9) continue;
    const ux = (b[0] - a[0]) / segLen, uy = (b[1] - a[1]) / segLen;
    let pos = 0;
    while (carry + (segLen - pos) >= spacing) {
      pos += spacing - carry;
      out.push([a[0] + ux * pos, a[1] + uy * pos]);
      carry = 0;
    }
    carry += segLen - pos;
  }
  return out;
}

/** A closed circle polyline (mm) approximated with `segs` segments. */
function circle(cx: number, cy: number, r: number, segs = 16): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Build a rhinestone template from the selection: one circle (Ø `diameterMm`)
 * every `spacingMm` along each object's outline.
 */
export function rhinestoneFromSelection(
  objects: fabric.FabricObject[],
  spacingMm: number,
  diameterMm: number,
): CutPath[] {
  const outlines = buildOutlineCutPaths(objects, 0, 1);
  const r = Math.max(0.1, diameterMm / 2);
  const out: CutPath[] = [];
  for (const p of outlines) {
    if (p.points.length < 2) continue;
    for (const [cx, cy] of resampleByLength(p.points, spacingMm, p.closed)) {
      out.push({
        id: `rs-${Date.now().toString(36)}-${out.length}`,
        points: circle(cx, cy, r),
        closed: true,
        kind: 'manual',
        passes: 1,
      });
    }
  }
  return out;
}
