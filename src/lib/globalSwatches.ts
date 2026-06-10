import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { pushHistory } from './historyOps';
import { useEditor } from '../store/editor';
import { collectSelectionColors, updateSelection } from './selectionApply';

type PaintObject = {
  fill?: unknown;
  stroke?: unknown;
  set?: (key: string, value: unknown) => void;
  _objects?: PaintObject[];
  excludeFromExport?: boolean;
};

export type SwatchPaintTarget = 'fill' | 'stroke' | 'both';
export type SwatchApplyTarget = 'fill' | 'stroke';

export const SWATCHES_STORAGE_KEY = 'vector.swatches';

export const DEFAULT_SWATCHES: string[] = [
  '#000000', '#ffffff', '#9a9aa6', '#3a3a44',
  '#ff3d3d', '#ff7a3d', '#ffc83d', '#f1ff3d',
  '#7aff3d', '#3dff7a', '#3dffd0', '#3dd0ff',
  '#3d9bff', '#3d5fff', '#7a3dff', '#c83dff',
  '#ff3dc8', '#ff3d7a', '#7a4f2b', '#2b4f7a',
  '#0f3d2b', '#5b2b3d', '#2b1b2b', '#15151a',
];

export function loadSwatches(storage: Pick<Storage, 'getItem'> = localStorage): string[] {
  try {
    const raw = storage.getItem(SWATCHES_STORAGE_KEY);
    if (!raw) return DEFAULT_SWATCHES.slice();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((color) => typeof color === 'string');
  } catch { /* ignore */ }
  return DEFAULT_SWATCHES.slice();
}

export function saveSwatches(swatches: string[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(SWATCHES_STORAGE_KEY, JSON.stringify(swatches)); } catch { /* ignore */ }
}

export function addSwatchColor(swatches: string[], color: string): string[] {
  const normalized = normalizeSwatchColor(color);
  if (!normalized || swatches.some((swatch) => normalizeSwatchColor(swatch) === normalized)) return swatches.slice();
  return [...swatches, color];
}

export function addSavedSwatchColor(color: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): string[] {
  const next = addSwatchColor(loadSwatches(storage), color);
  saveSwatches(next, storage);
  return next;
}

export function collectSelectionColorsIntoSwatches(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): { added: number; swatches: string[] } {
  const swatches = loadSwatches(storage);
  const have = new Set(swatches.map(normalizeSwatchColor));
  const fresh = collectSelectionColors().filter((color) => !have.has(normalizeSwatchColor(color)));
  const next = [...swatches, ...fresh];
  if (fresh.length > 0) saveSwatches(next, storage);
  return { added: fresh.length, swatches: next };
}

export function normalizeSwatchColor(color: string): string {
  return color.trim().toLowerCase();
}

function isReplaceablePaint(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && normalizeSwatchColor(value) !== 'transparent';
}


export function applySwatchPaintInObject(object: PaintObject, color: string, target: SwatchApplyTarget): number {
  const normalized = normalizeSwatchColor(color);
  if (!normalized || normalized === 'transparent') return 0;
  if (object.set) object.set(target, color);
  else object[target] = color;
  return 1;
}

export function applySwatchToSelection(color: string, target: SwatchApplyTarget): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getActiveObjects();
  if (objects.length === 0) return 0;

  let changed = 0;
  for (const object of objects) changed += applySwatchPaintInObject(object as fabric.FabricObject & PaintObject, color, target);

  if (changed > 0) {
    useEditor.getState().setStyle({ [target]: color });
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

export function countSwatchPaintMatches(object: PaintObject, color: string, target: SwatchPaintTarget = 'both'): number {
  const normalized = normalizeSwatchColor(color);
  if (!normalized) return 0;

  let matches = 0;
  if ((target === 'fill' || target === 'both') && isReplaceablePaint(object.fill) && normalizeSwatchColor(object.fill) === normalized) matches += 1;
  if ((target === 'stroke' || target === 'both') && isReplaceablePaint(object.stroke) && normalizeSwatchColor(object.stroke) === normalized) matches += 1;
  for (const child of object._objects ?? []) matches += countSwatchPaintMatches(child, color, target);
  return matches;
}

export function replacePaintInObject(object: PaintObject, fromColor: string, toColor: string): number {
  const from = normalizeSwatchColor(fromColor);
  const to = normalizeSwatchColor(toColor);
  if (!from || !to || from === to) return 0;

  let changed = 0;
  const replace = (key: 'fill' | 'stroke') => {
    const value = object[key];
    if (!isReplaceablePaint(value) || normalizeSwatchColor(value) !== from) return;
    if (object.set) object.set(key, toColor);
    else object[key] = toColor;
    changed += 1;
  };

  replace('fill');
  replace('stroke');
  for (const child of object._objects ?? []) changed += replacePaintInObject(child, from, toColor);
  return changed;
}

export function replaceSwatchListColor(swatches: string[], fromColor: string, toColor: string): string[] {
  const from = normalizeSwatchColor(fromColor);
  const seen = new Set<string>();
  const next: string[] = [];

  for (const swatch of swatches) {
    const candidate = normalizeSwatchColor(swatch) === from ? toColor : swatch;
    const key = normalizeSwatchColor(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(candidate);
  }

  return next;
}

export type ReplaceGlobalSwatchResult = {
  changed: number;
  swatches: string[];
};

export function replaceSavedSwatchWithColor(fromColor: string, toColor: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): ReplaceGlobalSwatchResult {
  const swatches = loadSwatches(storage);
  const nextSwatches = replaceSwatchListColor(swatches, fromColor, toColor);
  const changed = replaceColorAcrossCanvas(fromColor, toColor);
  saveSwatches(nextSwatches, storage);
  return { changed, swatches: nextSwatches };
}

export function replaceColorAcrossCanvas(fromColor: string, toColor: string): number {
  const canvas = getCanvas();
  if (!canvas) return 0;

  let changed = 0;
  for (const object of canvas.getObjects()) {
    changed += replacePaintInObject(object as fabric.FabricObject & PaintObject, fromColor, toColor);
  }

  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

export function selectObjectsUsingSwatch(color: string, target: SwatchPaintTarget = 'both'): number {
  const canvas = getCanvas();
  if (!canvas) return 0;

  const matches = canvas.getObjects().filter((object) => {
    const paintObject = object as fabric.FabricObject & PaintObject;
    if (paintObject.excludeFromExport) return false;
    return countSwatchPaintMatches(paintObject, color, target) > 0;
  });

  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(matches.length === 1 ? matches[0] : new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  updateSelection();
  return matches.length;
}
