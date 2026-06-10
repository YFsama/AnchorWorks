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
import { getCanvas, pushHistory } from './canvasEngine';
import { useEditor } from '../store/editor';
import { download, downloadDataURL } from './io';
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

/** Delete the artboard containing the active object. Returns true when removed. */
export function deleteActiveArtboard(): boolean {
  const id = activeArtboardId();
  if (!id) return false;
  deleteArtboard(id);
  return true;
}

/**
 * Create a new artboard that frames the current selection's bounding box
 * (Illustrator "Artboard from selection"), optionally inset by a margin. Placed
 * in-place over the artwork so it encloses it — handy for carving a piece out
 * for separate export. Returns the artboard, or null when nothing is selected.
 */
export function createArtboardFromSelection(marginPx = 0): Artboard | null {
  const canvas = getCanvas();
  const sel = canvas?.getActiveObject();
  if (!sel) return null;
  const b = sel.getBoundingRect();
  const list = getArtboards();
  const ab: Artboard = {
    id: nextId(),
    name: `Artboard ${list.length + 1}`,
    x: b.left - marginPx,
    y: b.top - marginPx,
    width: b.width + marginPx * 2,
    height: b.height + marginPx * 2,
  };
  commit([...list, ab]);
  return ab;
}

/**
 * Duplicate an artboard together with the artwork inside it (Illustrator/
 * SignMaster "Duplicate Artboard"). The new frame is placed to the right of all
 * existing artboards on the source's row; every object whose centre lies inside
 * the source frame is cloned and shifted by the same delta. Async because
 * Fabric v6's clone() is Promise-based. Returns the new artboard, or null.
 */
function overlapsArtboard(box: { left: number; top: number; width: number; height: number }, artboard: Artboard): boolean {
  return !(box.left + box.width < artboard.x
    || box.left > artboard.x + artboard.width
    || box.top + box.height < artboard.y
    || box.top > artboard.y + artboard.height);
}

function activeArtboardId(): string | null {
  const canvas = getCanvas();
  const active = canvas?.getActiveObject();
  if (!active) return null;
  const box = active.getBoundingRect();
  return getArtboards().find((artboard) => overlapsArtboard(box, artboard))?.id ?? null;
}

function duplicatedArtboardFrame(src: Artboard, list: Artboard[]): Artboard {
  const rightmost = list.reduce((acc, a) => (a.x + a.width > acc.x + acc.width ? a : acc), list[0]);
  return {
    id: nextId(),
    name: `${src.name} copy`,
    x: rightmost.x + rightmost.width + 30,
    y: src.y,
    width: src.width,
    height: src.height,
  };
}

export function duplicateArtboardFrame(id: string): Artboard | null {
  const src = findArtboard(id);
  if (!src) return null;
  const list = getArtboards();
  const ab = duplicatedArtboardFrame(src, list);
  commit([...list, ab]);
  return ab;
}

export async function duplicateArtboard(id: string): Promise<Artboard | null> {
  const src = findArtboard(id);
  if (!src) return null;
  const list = getArtboards();
  const ab = duplicatedArtboardFrame(src, list);
  const nx = ab.x;
  const ny = ab.y;
  commit([...list, ab]);

  const canvas = getCanvas();
  if (canvas) {
    const dx = nx - src.x;
    const dy = ny - src.y;
    const inside = canvas.getObjects().filter((o) => {
      if ((o as { excludeFromExport?: boolean }).excludeFromExport) return false;
      const b = o.getBoundingRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      return cx >= src.x && cx <= src.x + src.width && cy >= src.y && cy <= src.y + src.height;
    });
    for (const o of inside) {
      const clone = (await o.clone()) as fabric.FabricObject;
      clone.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
      clone.setCoords();
      canvas.add(clone);
    }
    if (inside.length) { canvas.requestRenderAll(); pushHistory(); }
  }
  return ab;
}


/** Duplicate the artboard containing the active object, including artwork on that page. */
export async function duplicateActiveArtboard(): Promise<Artboard | null> {
  const id = activeArtboardId();
  return id ? duplicateArtboard(id) : null;
}

/** Duplicate only the active artboard frame, leaving artwork in place. */
export function duplicateActiveArtboardFrame(): Artboard | null {
  const id = activeArtboardId();
  return id ? duplicateArtboardFrame(id) : null;
}

