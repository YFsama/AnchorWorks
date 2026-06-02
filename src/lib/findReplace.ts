/**
 * Find & Replace text (Illustrator Edit→Find and Replace) — replace every
 * occurrence of a string across all text objects on the canvas (including text
 * nested in groups). Plain-text search with an optional case-sensitive toggle.
 */
import type * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

const isText = (t?: string) => t === 'i-text' || t === 'text' || t === 'textbox';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collect every text object on the canvas, descending into groups. */
function collectTexts(objs: fabric.FabricObject[], out: fabric.IText[], dirty: Set<fabric.Group>, parent?: fabric.Group) {
  for (const o of objs) {
    if (isText(o.type)) {
      out.push(o as fabric.IText);
      if (parent) dirty.add(parent);
    }
    const kids = (o as unknown as { _objects?: fabric.FabricObject[] })._objects;
    if (kids) collectTexts(kids, out, dirty, o as fabric.Group);
  }
}

/** Count how many occurrences of `find` exist across all text objects. */
export function countTextMatches(find: string, matchCase: boolean): number {
  const canvas = getCanvas();
  if (!canvas || !find) return 0;
  const re = new RegExp(escapeRegex(find), matchCase ? 'g' : 'gi');
  const texts: fabric.IText[] = [];
  collectTexts(canvas.getObjects(), texts, new Set());
  let total = 0;
  for (const t of texts) {
    const cur = (t as unknown as { text?: string }).text ?? '';
    total += (cur.match(re) ?? []).length;
  }
  return total;
}

/**
 * Replace every occurrence of `find` with `replace` across all text objects.
 * Returns the number of replacements made.
 */
export function replaceAllText(find: string, replace: string, matchCase: boolean): number {
  const canvas = getCanvas();
  if (!canvas || !find) return 0;
  const re = new RegExp(escapeRegex(find), matchCase ? 'g' : 'gi');
  const texts: fabric.IText[] = [];
  const dirtyGroups = new Set<fabric.Group>();
  collectTexts(canvas.getObjects(), texts, dirtyGroups);

  let total = 0;
  for (const t of texts) {
    const cur = (t as unknown as { text?: string }).text ?? '';
    let count = 0;
    const next = cur.replace(re, () => { count++; return replace; });
    if (count > 0) { t.set({ text: next }); t.setCoords(); total += count; }
  }
  if (total > 0) {
    for (const g of dirtyGroups) (g as unknown as { dirty?: boolean }).dirty = true;
    canvas.requestRenderAll();
    pushHistory();
  }
  return total;
}
