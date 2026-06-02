/**
 * Change Case (Illustrator Type→Change Case) — transform the text of every
 * selected text object. Operates across a multi-selection, not just the active
 * object, and is the single source of truth the Character panel + command
 * palette both call.
 */
import type * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { updateSelection } from './selectionApply';

export type CaseMode = 'upper' | 'lower' | 'title' | 'sentence';

const isTextType = (t?: string) => t === 'i-text' || t === 'text' || t === 'textbox';

/** Title Case — capitalise the first letter of every word. */
export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** Sentence case — capitalise the first letter of each sentence, rest lower. */
export function sentenceCase(s: string): string {
  return s.toLowerCase().replace(/(^\s*\w)|([.!?]\s+\w)/g, (m) => m.toUpperCase());
}

export function applyCase(s: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper': return s.toUpperCase();
    case 'lower': return s.toLowerCase();
    case 'title': return titleCase(s);
    case 'sentence': return sentenceCase(s);
  }
}

/** True when the selection contains at least one text object. */
export function canChangeCase(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some((o) => isTextType(o.type));
}

/** Nudge the font size of every selected text object by `delta` px (clamped to
 *  ≥1). Returns the number changed (Illustrator's Ctrl+Shift+> / <). */
export function adjustFontSize(delta: number): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const texts = canvas.getActiveObjects().filter((o) => isTextType(o.type)) as fabric.IText[];
  if (texts.length === 0) return 0;
  for (const t of texts) {
    const cur = (t as unknown as { fontSize?: number }).fontSize ?? 16;
    t.set({ fontSize: Math.max(1, cur + delta) });
    t.setCoords();
  }
  canvas.requestRenderAll();
  pushHistory();
  updateSelection(); // refresh the summary (size grew) so panels re-read
  return texts.length;
}

/** Change the case of every selected text object. Returns the number changed. */
export function changeCaseSelection(mode: CaseMode): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const texts = canvas.getActiveObjects().filter((o) => isTextType(o.type)) as fabric.IText[];
  if (texts.length === 0) return 0;

  let count = 0;
  for (const t of texts) {
    const cur = (t as unknown as { text?: string }).text ?? '';
    const next = applyCase(cur, mode);
    if (next !== cur) { t.set({ text: next }); t.setCoords(); count++; }
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
