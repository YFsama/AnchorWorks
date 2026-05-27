import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

export type GradientStop = { offset: number; color: string };
export type GradientType = 'linear' | 'radial';

/**
 * Apply a gradient fill to all currently-selected objects.
 * @param stops  Array of { offset (0..1), color }
 * @param type   'linear' | 'radial'
 * @param angle  Degrees, used only for linear gradients (0 = left→right)
 */
export function applyGradientToSelection(
  stops: GradientStop[],
  type: GradientType,
  angle: number,
) {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;

  // Normalize stops: minimum 2, clamp/sort offsets
  const safeStops = (stops.length >= 2 ? stops : [
    { offset: 0, color: '#ffffff' },
    { offset: 1, color: '#000000' },
  ])
    .map((s) => ({ offset: Math.max(0, Math.min(1, s.offset)), color: s.color }))
    .sort((a, b) => a.offset - b.offset);

  objs.forEach((o) => {
    const w = (o.width ?? 0) || 1;
    const h = (o.height ?? 0) || 1;

    let coords: { x1: number; y1: number; x2: number; y2: number; r1?: number; r2?: number };

    if (type === 'linear') {
      // angle in degrees → vector across bounding box
      const rad = (angle * Math.PI) / 180;
      const cx = w / 2;
      const cy = h / 2;
      const halfLen = (Math.abs(Math.cos(rad)) * w + Math.abs(Math.sin(rad)) * h) / 2;
      const dx = Math.cos(rad) * halfLen;
      const dy = Math.sin(rad) * halfLen;
      coords = {
        x1: cx - dx,
        y1: cy - dy,
        x2: cx + dx,
        y2: cy + dy,
      };
    } else {
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.max(w, h) / 2;
      coords = {
        x1: cx,
        y1: cy,
        x2: cx,
        y2: cy,
        r1: 0,
        r2: r,
      };
    }

    const gradient = new fabric.Gradient({
      type,
      gradientUnits: 'pixels',
      coords,
      colorStops: safeStops,
    });

    o.set({ fill: gradient });
    o.setCoords();
  });

  canvas.requestRenderAll();
  pushHistory();
}

export type ShadowSpec = {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
};

/** Apply (or remove with null) a drop shadow on all selected objects. */
export function applyShadowToSelection(shadow: ShadowSpec | null) {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;

  objs.forEach((o) => {
    if (shadow) {
      o.shadow = new fabric.Shadow({
        color: shadow.color,
        blur: shadow.blur,
        offsetX: shadow.offsetX,
        offsetY: shadow.offsetY,
      });
    } else {
      o.shadow = null;
    }
    o.setCoords();
  });
  canvas.requestRenderAll();
  pushHistory();
}

export type StrokeStylePatch = Partial<{
  strokeDashArray: number[];
  strokeLineCap: CanvasLineCap;
  strokeLineJoin: CanvasLineJoin;
}>;

/** Apply advanced stroke styling (dash, line cap, line join) to selection. */
export function applyStrokeStyleToSelection(patch: StrokeStylePatch) {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;

  objs.forEach((o) => {
    if (patch.strokeDashArray !== undefined) {
      o.set('strokeDashArray', patch.strokeDashArray.length ? patch.strokeDashArray : null);
    }
    if (patch.strokeLineCap !== undefined) {
      o.set('strokeLineCap', patch.strokeLineCap);
    }
    if (patch.strokeLineJoin !== undefined) {
      o.set('strokeLineJoin', patch.strokeLineJoin);
    }
    o.setCoords();
  });
  canvas.requestRenderAll();
  pushHistory();
}

/** Apply a `globalCompositeOperation` (blend mode) to selection. */
export function applyBlendModeToSelection(mode: GlobalCompositeOperation) {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;

  objs.forEach((o) => {
    o.globalCompositeOperation = mode;
    o.setCoords();
  });
  canvas.requestRenderAll();
  pushHistory();
}

