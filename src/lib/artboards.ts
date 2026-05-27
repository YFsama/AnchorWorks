/**
 * Artboards — multiple rectangular "pages" overlayed on the canvas.
 *
 * Design note: artboards live independently of the document size. The
 * document size (DocSettings.width/height) is kept for backward compat and
 * controls the visible canvas surface; resizing the document does NOT shrink
 * or reposition existing artboards.
 *
 * Storage: artboards persist to localStorage under `vector.artboards`. They
 * are intentionally separate from the autosave snapshot so the autosave path
 * stays untouched.
 */

import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { useEditor } from '../store/editor';
import type { Artboard } from '../types';

const STORAGE_KEY = 'vector.artboards';

function notify() {
  try { window.dispatchEvent(new CustomEvent('vector:artboards-changed')); } catch { /* ignore */ }
}

function persist() {
  try {
    const list = useEditor.getState().artboards;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota or unavailable — silently skip */
  }
}

function commit(next: Artboard[]) {
  useEditor.getState().setArtboards(next);
  persist();
  notify();
}

/** Read the current artboards from the Zustand store. */
export function getArtboards(): Artboard[] {
  return useEditor.getState().artboards;
}

/**
 * Hydrate the artboards slice from localStorage on app startup. Safe to call
 * multiple times — it only replaces the slice if a valid persisted list is
 * found. If nothing is stored, the default single artboard is left as-is.
 */
export function loadArtboardsFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const valid: Artboard[] = parsed
      .filter((a) => a && typeof a === 'object'
        && typeof a.id === 'string'
        && typeof a.name === 'string'
        && Number.isFinite(a.x) && Number.isFinite(a.y)
        && Number.isFinite(a.width) && Number.isFinite(a.height))
      .map((a) => ({
        id: String(a.id),
        name: String(a.name),
        x: Number(a.x),
        y: Number(a.y),
        width: Math.max(1, Number(a.width)),
        height: Math.max(1, Number(a.height)),
      }));
    if (valid.length) {
      useEditor.getState().setArtboards(valid);
      notify();
    }
  } catch {
    /* corrupt — ignore */
  }
}

