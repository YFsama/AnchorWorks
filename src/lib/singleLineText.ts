import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

const GLYPH_HEIGHT = 14;
const DEFAULT_ADVANCE = 11;
const SPACE_ADVANCE = 6;

type MoveCommand = { kind: 'M'; x: number; y: number };
type LineCommand = { kind: 'L'; x: number; y: number };
type QuadraticCommand = { kind: 'Q'; cx: number; cy: number; x: number; y: number };
type CurveCommand = { kind: 'C'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number };
type StrokeCommand = MoveCommand | LineCommand | QuadraticCommand | CurveCommand;
type Glyph = { advance?: number; strokes: StrokeCommand[][] };

const move = (x: number, y: number): MoveCommand => ({ kind: 'M', x, y });
const line = (x: number, y: number): LineCommand => ({ kind: 'L', x, y });
const quad = (cx: number, cy: number, x: number, y: number): QuadraticCommand => ({ kind: 'Q', cx, cy, x, y });
const strokes = (...items: StrokeCommand[][]): Glyph => ({ strokes: items });

const GLYPHS: Record<string, Glyph> = {
  A: strokes([move(0, 14), line(5, 0), line(10, 14)], [move(2.2, 8), line(7.8, 8)]),
  B: strokes([move(0, 14), line(0, 0), line(5.8, 0), quad(10, 0, 10, 3.5), quad(10, 7, 5.8, 7), line(0, 7), line(6.2, 7), quad(10, 7, 10, 10.5), quad(10, 14, 6, 14), line(0, 14)]),
  C: strokes([move(10, 2), quad(7.8, 0, 5, 0), quad(0, 0, 0, 7), quad(0, 14, 5, 14), quad(7.8, 14, 10, 12)]),
  D: strokes([move(0, 14), line(0, 0), line(4.8, 0), quad(10, 0, 10, 7), quad(10, 14, 4.8, 14), line(0, 14)]),
  E: strokes([move(10, 0), line(0, 0), line(0, 14), line(10, 14)], [move(0, 7), line(7, 7)]),
  F: strokes([move(0, 14), line(0, 0), line(10, 0)], [move(0, 7), line(7, 7)]),
  G: strokes([move(10, 2.2), quad(7.8, 0, 5, 0), quad(0, 0, 0, 7), quad(0, 14, 5.2, 14), quad(10, 14, 10, 8.2), line(6, 8.2)]),
  H: strokes([move(0, 0), line(0, 14)], [move(10, 0), line(10, 14)], [move(0, 7), line(10, 7)]),
  I: strokes([move(1, 0), line(9, 0)], [move(5, 0), line(5, 14)], [move(1, 14), line(9, 14)]),
  J: strokes([move(10, 0), line(10, 10.5), quad(10, 14, 5, 14), quad(1, 14, 0, 11)]),
  K: strokes([move(0, 0), line(0, 14)], [move(10, 0), line(0, 7), line(10, 14)]),
  L: strokes([move(0, 0), line(0, 14), line(10, 14)]),
  M: strokes([move(0, 14), line(0, 0), line(5, 7), line(10, 0), line(10, 14)]),
  N: strokes([move(0, 14), line(0, 0), line(10, 14), line(10, 0)]),
  O: strokes([move(5, 0), quad(10, 0, 10, 7), quad(10, 14, 5, 14), quad(0, 14, 0, 7), quad(0, 0, 5, 0)]),
  P: strokes([move(0, 14), line(0, 0), line(6, 0), quad(10, 0, 10, 4), quad(10, 8, 6, 8), line(0, 8)]),
  Q: strokes([move(5, 0), quad(10, 0, 10, 7), quad(10, 14, 5, 14), quad(0, 14, 0, 7), quad(0, 0, 5, 0)], [move(6.4, 10.3), line(10.5, 14.5)]),
  R: strokes([move(0, 14), line(0, 0), line(6, 0), quad(10, 0, 10, 4), quad(10, 8, 6, 8), line(0, 8)], [move(5.5, 8), line(10, 14)]),
  S: strokes([move(9.5, 1.5), quad(6.5, 0, 4, 0.5), quad(0, 1.2, 0.7, 5), quad(1.2, 7, 5, 7), quad(10, 7, 10, 11), quad(10, 14, 5, 14), quad(2, 14, 0, 12.5)]),
  T: strokes([move(0, 0), line(10, 0)], [move(5, 0), line(5, 14)]),
  U: strokes([move(0, 0), line(0, 9.5), quad(0, 14, 5, 14), quad(10, 14, 10, 9.5), line(10, 0)]),
  V: strokes([move(0, 0), line(5, 14), line(10, 0)]),
  W: strokes([move(0, 0), line(2.5, 14), line(5, 8), line(7.5, 14), line(10, 0)]),
  X: strokes([move(0, 0), line(10, 14)], [move(10, 0), line(0, 14)]),
  Y: strokes([move(0, 0), line(5, 7), line(10, 0)], [move(5, 7), line(5, 14)]),
  Z: strokes([move(0, 0), line(10, 0), line(0, 14), line(10, 14)]),
  '0': strokes([move(5, 0), quad(10, 0, 10, 7), quad(10, 14, 5, 14), quad(0, 14, 0, 7), quad(0, 0, 5, 0)], [move(2.5, 11.5), line(7.5, 2.5)]),
  '1': strokes([move(2.5, 3), line(5, 0), line(5, 14)], [move(2, 14), line(8, 14)]),
  '2': strokes([move(1, 3), quad(2, 0, 5, 0), quad(10, 0, 10, 4), quad(10, 7, 5, 9), line(0, 14), line(10, 14)]),
  '3': strokes([move(1, 1.5), quad(3, 0, 5.5, 0), quad(10, 0, 10, 3.8), quad(10, 7, 5.5, 7), quad(10, 7, 10, 10.8), quad(10, 14, 5.5, 14), quad(2.5, 14, 0.7, 12.2)]),
  '4': strokes([move(8, 14), line(8, 0), line(0, 9), line(10, 9)]),
  '5': strokes([move(10, 0), line(1, 0), line(0.4, 6), quad(3, 5, 5.5, 5.5), quad(10, 6.5, 10, 10.5), quad(10, 14, 5.2, 14), quad(2, 14, 0, 12)]),
  '6': strokes([move(9.2, 1.4), quad(6, 0, 3, 2), quad(0, 4, 0, 8), quad(0, 14, 5, 14), quad(10, 14, 10, 9.5), quad(10, 6, 5, 6), quad(1, 6, 0, 9)]),
  '7': strokes([move(0, 0), line(10, 0), line(3, 14)]),
  '8': strokes([move(5, 0), quad(9, 0, 9, 3.5), quad(9, 7, 5, 7), quad(1, 7, 1, 3.5), quad(1, 0, 5, 0), quad(9, 0, 9, 3.5)], [move(5, 7), quad(10, 7, 10, 10.5), quad(10, 14, 5, 14), quad(0, 14, 0, 10.5), quad(0, 7, 5, 7)]),
  '9': strokes([move(10, 5), quad(9, 8, 5, 8), quad(0, 8, 0, 4), quad(0, 0, 5, 0), quad(10, 0, 10, 6), quad(10, 12, 5, 14), quad(2.5, 14, 1, 12.8)]),
  '-': { advance: 8, strokes: [[move(0, 7), line(7, 7)]] },
  '_': { advance: 8, strokes: [[move(0, 14), line(7, 14)]] },
  '.': { advance: 5, strokes: [[move(2, 13), line(2.1, 13.1)]] },
  ',': { advance: 5, strokes: [[move(3, 12.5), quad(2.5, 15, 1, 16)]] },
  ':': { advance: 5, strokes: [[move(2, 4.5), line(2.1, 4.6)], [move(2, 12), line(2.1, 12.1)]] },
  ';': { advance: 5, strokes: [[move(2, 4.5), line(2.1, 4.6)], [move(3, 12.5), quad(2.5, 15, 1, 16)]] },
  '/': { advance: 8, strokes: [[move(7, 0), line(0, 14)]] },
  '\\': { advance: 8, strokes: [[move(0, 0), line(7, 14)]] },
  '+': { advance: 9, strokes: [[move(4, 3), line(4, 11)], [move(0, 7), line(8, 7)]] },
  '=': { advance: 9, strokes: [[move(0, 5), line(8, 5)], [move(0, 9), line(8, 9)]] },
  '!': { advance: 5, strokes: [[move(2, 0), line(2, 10)], [move(2, 13), line(2.1, 13.1)]] },
  '?': strokes([move(1, 3), quad(2, 0, 5, 0), quad(9, 0, 9, 4), quad(9, 6, 5, 8), line(5, 10)], [move(5, 13), line(5.1, 13.1)]),
  '&': strokes([move(9.5, 14), line(2.5, 5), quad(1, 3, 2, 1.4), quad(3.5, -0.5, 6, 0.8), quad(8, 2.2, 6.5, 4.5), line(1.8, 10), quad(0, 13, 3.8, 14), quad(6.5, 14, 10, 9)]),
  '(': { advance: 6, strokes: [[move(5, 0), quad(0, 5, 5, 14)]] },
  ')': { advance: 6, strokes: [[move(0, 0), quad(5, 5, 0, 14)]] },
  '[': { advance: 6, strokes: [[move(5, 0), line(0, 0), line(0, 14), line(5, 14)]] },
  ']': { advance: 6, strokes: [[move(0, 0), line(5, 0), line(5, 14), line(0, 14)]] },
  '#': strokes([move(3, 0), line(1, 14)], [move(8, 0), line(6, 14)], [move(0, 5), line(10, 5)], [move(0, 10), line(10, 10)]),
};

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function commandToPath(command: StrokeCommand, offsetX: number, scale: number): string {
  if (command.kind === 'M' || command.kind === 'L') {
    return `${command.kind}${formatNumber(offsetX + command.x * scale)} ${formatNumber(command.y * scale)}`;
  }
  if (command.kind === 'Q') {
    return `Q${formatNumber(offsetX + command.cx * scale)} ${formatNumber(command.cy * scale)} ${formatNumber(offsetX + command.x * scale)} ${formatNumber(command.y * scale)}`;
  }
  return `C${formatNumber(offsetX + command.c1x * scale)} ${formatNumber(command.c1y * scale)} ${formatNumber(offsetX + command.c2x * scale)} ${formatNumber(command.c2y * scale)} ${formatNumber(offsetX + command.x * scale)} ${formatNumber(command.y * scale)}`;
}

