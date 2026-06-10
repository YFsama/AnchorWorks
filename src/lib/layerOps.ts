import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { blendObjectsOnCanvas, type BlendOptions } from './blend';
import { removeCleanupObjects } from './cleanUp';
import { addAnchorsToObject } from './addAnchors';
import { knifeSplitObjectAtCenter, type KnifeAxis } from './knife';
import { makeCompoundPathFromObjects, releaseCompoundPathObjects } from './masks';
import { clearGradientFillFromObject, clearPatternFillFromObject, expandDropShadowObjects, expandPatternFillObjects, flattenTransparencyObject, type PatternSpec } from './effects';
import { detachSymbolMetadataFromObjects } from './symbols';
import { freeDistortObject, type FreeDistortCorners } from './freeDistort';
import { grommetsFromObjects } from './grommets';
import { DEFAULT_CLEARED_APPEARANCE, applyGraphicStyleToObject, captureGraphicStyleFromObject, objectMatchesGraphicStyle, type GraphicStyle } from './graphicStyles';
import { offsetPathObject } from './offsetPath';
import { addOutlineEffectToCanvas } from './outlineEffect';
import { outlineStrokeObjectToFill } from './outlineStrokeFill';
import { reversePathObject } from './pathReverse';
import { rhinestoneFromSelection } from './rhinestone';
import { roundCornersObject } from './roundCorners';
import { simplifyPathObject } from './pathSimplify';
import { smoothPathObject } from './pathSmooth';
import { puckerObject } from './pucker';
import { roughenObject } from './roughen';
import { zigzagObject } from './zigzag';
import { twistObject } from './twist';
import { warpObjects, type WarpStyle } from './warp';
import { scissorsSplitObjectAtMidpoint } from './scissors';
import { splitObjectIntoGrid } from './splitGrid';
import { applyWidthProfileToObject, type WidthProfile } from './variableWidth';
import type { CutPath } from '../store/editor';

type ObjectWithId = fabric.FabricObject & { _id?: string };

function selectedObjectsById(ids: string[]): fabric.FabricObject[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  const wanted = new Set(ids.filter(Boolean));
  if (wanted.size === 0) return [];
  return canvas.getObjects().filter((object) => wanted.has(String((object as ObjectWithId)._id ?? '')));
}

export type LayerStackDestination = 'front' | 'back' | 'forward' | 'backward' | 'reverse';
export type LayerNameCaseMode = 'upper' | 'lower' | 'title' | 'sentence';

export const LAYER_BLEND_MODES = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'difference',
  'exclusion',
] as const satisfies readonly GlobalCompositeOperation[];

export type LayerBlendMode = typeof LAYER_BLEND_MODES[number];

export type LayerPaintTarget = 'fill' | 'stroke';

export type LayerStrokeStyleTarget = 'cap' | 'join';
export type LayerSameAppearanceTarget = 'appearance' | 'fill' | 'stroke' | 'opacity' | 'blendMode' | 'strokeWidth' | 'strokeCap' | 'strokeJoin' | 'dash' | 'miterLimit' | 'strokeUniform' | 'shadow';
export type LayerSameObjectTarget = 'type' | 'visibility' | 'lock' | 'named' | 'namePrefix';
export type LayerSameGeometryTarget = 'width' | 'height' | 'size' | 'area' | 'aspectRatio' | 'rotation' | 'scale' | 'skew' | 'x' | 'y' | 'position' | 'centerX' | 'centerY' | 'center' | 'right' | 'bottom' | 'bounds';
export type LayerSameProductionTarget = 'overprint' | 'printMarkKind';
export type LayerSameComplexAppearanceTarget = 'gradientFill' | 'pattern' | 'clipPath';
export type LayerSameTextTarget = 'fontFamily' | 'fontSize' | 'textAppearance';
export type LayerSameAssetTarget = 'symbol' | 'imageSource' | 'imageFilters';
export type LayerStrokeCap = CanvasLineCap;
export type LayerStrokeJoin = CanvasLineJoin;
export type LayerOverprintTarget = 'fill' | 'stroke' | 'both';
export type LayerTextStyleTarget = 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'charSpacing' | 'lineHeight' | 'textAlign' | 'underline' | 'linethrough' | 'overline';
export type LayerGeometrySetTarget = 'x' | 'y' | 'centerX' | 'centerY' | 'right' | 'bottom' | 'width' | 'height' | 'rotation' | 'scaleX' | 'scaleY' | 'skewX' | 'skewY';
export type LayerGeometryPairSetTarget = 'position' | 'center' | 'size' | 'scale' | 'skew' | 'bounds';

export interface LayerTargetResult {
  selected: number;
  revealed: number;
  unlocked: number;
}

export interface RenumberLayerObjectsOptions {
  prefix?: string;
  start?: number;
}

export interface ReplaceLayerObjectNameOptions {
  find: string;
  replace: string;
  matchCase?: boolean;
}

export interface SetLayerObjectOpacityOptions {
  opacity: number;
}

export interface SetLayerObjectBlendModeOptions {
  blendMode: LayerBlendMode;
}

export interface SetLayerObjectPaintOptions {
  target: LayerPaintTarget;
  paint: string;
}

export interface SetLayerObjectStrokeWidthOptions {
  strokeWidth: number;
}

export interface SetLayerObjectStrokeStyleOptions {
  target: LayerStrokeStyleTarget;
  value: LayerStrokeCap | LayerStrokeJoin;
}

export interface SetLayerObjectDashOptions {
  dash: number[];
}