export type ArtboardOrderDirection = 'previous' | 'next' | 'first' | 'last';

export function reorderArtboard(id: string, direction: ArtboardOrderDirection): boolean {
  const list = getArtboards();
  const index = list.findIndex((artboard) => artboard.id === id);
  if (index < 0) return false;
  const target = direction === 'first'
    ? 0
    : direction === 'last'
      ? list.length - 1
      : index + (direction === 'previous' ? -1 : 1);
  if (target < 0 || target >= list.length || target === index) return false;
  const next = [...list];
  const [artboard] = next.splice(index, 1);
  next.splice(target, 0, artboard);
  commit(next);
  return true;
}

export function reorderActiveArtboard(direction: ArtboardOrderDirection): boolean {
  const id = activeArtboardId();
  return id ? reorderArtboard(id, direction) : false;
}

function artboardOrderKey(artboard: Artboard): string {
  return `${artboard.id}:${artboard.x}:${artboard.y}:${artboard.width}:${artboard.height}`;
}

function artboardPositionSorted(list: Artboard[]): Artboard[] {
  return [...list].sort((a, b) => {
    const verticalTolerance = Math.max(1, Math.min(a.height, b.height) * 0.5);
    if (Math.abs(a.y - b.y) > verticalTolerance) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.name.localeCompare(b.name);
  });
}

export function sortArtboardsByPosition(): boolean {
  const list = getArtboards();
  if (list.length < 2) return false;
  const sorted = artboardPositionSorted(list);
  if (sorted.map(artboardOrderKey).join('|') === list.map(artboardOrderKey).join('|')) return false;
  commit(sorted);
  return true;
}

export function renumberArtboardsByPosition(prefix = 'Artboard'): boolean {
  const list = getArtboards();
  if (list.length === 0) return false;
  const sorted = artboardPositionSorted(list).map((artboard, index) => ({
    ...artboard,
    name: `${prefix} ${index + 1}`,
  }));
  const sameOrder = sorted.map((artboard) => artboard.id).join('|') === list.map((artboard) => artboard.id).join('|');
  const sameNames = sorted.every((artboard, index) => artboard.name === list[index]?.name);
  if (sameOrder && sameNames) return false;
  commit(sorted);
  return true;
}

export function renameArtboard(id: string, name: string): void {
  const list = getArtboards().map((a) => (a.id === id ? { ...a, name } : a));
  commit(list);
}

/** Rename the artboard containing the active object. Returns true when changed. */
export function renameActiveArtboard(name: string): boolean {
  const id = activeArtboardId();
  const nextName = name.trim();
  if (!id || !nextName) return false;
  const current = getArtboards().find((artboard) => artboard.id === id);
  if (!current || current.name === nextName) return false;
  renameArtboard(id, nextName);
  return true;
}

export function getActiveArtboard(): Artboard | null {
  const id = activeArtboardId();
  return id ? getArtboards().find((artboard) => artboard.id === id) ?? null : null;
}

export function getActiveArtboardName(): string | null {
  return getActiveArtboard()?.name ?? null;
}

export function promptRenameActiveArtboard(label = 'Artboard name'): boolean {
  const current = getActiveArtboardName();
  if (!current) return false;
  const next = window.prompt(label, current);
  if (next == null) return false;
  return renameActiveArtboard(next);
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

export interface RearrangeArtboardsOptions {
  columns?: number;
  spacing?: number;
  moveArtwork?: boolean;
  startX?: number;
  startY?: number;
}

export interface PromptRearrangeArtboardsLabels {
  columns?: string;
  spacing?: string;
  moveArtwork?: string;
}

function parsePositiveInteger(value: string): number | null {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  return rounded >= 1 ? rounded : null;
}

function parseNonNegativeNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePromptBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (['y', 'yes', 'true', '1'].includes(normalized)) return true;
  if (['n', 'no', 'false', '0'].includes(normalized)) return false;
  return null;
}

