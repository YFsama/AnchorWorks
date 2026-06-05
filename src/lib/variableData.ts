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

export type VariableDataPreview = {
  values: string[];
  total: number;
  hidden: number;
};

export type VariableDataGridSummary = {
  cols: number;
  rows: number;
  cells: number;
};

export type VariableDataFillOrder = 'rows' | 'columns';

export type VariableDataAutoGap = {
  gapX: number;
  gapY: number;
};

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

export function estimateVariableDataGaps(widthPx: number, heightPx: number, paddingMm = 10): VariableDataAutoGap {
  return {
    gapX: Math.max(5, Math.round(widthPx / MM_TO_PX) + paddingMm),
    gapY: Math.max(5, Math.round(heightPx / MM_TO_PX) + paddingMm),
  };
}

/** Parse pasted or comma-separated badge/list values into clean lines. */
export function parseVariableListValues(input: string): string[] {
  return input.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
}

/** Remove duplicate pasted list values while preserving first-seen order. */
export function dedupeVariableListValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Sort list values in natural A-Z order so Door 2 stays before Door 10. */
export function sortVariableListValues(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Reverse list values without mutating the original pasted list. */
export function reverseVariableListValues(values: string[]): string[] {
  return [...values].reverse();
}

export function summarizeVariableDataGrid(total: number, cols: number): VariableDataGridSummary {
  const nCols = Math.max(1, Math.floor(cols));
  const values = Math.max(0, Math.floor(total));
  return {
    cols: nCols,
    rows: values === 0 ? 0 : Math.ceil(values / nCols),
    cells: values,
  };
}

export function getVariableDataGridPosition(index: number, total: number, cols: number, fillOrder: VariableDataFillOrder = 'rows') {
  const nCols = Math.max(1, Math.floor(cols));
  if (fillOrder === 'columns') {
    const rows = Math.max(1, summarizeVariableDataGrid(total, nCols).rows);
    return { col: Math.floor(index / rows), row: index % rows };
  }
  return { col: index % nCols, row: Math.floor(index / nCols) };
}

/** Summarize generated values for the dialog preview chips. */
export function previewVariableDataValues(values: string[], limit = 5): VariableDataPreview {
  const total = values.length;
  const previewLimit = Math.max(0, Math.floor(limit));
  return {
    values: values.slice(0, previewLimit),
    total,
    hidden: Math.max(0, total - previewLimit),
  };
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
  fillOrder: VariableDataFillOrder = 'rows',
): Promise<number> {
  const c = getCanvas();
  if (!c || values.length === 0) return 0;
  const tmpl = (textObj as unknown as { text?: string }).text ?? '';
  const baseLeft = textObj.left ?? 0;
  const baseTop = textObj.top ?? 0;
  const gx = gapXmm * MM_TO_PX;
  const gy = gapYmm * MM_TO_PX;

  for (let i = 0; i < values.length; i++) {
    const { col, row } = getVariableDataGridPosition(i, values.length, cols, fillOrder);
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