export interface SetLayerObjectShadowOptions {
  color: string | null;
  blur?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface SetLayerObjectMiterLimitOptions {
  miterLimit: number;
}

export interface SetLayerObjectStrokeUniformOptions {
  strokeUniform: boolean;
}

export interface SetLayerObjectOverprintOptions {
  target: LayerOverprintTarget;
  overprint: boolean;
}

export interface SetLayerObjectPrintMarkKindOptions {
  printMarkKind: string | null;
}

export interface SetLayerObjectTextStyleOptions {
  target: LayerTextStyleTarget;
  value: string | number;
}

export interface SetLayerObjectGeometryOptions {
  target: LayerGeometrySetTarget;
  value: number;
}

export interface SetLayerObjectGeometryPairOptions {
  target: LayerGeometryPairSetTarget;
  values: number[];
}

export interface OffsetLayerObjectsOptions {
  offsetMm: number;
}

export interface SmoothLayerObjectsOptions {
  iterations: number;
}

export interface SimplifyLayerObjectsOptions {
  tolerancePx: number;
}

export interface SplitLayerObjectsIntoGridOptions {
  rows: number;
  cols: number;
  gutterMm: number;
}

export interface PuckerLayerObjectsOptions {
  amount: number;
}

export interface RoughenLayerObjectsOptions {
  sizeMm: number;
  detailMm: number;
}

export interface ZigzagLayerObjectsOptions {
  sizeMm: number;
  ridges: number;
  smooth: boolean;
}

export interface TwistLayerObjectsOptions {
  angleDeg: number;
}

export interface RoundCornersLayerObjectsOptions {
  radiusMm: number;
}

export interface FreeDistortLayerObjectsOptions {
  offsets: FreeDistortCorners;
}

export interface WarpLayerObjectsOptions {
  bendPct: number;
  style: WarpStyle;
}

export interface MultiOutlineLayerObjectsOptions {
  colors: string[];
  widthMm: number;
}

export interface VariableWidthLayerObjectsOptions {
  profile: WidthProfile;
}

export interface BlendLayerObjectsOptions extends BlendOptions {
  steps: number;
}

export interface RhinestoneLayerObjectsOptions {
  spacingMm: number;
  diameterMm: number;
}

export interface GrommetLayerObjectsOptions {
  insetMm: number;
  maxSpacingMm: number;
  diameterMm: number;
}

function unlockObject(object: fabric.FabricObject): boolean {
  const wasLocked = object.lockMovementX || object.lockMovementY || object.lockScalingX || object.lockScalingY || object.lockRotation;
  if (!wasLocked) return false;
  object.set({ lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false, hasControls: true });
  return true;
}

function moveObjectsOneStep(objects: fabric.FabricObject[], matches: fabric.FabricObject[], destination: 'forward' | 'backward'): void {
  const selected = new Set(matches);
  if (destination === 'forward') {
    for (let index = objects.length - 2; index >= 0; index--) {
      if (!selected.has(objects[index]) || selected.has(objects[index + 1])) continue;
      [objects[index], objects[index + 1]] = [objects[index + 1], objects[index]];
    }
    return;
  }
  for (let index = 1; index < objects.length; index++) {
    if (!selected.has(objects[index]) || selected.has(objects[index - 1])) continue;
    [objects[index - 1], objects[index]] = [objects[index], objects[index - 1]];
  }
}

export function normalizeLayerBlendMode(value: string): LayerBlendMode | null {
  const normalized = value.trim().toLowerCase().replace(/[ _]+/g, '-');
  if (normalized === 'normal') return 'source-over';
  return (LAYER_BLEND_MODES as readonly string[]).includes(normalized) ? normalized as LayerBlendMode : null;
}

export function normalizeLayerPaint(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(none|transparent)$/i.test(trimmed)) return '';
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return trimmed;
  if (/^(?:rgb|rgba|hsl|hsla)\(/i.test(trimmed)) return trimmed;
  return null;
}

export function normalizeLayerStrokeCap(value: string): LayerStrokeCap | null {
  const normalized = value.trim().toLowerCase();
  return normalized === 'butt' || normalized === 'round' || normalized === 'square' ? normalized : null;
}

export function normalizeLayerStrokeJoin(value: string): LayerStrokeJoin | null {
  const normalized = value.trim().toLowerCase();
  return normalized === 'miter' || normalized === 'round' || normalized === 'bevel' ? normalized : null;
}

export function normalizeLayerDash(value: string): number[] | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'solid' || normalized === 'none') return [];
  if (normalized === 'dashed' || normalized === 'dash') return [10, 5];
  if (normalized === 'dotted' || normalized === 'dot') return [2, 4];
  const values = normalized.split(/[\s,]+/).map(Number);
  if (values.length === 0 || values.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (values.every((part) => part === 0)) return [];
  return values;
}

export function normalizeLayerBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (['on', 'true', 'yes', '1', 'constant', 'uniform'].includes(normalized)) return true;
  if (['off', 'false', 'no', '0', 'scale', 'scaled'].includes(normalized)) return false;
  return null;
}

function changeNameCase(name: string, mode: LayerNameCaseMode): string {
  if (mode === 'upper') return name.toLocaleUpperCase();
  if (mode === 'lower') return name.toLocaleLowerCase();
  if (mode === 'title') {
    return name.toLocaleLowerCase().replace(/(^|[\s\-_./])([\p{L}\p{N}])/gu, (_match, separator: string, char: string) => `${separator}${char.toLocaleUpperCase()}`);
  }
  const lower = name.toLocaleLowerCase();
  return lower.replace(/(^\s*)([\p{L}\p{N}])/u, (_match, prefix: string, char: string) => `${prefix}${char.toLocaleUpperCase()}`);
}

function reverseObjectsInPlace(objects: fabric.FabricObject[], matches: fabric.FabricObject[]): void {
  const selected = new Set(matches);
  const indexes = objects.map((object, index) => (selected.has(object) ? index : -1)).filter((index) => index >= 0);
  const reversed = indexes.map((index) => objects[index]).reverse();
  indexes.forEach((index, slot) => {
    objects[index] = reversed[slot];
  });
}

