/**
 * Symbols library — reusable shape snippets that can be saved from the
 * current selection and re-instantiated later.
 *
 * Storage: persisted to localStorage under `vector.symbols`. LRU-trimmed to
 * a small cap so the quota stays well within typical browser limits.
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import type { SymbolEntry } from '../types';

const STORAGE_KEY = 'vector.symbols';
const LIMIT = 20;

function notify() {
  try { window.dispatchEvent(new CustomEvent('vector:symbols-changed')); } catch { /* ignore */ }
}

export function getSymbols(): SymbolEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SymbolEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: SymbolEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota — drop the oldest until it fits */
    let trimmed = [...list];
    while (trimmed.length > 1) {
      trimmed = trimmed.slice(0, trimmed.length - 1);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        break;
      } catch { /* try again with fewer entries */ }
    }
  }
  notify();
}

/**
 * Build a tiny 64×64 PNG thumbnail from a set of serialized fabric objects
 * using an offscreen StaticCanvas.
 */
async function makeThumbnail(serialized: object[]): Promise<string> {
  const SIZE = 64;
  const el = document.createElement('canvas');
  el.width = SIZE;
  el.height = SIZE;
  const off = new fabric.StaticCanvas(el, {
    width: SIZE,
    height: SIZE,
    backgroundColor: '#ffffff',
    renderOnAddRemove: false,
  });
  try {
    const enlived = (await fabric.util.enlivenObjects(serialized)) as fabric.FabricObject[];
    for (const o of enlived) off.add(o);
    off.renderAll();
    // Fit content within the 64×64 frame.
    const objs = off.getObjects();
    if (objs.length) {
      const lefts = objs.map(o => o.getBoundingRect().left);
      const tops = objs.map(o => o.getBoundingRect().top);
      const rights = objs.map(o => o.getBoundingRect().left + o.getBoundingRect().width);
      const bottoms = objs.map(o => o.getBoundingRect().top + o.getBoundingRect().height);
      const minX = Math.min(...lefts);
      const minY = Math.min(...tops);
      const maxX = Math.max(...rights);
      const maxY = Math.max(...bottoms);
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const pad = 4;
      const scale = Math.min((SIZE - pad * 2) / w, (SIZE - pad * 2) / h);
      const offsetX = (SIZE - w * scale) / 2 - minX * scale;
      const offsetY = (SIZE - h * scale) / 2 - minY * scale;
      off.setViewportTransform([scale, 0, 0, scale, offsetX, offsetY]);
      off.renderAll();
    }
    return off.toDataURL({ format: 'png', multiplier: 1 });
  } catch {
    return '';
  } finally {
    off.dispose();
  }
}

/**
 * Capture the current active selection as a reusable symbol. Returns the
 * persisted entry, or null if no selection / no canvas.
 */
export async function saveSelectionAsSymbol(name: string): Promise<SymbolEntry | null> {
  const canvas = getCanvas();
  if (!canvas) return null;
  const active = canvas.getActiveObjects();
  if (!active.length) return null;

  // Serialize each selected object via toObject().
  const serialized = active.map((o) => o.toObject() as object);

  // Normalize positions so the bounding box top-left is (0,0). This makes
  // later insertion at an arbitrary point predictable.
  const rects = active.map((o) => o.getBoundingRect());
  const minX = Math.min(...rects.map((r) => r.left));
  const minY = Math.min(...rects.map((r) => r.top));
  const normalized = serialized.map((data) => {
    const d = data as Record<string, unknown>;
    if (typeof d.left === 'number') d.left = (d.left as number) - minX;
    if (typeof d.top === 'number') d.top = (d.top as number) - minY;
    return d;
  });

  const thumbnail = await makeThumbnail(normalized);
  const entry: SymbolEntry = {
    id: `sym-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name || 'Symbol',
    thumbnail,
    objectsJSON: normalized,
    addedAt: Date.now(),
  };

  // LRU: newest first; cap at LIMIT.
  const next = [entry, ...getSymbols().filter((s) => s.id !== entry.id)].slice(0, LIMIT);
  writeAll(next);
  return entry;
}

export function deleteSymbol(id: string): void {
  const list = getSymbols().filter((s) => s.id !== id);
  writeAll(list);
}

export function renameSymbol(id: string, name: string): void {
  const list = getSymbols().map((s) => (s.id === id ? { ...s, name } : s));
  writeAll(list);
}

/**
 * Instantiate a previously-saved symbol onto the main canvas at (x, y), or
 * the visible canvas center when omitted. New objects are wrapped in an
 * ActiveSelection so the user can immediately drag them.
 */
export async function insertSymbol(id: string, x?: number, y?: number): Promise<void> {
  const canvas = getCanvas();
  if (!canvas) return;
  const entry = getSymbols().find((s) => s.id === id);
  if (!entry) return;
  const raw = Array.isArray(entry.objectsJSON) ? entry.objectsJSON : [entry.objectsJSON];

  // Touch the LRU order so recently inserted symbols stay first.
  const rest = getSymbols().filter((s) => s.id !== id);
  writeAll([{ ...entry, addedAt: Date.now() }, ...rest].slice(0, LIMIT));

  const enlived = (await fabric.util.enlivenObjects(raw as object[])) as fabric.FabricObject[];
  if (!enlived.length) return;

  // Compute the target offset. The objects were saved with their bounding box
  // anchored at (0,0), so we just translate the whole bunch.
  let cx = x;
  let cy = y;
  if (cx == null || cy == null) {
    const c = canvas.getCenterPoint();
    // Convert viewport center back to scene coords.
    const vt = canvas.viewportTransform!;
    const zoom = canvas.getZoom();
    cx = (c.x - vt[4]) / zoom;
    cy = (c.y - vt[5]) / zoom;
    // Anchor by group center: shift back by half bounds.
    const rects = enlived.map((o) => o.getBoundingRect());
    const w = Math.max(...rects.map((r) => r.left + r.width));
    const h = Math.max(...rects.map((r) => r.top + r.height));
    cx -= w / 2;
    cy -= h / 2;
  }

  for (const o of enlived) {
    o.set({ left: (o.left ?? 0) + cx, top: (o.top ?? 0) + cy });
    o.setCoords();
    canvas.add(o);
  }
  canvas.discardActiveObject();
  if (enlived.length === 1) {
    canvas.setActiveObject(enlived[0]);
  } else {
    const sel = new fabric.ActiveSelection(enlived, { canvas });
    canvas.setActiveObject(sel);
  }
  canvas.requestRenderAll();
  pushHistory();
}