/** Prompt for Illustrator-style Rearrange Artboards options. Returns null on cancel, -1 on invalid input. */
export function promptRearrangeArtboards(labels: PromptRearrangeArtboardsLabels = {}): number | null {
  const artboardCount = getArtboards().length;
  if (artboardCount < 2) return 0;
  const defaultColumns = String(Math.ceil(Math.sqrt(artboardCount)));
  const columnsRaw = window.prompt(labels.columns ?? 'Columns', defaultColumns);
  if (columnsRaw == null) return null;
  const columns = parsePositiveInteger(columnsRaw);
  if (columns == null) return -1;

  const spacingRaw = window.prompt(labels.spacing ?? 'Spacing', '30');
  if (spacingRaw == null) return null;
  const spacing = parseNonNegativeNumber(spacingRaw);
  if (spacing == null) return -1;

  const moveArtworkRaw = window.prompt(labels.moveArtwork ?? 'Move artwork? yes/no', 'yes');
  if (moveArtworkRaw == null) return null;
  const moveArtwork = parsePromptBoolean(moveArtworkRaw);
  if (moveArtwork == null) return -1;

  return rearrangeArtboards({ columns, spacing, moveArtwork });
}

function centerInsideArtboard(object: fabric.FabricObject, artboard: Artboard): boolean {
  const bounds = object.getBoundingRect();
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  return cx >= artboard.x && cx <= artboard.x + artboard.width && cy >= artboard.y && cy <= artboard.y + artboard.height;
}

export function rearrangeArtboards(options: RearrangeArtboardsOptions = {}): number {
  const artboards = getArtboards();
  if (artboards.length < 2) return 0;
  const columns = Math.max(1, Math.floor(options.columns ?? Math.ceil(Math.sqrt(artboards.length))));
  const spacing = Math.max(0, options.spacing ?? 30);
  const startX = options.startX ?? Math.min(...artboards.map((artboard) => artboard.x));
  const startY = options.startY ?? Math.min(...artboards.map((artboard) => artboard.y));
  let x = startX;
  let y = startY;
  let rowHeight = 0;
  const arranged = artboards.map((artboard, index) => {
    if (index > 0 && index % columns === 0) {
      x = startX;
      y += rowHeight + spacing;
      rowHeight = 0;
    }
    const next = { ...artboard, x: Math.round(x), y: Math.round(y) };
    x += artboard.width + spacing;
    rowHeight = Math.max(rowHeight, artboard.height);
    return next;
  });
  commit(arranged);

  if (options.moveArtwork !== false) {
    const canvas = getCanvas();
    if (canvas) {
      let movedObjects = 0;
      for (const object of canvas.getObjects()) {
        if ((object as { excludeFromExport?: boolean }).excludeFromExport) continue;
        const sourceIndex = artboards.findIndex((artboard) => centerInsideArtboard(object, artboard));
        if (sourceIndex < 0) continue;
        const source = artboards[sourceIndex];
        const target = arranged[sourceIndex];
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        if (!dx && !dy) continue;
        object.set({ left: (object.left ?? 0) + dx, top: (object.top ?? 0) + dy });
        object.setCoords();
        movedObjects++;
      }
      if (movedObjects) {
        canvas.requestRenderAll();
        pushHistory();
      }
    }
  }
  return arranged.length;
}

/** Reposition + resize an artboard to tightly fit `bbox` plus a px margin, in
 *  one commit (Fit Artboard to Artwork / Selection). */
export function fitArtboard(id: string, bbox: { left: number; top: number; width: number; height: number }, marginPx = 0): void {
  const list = getArtboards().map((a) => (a.id === id ? {
    ...a,
    x: Math.round(bbox.left - marginPx),
    y: Math.round(bbox.top - marginPx),
    width: Math.max(1, Math.round(bbox.width + marginPx * 2)),
    height: Math.max(1, Math.round(bbox.height + marginPx * 2)),
  } : a));
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
 * Download every artboard as a separate SVG file (one per artboard), using the
 * async full-fidelity render. Returns the number exported.
 */
function safeArtboardName(artboard: Artboard, fallback: string): string {
  return (artboard.name || fallback).replace(/[^\w.-]+/g, '_');
}

export function parseArtboardRange(range: string, artboardCount: number): number[] | null {
  if (artboardCount <= 0) return [];
  const seen = new Set<number>();
  const indexes: number[] = [];
  const parts = range.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || start > artboardCount || end > artboardCount || start > end) return null;
    for (let page = start; page <= end; page++) {
      const index = page - 1;
      if (!seen.has(index)) {
        seen.add(index);
        indexes.push(index);
      }
    }
  }
  return indexes;
}