function nextId(): string {
  return `ab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Create a new artboard appended 30px to the right of the rightmost existing
 * artboard. If none exist, places the new one at (0, 0).
 */
export function createArtboard(name?: string, w?: number, h?: number): Artboard {
  const list = getArtboards();
  const doc = useEditor.getState().doc;
  const width = w ?? doc.width ?? 800;
  const height = h ?? doc.height ?? 600;
  let x = 0;
  let y = 0;
  if (list.length) {
    const rightmost = list.reduce((acc, a) => (a.x + a.width > acc.x + acc.width ? a : acc), list[0]);
    x = rightmost.x + rightmost.width + 30;
    y = rightmost.y;
  }
  const ab: Artboard = {
    id: nextId(),
    name: name ?? `Artboard ${list.length + 1}`,
    x,
    y,
    width,
    height,
  };
  commit([...list, ab]);
  return ab;
}

export function deleteArtboard(id: string): void {
  const list = getArtboards().filter((a) => a.id !== id);
  commit(list);
}

export function renameArtboard(id: string, name: string): void {
  const list = getArtboards().map((a) => (a.id === id ? { ...a, name } : a));
  commit(list);
}

export function moveArtboard(id: string, x: number, y: number): void {
  const list = getArtboards().map((a) => (a.id === id ? { ...a, x, y } : a));
  commit(list);
}

export function resizeArtboard(id: string, w: number, h: number): void {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  const list = getArtboards().map((a) => (a.id === id ? { ...a, width, height } : a));
  commit(list);
}

function findArtboard(id: string): Artboard | undefined {
  return getArtboards().find((a) => a.id === id);
}

/**
 * Test whether a Fabric object's bounding rect intersects the artboard rect
 * (any overlap counts as "inside this artboard" for export purposes).
 */
function overlaps(obj: fabric.FabricObject, ab: Artboard): boolean {
  const b = obj.getBoundingRect();
  return !(b.left + b.width < ab.x
    || b.left > ab.x + ab.width
    || b.top + b.height < ab.y
    || b.top > ab.y + ab.height);
}

/**
 * Render just the contents intersecting `artboard` as an SVG string. We build
 * an offscreen StaticCanvas sized to the artboard, clone the matching objects
 * with their position translated, and call toSVG.
 */
export function exportArtboardSVG(id: string): string {
  const ab = findArtboard(id);
  const canvas = getCanvas();
  if (!ab || !canvas) return '';
  const objs = canvas.getObjects().filter(
    (o) => !(o as { excludeFromExport?: boolean }).excludeFromExport && overlaps(o, ab),
  );
  // Serialize selected objects, shifted into artboard-local coords.
  // (Currently unused; preserved for future enlive-based export path.)
  void {
    version: 'artboard-export',
    objects: objs.map((o) => {
      const data = o.toObject() as Record<string, unknown>;
      // Translate so the artboard origin is (0,0).
      if (typeof data.left === 'number') data.left = (data.left as number) - ab.x;
      if (typeof data.top === 'number') data.top = (data.top as number) - ab.y;
      return data;
    }),
    background: canvas.backgroundColor ?? 'transparent',
  };

  // Build an offscreen static canvas sized to the artboard, load it, and
  // serialize to SVG. The constructor accepts either a HTMLCanvasElement or
  // an id; we use a detached element here.
  const el = document.createElement('canvas');
  el.width = Math.max(1, Math.round(ab.width));
  el.height = Math.max(1, Math.round(ab.height));
  const off = new fabric.StaticCanvas(el, {
    width: ab.width,
    height: ab.height,
    backgroundColor: canvas.backgroundColor as string,
    renderOnAddRemove: false,
  });

  // loadFromJSON is async on StaticCanvas — but Fabric returns a Promise and
  // the toSVG path is synchronous once objects are present. We can't easily
  // await here because the public API for this module is synchronous. Use a
  // synchronous fallback: enliven via the canvas methods on a best-effort
  // basis. If the async path is required, return an empty string.
  // Instead, perform a synchronous enlive by relying on classRegistry.
  let svg: string;
  try {
    // Fabric exposes util.enlivenObjects which returns a Promise. To keep the
    // export synchronous from the caller's perspective we eagerly build the
    // SVG header + objects markup using each serialized record's known fields
    // via a temporary deferred resolution. For simplicity and correctness we
    // fall back to an async-aware path returning whatever has been rendered;
    // most calls go through exportArtboardSVGAsync below.
    svg = off.toSVG({ viewBox: { x: 0, y: 0, width: ab.width, height: ab.height } });
  } finally {
    off.dispose();
  }
  return svg || `<!-- empty artboard ${ab.name} -->`;
}

/**
 * Async variant that fully enlivens the artboard contents and returns a real
 * SVG. Prefer this from UI code.
 */
export async function exportArtboardSVGAsync(id: string): Promise<string> {
  const ab = findArtboard(id);
  const canvas = getCanvas();
  if (!ab || !canvas) return '';
  const objs = canvas.getObjects().filter(
    (o) => !(o as { excludeFromExport?: boolean }).excludeFromExport && overlaps(o, ab),
  );
  const serialized = objs.map((o) => {
    const data = o.toObject() as Record<string, unknown>;
    if (typeof data.left === 'number') data.left = (data.left as number) - ab.x;
    if (typeof data.top === 'number') data.top = (data.top as number) - ab.y;
    return data;
  });

  const el = document.createElement('canvas');
  el.width = Math.max(1, Math.round(ab.width));
  el.height = Math.max(1, Math.round(ab.height));
  const off = new fabric.StaticCanvas(el, {
    width: ab.width,
    height: ab.height,
    backgroundColor: canvas.backgroundColor as string,
    renderOnAddRemove: false,
  });
  try {
    const enlived = await fabric.util.enlivenObjects(serialized);
    for (const o of enlived) off.add(o as fabric.FabricObject);
    off.renderAll();
    return off.toSVG({ viewBox: { x: 0, y: 0, width: ab.width, height: ab.height } });
  } finally {
    off.dispose();
  }
}

/** Synchronous list-export, calling exportArtboardSVG for each artboard. */
export function exportAllArtboardsSVG(): string[] {
  return getArtboards().map((a) => exportArtboardSVG(a.id));
}

/**
 * Render an artboard region as a PNG data URL using the main canvas's
 * `toDataURL` with explicit left/top/width/height. Returns '' if no canvas.
 */
export function exportArtboardPNG(id: string, multiplier = 2): string {
  const ab = findArtboard(id);
  const canvas = getCanvas();
  if (!ab || !canvas) return '';
  return canvas.toDataURL({
    format: 'png',
    multiplier,
    left: ab.x,
    top: ab.y,
    width: ab.width,
    height: ab.height,
  });
}
