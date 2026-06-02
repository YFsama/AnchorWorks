/**
 * Edit Colors — Invert / Convert to Grayscale (Illustrator Edit→Edit Colors).
 * Walk the selection (including group children) and remap every solid hex/rgb
 * fill + stroke through a per-channel transform. Gradients / patterns / named or
 * transparent paints are left untouched.
 */
import type * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { updateSelection } from './selectionApply';

type RGB = { r: number; g: number; b: number };

function* walk(obj: fabric.FabricObject): Generator<fabric.FabricObject> {
  yield obj;
  const kids = (obj as unknown as { _objects?: fabric.FabricObject[] })._objects;
  if (kids) for (const k of kids) yield* walk(k);
}

/** Parse '#rgb' / '#rrggbb' / 'rgb(r,g,b)' to channels, else null. */
export function parseColor(c: string): RGB | null {
  const s = c.trim().toLowerCase();
  const hex = s.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16) };
  }
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
export const toHex = ({ r, g, b }: RGB) => `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`;

/** Per-channel invert (exposed for tests). */
export const invertRGB = ({ r, g, b }: RGB): RGB => ({ r: 255 - r, g: 255 - g, b: 255 - b });
/** Per-channel luminance grey (exposed for tests). */
export const grayRGB = ({ r, g, b }: RGB): RGB => {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return { r: y, g: y, b: y };
};

/** True when the selection holds at least one object. */
export function canAdjustColors(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().length > 0;
}

function adjustSelection(fn: (rgb: RGB) => RGB): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  const remap = (cur: unknown): string | null => {
    if (typeof cur !== 'string' || !cur || cur === 'transparent') return null;
    const rgb = parseColor(cur);
    if (!rgb) return null;
    const next = toHex(fn(rgb));
    return next.toLowerCase() === cur.trim().toLowerCase() ? null : next;
  };
  for (const top of canvas.getActiveObjects()) {
    for (const o of walk(top)) {
      const nf = remap(o.fill); if (nf) { o.set('fill', nf); changed++; }
      const ns = remap(o.stroke); if (ns) { o.set('stroke', ns); changed++; }
    }
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Invert every solid fill/stroke colour (255 − channel). */
export function invertColorsSelection(): number {
  return adjustSelection(invertRGB);
}

/** Convert every solid fill/stroke colour to its luminance grey. */
export function grayscaleColorsSelection(): number {
  return adjustSelection(grayRGB);
}
