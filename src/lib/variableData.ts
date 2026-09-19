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

/* ------------------------------------------------------------------ *
 * CSV data merge (multi-field variable data).
 *
 * SignMaster/Illustrator-style data merge: paste or load a CSV, bind its
 * columns to NAMED text objects on the canvas (name them with Rename
 * Selection), and the merge clones the named objects per record onto the
 * same grid layout the serial/list generator uses, substituting
 * `{{ColumnName}}` tokens (or the legacy `#` run / whole-text replace).
 * ------------------------------------------------------------------ */

/** Parsed CSV — header exposed in both modes (null when `hasHeader` is off). */
export interface CsvData {
  /** First row when `hasHeader` was true, else null. */
  header: string[] | null;
  /** Column names — the header row, or generated `Column 1…N` labels. */
  columns: string[];
  /** Raw data rows (header excluded when present). */
  rows: string[][];
  /** Rows keyed by column name (missing trailing cells → ''). */
  records: Array<Record<string, string>>;
}

/**
 * RFC-4180-tolerant CSV splitter: quoted fields, escaped quotes (`""`),
 * commas and line breaks inside quotes, CRLF or LF line endings, and a
 * trailing newline / blank lines that produce no phantom record.
 */
function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
      i++; continue;
    }
    field += ch; i++;
  }
  // Final field/row when the text does not end on a line break.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // Tolerance: skip rows that are just one empty field (stray blank lines).
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

/**
 * Parse CSV text for the data merge. With `hasHeader` the first row names
 * the columns (blank header cells get generated labels); without it columns
 * are `Column 1…N` after the widest row. Both modes are exposed so the
 * dialog can let the user decide whether row 1 is data or labels.
 */
export function parseCsv(text: string, hasHeader = false): CsvData {
  const rows = splitCsvRows(text);
  if (rows.length === 0) return { header: hasHeader ? [] : null, columns: [], rows: [], records: [] };

  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const label = (i: number) => `Column ${i + 1}`;
  const header = hasHeader
    ? Array.from({ length: width }, (_, i) => rows[0][i]?.trim() || label(i))
    : null;
  const columns = header ?? Array.from({ length: width }, (_, i) => label(i));
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const records = dataRows.map(r => {
    const rec: Record<string, string> = {};
    columns.forEach((col, i) => { rec[col] = r[i] ?? ''; });
    return rec;
  });
  return { header, columns, rows: dataRows, records };
}

/** True when the text contains at least one `{{Token}}` placeholder. */
export function hasTokens(text: string): boolean {
  return /\{\{\s*[^}]+?\s*\}\}/.test(text);
}

/**
 * Replace every `{{ColumnName}}` token with the record's value (column names
 * match case-insensitively after trimming). Unknown columns keep their token
 * so the operator can SEE the typo instead of silently losing text.
 */
export function substituteTokens(text: string, record: Record<string, string>): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (whole, name: string) => {
    const key = Object.keys(record).find(k => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? whole : record[key];
  });
}

/** Final text for one binding under one record: tokens, then the `#` run /
 *  whole-text replace the single-field generator has always used. */
function mergedText(template: string, value: string, record: Record<string, string>): string {
  if (hasTokens(template)) return substituteTokens(template, record);
  return applyValue(template, value);
}

/** A canvas object as the merge resolver sees it (testable without Fabric). */
export interface NamedTextSource {
  name?: string | null;
  text?: unknown;
}

export interface DataMergeBinding {
  /** CSV column name (case-insensitive match against the record keys). */
  column: string;
  /** Target object name (case-insensitive match, set via Rename Selection). */
  target: string;
}

export interface DataMergeLayout {
  cols: number;
  gapXmm: number;
  gapYmm: number;
  fillOrder?: VariableDataFillOrder;
}

/**
 * Resolve each binding's target name to an object by case-insensitive name
 * match (the object's `name`, set via Rename Selection). Generic over the
 * object type so callers keep their concrete type back (Fabric objects
 * included — they carry `name`/`text` at runtime even though the Fabric
 * typings don't declare them). Returns `unmatched` names so the UI can tell
 * the operator which names nothing on the canvas answers to.
 */
export function resolveDataMergeTargets<T extends object>(objects: T[], bindings: DataMergeBinding[]): { targets: Array<T | null>; unmatched: string[] } {
  const targets = bindings.map(b => {
    const want = b.target.trim().toLowerCase();
    if (!want) return null;
    return objects.find(o => {
      const name = (o as NamedTextSource).name;
      return typeof name === 'string' && name.trim().toLowerCase() === want;
    }) ?? null;
  });
  const unmatched = bindings
    .filter((_, i) => !targets[i])
    .map(b => b.target.trim())
    .filter(Boolean);
  return { targets, unmatched };
}

