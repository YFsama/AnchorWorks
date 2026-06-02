/**
 * Break text apart (SignMaster "Break Text" / per-letter editing) — split a
 * selected text object into one object per letter or per line, each kept at its
 * original on-screen position, font, and fill, so letters/lines can be moved,
 * coloured, or cut individually. The originals are removed.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

const isText = (t?: string) => t === 'i-text' || t === 'text' || t === 'textbox';

interface CharBound { left: number; width: number; }
interface TextInternals {
  textLines: string[];
  __charBounds?: CharBound[][];
  getHeightOfLine(i: number): number;
  _getLineLeftOffset?(i: number): number;
}

/** Common style snapshot copied onto every produced piece. */
function styleOf(t: fabric.IText) {
  return {
    fontFamily: t.fontFamily,
    fontWeight: t.fontWeight,
    fontStyle: t.fontStyle,
    fill: t.fill,
    stroke: t.stroke,
    strokeWidth: t.strokeWidth,
    underline: t.underline,
    angle: t.angle ?? 0,
  };
}

/** Map a text-local (lx, ly) offset to a scene point, honouring the text's
 *  scale + rotation about its top-left origin. */
function place(t: fabric.IText, lx: number, ly: number): { left: number; top: number } {
  const sx = lx * (t.scaleX ?? 1);
  const sy = ly * (t.scaleY ?? 1);
  const a = ((t.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  return { left: (t.left ?? 0) + sx * cos - sy * sin, top: (t.top ?? 0) + sx * sin + sy * cos };
}

function selectedTexts(canvas: fabric.Canvas): fabric.IText[] {
  return canvas.getActiveObjects().filter((o) => isText(o.type)) as fabric.IText[];
}

/** Split each selected text object into one IText per non-space letter. */
export function splitTextToLetters(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const texts = selectedTexts(canvas);
  if (texts.length === 0) return 0;

  const made: fabric.FabricObject[] = [];
  for (const t of texts) {
    const ti = t as unknown as TextInternals;
    if (!ti.__charBounds) continue; // not measured yet — skip rather than guess
    const fontSize = (t.fontSize ?? 16) * (t.scaleY ?? 1);
    let yOff = 0;
    for (let i = 0; i < ti.textLines.length; i++) {
      const line = ti.textLines[i];
      const bounds = ti.__charBounds[i] ?? [];
      const leftPad = ti._getLineLeftOffset ? ti._getLineLeftOffset(i) : 0;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch.trim() === '') continue;
        const cb = bounds[j];
        if (!cb) continue;
        const { left, top } = place(t, leftPad + cb.left, yOff);
        made.push(new fabric.IText(ch, { left, top, fontSize, ...styleOf(t) }));
      }
      yOff += ti.getHeightOfLine(i);
    }
    canvas.remove(t);
  }
  return commit(canvas, made);
}

/** Split each selected multi-line text object into one IText per line. */
export function splitTextToLines(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const texts = selectedTexts(canvas);
  if (texts.length === 0) return 0;

  const made: fabric.FabricObject[] = [];
  for (const t of texts) {
    const ti = t as unknown as TextInternals;
    if (ti.textLines.length < 2) continue; // nothing to split
    const fontSize = (t.fontSize ?? 16) * (t.scaleY ?? 1);
    let yOff = 0;
    for (let i = 0; i < ti.textLines.length; i++) {
      const line = ti.textLines[i];
      if (line.trim() !== '') {
        const leftPad = ti._getLineLeftOffset ? ti._getLineLeftOffset(i) : 0;
        const { left, top } = place(t, leftPad, yOff);
        made.push(new fabric.IText(line, { left, top, fontSize, ...styleOf(t) }));
      }
      yOff += ti.getHeightOfLine(i);
    }
    canvas.remove(t);
  }
  return commit(canvas, made);
}

function commit(canvas: fabric.Canvas, made: fabric.FabricObject[]): number {
  if (made.length === 0) { canvas.requestRenderAll(); return 0; }
  canvas.discardActiveObject();
  made.forEach((o) => canvas.add(o));
  canvas.setActiveObject(made.length === 1 ? made[0] : new fabric.ActiveSelection(made, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return made.length;
}
