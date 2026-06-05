import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

export type FreeformGradientStop = { x: number; y: number; color: string; radius: number };

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const n = Number.parseInt(full || '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function addFreeformGradient(width = 480, height = 320, stops: FreeformGradientStop[]): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas || stops.length < 2) return false;
  const el = document.createElement('canvas');
  el.width = Math.max(16, Math.round(width));
  el.height = Math.max(16, Math.round(height));
  const ctx = el.getContext('2d');
  if (!ctx) return false;
  const image = ctx.createImageData(el.width, el.height);
  const rgbs = stops.map(stop => hexToRgb(stop.color));
  for (let y = 0; y < el.height; y++) {
    for (let x = 0; x < el.width; x++) {
      let total = 0, r = 0, g = 0, b = 0;
      stops.forEach((stop, index) => {
        const sx = stop.x * el.width;
        const sy = stop.y * el.height;
        const radius = Math.max(1, stop.radius * Math.max(el.width, el.height));
        const d2 = ((x - sx) ** 2 + (y - sy) ** 2) / (radius * radius);
        const w = Math.exp(-d2 * 2.8);
        total += w;
        r += rgbs[index][0] * w; g += rgbs[index][1] * w; b += rgbs[index][2] * w;
      });
      const i = (y * el.width + x) * 4;
      image.data[i] = Math.round(r / total);
      image.data[i + 1] = Math.round(g / total);
      image.data[i + 2] = Math.round(b / total);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const dataUrl = el.toDataURL('image/png');
  const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });
  const center = canvas.getCenterPoint();
  img.set({ left: center.x - el.width / 2, top: center.y - el.height / 2 });
  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