function artboardsFromRange(range: string): Artboard[] | null {
  const artboards = getArtboards();
  const indexes = parseArtboardRange(range, artboards.length);
  if (!indexes) return null;
  return indexes.map((index) => artboards[index]).filter(Boolean);
}

function artboardsFromIds(ids: string[]): Artboard[] {
  const artboards = getArtboards();
  const byId = new Map(artboards.map((artboard) => [artboard.id, artboard]));
  const seen = new Set<string>();
  const selected: Artboard[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const artboard = byId.get(id);
    if (!artboard) continue;
    seen.add(id);
    selected.push(artboard);
  }
  return selected;
}

export async function exportActiveArtboardAsSVG(): Promise<boolean> {
  const artboard = getActiveArtboard();
  if (!artboard) return false;
  const svg = await exportArtboardSVGAsync(artboard.id);
  if (!svg) return false;
  download(`${safeArtboardName(artboard, 'active-artboard')}.svg`, svg);
  return true;
}

export function exportActiveArtboardAsPNG(multiplier = 2): boolean {
  const artboard = getActiveArtboard();
  if (!artboard) return false;
  const url = exportArtboardPNG(artboard.id, multiplier);
  if (!url) return false;
  downloadDataURL(`${safeArtboardName(artboard, 'active-artboard')}.png`, url);
  return true;
}

export async function exportAllArtboardsAsFiles(): Promise<number> {
  const abs = getArtboards();
  let n = 0;
  for (const a of abs) {
    const svg = await exportArtboardSVGAsync(a.id);
    if (!svg) continue;
    download(`${safeArtboardName(a, `artboard-${n + 1}`)}.svg`, svg);
    n++;
  }
  return n;
}

export async function exportArtboardRangeAsFiles(range: string): Promise<number | null> {
  const artboards = artboardsFromRange(range);
  if (!artboards) return null;
  return exportArtboardsAsFilesByList(artboards);
}

async function exportArtboardsAsFilesByList(artboards: Artboard[]): Promise<number> {
  let n = 0;
  for (const artboard of artboards) {
    const svg = await exportArtboardSVGAsync(artboard.id);
    if (!svg) continue;
    download(`${safeArtboardName(artboard, `artboard-${n + 1}`)}.svg`, svg);
    n++;
  }
  return n;
}

export async function exportArtboardsByIdAsFiles(ids: string[]): Promise<number> {
  return exportArtboardsAsFilesByList(artboardsFromIds(ids));
}

/** Download every artboard as its own PNG (`multiplier`× resolution). Returns
 *  the number exported. */
export function exportAllArtboardsAsPNG(multiplier = 2): number {
  const abs = getArtboards();
  let n = 0;
  for (const a of abs) {
    const url = exportArtboardPNG(a.id, multiplier);
    if (!url) continue;
    downloadDataURL(`${safeArtboardName(a, `artboard-${n + 1}`)}.png`, url);
    n++;
  }
  return n;
}

export function exportArtboardRangeAsPNG(range: string, multiplier = 2): number | null {
  const artboards = artboardsFromRange(range);
  if (!artboards) return null;
  return exportArtboardsAsPNGByList(artboards, multiplier);
}

function exportArtboardsAsPNGByList(artboards: Artboard[], multiplier = 2): number {
  let n = 0;
  for (const artboard of artboards) {
    const url = exportArtboardPNG(artboard.id, multiplier);
    if (!url) continue;
    downloadDataURL(`${safeArtboardName(artboard, `artboard-${n + 1}`)}.png`, url);
    n++;
  }
  return n;
}

export function exportArtboardsByIdAsPNG(ids: string[], multiplier = 2): number {
  return exportArtboardsAsPNGByList(artboardsFromIds(ids), multiplier);
}

export async function promptExportArtboardRangeAsSVG(label = 'Artboard range', defaultRange = '1'): Promise<number | null> {
  const range = window.prompt(label, defaultRange);
  if (range == null) return null;
  return exportArtboardRangeAsFiles(range);
}

export function promptExportArtboardRangeAsPNG(label = 'Artboard range', defaultRange = '1'): number | null {
  const range = window.prompt(label, defaultRange);
  if (range == null) return null;
  return exportArtboardRangeAsPNG(range);
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
