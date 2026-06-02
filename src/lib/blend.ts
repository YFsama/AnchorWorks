/**
 * Blend (Illustrator Object→Blend) — generate N intermediate copies between the
 * two selected objects, interpolating position, scale, rotation, opacity, and
 * fill/stroke colour. The two ends are kept; the steps are inserted between.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hexToRgb(h: string): [number, number, number] | null {
  const m = h.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(m)) return [parseInt(m[0] + m[0], 16), parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16)];
  if (/^[0-9a-f]{6}$/i.test(m)) return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  return null;
}
const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Interpolate two colours; falls back to `a` when either isn't a flat hex. */
function lerpColor(a: unknown, b: unknown, t: number): string {
  const av = typeof a === 'string' ? a : '';
  const bv = typeof b === 'string' ? b : '';
  const ra = hexToRgb(av), rb = hexToRgb(bv);
  if (!ra || !rb) return av;
  return `#${toHex(lerp(ra[0], rb[0], t))}${toHex(lerp(ra[1], rb[1], t))}${toHex(lerp(ra[2], rb[2], t))}`;
}

/** Blend `steps` intermediate copies between the two selected objects. */
export async function blendSelection(steps: number): Promise<number> {
  const canvas = getCanvas();
  if (!canvas || steps < 1) return 0;
  const objs = canvas.getActiveObjects();
  if (objs.length < 2) return 0;
  const all = canvas.getObjects();
  const sorted = [...objs].sort((x, y) => all.indexOf(x) - all.indexOf(y));
  const A = sorted[0];
  const B = sorted[sorted.length - 1];

  const created: fabric.FabricObject[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const o = await A.clone();
    o.set({
      left: lerp(A.left ?? 0, B.left ?? 0, t),
      top: lerp(A.top ?? 0, B.top ?? 0, t),
      scaleX: lerp(A.scaleX ?? 1, B.scaleX ?? 1, t),
      scaleY: lerp(A.scaleY ?? 1, B.scaleY ?? 1, t),
      angle: lerp(A.angle ?? 0, B.angle ?? 0, t),
      opacity: lerp(A.opacity ?? 1, B.opacity ?? 1, t),
      fill: lerpColor(A.fill, B.fill, t),
      stroke: lerpColor(A.stroke, B.stroke, t),
    });
    o.setCoords();
    canvas.add(o);
    created.push(o);
  }
  if (created.length === 0) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}