export interface DataMergePlanEntry {
  /** Index into the bindings array. */
  binding: number;
  /** Grid cell the record lands on (same cell for every binding). */
  col: number;
  row: number;
  /** Substituted text for that binding's target. */
  text: string;
}

export interface DataMergePlanRecord {
  index: number;
  ok: boolean;
  /** Bound columns this record does not provide. */
  missing: string[];
  entries: DataMergePlanEntry[];
}

export interface DataMergePlan {
  records: DataMergePlanRecord[];
  generated: number;
  skipped: number;
  /** Every column name that was missing from at least one record. */
  missingColumns: string[];
}

/** Case-insensitive record lookup by column name. */
function recordValue(record: Record<string, string>, column: string): { hit: boolean; value: string } {
  const key = Object.keys(record).find(k => k.toLowerCase() === column.toLowerCase());
  return key === undefined ? { hit: false, value: '' } : { hit: true, value: record[key] };
}

/**
 * Pure per-record plan: which records generate (every bound column present),
 * which are skipped with which missing columns, and the substituted text +
 * grid cell for every binding of each good record. The canvas apply step is
 * a thin consumer of this, which keeps the logic unit-testable.
 */
export function planDataMerge(
  records: Array<Record<string, string>>,
  bindings: DataMergeBinding[],
  templateTexts: string[],
  layout: DataMergeLayout,
): DataMergePlan {
  const missingSet = new Set<string>();
  let generated = 0;
  const plans = records.map((record, index) => {
    const missing = bindings
      .filter(b => b.column && !recordValue(record, b.column).hit)
      .map(b => b.column);
    if (missing.length > 0) {
      missing.forEach(m => missingSet.add(m));
      return { index, ok: false, missing, entries: [] };
    }
    generated++;
    const { col, row } = getVariableDataGridPosition(index, records.length, layout.cols, layout.fillOrder ?? 'rows');
    const entries = bindings.map((b, bi) => ({
      binding: bi,
      col,
      row,
      text: mergedText(templateTexts[bi] ?? '', recordValue(record, b.column).value, record),
    }));
    return { index, ok: true, missing: [], entries };
  });
  return { records: plans, generated, skipped: plans.length - generated, missingColumns: [...missingSet].sort() };
}

export interface DataMergeOutcome extends DataMergePlan {
  /** Target names that matched no object on the canvas. */
  unmatched: string[];
}

/**
 * Apply a CSV data merge: for every record the named text objects are cloned
 * onto the grid (record 0 reuses the originals, like the serial generator),
 * each copy carrying the substituted text. Records missing a bound column
 * are skipped and counted — the caller reports the summary. One history push.
 */
export async function applyDataMerge(
  records: Array<Record<string, string>>,
  bindings: DataMergeBinding[],
  layout: DataMergeLayout,
): Promise<DataMergeOutcome> {
  const c = getCanvas();
  const texts = (c?.getObjects() ?? []).filter(o => typeof (o as NamedTextSource).text === 'string');
  const { targets, unmatched } = resolveDataMergeTargets(texts, bindings);
  const plan = planDataMerge(
    records,
    bindings,
    targets.map(t => String((t as NamedTextSource | null)?.text ?? '')),
    layout,
  );  if (!c || plan.generated === 0) return { ...plan, unmatched };

  const gx = layout.gapXmm * MM_TO_PX;
  const gy = layout.gapYmm * MM_TO_PX;
  for (const record of plan.records) {
    if (!record.ok) continue;
    for (const entry of record.entries) {
      const target = targets[entry.binding];
      if (!target) continue;
      // Record 0 writes the originals in place (same semantics as the
      // single-field generator); later records clone them.
      const obj = record.index === 0 ? target : await target.clone();
      const baseLeft = target.left ?? 0;
      const baseTop = target.top ?? 0;
      (obj as unknown as { set: (o: Record<string, unknown>) => void }).set({
        text: entry.text,
        left: baseLeft + entry.col * gx,
        top: baseTop + entry.row * gy,
      });
      obj.setCoords();
      if (obj !== target) c.add(obj);
    }
  }
  c.requestRenderAll();
  pushHistory();
  return { ...plan, unmatched };
}
