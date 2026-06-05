import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

const GLYPH_W = 10;
const GLYPH_H = 14;

type Segment = [number, number, number, number];
const SEGMENTS: Record<string, Segment> = {
  a: [1, 0, 9, 0], b: [10, 1, 10, 6], c: [10, 8, 10, 13], d: [1, 14, 9, 14], e: [0, 8, 0, 13], f: [0, 1, 0, 6], g: [1, 7, 9, 7],
  h: [0, 0, 10, 14], i: [10, 0, 0, 14], j: [0, 0, 10, 0], k: [0, 14, 10, 14], l: [5, 0, 5, 14], m: [0, 0, 5, 7], n: [10, 0, 5, 7],
};

const GLYPHS: Record<string, string[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'], '1': ['b', 'c'], '2': ['a', 'b', 'g', 'e', 'd'], '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'], '5': ['a', 'f', 'g', 'c', 'd'], '6': ['a', 'f', 'g', 'e', 'c', 'd'], '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'], '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  A: ['a', 'b', 'c', 'e', 'f', 'g'], B: ['f', 'e', 'g', 'b', 'c', 'a', 'd'], C: ['a', 'f', 'e', 'd'], D: ['f', 'e', 'a', 'b', 'c', 'd'],
  E: ['a', 'f', 'g', 'e', 'd'], F: ['a', 'f', 'g', 'e'], G: ['a', 'f', 'e', 'd', 'c', 'g'], H: ['f', 'e', 'b', 'c', 'g'],
  I: ['j', 'l', 'k'], J: ['b', 'c', 'd', 'e'], K: ['f', 'e', 'm', 'i'], L: ['f', 'e', 'd'], M: ['f', 'e', 'm', 'n', 'b', 'c'],
  N: ['f', 'e', 'h', 'b', 'c'], O: ['a', 'b', 'c', 'd', 'e', 'f'], P: ['a', 'b', 'f', 'g', 'e'], Q: ['a', 'b', 'c', 'd', 'e', 'f', 'n'],
  R: ['a', 'b', 'f', 'g', 'e', 'n'], S: ['a', 'f', 'g', 'c', 'd'], T: ['j', 'l'], U: ['f', 'e', 'd', 'c', 'b'],
  V: ['f', 'i'], W: ['f', 'e', 'm', 'n', 'c', 'b'], X: ['h', 'i'], Y: ['m', 'n', 'l'], Z: ['a', 'i', 'd'],
  '-': ['g'], '_': ['d'], '.': ['d'], '/': ['i'], '\\': ['h'], '+': ['g', 'l'], '=': ['g', 'd'], '!': ['l', 'd'], '?': ['a', 'b', 'g', 'l'],
};

function pathForText(text: string, sizePx: number, trackingPx: number): string {
  const scale = sizePx / GLYPH_H;
  const advance = GLYPH_W * scale + trackingPx;
  const parts: string[] = [];
  let x = 0;
  for (const ch of text) {
    if (ch === ' ') { x += advance; continue; }
    const glyph = GLYPHS[ch.toUpperCase()] ?? GLYPHS['?'];
    for (const key of glyph) {
      const seg = SEGMENTS[key];
      if (!seg) continue;
      const [x1, y1, x2, y2] = seg;
      parts.push(`M${(x + x1 * scale).toFixed(2)} ${(y1 * scale).toFixed(2)} L${(x + x2 * scale).toFixed(2)} ${(y2 * scale).toFixed(2)}`);
    }
    x += advance;
  }
  return parts.join(' ');
}

export function addSingleLineText(text: string, sizePx = 72, trackingPx = 8): boolean {
  const canvas = getCanvas();
  if (!canvas || !text.trim()) return false;
  const d = pathForText(text.trim(), sizePx, trackingPx);
  if (!d) return false;
  const center = canvas.getCenterPoint();
  const path = new fabric.Path(d, {
    left: center.x - (text.length * (sizePx * 0.75)) / 2,
    top: center.y - sizePx / 2,
    fill: '',
    stroke: '#111827',
    strokeWidth: Math.max(1, sizePx / 28),
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
  });
  canvas.add(path);
  canvas.setActiveObject(path);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
