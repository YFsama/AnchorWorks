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

type HSL = { h: number; s: number; l: number };

/** RGB (0–255) → HSL (h 0–360, s/l 0–1). */
export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

/** HSL → RGB (0–255). */
export function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = ((h % 360) + 360) % 360 / 360;
  const ch = (t: number) => {
    let tc = t;
    if (tc < 0) tc += 1;
    if (tc > 1) tc -= 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
    return p;
  };
  return { r: ch(hk + 1 / 3) * 255, g: ch(hk) * 255, b: ch(hk - 1 / 3) * 255 };
}

/** Scale saturation by `factor` (0 = grey, 1 = unchanged, >1 = more vivid). */
export const saturateRGB = (rgb: RGB, factor: number): RGB => {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ ...hsl, s: Math.max(0, Math.min(1, hsl.s * factor)) });
};

/** Rotate hue by `deg` degrees around the colour wheel. */
export const shiftHueRGB = (rgb: RGB, deg: number): RGB => {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ ...hsl, h: ((hsl.h + deg) % 360 + 360) % 360 });
};

/** Scale lightness by `factor` (0 = black, 1 = unchanged, >1 = lighter). */
export const brightenRGB = (rgb: RGB, factor: number): RGB => {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ ...hsl, l: Math.max(0, Math.min(1, hsl.l * factor)) });
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

/** Scale the saturation of every solid fill/stroke. `amount` is a percentage
 *  in [-100, 100]: −100 → greyscale, 0 → unchanged, +100 → double saturation. */
export function saturateColorsSelection(amount: number): number {
  const factor = 1 + amount / 100;
  return adjustSelection((rgb) => saturateRGB(rgb, factor));
}

/** Rotate the hue of every solid fill/stroke by `deg` degrees. */
export function shiftHueColorsSelection(deg: number): number {
  return adjustSelection((rgb) => shiftHueRGB(rgb, deg));
}

/** Lighten/darken every solid fill/stroke. `amount` in [-100, 100]: −100 →
 *  black, 0 → unchanged, +100 → doubled lightness. */
export function brightnessColorsSelection(amount: number): number {
  const factor = 1 + amount / 100;
  return adjustSelection((rgb) => brightenRGB(rgb, factor));
}
