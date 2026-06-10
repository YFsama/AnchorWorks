import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

export type FreeformGradientStop = { x: number; y: number; color: string; radius: number };
export type FreeformGradientMode = 'freeform' | 'mesh';
export type RenderedGradient = { width: number; height: number; data: Uint8ClampedArray };

type Rgb = [number, number, number];

type MeshCornerStops = {
  topLeft: FreeformGradientStop;
  topRight: FreeformGradientStop;
  bottomLeft: FreeformGradientStop;
  bottomRight: FreeformGradientStop;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(full || '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function writePixel(data: Uint8ClampedArray, index: number, r: number, g: number, b: number): void {
  data[index] = Math.max(0, Math.min(255, Math.round(r)));
  data[index + 1] = Math.max(0, Math.min(255, Math.round(g)));
  data[index + 2] = Math.max(0, Math.min(255, Math.round(b)));
  data[index + 3] = 255;
}

function cornerDistance(stop: FreeformGradientStop, x: number, y: number): number {
  return (stop.x - x) ** 2 + (stop.y - y) ** 2;
}

function pickMeshCorners(stops: FreeformGradientStop[]): MeshCornerStops {
  return {
    topLeft: stops.reduce((best, stop) => cornerDistance(stop, 0, 0) < cornerDistance(best, 0, 0) ? stop : best, stops[0]),
    topRight: stops.reduce((best, stop) => cornerDistance(stop, 1, 0) < cornerDistance(best, 1, 0) ? stop : best, stops[0]),
    bottomLeft: stops.reduce((best, stop) => cornerDistance(stop, 0, 1) < cornerDistance(best, 0, 1) ? stop : best, stops[0]),
    bottomRight: stops.reduce((best, stop) => cornerDistance(stop, 1, 1) < cornerDistance(best, 1, 1) ? stop : best, stops[0]),
  };
}

function renderFreeformPixel(x: number, y: number, width: number, height: number, stops: FreeformGradientStop[], rgbs: Rgb[]): Rgb {
  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  stops.forEach((stop, index) => {
    const sx = clamp01(stop.x) * width;
    const sy = clamp01(stop.y) * height;
    const radius = Math.max(1, stop.radius * Math.max(width, height));
    const d2 = ((x - sx) ** 2 + (y - sy) ** 2) / (radius * radius);
    const w = Math.exp(-d2 * 2.8);
    total += w;
    r += rgbs[index][0] * w;
    g += rgbs[index][1] * w;
    b += rgbs[index][2] * w;
  });
  return total > 0 ? [r / total, g / total, b / total] : [0, 0, 0];
}

function renderMeshPixel(x: number, y: number, width: number, height: number, stops: FreeformGradientStop[], rgbs: Rgb[], corners: MeshCornerStops): Rgb {
  const u = width <= 1 ? 0 : x / (width - 1);
  const v = height <= 1 ? 0 : y / (height - 1);
  const cornerIndices = [corners.topLeft, corners.topRight, corners.bottomLeft, corners.bottomRight].map(corner => stops.indexOf(corner));
  const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
  let r = 0;
  let g = 0;
  let b = 0;
  cornerIndices.forEach((stopIndex, index) => {
    const rgb = rgbs[Math.max(0, stopIndex)];
    r += rgb[0] * weights[index];
    g += rgb[1] * weights[index];
    b += rgb[2] * weights[index];
  });
  stops.forEach((stop, index) => {
    if (cornerIndices.includes(index)) return;
    const sx = clamp01(stop.x) * (width - 1);
    const sy = clamp01(stop.y) * (height - 1);
    const radius = Math.max(1, stop.radius * Math.max(width, height));
    const d2 = ((x - sx) ** 2 + (y - sy) ** 2) / (radius * radius);
    const influence = Math.exp(-d2 * 7) * 0.65;
    r = r * (1 - influence) + rgbs[index][0] * influence;
    g = g * (1 - influence) + rgbs[index][1] * influence;
    b = b * (1 - influence) + rgbs[index][2] * influence;
  });
  return [r, g, b];
}

export function renderFreeformGradient(width = 480, height = 320, stops: FreeformGradientStop[], mode: FreeformGradientMode = 'freeform'): RenderedGradient | null {
  if (stops.length < 2) return null;
  const safeWidth = Math.max(16, Math.round(width));
  const safeHeight = Math.max(16, Math.round(height));
  const data = new Uint8ClampedArray(safeWidth * safeHeight * 4);
  const rgbs = stops.map(stop => hexToRgb(stop.color));
  const corners = pickMeshCorners(stops);
  for (let y = 0; y < safeHeight; y++) {
    for (let x = 0; x < safeWidth; x++) {
      const [r, g, b] = mode === 'mesh'
        ? renderMeshPixel(x, y, safeWidth, safeHeight, stops, rgbs, corners)
        : renderFreeformPixel(x, y, safeWidth, safeHeight, stops, rgbs);
      writePixel(data, (y * safeWidth + x) * 4, r, g, b);
    }
  }
  return { width: safeWidth, height: safeHeight, data };
}

export async function addFreeformGradient(width = 480, height = 320, stops: FreeformGradientStop[], mode: FreeformGradientMode = 'freeform'): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  const rendered = renderFreeformGradient(width, height, stops, mode);
  if (!rendered) return false;
  const el = document.createElement('canvas');
  el.width = rendered.width;
  el.height = rendered.height;
  const ctx = el.getContext('2d');
  if (!ctx) return false;
  const image = ctx.createImageData(rendered.width, rendered.height);
  image.data.set(rendered.data);
  ctx.putImageData(image, 0, 0);
  const dataUrl = el.toDataURL('image/png');
  const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
  const center = canvas.getCenterPoint();
  img.set({
    left: center.x - rendered.width / 2,
    top: center.y - rendered.height / 2,
    name: mode === 'mesh' ? 'Gradient mesh' : 'Freeform gradient',
  });
  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