export function moveLayerObjectsById(ids: string[], destination: LayerStackDestination): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  if (destination === 'front' || destination === 'back') {
    const ordered = destination === 'front' ? matches : [...matches].reverse();
    for (const object of ordered) {
      if (destination === 'front') canvas.bringObjectToFront(object);
      else canvas.sendObjectToBack(object);
    }
  } else if (destination === 'reverse') {
    reverseObjectsInPlace(canvas.getObjects(), matches);
  } else {
    moveObjectsOneStep(canvas.getObjects(), matches, destination);
  }
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function groupLayerObjectsById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getObjects();
  const matches = selectedObjectsById(ids);
  if (matches.length < 2) return 0;
  const matchSet = new Set(matches);
  const topIndex = objects.reduce((top, object, index) => (matchSet.has(object) ? index : top), -1);
  const removedBeforeTop = objects.slice(0, topIndex).filter((object) => matchSet.has(object)).length;
  const insertIndex = Math.max(0, topIndex - removedBeforeTop);
  canvas.discardActiveObject();
  for (const object of matches) canvas.remove(object);
  const group = new fabric.Group(matches);
  canvas.add(group);
  canvas.moveObjectTo(group, insertIndex);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function ungroupLayerObjectsById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const groups = selectedObjectsById(ids).filter((object): object is fabric.Group => object.type === 'group');
  if (groups.length === 0) return 0;
  const released: fabric.FabricObject[] = [];
  canvas.discardActiveObject();
  for (const group of groups) {
    const insertIndex = canvas.getObjects().indexOf(group);
    const items = group.removeAll() as fabric.FabricObject[];
    canvas.remove(group);
    items.forEach((item, offset) => {
      canvas.add(item);
      if (insertIndex >= 0) canvas.moveObjectTo(item, insertIndex + offset);
      released.push(item);
    });
  }
  if (released.length === 1) canvas.setActiveObject(released[0]);
  else if (released.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(released, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return groups.length;
}

export function targetLayerObjectsById(ids: string[]): LayerTargetResult {
  const canvas = getCanvas();
  if (!canvas) return { selected: 0, revealed: 0, unlocked: 0 };
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return { selected: 0, revealed: 0, unlocked: 0 };
  let revealed = 0;
  let unlocked = 0;
  for (const object of matches) {
    if (object.visible === false) {
      object.visible = true;
      revealed++;
    }
    if (unlockObject(object)) unlocked++;
  }
  canvas.discardActiveObject();
  canvas.setActiveObject(matches.length === 1 ? matches[0] : new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  if (revealed || unlocked) pushHistory();
  return { selected: matches.length, revealed, unlocked };
}

export function renumberLayerObjectsById(ids: string[], options: RenumberLayerObjectsOptions = {}): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const prefix = options.prefix?.trim() || 'Layer';
  const start = Number.isFinite(options.start) ? Math.max(0, Math.floor(options.start ?? 1)) : 1;
  matches.forEach((object, index) => {
    (object as ObjectWithId & { name?: string | null }).name = `${prefix} ${start + index}`;
  });
  canvas.requestRenderAll();
  pushHistory();
  return matches.length;
}

export function replaceLayerObjectNamesById(ids: string[], options: ReplaceLayerObjectNameOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const needle = options.find;
  if (!needle) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, options.matchCase ? 'g' : 'gi');
  let changed = 0;
  for (const object of matches) {
    const named = object as ObjectWithId & { name?: string | null };
    const current = typeof named.name === 'string' ? named.name : '';
    if (!pattern.test(current)) {
      pattern.lastIndex = 0;
      continue;
    }
    pattern.lastIndex = 0;
    named.name = current.replace(pattern, options.replace) || null;
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function changeLayerObjectNameCaseById(ids: string[], mode: LayerNameCaseMode): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const named = object as ObjectWithId & { name?: string | null };
    if (typeof named.name !== 'string' || named.name.length === 0) continue;
    const next = changeNameCase(named.name, mode);
    if (next === named.name) continue;
    named.name = next;
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function cleanLayerObjectNamesById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const named = object as ObjectWithId & { name?: string | null };
    if (typeof named.name !== 'string') continue;
    const next = named.name.trim().replace(/\s+/g, ' ') || null;
    if (next === named.name) continue;
    named.name = next;
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectOpacityById(ids: string[], options: SetLayerObjectOpacityOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  if (!Number.isFinite(options.opacity)) return 0;
  const opacity = Math.max(0, Math.min(1, options.opacity));
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const current = typeof object.opacity === 'number' ? object.opacity : 1;
    if (Math.abs(current - opacity) < 0.001) continue;
    object.set({ opacity });
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectBlendModeById(ids: string[], options: SetLayerObjectBlendModeOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const current = object.globalCompositeOperation ?? 'source-over';
    if (current === options.blendMode) continue;
    object.globalCompositeOperation = options.blendMode;
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectPaintById(ids: string[], options: SetLayerObjectPaintOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const current = options.target === 'fill' ? object.fill : object.stroke;
    if (current === options.paint) continue;
    object.set({ [options.target]: options.paint });
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectStrokeWidthById(ids: string[], options: SetLayerObjectStrokeWidthOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  if (!Number.isFinite(options.strokeWidth)) return 0;
  const strokeWidth = Math.max(0, options.strokeWidth);
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const current = typeof object.strokeWidth === 'number' ? object.strokeWidth : 0;
    if (Math.abs(current - strokeWidth) < 0.001) continue;
    object.set({ strokeWidth });
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectStrokeStyleById(ids: string[], options: SetLayerObjectStrokeStyleOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const property = options.target === 'cap' ? 'strokeLineCap' : 'strokeLineJoin';
  const fallback = options.target === 'cap' ? 'butt' : 'miter';
  let changed = 0;
  for (const object of matches) {
    const current = object[property] ?? fallback;
    if (current === options.value) continue;
    object.set({ [property]: options.value });
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

function sameDashArray(current: number[] | null | undefined, next: number[]): boolean {
  const existing = Array.isArray(current) ? current : [];
  return existing.length === next.length && existing.every((value, index) => Math.abs(value - next[index]) < 0.001);
}

export function setLayerObjectDashById(ids: string[], options: SetLayerObjectDashOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if (sameDashArray(object.strokeDashArray, options.dash)) continue;
    object.set({ strokeDashArray: [...options.dash] });
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}


export function setLayerObjectShadowById(ids: string[], options: SetLayerObjectShadowOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const color = typeof options.color === 'string' ? options.color.trim() : null;
  const clearShadow = !color || color.toLowerCase() === 'none';
  const blur = options.blur ?? 0;
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  if (!clearShadow && (!Number.isFinite(blur) || !Number.isFinite(offsetX) || !Number.isFinite(offsetY))) return 0;
  const nextShadow = clearShadow ? null : new fabric.Shadow({ color, blur: Math.max(0, blur), offsetX, offsetY });
  const nextSignature = shadowSignature(nextShadow);
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if (shadowSignature(object.shadow) === nextSignature) continue;
    object.shadow = nextShadow ? new fabric.Shadow(nextShadow) : null;
    object.setCoords();
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectOverprintById(ids: string[], options: SetLayerObjectOverprintOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const raw = object as fabric.FabricObject & { fillOverprint?: boolean; overprintFill?: boolean; strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean };
    const updates: Partial<typeof raw> = {};
    if (options.target === 'fill' || options.target === 'both') {
      if (raw.fillOverprint !== options.overprint) updates.fillOverprint = options.overprint;
      if (raw.overprintFill !== options.overprint) updates.overprintFill = options.overprint;
    }
    if (options.target === 'stroke' || options.target === 'both') {
      if (raw.strokeOverprint !== options.overprint) updates.strokeOverprint = options.overprint;
      if (raw.overprintStroke !== options.overprint) updates.overprintStroke = options.overprint;
    }
    const allOverprint = options.target === 'both' && options.overprint;
    if (raw.overprint !== allOverprint) updates.overprint = allOverprint;
    if (Object.keys(updates).length === 0) continue;
    Object.assign(raw, updates);
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectPrintMarkKindById(ids: string[], options: SetLayerObjectPrintMarkKindOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const printMarkKind = typeof options.printMarkKind === 'string' && options.printMarkKind.trim() ? options.printMarkKind.trim().toLowerCase().replace(/[ _]+/g, '-') : null;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const raw = object as fabric.FabricObject & { printMarkKind?: string };
    if ((raw.printMarkKind ?? null) === printMarkKind) continue;
    if (printMarkKind) raw.printMarkKind = printMarkKind;
    else delete raw.printMarkKind;
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectTextStyleById(ids: string[], options: SetLayerObjectTextStyleOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids).filter((object) => LAYER_TEXT_TYPES.has(object.type ?? ''));
  if (matches.length === 0) return 0;
  const value = options.target === 'underline' || options.target === 'linethrough' || options.target === 'overline'
    ? (typeof options.value === 'boolean' ? options.value : normalizeLayerBoolean(String(options.value)))
    : options.target === 'textAlign'
      ? String(options.value).trim().toLowerCase()
      : options.target === 'fontFamily' || options.target === 'fontWeight' || options.target === 'fontStyle'
        ? String(options.value).trim()
        : Number(options.value);
  if (value == null) return 0;
  if (typeof value === 'string' && !value) return 0;
  if (options.target === 'textAlign' && !['left', 'center', 'right', 'justify'].includes(value as string)) return 0;
  if (typeof value === 'number' && (!Number.isFinite(value) || (options.target !== 'charSpacing' && value <= 0))) return 0;
  let changed = 0;
  for (const object of matches) {
    const raw = object as fabric.FabricObject & Record<string, unknown> & { setCoords?: () => void };
    if (raw[options.target] === value) continue;
    object.set({ [options.target]: value });
    raw.setCoords?.();
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectGeometryById(ids: string[], options: SetLayerObjectGeometryOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.value)) return 0;
  if ((options.target === 'width' || options.target === 'height' || options.target === 'scaleX' || options.target === 'scaleY') && options.value <= 0) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const updates: Partial<fabric.FabricObject> = {};
    if (options.target === 'x' && Math.abs((object.left ?? 0) - options.value) >= 0.001) updates.left = options.value;
    if (options.target === 'y' && Math.abs((object.top ?? 0) - options.value) >= 0.001) updates.top = options.value;
    const size = scaledLayerSize(object);
    if (options.target === 'centerX' && size && Math.abs((object.left ?? 0) + size.width / 2 - options.value) >= 0.001) updates.left = options.value - size.width / 2;
    if (options.target === 'centerY' && size && Math.abs((object.top ?? 0) + size.height / 2 - options.value) >= 0.001) updates.top = options.value - size.height / 2;
    if (options.target === 'right' && size && Math.abs((object.left ?? 0) + size.width - options.value) >= 0.001) updates.left = options.value - size.width;
    if (options.target === 'bottom' && size && Math.abs((object.top ?? 0) + size.height - options.value) >= 0.001) updates.top = options.value - size.height;
    if (options.target === 'rotation' && Math.abs((object.angle ?? 0) - options.value) >= 0.001) updates.angle = options.value;
    if (options.target === 'scaleX' && Math.abs((object.scaleX ?? 1) - options.value) >= 0.001) updates.scaleX = options.value;
    if (options.target === 'scaleY' && Math.abs((object.scaleY ?? 1) - options.value) >= 0.001) updates.scaleY = options.value;
    if (options.target === 'skewX' && Math.abs((object.skewX ?? 0) - options.value) >= 0.001) updates.skewX = options.value;
    if (options.target === 'skewY' && Math.abs((object.skewY ?? 0) - options.value) >= 0.001) updates.skewY = options.value;
    if (options.target === 'width') {
      const baseWidth = typeof object.width === 'number' && Number.isFinite(object.width) ? Math.abs(object.width) : 0;
      if (baseWidth <= 0) continue;
      const currentScale = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
      const nextScale = (currentScale < 0 ? -1 : 1) * (options.value / baseWidth);
      if (Math.abs(currentScale - nextScale) >= 0.001) updates.scaleX = nextScale;
    }
    if (options.target === 'height') {
      const baseHeight = typeof object.height === 'number' && Number.isFinite(object.height) ? Math.abs(object.height) : 0;
      if (baseHeight <= 0) continue;
      const currentScale = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
      const nextScale = (currentScale < 0 ? -1 : 1) * (options.value / baseHeight);
      if (Math.abs(currentScale - nextScale) >= 0.001) updates.scaleY = nextScale;
    }
    if (Object.keys(updates).length === 0) continue;
    object.set(updates);
    object.setCoords();
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

function validLayerGeometryPairOptions(options: SetLayerObjectGeometryPairOptions): boolean {
  if (options.values.some((value) => !Number.isFinite(value))) return false;
  if (options.target === 'size' || options.target === 'scale') return options.values.length >= 2 && options.values[0] > 0 && options.values[1] > 0;
  if (options.target === 'bounds') return options.values.length >= 4 && options.values[2] > options.values[0] && options.values[3] > options.values[1];
  return options.values.length >= 2;
}

export function setLayerObjectGeometryPairById(ids: string[], options: SetLayerObjectGeometryPairOptions): number {
  const canvas = getCanvas();
  if (!canvas || !validLayerGeometryPairOptions(options)) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const size = scaledLayerSize(object);
    const updates: Partial<fabric.FabricObject> = {};
    const [first, second, third, fourth] = options.values;
    if (options.target === 'position') {
      if (Math.abs((object.left ?? 0) - first) >= 0.001) updates.left = first;
      if (Math.abs((object.top ?? 0) - second) >= 0.001) updates.top = second;
    }
    if (options.target === 'center' && size) {
      const nextLeft = first - size.width / 2;
      const nextTop = second - size.height / 2;
      if (Math.abs((object.left ?? 0) - nextLeft) >= 0.001) updates.left = nextLeft;
      if (Math.abs((object.top ?? 0) - nextTop) >= 0.001) updates.top = nextTop;
    }
    if (options.target === 'size') {
      const baseWidth = typeof object.width === 'number' && Number.isFinite(object.width) ? Math.abs(object.width) : 0;
      const baseHeight = typeof object.height === 'number' && Number.isFinite(object.height) ? Math.abs(object.height) : 0;
      if (baseWidth <= 0 || baseHeight <= 0) continue;
      const currentScaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
      const currentScaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
      const nextScaleX = (currentScaleX < 0 ? -1 : 1) * (first / baseWidth);
      const nextScaleY = (currentScaleY < 0 ? -1 : 1) * (second / baseHeight);
      if (Math.abs(currentScaleX - nextScaleX) >= 0.001) updates.scaleX = nextScaleX;
      if (Math.abs(currentScaleY - nextScaleY) >= 0.001) updates.scaleY = nextScaleY;
    }
    if (options.target === 'scale') {
      if (Math.abs((object.scaleX ?? 1) - first) >= 0.001) updates.scaleX = first;
      if (Math.abs((object.scaleY ?? 1) - second) >= 0.001) updates.scaleY = second;
    }
    if (options.target === 'skew') {
      if (Math.abs((object.skewX ?? 0) - first) >= 0.001) updates.skewX = first;
      if (Math.abs((object.skewY ?? 0) - second) >= 0.001) updates.skewY = second;
    }
    if (options.target === 'bounds') {
      const baseWidth = typeof object.width === 'number' && Number.isFinite(object.width) ? Math.abs(object.width) : 0;
      const baseHeight = typeof object.height === 'number' && Number.isFinite(object.height) ? Math.abs(object.height) : 0;
      if (baseWidth <= 0 || baseHeight <= 0) continue;
      const currentScaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
      const currentScaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
      const nextScaleX = (currentScaleX < 0 ? -1 : 1) * ((third - first) / baseWidth);
      const nextScaleY = (currentScaleY < 0 ? -1 : 1) * ((fourth - second) / baseHeight);
      if (Math.abs((object.left ?? 0) - first) >= 0.001) updates.left = first;
      if (Math.abs((object.top ?? 0) - second) >= 0.001) updates.top = second;
      if (Math.abs(currentScaleX - nextScaleX) >= 0.001) updates.scaleX = nextScaleX;
      if (Math.abs(currentScaleY - nextScaleY) >= 0.001) updates.scaleY = nextScaleY;
    }
    if (Object.keys(updates).length === 0) continue;
    object.set(updates);
    object.setCoords();
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}


function getLayerSelectionSample(canvas: fabric.Canvas, matches: fabric.FabricObject[], sampleId?: string): fabric.FabricObject | null {
  const explicitSample = sampleId ? matches.find((object) => String((object as ObjectWithId)._id ?? '') === sampleId) : null;
  const active = typeof canvas.getActiveObject === 'function' ? canvas.getActiveObject() : null;
  return explicitSample ?? (active && matches.includes(active) ? active : matches[0]) ?? null;
}

function selectLayerMatches(canvas: fabric.Canvas, matches: fabric.FabricObject[]): number {
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(matches.length === 1 ? matches[0] : new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  return matches.length;
}

function paintSignature(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}


function shadowSignature(value: fabric.FabricObject['shadow']): string {
  if (!value) return '';
  const shadow = value as fabric.Shadow;
  return [
    paintSignature(shadow.color),
    (shadow.blur ?? 0).toFixed(3),
    (shadow.offsetX ?? 0).toFixed(3),
    (shadow.offsetY ?? 0).toFixed(3),
  ].join('|');
}

function matchesLayerSameAppearanceTarget(object: fabric.FabricObject, sample: fabric.FabricObject, target: LayerSameAppearanceTarget): boolean {
  if (target === 'appearance') {
    return objectMatchesGraphicStyle(object, captureGraphicStyleFromObject(sample, 'Layer Sample'));
  }
  if (target === 'fill') return paintSignature(object.fill) === paintSignature(sample.fill);
  if (target === 'stroke') return paintSignature(object.stroke) === paintSignature(sample.stroke);
  if (target === 'opacity') return Math.abs((object.opacity ?? 1) - (sample.opacity ?? 1)) < 0.001;
  if (target === 'blendMode') return (object.globalCompositeOperation ?? 'source-over') === (sample.globalCompositeOperation ?? 'source-over');
  if (target === 'strokeWidth') return Math.abs((object.strokeWidth ?? 0) - (sample.strokeWidth ?? 0)) < 0.001;
  if (target === 'strokeCap') return (object.strokeLineCap ?? 'butt') === (sample.strokeLineCap ?? 'butt');
  if (target === 'strokeJoin') return (object.strokeLineJoin ?? 'miter') === (sample.strokeLineJoin ?? 'miter');
  if (target === 'dash') return sameDashArray(object.strokeDashArray, Array.isArray(sample.strokeDashArray) ? sample.strokeDashArray : []);
  if (target === 'miterLimit') return Math.abs((object.strokeMiterLimit ?? 4) - (sample.strokeMiterLimit ?? 4)) < 0.001;
  if (target === 'strokeUniform') return !!object.strokeUniform === !!sample.strokeUniform;
  return shadowSignature(object.shadow) === shadowSignature(sample.shadow);
}

export function selectMatchingLayerAppearanceById(ids: string[], sampleId?: string): number {
  return selectSameLayerAppearanceById(ids, 'appearance', sampleId);
}

export function selectSameLayerAppearanceById(ids: string[], target: LayerSameAppearanceTarget, sampleId?: string): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const sample = getLayerSelectionSample(canvas, matches, sampleId);
  if (!sample) return 0;
  return selectLayerMatches(canvas, matches.filter((object) => matchesLayerSameAppearanceTarget(object, sample, target)));
}


const LAYER_TEXT_TYPES = new Set(['text', 'i-text', 'textbox']);

function layerObjectTypeSet(object: fabric.FabricObject): Set<string> {
  const type = object.type ?? '';
  return LAYER_TEXT_TYPES.has(type) ? LAYER_TEXT_TYPES : new Set([type]);
}

function isLayerObjectLocked(object: fabric.FabricObject): boolean {
  return !!(object.lockMovementX || object.lockMovementY || object.lockScalingX || object.lockScalingY || object.lockRotation);
}


function layerObjectName(object: fabric.FabricObject): string {
  const value = (object as ObjectWithId & { name?: string | null }).name;
  return typeof value === 'string' ? value.trim() : '';
}

function layerNamePrefix(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  const match = trimmed.match(/^[^\s._-]+/);
  return match?.[0] ?? trimmed;
}

function matchesLayerSameObjectTarget(object: fabric.FabricObject, sample: fabric.FabricObject, target: LayerSameObjectTarget): boolean {
  if (target === 'type') return layerObjectTypeSet(sample).has(object.type ?? '');
  if (target === 'visibility') return (object.visible !== false) === (sample.visible !== false);
  if (target === 'lock') return isLayerObjectLocked(object) === isLayerObjectLocked(sample);
  if (target === 'named') return !!layerObjectName(object) === !!layerObjectName(sample);
  const samplePrefix = layerNamePrefix(layerObjectName(sample));
  return !!samplePrefix && layerNamePrefix(layerObjectName(object)) === samplePrefix;
}


function numericSignature(value: unknown, fallback = 0): string {
  return (typeof value === 'number' && Number.isFinite(value) ? value : fallback).toFixed(3);
}

function scaledLayerSize(object: fabric.FabricObject): { width: number; height: number } | null {
  const width = typeof object.width === 'number' && Number.isFinite(object.width) ? object.width : null;
  const height = typeof object.height === 'number' && Number.isFinite(object.height) ? object.height : null;
  if (!width || !height) return null;
  const scaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
  const scaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
  const actualWidth = Math.abs(width * scaleX);
  const actualHeight = Math.abs(height * scaleY);
  return actualWidth > 0 && actualHeight > 0 ? { width: actualWidth, height: actualHeight } : null;
}

function layerGeometrySignature(object: fabric.FabricObject, target: LayerSameGeometryTarget): string | null {
  if (target === 'rotation') {
    const angle = typeof object.angle === 'number' && Number.isFinite(object.angle) ? object.angle : 0;
    return `angle:${numericSignature(((angle % 360) + 360) % 360)}`;
  }
  if (target === 'scale') {
    const scaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
    const scaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
    return `scaleX:${numericSignature(scaleX)}|scaleY:${numericSignature(scaleY)}`;
  }
  if (target === 'skew') {
    const skewX = typeof object.skewX === 'number' && Number.isFinite(object.skewX) ? object.skewX : 0;
    const skewY = typeof object.skewY === 'number' && Number.isFinite(object.skewY) ? object.skewY : 0;
    return `skewX:${numericSignature(skewX)}|skewY:${numericSignature(skewY)}`;
  }
  const size = scaledLayerSize(object);
  if (!size) return null;
  const left = typeof object.left === 'number' && Number.isFinite(object.left) ? object.left : 0;
  const top = typeof object.top === 'number' && Number.isFinite(object.top) ? object.top : 0;
  const centerX = left + size.width / 2;
  const centerY = top + size.height / 2;
  if (target === 'width') return `width:${numericSignature(size.width)}`;
  if (target === 'height') return `height:${numericSignature(size.height)}`;
  if (target === 'area') return `area:${numericSignature(size.width * size.height)}`;
  if (target === 'aspectRatio') return `aspect:${numericSignature(size.width / size.height)}`;
  if (target === 'x') return `x:${numericSignature(left)}`;
  if (target === 'y') return `y:${numericSignature(top)}`;
  if (target === 'position') return `x:${numericSignature(left)}|y:${numericSignature(top)}`;
  if (target === 'centerX') return `centerX:${numericSignature(centerX)}`;
  if (target === 'centerY') return `centerY:${numericSignature(centerY)}`;
  if (target === 'center') return `centerX:${numericSignature(centerX)}|centerY:${numericSignature(centerY)}`;
  if (target === 'right') return `right:${numericSignature(left + size.width)}`;
  if (target === 'bottom') return `bottom:${numericSignature(top + size.height)}`;
  if (target === 'bounds') return `left:${numericSignature(left)}|top:${numericSignature(top)}|right:${numericSignature(left + size.width)}|bottom:${numericSignature(top + size.height)}`;
  return `width:${numericSignature(size.width)}|height:${numericSignature(size.height)}`;
}


function layerOverprintFlag(object: fabric.FabricObject, keys: string[]): boolean {
  const raw = object as fabric.FabricObject & Record<string, unknown>;
  return keys.some((key) => raw[key] === true);
}

function layerOverprintSignature(object: fabric.FabricObject): string {
  const raw = object as fabric.FabricObject & { overprint?: unknown };
  const fill = layerOverprintFlag(object, ['fillOverprint', 'overprintFill']);
  const stroke = layerOverprintFlag(object, ['strokeOverprint', 'overprintStroke']);
  const both = raw.overprint === true;
  return `fill:${fill || both}|stroke:${stroke || both}`;
}

function layerPrintMarkKind(object: fabric.FabricObject): string {
  const value = (object as fabric.FabricObject & { printMarkKind?: unknown }).printMarkKind;
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function layerProductionSignature(object: fabric.FabricObject, target: LayerSameProductionTarget): string | null {
  if (target === 'overprint') return layerOverprintSignature(object);
  const kind = layerPrintMarkKind(object);
  return kind || null;
}


function layerPatternSignature(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const pattern = value as { kind?: unknown; size?: unknown; color1?: unknown; color2?: unknown };
  const kind = typeof pattern.kind === 'string' && pattern.kind.trim() ? pattern.kind.trim().toLowerCase() : '';
  const color1 = typeof pattern.color1 === 'string' && pattern.color1.trim() ? pattern.color1.trim().toLowerCase() : '';
  const color2 = typeof pattern.color2 === 'string' && pattern.color2.trim() ? pattern.color2.trim().toLowerCase() : '';
  const size = typeof pattern.size === 'number' && Number.isFinite(pattern.size) ? pattern.size.toFixed(3) : '';
  return kind && size && color1 && color2 ? `${kind}|${size}|${color1}|${color2}` : null;
}

function layerGradientSignature(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const gradient = value as { type?: unknown; coords?: Record<string, unknown>; colorStops?: Array<{ offset?: unknown; color?: unknown }> };
  const type = typeof gradient.type === 'string' ? gradient.type.trim().toLowerCase() : '';
  if (type !== 'linear' && type !== 'radial') return null;
  const coords = gradient.coords ?? {};
  const coordPart = ['x1', 'y1', 'x2', 'y2', 'r1', 'r2'].map((key) => numericSignature(coords[key], 0)).join(',');
  const stops = Array.isArray(gradient.colorStops) ? gradient.colorStops : [];
  if (stops.length < 2) return null;
  const stopPart = stops.map((stop) => `${numericSignature(stop.offset, 0)}:${paintSignature(stop.color)}`).join(',');
  return `${type}|${coordPart}|${stopPart}`;
}

function layerComplexAppearanceSignature(object: fabric.FabricObject, target: LayerSameComplexAppearanceTarget): string | null {
  if (target === 'gradientFill') return layerGradientSignature(object.fill);
  if (target === 'pattern') return layerPatternSignature((object as fabric.FabricObject & { patternSpec?: unknown }).patternSpec);
  return object.clipPath ? 'clipPath' : null;
}


function layerNormalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function layerTextAppearanceSignature(object: fabric.FabricObject): string | null {
  if (!LAYER_TEXT_TYPES.has(object.type ?? '')) return null;
  const raw = object as fabric.FabricObject & Record<string, unknown>;
  const fontFamily = layerNormalizedString(raw.fontFamily);
  if (!fontFamily) return null;
  return [
    `family:${fontFamily}`,
    `size:${numericSignature(raw.fontSize)}`,
    `weight:${layerNormalizedString(raw.fontWeight) ?? 'normal'}`,
    `style:${layerNormalizedString(raw.fontStyle) ?? 'normal'}`,
    `align:${layerNormalizedString(raw.textAlign) ?? 'left'}`,
    `underline:${raw.underline === true ? '1' : '0'}`,
    `strike:${raw.linethrough === true ? '1' : '0'}`,
    `overline:${raw.overline === true ? '1' : '0'}`,
    `tracking:${numericSignature(raw.charSpacing)}`,
    `leading:${numericSignature(raw.lineHeight, 1)}`,
  ].join('|');
}

function layerTextSignature(object: fabric.FabricObject, target: LayerSameTextTarget): string | null {
  if (!LAYER_TEXT_TYPES.has(object.type ?? '')) return null;
  const raw = object as fabric.FabricObject & Record<string, unknown>;
  if (target === 'fontFamily') return layerNormalizedString(raw.fontFamily);
  if (target === 'fontSize') return typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize) ? numericSignature(raw.fontSize) : null;
  return layerTextAppearanceSignature(object);
}

export function selectSameLayerTextById(ids: string[], target: LayerSameTextTarget, sampleId?: string): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const sample = getLayerSelectionSample(canvas, matches, sampleId);
  if (!sample) return 0;
  const sampleSignature = layerTextSignature(sample, target);
  if (!sampleSignature) return 0;
  return selectLayerMatches(canvas, matches.filter((object) => layerTextSignature(object, target) === sampleSignature));
}

function filterSignature(filter: unknown): string {
  if (!filter || typeof filter !== 'object') return paintSignature(filter);
  const record = filter as { constructor?: { name?: string }; type?: unknown; toObject?: () => unknown };
  const type = layerNormalizedString(record.type) ?? layerNormalizedString(record.constructor?.name) ?? 'filter';
  const payload = (() => {
    try {
      return typeof record.toObject === 'function' ? record.toObject() : filter;
    } catch {
      return filter;
    }
  })();
  return `${type}:${paintSignature(payload)}`;
}

function imageSourceSignature(object: fabric.FabricObject): string | null {
  if ((object.type ?? '') !== 'image') return null;
  const raw = object as fabric.FabricObject & { _src?: unknown; src?: unknown; getSrc?: () => unknown; getElement?: () => unknown };
  const direct = layerNormalizedString(raw._src) ?? layerNormalizedString(raw.src);
  if (direct) return direct;
  const source = (() => {
    try {
      return typeof raw.getSrc === 'function' ? raw.getSrc() : null;
    } catch {
      return null;
    }
  })();
  const normalizedSource = layerNormalizedString(source);
  if (normalizedSource) return normalizedSource;
  const element = (() => {
    try {
      return typeof raw.getElement === 'function' ? raw.getElement() : null;
    } catch {
      return null;
    }
  })();
  return layerNormalizedString((element as { src?: unknown } | null)?.src);
}

function imageFiltersSignature(object: fabric.FabricObject): string | null {
  if ((object.type ?? '') !== 'image') return null;
  const filters = (object as fabric.FabricObject & { filters?: unknown }).filters;
  if (!Array.isArray(filters) || filters.length === 0) return null;
  return filters.map(filterSignature).sort().join('|');
}

function layerAssetSignature(object: fabric.FabricObject, target: LayerSameAssetTarget): string | null {
  if (target === 'symbol') return layerNormalizedString((object as fabric.FabricObject & { symbolId?: unknown }).symbolId);
  if (target === 'imageSource') return imageSourceSignature(object);
  return imageFiltersSignature(object);
}

export function selectSameLayerAssetById(ids: string[], target: LayerSameAssetTarget, sampleId?: string): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const sample = getLayerSelectionSample(canvas, matches, sampleId);
  if (!sample) return 0;
  const sampleSignature = layerAssetSignature(sample, target);
  if (!sampleSignature) return 0;
  return selectLayerMatches(canvas, matches.filter((object) => layerAssetSignature(object, target) === sampleSignature));
}






export async function expandLayerObjectAppearanceById(ids: string[]): Promise<number> {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  let changed = 0;
  const patternResult = expandPatternFillObjects(canvas, matches);
  changed += patternResult.count;
  created.push(...patternResult.created);
  const shadowResult = await expandDropShadowObjects(canvas, matches);
  changed += shadowResult.count;
  created.push(...shadowResult.created);
  for (const object of matches) if (flattenTransparencyObject(object)) changed++;
  if (!changed) return 0;
  canvas.discardActiveObject();
  if (created.length > 0) canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function flattenLayerObjectTransparencyById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if (!flattenTransparencyObject(object)) continue;
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function detachLayerSymbolInstancesById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const changed = detachSymbolMetadataFromObjects(matches);
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function clearLayerObjectGradientFillById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if (!clearGradientFillFromObject(object)) continue;
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function clearLayerObjectPatternFillById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if (!clearPatternFillFromObject(object as fabric.FabricObject & { patternSpec?: PatternSpec })) continue;
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}











export function rhinestoneLayerObjectsById(ids: string[], options: RhinestoneLayerObjectsOptions): CutPath[] {
  if (!Number.isFinite(options.spacingMm) || !Number.isFinite(options.diameterMm) || options.spacingMm <= 0 || options.diameterMm <= 0) return [];
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return [];
  return rhinestoneFromSelection(matches, options.spacingMm, options.diameterMm);
}

export function grommetLayerObjectsById(ids: string[], options: GrommetLayerObjectsOptions): CutPath[] {
  if (!Number.isFinite(options.insetMm) || !Number.isFinite(options.maxSpacingMm) || !Number.isFinite(options.diameterMm) || options.insetMm < 0 || options.maxSpacingMm <= 0 || options.diameterMm <= 0) return [];
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return [];
  return grommetsFromObjects(matches, options.insetMm, options.maxSpacingMm, options.diameterMm);
}

export async function blendLayerObjectsById(ids: string[], options: BlendLayerObjectsOptions): Promise<number> {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.steps) || options.steps < 1) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length < 2) return 0;
  const created = await blendObjectsOnCanvas(canvas as fabric.Canvas, matches, Math.round(options.steps), options);
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function variableWidthLayerObjectsById(ids: string[], options: VariableWidthLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = applyWidthProfileToObject(canvas as fabric.Canvas, object, options.profile);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export async function multiOutlineLayerObjectsById(ids: string[], options: MultiOutlineLayerObjectsOptions): Promise<number> {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.widthMm) || options.widthMm <= 0 || options.colors.length === 0) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const added = await addOutlineEffectToCanvas(canvas as fabric.Canvas, matches, options.colors, options.widthMm, false);
  if (!added) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return added;
}

export function warpLayerObjectsById(ids: string[], options: WarpLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.bendPct) || options.bendPct === 0) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created = warpObjects(canvas as fabric.Canvas, matches, options.bendPct, options.style);
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function freeDistortLayerObjectsById(ids: string[], options: FreeDistortLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = freeDistortObject(canvas as fabric.Canvas, object, options.offsets);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function roundCornersLayerObjectsById(ids: string[], options: RoundCornersLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.radiusMm) || options.radiusMm <= 0) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = roundCornersObject(canvas as fabric.Canvas, object, options.radiusMm);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function twistLayerObjectsById(ids: string[], options: TwistLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.angleDeg) || options.angleDeg === 0) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = twistObject(canvas as fabric.Canvas, object, options.angleDeg);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function zigzagLayerObjectsById(ids: string[], options: ZigzagLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.sizeMm) || !Number.isFinite(options.ridges) || options.sizeMm <= 0 || options.ridges < 1) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = zigzagObject(canvas as fabric.Canvas, object, options.sizeMm, options.ridges, options.smooth);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function roughenLayerObjectsById(ids: string[], options: RoughenLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.sizeMm) || !Number.isFinite(options.detailMm) || options.sizeMm <= 0) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = roughenObject(canvas as fabric.Canvas, object, options.sizeMm, options.detailMm);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function puckerLayerObjectsById(ids: string[], options: PuckerLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.amount) || options.amount === 0) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = puckerObject(canvas as fabric.Canvas, object, options.amount);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function knifeSplitLayerObjectsById(ids: string[], axis: KnifeAxis): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  let changed = 0;
  for (const object of matches) {
    const pieces = knifeSplitObjectAtCenter(canvas as fabric.Canvas, object, axis);
    if (pieces.length === 0) continue;
    created.push(...pieces);
    changed++;
  }
  if (!changed) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function scissorsSplitLayerObjectsById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  let changed = 0;
  for (const object of matches) {
    const pieces = scissorsSplitObjectAtMidpoint(canvas as fabric.Canvas, object);
    if (pieces.length === 0) continue;
    created.push(...pieces);
    changed++;
  }
  if (!changed) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function splitLayerObjectsIntoGridById(ids: string[], options: SplitLayerObjectsIntoGridOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.rows) || !Number.isFinite(options.cols) || !Number.isFinite(options.gutterMm)) return 0;
  const rows = Math.max(1, Math.round(options.rows));
  const cols = Math.max(1, Math.round(options.cols));
  const gutterMm = Math.max(0, options.gutterMm);
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    created.push(...splitObjectIntoGrid(canvas as fabric.Canvas, object, { rows, cols, gutterMm }));
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function cleanUpLayerObjectsById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const changed = removeCleanupObjects(canvas as fabric.Canvas, matches);
  if (!changed) return 0;
  pushHistory();
  return changed;
}

