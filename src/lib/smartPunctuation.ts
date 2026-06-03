/**
 * Smart Punctuation (Illustrator Type→Smart Punctuation) — replace typewriter
 * punctuation in every selected text object with typographer's marks: straight
 * quotes → curly quotes/apostrophes, `--` → em dash, `...` → ellipsis. Mirrors
 * changeCaseSelection's multi-selection behaviour and is the single source of
 * truth the Type menu + command palette both call.
 */
import type * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

const isTextType = (t?: string) => t === 'i-text' || t === 'text' || t === 'textbox';

/**
 * Convert typewriter punctuation to typographic marks. Quote direction is
 * decided by the preceding character: a quote at the start of the string or
 * after whitespace / an opening bracket opens; otherwise it closes (so an
 * in-word apostrophe like "don't" becomes "don’t").
 */
export function smartenPunctuation(s: string): string {
  return s
    // Order: multi-char sequences first so quote passes don't split them.
    .replace(/\.\.\./g, '…')               // ... → …
    .replace(/--/g, '—')                    // -- → —
    .replace(/(^|[\s([{<])"/g, '$1“')      // opening "
    .replace(/"/g, '”')                      // remaining " → closing ”
    .replace(/(^|[\s([{<])'/g, '$1‘')      // opening '
    .replace(/'/g, '’');                     // remaining ' → ’ (also apostrophe)
}

/** True when the selection contains at least one text object. */
export function canSmartPunctuation(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().some((o) => isTextType(o.type));
}

/** Apply smart punctuation to every selected text object. Returns the count changed. */
export function smartPunctuationSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const texts = canvas.getActiveObjects().filter((o) => isTextType(o.type)) as fabric.IText[];
  if (texts.length === 0) return 0;

  let count = 0;
  for (const t of texts) {
    const cur = (t as unknown as { text?: string }).text ?? '';
    const next = smartenPunctuation(cur);
    if (next !== cur) { t.set({ text: next }); t.setCoords(); count++; }
  }
  if (count > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return count;
}