export function buildSingleLineTextPath(text: string, sizePx: number, trackingPx: number): { d: string; width: number; height: number } {
  const scale = sizePx / GLYPH_HEIGHT;
  const parts: string[] = [];
  let cursorX = 0;
  const chars = Array.from(text.trim());
  chars.forEach((char, index) => {
    if (char === ' ') {
      cursorX += SPACE_ADVANCE * scale + trackingPx;
      return;
    }
    const glyph = GLYPHS[char.toUpperCase()] ?? GLYPHS['?'];
    glyph.strokes.forEach(stroke => {
      stroke.forEach(command => parts.push(commandToPath(command, cursorX, scale)));
    });
    const advance = (glyph.advance ?? DEFAULT_ADVANCE) * scale;
    cursorX += advance + (index === chars.length - 1 ? 0 : trackingPx);
  });
  return { d: parts.join(' '), width: Math.max(0, cursorX), height: sizePx };
}

export function addSingleLineText(text: string, sizePx = 72, trackingPx = 8): boolean {
  const canvas = getCanvas();
  if (!canvas || !text.trim()) return false;
  const { d, width, height } = buildSingleLineTextPath(text, sizePx, trackingPx);
  if (!d) return false;
  const center = canvas.getCenterPoint();
  const path = new fabric.Path(d, {
    left: center.x - width / 2,
    top: center.y - height / 2,
    fill: '',
    stroke: '#111827',
    strokeWidth: Math.max(1, sizePx / 32),
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    name: 'Single-line text',
  });
  canvas.add(path);
  canvas.setActiveObject(path);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