export function addAnchorsToLayerObjectsById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const changed: fabric.FabricObject[] = [];
  for (const object of matches) {
    if (addAnchorsToObject(object)) changed.push(object);
  }
  if (changed.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(changed.length === 1 ? changed[0] : new fabric.ActiveSelection(changed, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return changed.length;
}

export function makeLayerCompoundPathById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length < 2) return 0;
  const path = makeCompoundPathFromObjects(canvas as fabric.Canvas, matches);
  if (!path) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(path);
  canvas.requestRenderAll();
  pushHistory();
  return 1;
}

export function outlineLayerObjectStrokesById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const fillPath = outlineStrokeObjectToFill(canvas as fabric.Canvas, object);
    if (fillPath) created.push(fillPath);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function offsetLayerObjectsById(ids: string[], options: OffsetLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.offsetMm) || options.offsetMm === 0) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = offsetPathObject(canvas as fabric.Canvas, object, options.offsetMm);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function smoothLayerObjectsById(ids: string[], options: SmoothLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.iterations)) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = smoothPathObject(canvas as fabric.Canvas, object, options.iterations);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function simplifyLayerObjectsById(ids: string[], options: SimplifyLayerObjectsOptions): number {
  const canvas = getCanvas();
  if (!canvas || !Number.isFinite(options.tolerancePx)) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = simplifyPathObject(canvas as fabric.Canvas, object, options.tolerancePx);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}


