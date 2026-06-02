/**
 * Variable data / serial numbering (SignMaster badges & numbering).
 *
 * Takes one selected text object as a template and lays out N copies in a grid,
 * each carrying the next value from a number sequence or a custom list. If the
 * template text contains a run of `#`, that run is replaced (numbers zero-pad
 * to the run length) — e.g. "No. ###" → "No. 007"; otherwise the whole text is
 * replaced by the value.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

const MM_TO_PX = 3.7795; // 96dpi

/** Build a numeric sequence as zero-padded strings. */
export function buildSerialValues(start: number, step: number, count: number, pad: number): string[] {
  const out: string[] = [];
  const n = Math.max(0, Math.min(2000, Math.floor(count)));
  for (let i = 0; i < n; i++) {
    const v = start + i * step;
    out.push(pad > 0 ? String(Math.trunc(v)).padStart(pad, '0') : String(v));
  }
  return out;
}

/** Substitute a value into the template's `#` run, or replace the whole text. */
function applyValue(template: string, value: string): string {
  const m = template.match(/#+/);
  if (!m) return value;
  const runLen = m[0].length;
  const padded = /^-?\d+$/.test(value) ? value.padStart(runLen, '0') : value;
  return template.replace(/#+/, padded);
}

/**
 * Replace the template's text with `values[0]` and clone it for the rest, laid
 * out in a `cols`-wide grid spaced `gapXmm` × `gapYmm`. Returns the copy count.
 */
export async function generateVariableData(
  textObj: fabric.FabricObject,
  values: string[],
  cols: number,
  gapXmm: number,
  gapYmm: number,
): Promise<number> {
  const c = getCanvas();
  if (!c || values.length === 0) return 0;
  const tmpl = (textObj as unknown as { text?: string }).text ?? '';
  const baseLeft = textObj.left ?? 0;
  const baseTop = textObj.top ?? 0;
  const gx = gapXmm * MM_TO_PX;
  const gy = gapYmm * MM_TO_PX;
  const nCols = Math.max(1, cols);

  for (let i = 0; i < values.length; i++) {
    const col = i % nCols;
    const row = Math.floor(i / nCols);
    // Reuse the template for the first value; clone for the rest.
    const obj = i === 0 ? textObj : await textObj.clone();
    (obj as unknown as { set: (o: Record<string, unknown>) => void }).set({
      text: applyValue(tmpl, values[i]),
      left: baseLeft + col * gx,
      top: baseTop + row * gy,
    });
    obj.setCoords();
    if (i !== 0) c.add(obj);
  }
  c.requestRenderAll();
  pushHistory();
  return values.length;
}
