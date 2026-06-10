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
function isFabricGradient(value: unknown): value is fabric.Gradient<'linear' | 'radial'> {
  return !!value && typeof value === 'object' && 'colorStops' in value && 'type' in value;
}


function alphaPaint(value: unknown, alpha: number): string | null {
  if (typeof value !== 'string' || !value.trim() || alpha >= 1) return null;
  const paint = value.trim();
  const hex = paint.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const red = parseInt(hex[0] + hex[0], 16);
    const green = parseInt(hex[1] + hex[1], 16);
    const blue = parseInt(hex[2] + hex[2], 16);
    return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`;
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(paint);
  if (!rgb) return null;
  const parts = rgb[1].split(',').map(part => Number(part.trim()));
  if (parts.length !== 3 && parts.length !== 4) return null;
  if (!parts.every(Number.isFinite)) return null;
  const sourceAlpha = parts.length === 4 ? Math.max(0, Math.min(1, parts[3])) : 1;
  return `rgba(${Math.max(0, Math.min(255, parts[0]))}, ${Math.max(0, Math.min(255, parts[1]))}, ${Math.max(0, Math.min(255, parts[2]))}, ${Number((sourceAlpha * alpha).toFixed(3))})`;
}

export function flattenTransparencyObject(object: fabric.FabricObject): boolean {
  const opacity = Math.max(0, Math.min(1, Number(object.opacity ?? 1)));
  const blendMode = object.globalCompositeOperation;
  const hasBlendMode = typeof blendMode === 'string' && blendMode !== 'source-over';
  if (opacity >= 1 && !hasBlendMode) return false;
  const fill = alphaPaint(object.fill, opacity);
  const stroke = alphaPaint(object.stroke, opacity);
  const updates: Record<string, unknown> = { opacity: 1 };
  if (fill) updates.fill = fill;
  if (stroke) updates.stroke = stroke;
  object.set(updates);
  object.globalCompositeOperation = 'source-over';
  const shadow = object.shadow as fabric.Shadow | null | undefined;
  if (shadow && opacity < 1) {
    const color = alphaPaint(shadow.color, opacity) ?? shadow.color;
    object.set('shadow', new fabric.Shadow({ color, blur: shadow.blur, offsetX: shadow.offsetX, offsetY: shadow.offsetY }));
  }
  object.setCoords();
  return true;
}

export function flattenTransparencySelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let count = 0;
  for (const object of canvas.getActiveObjects()) {
    if (flattenTransparencyObject(object)) count += 1;
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}

export function clearGradientFillFromObject(object: fabric.FabricObject): boolean {
  const fill = object.fill;
  if (!isFabricGradient(fill)) return false;
  const stops = Array.isArray(fill.colorStops) ? fill.colorStops : [];
  const firstColor = typeof stops[0]?.color === 'string' ? stops[0].color : '#ffffff';
  object.set({ fill: firstColor });
  object.setCoords();
  return true;
}

export function clearGradientFillSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let count = 0;
  for (const object of canvas.getActiveObjects()) {
    if (clearGradientFillFromObject(object)) count += 1;
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}

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

export type ExpandedShadowSpec = ShadowSpec & { opacity: number };

type ShadowLike = Partial<ShadowSpec> & { color?: string; affectStroke?: boolean; nonScaling?: boolean };

export function extractExpandedShadowSpec(shadow: ShadowLike | null | undefined): ExpandedShadowSpec | null {
  if (!shadow || typeof shadow.color !== 'string' || !shadow.color) return null;
  return {
    color: shadow.color,
    blur: Number.isFinite(shadow.blur) ? Math.max(0, Number(shadow.blur)) : 0,
    offsetX: Number.isFinite(shadow.offsetX) ? Number(shadow.offsetX) : 0,
    offsetY: Number.isFinite(shadow.offsetY) ? Number(shadow.offsetY) : 0,
    opacity: 0.45,
  };
}

function applyExpandedShadowAppearance(object: fabric.FabricObject, spec: ExpandedShadowSpec): void {
  object.set({
    left: (object.left ?? 0) + spec.offsetX,
    top: (object.top ?? 0) + spec.offsetY,
    fill: spec.color,
    stroke: '',
    strokeWidth: 0,
    opacity: Math.min(1, Math.max(0, spec.opacity)),
    shadow: spec.blur > 0 ? new fabric.Shadow({ color: spec.color, blur: spec.blur, offsetX: 0, offsetY: 0 }) : null,
    globalCompositeOperation: 'source-over',
  });
  object.setCoords();
}

export async function expandDropShadowObjects(canvas: fabric.Canvas, objects: fabric.FabricObject[]): Promise<{ count: number; created: fabric.FabricObject[] }> {
  const created: fabric.FabricObject[] = [];
  let count = 0;
  for (const object of objects) {
    const spec = extractExpandedShadowSpec(object.shadow as ShadowLike | null | undefined);
    if (!spec) continue;
    const clone = await object.clone();
    applyExpandedShadowAppearance(clone as fabric.FabricObject, spec);
    object.shadow = null;
    object.setCoords();
    canvas.add(clone as fabric.FabricObject);
    canvas.sendObjectToBack(clone as fabric.FabricObject);
    created.push(clone as fabric.FabricObject);
    count += 1;
  }
  return { count, created };
}

export async function expandDropShadowSelection(): Promise<number> {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const { count, created } = await expandDropShadowObjects(canvas, canvas.getActiveObjects());
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}

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
  strokeMiterLimit: number;
}>;

/** Apply advanced stroke styling (dash, line cap, line join, miter) to selection. */
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
    if (patch.strokeMiterLimit !== undefined) {
      o.set('strokeMiterLimit', patch.strokeMiterLimit);
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

export type OverprintTarget = 'fill' | 'stroke' | 'both';

type OverprintObject = fabric.FabricObject & {
  overprint?: boolean;
  fillOverprint?: boolean;
  strokeOverprint?: boolean;
  overprintFill?: boolean;
  overprintStroke?: boolean;
};

export function setOverprintOnObject(object: fabric.FabricObject, target: OverprintTarget, enabled: boolean): boolean {
  const overprintObject = object as OverprintObject;
  const updates: Partial<OverprintObject> = {};
  if (target === 'fill' || target === 'both') {
    if (overprintObject.fillOverprint !== enabled || overprintObject.overprintFill !== enabled) {
      updates.fillOverprint = enabled;
      updates.overprintFill = enabled;
    }
  }
  if (target === 'stroke' || target === 'both') {
    if (overprintObject.strokeOverprint !== enabled || overprintObject.overprintStroke !== enabled) {
      updates.strokeOverprint = enabled;
      updates.overprintStroke = enabled;
    }
  }
  if (target === 'both' && overprintObject.overprint !== enabled) updates.overprint = enabled;
  if (Object.keys(updates).length === 0) return false;
  Object.assign(overprintObject, updates);
  object.setCoords();
  return true;
}

export function applyOverprintToSelection(target: OverprintTarget, enabled: boolean): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let count = 0;
  for (const object of canvas.getActiveObjects()) {
    if (setOverprintOnObject(object, target, enabled)) count += 1;
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}

/**
 * Toggle constant stroke width on the selection — `strokeUniform: true` keeps a
 * stroke (and cut line) at the same px width no matter how the object is scaled
 * (Illustrator's "Scale Strokes & Effects" off). Flips based on the active
 * object's current state. Returns the new state, or null if nothing selected.
 */
/** Set constant-stroke-width (strokeUniform) on the selection. Returns count. */
export function setUniformStroke(on: boolean): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  if (!objs.length) return 0;
  objs.forEach((o) => { (o as { strokeUniform?: boolean }).strokeUniform = on; o.setCoords(); });
  canvas.requestRenderAll();
  pushHistory();
  return objs.length;
}

export function toggleUniformStroke(): boolean | null {
  const canvas = getCanvas();
  if (!canvas || !canvas.getActiveObjects().length) return null;
  const next = !((canvas.getActiveObject() as { strokeUniform?: boolean })?.strokeUniform);
  setUniformStroke(next);
  return next;
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

export type PatternSpec = { kind: PatternKind; size: number; color1: string; color2: string };
type PatternedObject = fabric.FabricObject & { patternSpec?: PatternSpec };

export function buildExpandedPatternTiles(bounds: { left: number; top: number; width: number; height: number }, spec: PatternSpec): Array<{ left: number; top: number; width: number; height: number; fill: string }> {
  const size = Math.max(2, Math.floor(spec.size));
  const cols = Math.max(1, Math.ceil(bounds.width / size));
  const rows = Math.max(1, Math.ceil(bounds.height / size));
  const tiles: Array<{ left: number; top: number; width: number; height: number; fill: string }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left = bounds.left + col * size;
      const top = bounds.top + row * size;
      if (spec.kind === 'checker') {
        tiles.push({ left, top, width: size, height: size, fill: (row + col) % 2 === 0 ? spec.color2 : spec.color1 });
      } else if (spec.kind === 'dots') {
        tiles.push({ left: left + size * 0.25, top: top + size * 0.25, width: size * 0.5, height: size * 0.5, fill: spec.color2 });
      } else {
        tiles.push({ left, top, width: size, height: Math.max(1, size * 0.18), fill: spec.color2 });
        if (spec.kind === 'crosshatch') tiles.push({ left, top: top + size * 0.5, width: size, height: Math.max(1, size * 0.18), fill: spec.color2 });
      }
    }
  }
  return tiles;
}


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
export function clearPatternFillFromObject(object: PatternedObject): boolean {
  const spec = object.patternSpec;
  if (!spec) return false;
  object.set({ fill: spec.color1 });
  delete object.patternSpec;
  object.setCoords();
  return true;
}

export function clearPatternFillSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let count = 0;
  for (const object of canvas.getActiveObjects()) {
    if (clearPatternFillFromObject(object as PatternedObject)) count += 1;
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}

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
    (o as PatternedObject).patternSpec = { kind, size, color1, color2 };
    o.setCoords();
  });

  canvas.requestRenderAll();
  pushHistory();
}

export function expandPatternFillObjects(canvas: fabric.Canvas, objects: fabric.FabricObject[]): { count: number; created: fabric.FabricObject[] } {
  const created: fabric.FabricObject[] = [];
  let count = 0;
  for (const object of objects) {
    const spec = (object as PatternedObject).patternSpec;
    if (!spec) continue;
    const bounds = object.getBoundingRect();
    const background = new fabric.Rect({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, fill: spec.color1, stroke: '', strokeWidth: 0, opacity: object.opacity ?? 1 });
    const tiles = buildExpandedPatternTiles(bounds, spec).map((tile) => new fabric.Rect({ ...tile, stroke: '', strokeWidth: 0, opacity: object.opacity ?? 1 }));
    object.set({ fill: '', stroke: object.stroke, strokeWidth: object.strokeWidth ?? 0 });
    delete (object as PatternedObject).patternSpec;
    object.setCoords();
    canvas.add(background, ...tiles);
    created.push(background, ...tiles);
    count += 1;
  }
  return { count, created };
}

export function expandPatternFillSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const { count, created } = expandPatternFillObjects(canvas, canvas.getActiveObjects());
  if (count > 0) {
    canvas.discardActiveObject();
    canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}

export async function expandAppearanceSelection(): Promise<number> {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getActiveObjects();
  if (objects.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  let count = 0;
  const patternResult = expandPatternFillObjects(canvas, objects);
  count += patternResult.count;
  created.push(...patternResult.created);
  const shadowResult = await expandDropShadowObjects(canvas, objects);
  count += shadowResult.count;
  created.push(...shadowResult.created);
  for (const object of objects) if (flattenTransparencyObject(object)) count += 1;
  if (count === 0) return 0;
  canvas.discardActiveObject();
  if (created.length > 0) canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return count;
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