export function reverseLayerObjectsById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const created: fabric.FabricObject[] = [];
  for (const object of matches) {
    const path = reversePathObject(canvas as fabric.Canvas, object);
    if (path) created.push(path);
  }
  if (created.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

export function releaseLayerCompoundPathsById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const { count, created } = releaseCompoundPathObjects(canvas as fabric.Canvas, matches);
  if (count === 0) return 0;
  canvas.discardActiveObject();
  if (created.length > 0) canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return count;
}

export function expandLayerObjectClippingMasksById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const leaves: fabric.FabricObject[] = [];
  let changed = 0;
  canvas.discardActiveObject();
  for (const object of matches) {
    if (object.clipPath) {
      object.set({ clipPath: undefined } as Partial<fabric.FabricObject>);
      object.setCoords();
      changed++;
    }
    if (object.type === 'group') {
      const group = object as fabric.Group;
      const items = group.removeAll() as fabric.FabricObject[];
      if (items.length === 0) continue;
      canvas.remove(group);
      for (const item of items) {
        item.setCoords();
        canvas.add(item);
        leaves.push(item);
      }
      changed++;
    } else {
      leaves.push(object);
    }
  }
  if (!changed) return 0;
  if (leaves.length > 0) canvas.setActiveObject(leaves.length === 1 ? leaves[0] : new fabric.ActiveSelection(leaves, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function releaseLayerObjectClippingMasksById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if (!object.clipPath) continue;
    object.set({ clipPath: undefined } as Partial<fabric.FabricObject>);
    object.setCoords();
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function clearLayerObjectImageFiltersById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if ((object.type ?? '') !== 'image') continue;
    const image = object as fabric.FabricObject & { filters?: unknown[]; applyFilters?: () => unknown };
    if (!Array.isArray(image.filters) || image.filters.length === 0) continue;
    image.filters = [];
    if (typeof image.applyFilters === 'function') image.applyFilters();
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function selectSameLayerComplexAppearanceById(ids: string[], target: LayerSameComplexAppearanceTarget, sampleId?: string): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const sample = getLayerSelectionSample(canvas, matches, sampleId);
  if (!sample) return 0;
  const sampleSignature = layerComplexAppearanceSignature(sample, target);
  if (!sampleSignature) return 0;
  return selectLayerMatches(canvas, matches.filter((object) => layerComplexAppearanceSignature(object, target) === sampleSignature));
}

export function selectSameLayerProductionById(ids: string[], target: LayerSameProductionTarget, sampleId?: string): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const sample = getLayerSelectionSample(canvas, matches, sampleId);
  if (!sample) return 0;
  const sampleSignature = layerProductionSignature(sample, target);
  if (!sampleSignature) return 0;
  return selectLayerMatches(canvas, matches.filter((object) => layerProductionSignature(object, target) === sampleSignature));
}