// ---------- Color helpers (HSL math for palette generation) ----------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

// ---------- Pattern fills ----------

export type PatternKind = 'checker' | 'stripes' | 'dots' | 'crosshatch';

/** Render a small repeating tile of the requested pattern to an offscreen canvas. */
function makePatternCanvas(
  kind: PatternKind,
  size: number,
  color1: string,
  color2: string,
): HTMLCanvasElement {
  const s = Math.max(2, Math.floor(size));
  const cv = document.createElement('canvas');
  cv.width = s;
  cv.height = s;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;

  // Background
  ctx.fillStyle = color1;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = color2;
  ctx.strokeStyle = color2;

  switch (kind) {
    case 'checker': {
      // Two diagonally opposite cells in foreground color.
      const h = s / 2;
      ctx.fillRect(0, 0, h, h);
      ctx.fillRect(h, h, h, h);
      break;
    }
    case 'stripes': {
      // Diagonal stripes, foreground band of ~40% of tile.
      const stripe = Math.max(1, Math.floor(s * 0.4));
      ctx.lineWidth = stripe;
      ctx.beginPath();
      // Two diagonal lines so the tile wraps cleanly.
      ctx.moveTo(-s, s);
      ctx.lineTo(s * 2, -s * 2);
      ctx.moveTo(0, s * 2);
      ctx.lineTo(s * 2, 0);
      ctx.stroke();
      break;
    }
    case 'dots': {
      const r = Math.max(1, Math.floor(s * 0.22));
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'crosshatch': {
      ctx.lineWidth = Math.max(1, Math.floor(s * 0.12));
      ctx.beginPath();
      // Two crossing diagonals through tile, repeated to tile cleanly.
      ctx.moveTo(-s, s);
      ctx.lineTo(s * 2, -s * 2);
      ctx.moveTo(0, s * 2);
      ctx.lineTo(s * 2, 0);
      ctx.moveTo(-s, -s);
      ctx.lineTo(s * 2, s * 2);
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 2, s);
      ctx.stroke();
      break;
    }
  }
  return cv;
}

/** Apply a procedurally-generated repeating pattern as the fill of the selection. */
export function applyPatternFill(
  kind: PatternKind,
  size: number,
  color1: string,
  color2: string,
) {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;

  objs.forEach((o) => {
    const tile = makePatternCanvas(kind, size, color1, color2);
    const pattern = new fabric.Pattern({
      source: tile,
      repeat: 'repeat',
    });
    o.set({ fill: pattern });
    o.setCoords();
  });

  canvas.requestRenderAll();
  pushHistory();
}

/**
 * Generate a 5-color harmonized palette from a base color.
 * Mix of triadic (±120°) and analogous (±30°) hues.
 */
export function generatePalette(baseHex: string): string[] {
  const rgb = hexToRgb(baseHex) ?? { r: 61, g: 155, b: 255 };
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const sat = Math.max(0.25, Math.min(0.9, s || 0.6));
  const lit = Math.max(0.2, Math.min(0.8, l || 0.5));

  const offsets: Array<{ dh: number; sl: number; dl: number }> = [
    { dh: -30, sl: 1.0, dl: 0.08 },   // analogous lighter
    { dh: 0, sl: 1.0, dl: 0 },        // base
    { dh: 30, sl: 1.0, dl: -0.08 },   // analogous darker
    { dh: 120, sl: 0.9, dl: 0.04 },   // triadic A
    { dh: -120, sl: 0.9, dl: -0.04 }, // triadic B
  ];

  return offsets.map((o) => {
    const nh = h + o.dh;
    const nl = Math.max(0.08, Math.min(0.92, lit + o.dl));
    const ns = Math.max(0.15, Math.min(0.95, sat * o.sl));
    const { r, g, b } = hslToRgb(nh, ns, nl);
    return rgbToHex(r, g, b);
  });
}