export function selectSameLayerGeometryById(ids: string[], target: LayerSameGeometryTarget, sampleId?: string): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const sample = getLayerSelectionSample(canvas, matches, sampleId);
  if (!sample) return 0;
  const sampleSignature = layerGeometrySignature(sample, target);
  if (!sampleSignature) return 0;
  return selectLayerMatches(canvas, matches.filter((object) => layerGeometrySignature(object, target) === sampleSignature));
}

export function selectSameLayerObjectById(ids: string[], target: LayerSameObjectTarget, sampleId?: string): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  const sample = getLayerSelectionSample(canvas, matches, sampleId);
  if (!sample) return 0;
  return selectLayerMatches(canvas, matches.filter((object) => matchesLayerSameObjectTarget(object, sample, target)));
}

export function applyGraphicStyleToLayerObjectsById(ids: string[], style: GraphicStyle): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if (objectMatchesGraphicStyle(object, style)) continue;
    applyGraphicStyleToObject(object, style);
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

function sameShadow(current: fabric.FabricObject['shadow'], next: typeof DEFAULT_CLEARED_APPEARANCE.shadow): boolean {
  if (!current && !next) return true;
  if (!current || !next) return false;
  const shadow = current as fabric.Shadow;
  return shadow.color === next.color
    && Math.abs((shadow.blur ?? 0) - next.blur) < 0.001
    && Math.abs((shadow.offsetX ?? 0) - next.offsetX) < 0.001
    && Math.abs((shadow.offsetY ?? 0) - next.offsetY) < 0.001;
}

function hasClearedAppearance(object: fabric.FabricObject): boolean {
  return object.fill === DEFAULT_CLEARED_APPEARANCE.fill
    && object.stroke === DEFAULT_CLEARED_APPEARANCE.stroke
    && Math.abs((object.strokeWidth ?? 0) - DEFAULT_CLEARED_APPEARANCE.strokeWidth) < 0.001
    && Math.abs((object.opacity ?? 1) - DEFAULT_CLEARED_APPEARANCE.opacity) < 0.001
    && (object.globalCompositeOperation ?? 'source-over') === DEFAULT_CLEARED_APPEARANCE.blendMode
    && sameDashArray(object.strokeDashArray, DEFAULT_CLEARED_APPEARANCE.strokeDashArray)
    && (object.strokeLineCap ?? 'butt') === DEFAULT_CLEARED_APPEARANCE.strokeLineCap
    && (object.strokeLineJoin ?? 'miter') === DEFAULT_CLEARED_APPEARANCE.strokeLineJoin
    && sameShadow(object.shadow, DEFAULT_CLEARED_APPEARANCE.shadow);
}

export function clearLayerObjectAppearanceById(ids: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if (hasClearedAppearance(object)) continue;
    object.set({
      fill: DEFAULT_CLEARED_APPEARANCE.fill,
      stroke: DEFAULT_CLEARED_APPEARANCE.stroke,
      strokeWidth: DEFAULT_CLEARED_APPEARANCE.strokeWidth,
      opacity: DEFAULT_CLEARED_APPEARANCE.opacity,
      strokeDashArray: DEFAULT_CLEARED_APPEARANCE.strokeDashArray.length ? [...DEFAULT_CLEARED_APPEARANCE.strokeDashArray] : null,
      strokeLineCap: DEFAULT_CLEARED_APPEARANCE.strokeLineCap,
      strokeLineJoin: DEFAULT_CLEARED_APPEARANCE.strokeLineJoin,
    });
    object.globalCompositeOperation = DEFAULT_CLEARED_APPEARANCE.blendMode;
    object.shadow = DEFAULT_CLEARED_APPEARANCE.shadow ? new fabric.Shadow(DEFAULT_CLEARED_APPEARANCE.shadow) : null;
    object.setCoords();
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectMiterLimitById(ids: string[], options: SetLayerObjectMiterLimitOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  if (!Number.isFinite(options.miterLimit)) return 0;
  const miterLimit = Math.max(0, options.miterLimit);
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    const current = typeof object.strokeMiterLimit === 'number' ? object.strokeMiterLimit : 4;
    if (Math.abs(current - miterLimit) < 0.001) continue;
    object.set({ strokeMiterLimit: miterLimit });
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}

export function setLayerObjectStrokeUniformById(ids: string[], options: SetLayerObjectStrokeUniformOptions): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const matches = selectedObjectsById(ids);
  if (matches.length === 0) return 0;
  let changed = 0;
  for (const object of matches) {
    if (!!object.strokeUniform === options.strokeUniform) continue;
    object.set({ strokeUniform: options.strokeUniform });
    changed++;
  }
  if (!changed) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return changed;
}
