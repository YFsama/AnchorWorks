/**
 * Plain selection operations — delete / duplicate / nudge.
 *
 * Three small commands on the active selection. Pulled out of canvasEngine.ts
 * (task #20) so the engine file keeps shrinking; behaviour identical.
 *
 * History semantics intentionally preserved:
 *   - `deleteSelection` does NOT call pushHistory — Fabric's `object:removed`
 *     handler wired up inside `initCanvas` pushes for us.
 *   - `duplicateSelection` likewise relies on `object:added` to push.
 *   - `nudgeSelection` DOES call pushHistory directly: `.set({ left, top })`
 *     doesn't fire `object:modified`, so without the explicit push, arrow-key
 *     nudges wouldn't land in the undo stack.
 *
 * Re-exported from canvasEngine.ts for back-compat — CanvasContextMenu,
 * CommandPalette, PropertiesPanel, lib/clipboard, App.tsx skills all keep
 * importing from './canvasEngine' unchanged.
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { useEditor, type UserGuide } from '../store/editor';
import { updateSelection } from './selectionApply';
import { ALL_FONTS } from './fonts';

// Select Same / select-by-attribute family — moved verbatim to ./selection/selectByAttribute.
export type { SelectSameProp } from './selection/selectByAttribute';
export {
  shadowSignature,
  patternSignature,
  gradientSignature,
  overprintSignature,
  fillStrokeSignature,
  fillAppearanceSignature,
  strokeAppearanceSignature,
  textAppearanceSignature,
  objectPositionSignature,
  objectXSignature,
  objectYSignature,
  objectRightSignature,
  objectBottomSignature,
  objectCenterSignature,
  objectCenterXSignature,
  objectCenterYSignature,
  objectSizeSignature,
  objectBoundsSignature,
  objectWidthSignature,
  objectHeightSignature,
  objectAreaSignature,
  objectAspectRatioSignature,
  objectScaleSignature,
  objectSkewSignature,
  objectRotationSignature,
  objectTransformSignature,
  artboardPlacementSignature,
  artboardAnyPlacementSignature,
  appearanceSignature,
  selectSameSignature,
  sameSignature,
  selectSame,
  selectSameActiveArtboard,
} from './selection/selectByAttribute';
// Same-family signatures still used directly by helpers below (hasPatternFill / hasGradientFill).
import { patternSignature, gradientSignature } from './selection/selectByAttribute';
// Appearance apply / prepress fix machinery — moved verbatim to ./selection/appearanceApply.
import {
  processPaintFromSpot,
  processPaintFromLab,
  processPaintFromGrayscale,
  processPaintFromRgb,
  processPaintFromNonCmyk,
  reducedInkPaint,
  transformPrepressPaints,
  transformPrepressPaintsOnActiveArtboard,
  fixPrepressPaints,
  fixPrepressPaintsOnActiveArtboard,
  fixPrepressRisks,
  clearOverprints,
  clearWhiteOverprints,
  clearWhiteOverprintsOnActiveArtboard,
  fixTransparencyAppearance,
  fixDashedStrokes,
  fixThinStrokes,
} from './selection/appearanceApply';

type FabricObject = fabric.FabricObject;

export type MatchableObject = Record<string, unknown>;

export function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

export const TEXT_TYPES = ['i-text', 'text', 'textbox'];
const REGISTERED_FONT_FAMILIES = new Set(ALL_FONTS.flatMap((font) => [font.name, font.family.split(',')[0] ?? font.family].map((family) => normalizeString(family))));
const CSS_PIXELS_PER_INCH = 96;
const LOW_RESOLUTION_IMAGE_PPI = 150;
const HIGH_RESOLUTION_IMAGE_PPI = 450;
export const THIN_STROKE_WIDTH = 0.25;

/** Remove every object in the active selection and clear the selection. */
export function deleteSelection(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  canvas.getActiveObjects().forEach(o => canvas.remove(o));
  canvas.discardActiveObject();
  canvas.requestRenderAll();
}

/** Rename the active object/selection so Layers-panel rows are meaningful. */
export function renameSelection(name: string): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  if (objs.length === 0) return 0;
  const trimmed = name.trim();
  for (const o of objs) {
    (o as fabric.FabricObject & { name?: string | null }).name = trimmed || null;
  }
  canvas.requestRenderAll();
  updateSelection();
  canvas.fire('object:modified', { target: objs[0] });
  return objs.length;
}

export function getSelectionRenameDefault(): string {
  const canvas = getCanvas();
  if (!canvas) return '';
  const objs = canvas.getActiveObjects();
  if (objs.length !== 1) return '';
  const name = (objs[0] as fabric.FabricObject & { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

export function promptRenameSelection(label = 'Object name'): number | null {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  if (objs.length === 0) return 0;
  const name = window.prompt(label, getSelectionRenameDefault());
  if (name == null) return null;
  return renameSelection(name);
}

/** Clone the active selection and offset by +20px so the duplicate is
 *  visible. Async because Fabric's `clone()` returns a Promise (it deeply
 *  serialises the object including image data). */
export function duplicateSelection(): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const active = canvas.getActiveObject();
  if (!active) return;
  active.clone().then((c: FabricObject) => {
    c.set({ left: (c.left ?? 0) + 20, top: (c.top ?? 0) + 20 });
    canvas.add(c);
    canvas.setActiveObject(c);
    canvas.requestRenderAll();
  });
}

/** Translate every selected object by (dx, dy). Used by arrow-key nudges and
 *  the AI `nudge` skill. */
export function nudgeSelection(dx: number, dy: number): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  objs.forEach(o => {
    o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
    o.setCoords();
  });
  if (objs.length) {
    canvas.requestRenderAll();
    pushHistory();
  }
}


/**
 * Lock the active selection — disables move / scale / rotate (Illustrator's
 * Object→Lock). Matches the Layers-panel lock (lockMovementX), so the lock icon
 * there reflects it, and the props serialise with the project. Returns the count.
 */
export function lockSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  for (const o of objs) {
    o.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
  }
  if (objs.length) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return objs.length;
}

/**
 * Lock every unlocked object outside the active selection (Object→Lock→Other).
 * Keeps the current selection active/editable while freezing surrounding art.
 * Returns the count newly locked.
 */
export function lockOthers(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const keep = new Set(canvas.getActiveObjects());
  if (keep.size === 0) return 0;
  let n = 0;
  for (const o of canvas.getObjects()) {
    if (keep.has(o) || (o as { excludeFromExport?: boolean }).excludeFromExport) continue;
    if (o.lockMovementX && o.lockMovementY && o.lockScalingX && o.lockScalingY && o.lockRotation) continue;
    o.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    n++;
  }
  if (n > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return n;
}

function mutateObjectsByActiveArtboard(predicate: (box: { left: number; top: number; right: number; bottom: number }, bounds: { left: number; top: number; right: number; bottom: number }) => boolean, mutator: (object: FabricObject) => boolean): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const bounds = activeArtboardBounds();
  if (!bounds) return 0;
  let n = 0;
  for (const object of canvas.getObjects()) {
    if (!isSelectableArtwork(object)) continue;
    const box = objectBoundingBox(object);
    if (!box || !predicate(box, bounds)) continue;
    if (mutator(object)) n++;
  }
  if (n > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return n;
}

function mutateObjectsOutsideActiveArtboard(mutator: (object: FabricObject) => boolean): number {
  return mutateObjectsByActiveArtboard((box, bounds) => isOutsideBounds(box, bounds), mutator);
}

function mutateObjectsOnActiveArtboard(mutator: (object: FabricObject) => boolean): number {
  return mutateObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), mutator);
}

function lockObject(object: FabricObject): void {
  object.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
}

/** Lock all printable artwork outside the active object's artboard. */
export function lockOtherArtboards(): number {
  return mutateObjectsOutsideActiveArtboard((object) => {
    if (isObjectLocked(object)) return false;
    lockObject(object);
    return true;
  });
}

/** Lock all printable artwork on the active object's artboard. */
export function lockActiveArtboard(): number {
  return mutateObjectsOnActiveArtboard((object) => {
    if (isObjectLocked(object)) return false;
    lockObject(object);
    return true;
  });
}

function isObjectLocked(object: FabricObject): boolean {
  return !!(object.lockMovementX || object.lockMovementY || object.lockScalingX || object.lockScalingY || object.lockRotation);
}

function unlockObject(object: FabricObject): void {
  object.set({ lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false });
}

/** Unlock the active selection without disturbing other locked objects. Returns count. */
export function unlockSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let n = 0;
  for (const o of canvas.getActiveObjects()) {
    if (!isObjectLocked(o)) continue;
    unlockObject(o);
    n++;
  }
  if (n > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return n;
}

/** Unlock every locked object on the active object's artboard. Returns count. */
export function unlockActiveArtboard(): number {
  return mutateObjectsOnActiveArtboard((object) => {
    if (!isObjectLocked(object)) return false;
    unlockObject(object);
    return true;
  });
}

/** Unlock every locked object outside the active object's artboard. Returns count. */
export function unlockOtherArtboards(): number {
  return mutateObjectsOutsideActiveArtboard((object) => {
    if (!isObjectLocked(object)) return false;
    unlockObject(object);
    return true;
  });
}

/** Unlock every locked object on the canvas (Object→Unlock All). Returns count. */
export function unlockAll(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let n = 0;
  for (const o of canvas.getObjects()) {
    if (!isObjectLocked(o)) continue;
    unlockObject(o);
    n++;
  }
  if (n > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return n;
}

/**
 * Hide the active selection (Illustrator Object→Hide). Sets `visible: false`,
 * matching the Layers-panel eye toggle and serialising with the project.
 * Returns the count hidden.
 */
export function hideSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  for (const o of objs) o.set({ visible: false });
  if (objs.length) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    pushHistory();
  }
  return objs.length;
}

/** Reveal only the active selection, preserving other hidden artwork. Returns count. */
export function showSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let n = 0;
  for (const o of canvas.getActiveObjects()) {
    if (o.visible !== false) continue;
    o.set({ visible: true });
    n++;
  }
  if (n > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return n;
}

/**
 * Hide every object NOT in the current selection (Illustrator Object→Hide→Other),
 * to focus on the selected art. Returns the number hidden.
 */
export function hideOthers(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const keep = new Set(canvas.getActiveObjects());
  if (keep.size === 0) return 0;
  let n = 0;
  for (const o of canvas.getObjects()) {
    if (keep.has(o) || (o as { excludeFromExport?: boolean }).excludeFromExport) continue;
    if (o.visible !== false) { o.set({ visible: false }); n++; }
  }
  if (n > 0) { canvas.requestRenderAll(); pushHistory(); }
  return n;
}

/** Hide all printable artwork outside the active object's artboard. */
export function hideOtherArtboards(): number {
  return mutateObjectsOutsideActiveArtboard((object) => {
    if (object.visible === false) return false;
    object.set({ visible: false });
    return true;
  });
}

/** Hide all printable artwork on the active object's artboard. */
export function hideActiveArtboard(): number {
  return mutateObjectsOnActiveArtboard((object) => {
    if (object.visible === false) return false;
    object.set({ visible: false });
    return true;
  });
}

/** Reveal hidden printable artwork on the active object's artboard. */
export function showActiveArtboard(): number {
  return mutateObjectsOnActiveArtboard((object) => {
    if (object.visible !== false) return false;
    object.set({ visible: true });
    return true;
  });
}

/** Reveal hidden printable artwork outside the active object's artboard. */
export function showOtherArtboards(): number {
  return mutateObjectsOutsideActiveArtboard((object) => {
    if (object.visible !== false) return false;
    object.set({ visible: true });
    return true;
  });
}

/** Reveal every hidden object (Object→Show All). Returns the count revealed. */
export function showAll(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let n = 0;
  for (const o of canvas.getObjects()) {
    if (o.visible === false) { o.set({ visible: true }); n++; }
  }
  if (n > 0) {
    canvas.requestRenderAll();
    pushHistory();
  }
  return n;
}

/**
 * Select the inverse — everything selectable EXCEPT the current selection
 * (Illustrator Select→Inverse). Skips overlay / hidden / non-selectable objects.
 * Returns the new selection count.
 */
export function selectInverse(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const active = new Set(canvas.getActiveObjects());
  const others = canvas.getObjects().filter((o) =>
    !active.has(o)
    && !(o as { excludeFromExport?: boolean }).excludeFromExport
    && o.visible !== false
    && o.selectable !== false);
  canvas.discardActiveObject();
  if (others.length === 1) canvas.setActiveObject(others[0]);
  else if (others.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(others, { canvas }));
  canvas.requestRenderAll();
  return others.length;
}

/**
 * Select the next object above / below the current single selection in stacking
 * order (Illustrator Select→Next Object Above / Below). With nothing selected,
 * picks the top ('up') or bottom ('down') object. Returns true if it moved.
 */
export function selectObjectInStack(dir: 'up' | 'down'): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = canvas.getObjects().filter((o) =>
    !(o as { excludeFromExport?: boolean }).excludeFromExport
    && o.visible !== false
    && o.selectable !== false);
  if (objs.length === 0) return false;

  const active = canvas.getActiveObject();
  let idx: number;
  if (!active || active.type === 'activeselection') {
    idx = dir === 'up' ? objs.length - 1 : 0;
  } else {
    const cur = objs.indexOf(active);
    if (cur === -1) { idx = dir === 'up' ? objs.length - 1 : 0; }
    else { idx = dir === 'up' ? cur + 1 : cur - 1; if (idx < 0 || idx >= objs.length) return false; }
  }
  canvas.discardActiveObject();
  canvas.setActiveObject(objs[idx]);
  canvas.requestRenderAll();
  return true;
}

/** Select every selectable object whose type is in `kinds` (Illustrator
 *  Select→Object→…). Returns the number selected. */
export function selectByType(kinds: string[]): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const set = new Set(kinds);
  const matches = canvas.getObjects().filter((o) =>
    set.has(o.type ?? '')
    && !(o as { excludeFromExport?: boolean }).excludeFromExport
    && o.visible !== false
    && o.selectable !== false);
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  if (matches.length === 1) canvas.setActiveObject(matches[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  return matches.length;
}

/** Select all text objects (Illustrator Select→Object→Text Objects). */
export function selectAllText(): number {
  return selectByType(['i-text', 'text', 'textbox']);
}

/** Select all text objects intersecting the active object's artboard. */
export function selectAllTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => TEXT_TYPES.includes(o.type ?? ''));
}

export function selectPointTextObjects(): number {
  return selectByType(['i-text', 'text']);
}

/** Select point text objects intersecting the active object's artboard. */
export function selectPointTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => ['i-text', 'text'].includes(o.type ?? ''));
}

export function selectAreaTextObjects(): number {
  return selectByType(['textbox']);
}

/** Select area text objects intersecting the active object's artboard. */
export function selectAreaTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => o.type === 'textbox');
}

function isOverflowingTextbox(object: fabric.FabricObject): boolean {
  if (object.type !== 'textbox') return false;
  const textbox = object as fabric.Textbox & { overflow?: unknown; textOverflow?: unknown; hiddenText?: unknown; _textLines?: unknown[]; dynamicMinWidth?: unknown; calcTextHeight?: () => number };
  if (textbox.overflow === true || textbox.textOverflow === true || textbox.hiddenText === true) return true;
  const boxHeight = typeof textbox.height === 'number' ? textbox.height : 0;
  if (boxHeight <= 0) return false;
  const textHeight = typeof textbox.calcTextHeight === 'function'
    ? textbox.calcTextHeight()
    : typeof textbox.fontSize === 'number' && Array.isArray(textbox._textLines)
      ? textbox._textLines.length * textbox.fontSize * (typeof textbox.lineHeight === 'number' ? textbox.lineHeight : 1.16)
      : 0;
  return Number.isFinite(textHeight) && textHeight > boxHeight + 0.5;
}

export function selectOverflowingTextObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isOverflowingTextbox(o));
}

/** Select overflowing text objects intersecting the active object's artboard. */
export function selectOverflowingTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isOverflowingTextbox(o));
}

function isEmptyTextObject(object: fabric.FabricObject): boolean {
  if (!TEXT_TYPES.includes(object.type ?? '')) return false;
  const text = (object as fabric.FabricText & { text?: unknown }).text;
  return typeof text === 'string' && text.trim().length === 0;
}

export function selectEmptyTextObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isEmptyTextObject(o));
}

/** Select empty text objects intersecting the active object's artboard. */
export function selectEmptyTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isEmptyTextObject(o));
}

/** Remove blank/whitespace-only text frames left by imported artwork. */
export function fixEmptyTextObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && isEmptyTextObject(o));
}

/** Remove blank/whitespace-only text frames only on the active object's artboard. */
export function fixEmptyTextActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && isEmptyTextObject(o)) : 0;
}

function isTextOnPathObject(object: fabric.FabricObject): boolean {
  return (object as fabric.FabricObject & { __textOnPath?: unknown }).__textOnPath !== undefined;
}

export function selectTextOnPathObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isTextOnPathObject(o));
}

/** Select text-on-path objects intersecting the active object's artboard. */
export function selectTextOnPathActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isTextOnPathObject(o));
}

function textPrimaryFontFamily(object: fabric.FabricObject): string | null {
  const text = object as fabric.FabricText & { fontFamily?: unknown };
  const family = typeof text.fontFamily === 'string' ? text.fontFamily.split(',')[0] : '';
  return normalizeString(family);
}

function isMissingFontTextObject(object: fabric.FabricObject): boolean {
  if (!TEXT_TYPES.includes(object.type ?? '')) return false;
  const text = object as fabric.FabricText & { missingFont?: unknown; fontMissing?: unknown; fontStatus?: unknown };
  if (text.missingFont === true || text.fontMissing === true || normalizeString(text.fontStatus) === 'missing') return true;
  const primaryFamily = textPrimaryFontFamily(object);
  return !!primaryFamily && !REGISTERED_FONT_FAMILIES.has(primaryFamily);
}

export function selectMissingFontTextObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isMissingFontTextObject(o));
}

/** Select missing-font text objects intersecting the active object's artboard. */
export function selectMissingFontTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isMissingFontTextObject(o));
}

function hasCustomTextSpacing(object: fabric.FabricObject): boolean {
  if (!TEXT_TYPES.includes(object.type ?? '')) return false;
  const text = object as fabric.FabricText & { charSpacing?: unknown; lineHeight?: unknown };
  const charSpacing = typeof text.charSpacing === 'number' && Number.isFinite(text.charSpacing) ? text.charSpacing : 0;
  const lineHeight = typeof text.lineHeight === 'number' && Number.isFinite(text.lineHeight) ? text.lineHeight : 1.16;
  return Math.abs(charSpacing) > 0.001 || Math.abs(lineHeight - 1.16) > 0.001;
}

export function selectCustomTextSpacingObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasCustomTextSpacing(o));
}

/** Select custom-spaced text objects intersecting the active object's artboard. */
export function selectCustomTextSpacingActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasCustomTextSpacing(o));
}

function hasTextDecoration(object: fabric.FabricObject): boolean {
  if (!TEXT_TYPES.includes(object.type ?? '')) return false;
  const text = object as fabric.FabricText & { underline?: unknown; linethrough?: unknown; overline?: unknown };
  return text.underline === true || text.linethrough === true || text.overline === true;
}

export function selectDecoratedTextObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasTextDecoration(o));
}

/** Select decorated text objects intersecting the active object's artboard. */
export function selectDecoratedTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasTextDecoration(o));
}

function hasStyledTextAppearance(object: fabric.FabricObject): boolean {
  if (!TEXT_TYPES.includes(object.type ?? '')) return false;
  const text = object as fabric.FabricText & { fontStyle?: unknown; fontWeight?: unknown };
  const fontStyle = normalizeString(text.fontStyle);
  if (fontStyle && fontStyle !== 'normal') return true;
  const fontWeight = text.fontWeight;
  if (typeof fontWeight === 'number') return Number.isFinite(fontWeight) && fontWeight >= 600;
  const normalizedWeight = normalizeString(fontWeight);
  if (!normalizedWeight || normalizedWeight === 'normal' || normalizedWeight === 'regular') return false;
  const numericWeight = Number(normalizedWeight);
  if (Number.isFinite(numericWeight)) return numericWeight >= 600;
  return normalizedWeight !== '400';
}

export function selectStyledTextObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasStyledTextAppearance(o));
}

/** Select styled text objects intersecting the active object's artboard. */
export function selectStyledTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasStyledTextAppearance(o));
}

function hasTransformedTextGeometry(object: fabric.FabricObject): boolean {
  if (!TEXT_TYPES.includes(object.type ?? '')) return false;
  const scaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
  const scaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
  const angle = typeof object.angle === 'number' && Number.isFinite(object.angle) ? object.angle : 0;
  const skewX = typeof object.skewX === 'number' && Number.isFinite(object.skewX) ? object.skewX : 0;
  const skewY = typeof object.skewY === 'number' && Number.isFinite(object.skewY) ? object.skewY : 0;
  return Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001 || Math.abs(angle) > 0.001 || Math.abs(skewX) > 0.001 || Math.abs(skewY) > 0.001;
}

export function selectTransformedTextObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasTransformedTextGeometry(o));
}

/** Select transformed text objects intersecting the active object's artboard. */
export function selectTransformedTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasTransformedTextGeometry(o));
}

function hasMixedInlineTextStyles(object: fabric.FabricObject): boolean {
  if (!TEXT_TYPES.includes(object.type ?? '')) return false;
  const styles = (object as fabric.FabricText & { styles?: unknown }).styles;
  if (!styles || typeof styles !== 'object') return false;
  return Object.values(styles as Record<string, unknown>).some((lineStyles) => {
    if (!lineStyles || typeof lineStyles !== 'object') return false;
    return Object.values(lineStyles as Record<string, unknown>).some((charStyle) => !!charStyle && typeof charStyle === 'object' && Object.keys(charStyle).length > 0);
  });
}

export function selectMixedStyleTextObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasMixedInlineTextStyles(o));
}

/** Select mixed-inline-style text objects intersecting the active object's artboard. */
export function selectMixedStyleTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasMixedInlineTextStyles(o));
}

function hasNonLeftTextAlignment(object: fabric.FabricObject): boolean {
  if (!TEXT_TYPES.includes(object.type ?? '')) return false;
  const alignment = normalizeString((object as fabric.FabricText & { textAlign?: unknown }).textAlign) ?? 'left';
  return alignment !== 'left';
}

export function selectNonLeftAlignedTextObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasNonLeftTextAlignment(o));
}

/** Select non-left-aligned text objects intersecting the active object's artboard. */
export function selectNonLeftAlignedTextActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasNonLeftTextAlignment(o));
}

export function isImageObject(object: fabric.FabricObject): boolean {
  return object.type === 'image';
}

export function selectAllImages(): number {
  return selectByType(['image']);
}

/** Select image objects intersecting the active object's artboard. */
export function selectAllImagesActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isImageObject(o));
}

function hasImageFilters(object: fabric.FabricObject): boolean {
  return isImageObject(object) && Array.isArray((object as fabric.FabricImage).filters) && ((object as fabric.FabricImage).filters?.length ?? 0) > 0;
}

export function selectFilteredImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasImageFilters(o));
}

/** Select filtered image objects intersecting the active object's artboard. */
export function selectFilteredImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasImageFilters(o));
}


function clearImageFilters(object: fabric.FabricObject): boolean {
  if (!hasImageFilters(object)) return false;
  const image = object as fabric.FabricImage & { filters?: unknown[]; applyFilters?: () => void; set?: (props: Record<string, unknown>) => void };
  if (typeof image.set === 'function') image.set({ filters: [] });
  else image.filters = [];
  if (typeof image.applyFilters === 'function') image.applyFilters();
  return true;
}

/** Clear live raster filters from placed images for print/export review. */
export function fixFilteredImageObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && clearImageFilters(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Clear live raster filters only on the active object's artboard. */
export function fixFilteredImageActiveArtboardObjects(): number {
  const canvas = getCanvas();
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!canvas || !inActiveArtboard) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && inActiveArtboard(object) && clearImageFilters(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

function isCroppedImageObject(object: fabric.FabricObject): boolean {
  if (!isImageObject(object)) return false;
  const image = object as fabric.FabricImage & { cropWidth?: unknown; cropHeight?: unknown };
  const cropX = typeof image.cropX === 'number' && Number.isFinite(image.cropX) ? image.cropX : 0;
  const cropY = typeof image.cropY === 'number' && Number.isFinite(image.cropY) ? image.cropY : 0;
  const cropWidth = typeof image.cropWidth === 'number' && Number.isFinite(image.cropWidth) ? image.cropWidth : null;
  const cropHeight = typeof image.cropHeight === 'number' && Number.isFinite(image.cropHeight) ? image.cropHeight : null;
  return Math.abs(cropX) > 0.001 || Math.abs(cropY) > 0.001 || (cropWidth !== null && Math.abs(cropWidth - (image.width ?? cropWidth)) > 0.001) || (cropHeight !== null && Math.abs(cropHeight - (image.height ?? cropHeight)) > 0.001);
}

export function selectCroppedImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isCroppedImageObject(o));
}

/** Select cropped image objects intersecting the active object's artboard. */
export function selectCroppedImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isCroppedImageObject(o));
}


function clearImageCrop(object: fabric.FabricObject): boolean {
  if (!isCroppedImageObject(object)) return false;
  const image = object as fabric.FabricImage & { cropWidth?: unknown; cropHeight?: unknown; set?: (props: Record<string, unknown>) => void };
  const updates = {
    cropX: 0,
    cropY: 0,
    cropWidth: typeof image.width === 'number' && Number.isFinite(image.width) ? image.width : undefined,
    cropHeight: typeof image.height === 'number' && Number.isFinite(image.height) ? image.height : undefined,
  };
  if (typeof image.set === 'function') image.set(updates);
  else Object.assign(image, updates);
  return true;
}

/** Clear image crop offsets/limits so hidden pixels can be reviewed before handoff. */
export function fixCroppedImageObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && clearImageCrop(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Clear image crops only on the active object's artboard. */
export function fixCroppedImageActiveArtboardObjects(): number {
  const canvas = getCanvas();
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!canvas || !inActiveArtboard) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && inActiveArtboard(object) && clearImageCrop(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

export function imageSource(image: fabric.FabricImage): string {
  const sourceImage = image as fabric.FabricImage & { _src?: unknown; src?: unknown; getSrc?: () => string };
  return typeof sourceImage._src === 'string'
    ? sourceImage._src
    : typeof sourceImage.src === 'string'
      ? sourceImage.src
      : typeof sourceImage.getSrc === 'function'
        ? sourceImage.getSrc()
        : '';
}

export function isEmbeddedImageObject(object: fabric.FabricObject): boolean {
  return isImageObject(object) && /^data:image\//i.test(imageSource(object as fabric.FabricImage).trim());
}

export function selectEmbeddedImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isEmbeddedImageObject(o));
}

/** Select embedded image objects intersecting the active object's artboard. */
export function selectEmbeddedImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isEmbeddedImageObject(o));
}

export function isLinkedImageObject(object: fabric.FabricObject): boolean {
  if (!isImageObject(object)) return false;
  const source = imageSource(object as fabric.FabricImage).trim();
  return source.length > 0 && !/^data:image\//i.test(source);
}

function isUnknownSourceImageObject(object: fabric.FabricObject): boolean {
  return isImageObject(object) && imageSource(object as fabric.FabricImage).trim().length === 0;
}

function imageElementDataUrl(image: fabric.FabricImage): string | null {
  const imageWithElement = image as fabric.FabricImage & { _element?: unknown; getElement?: () => unknown; toDataURL?: (options?: Record<string, unknown>) => string };
  const element = typeof imageWithElement.getElement === 'function' ? imageWithElement.getElement() : imageWithElement._element;
  const canvasLike = element as { toDataURL?: (type?: string) => string } | undefined;
  if (typeof canvasLike?.toDataURL === 'function') {
    const dataUrl = canvasLike.toDataURL('image/png');
    if (/^data:image\//i.test(dataUrl)) return dataUrl;
    return null;
  }
  const imageLike = element as CanvasImageSource & { src?: unknown; naturalWidth?: unknown; naturalHeight?: unknown; width?: unknown; height?: unknown } | undefined;
  if (typeof imageLike?.src === 'string' && /^data:image\//i.test(imageLike.src.trim())) return imageLike.src.trim();
  if (typeof document !== 'undefined' && imageLike) {
    const width = typeof imageLike.naturalWidth === 'number' && imageLike.naturalWidth > 0
      ? imageLike.naturalWidth
      : typeof imageLike.width === 'number' && imageLike.width > 0
        ? imageLike.width
        : 0;
    const height = typeof imageLike.naturalHeight === 'number' && imageLike.naturalHeight > 0
      ? imageLike.naturalHeight
      : typeof imageLike.height === 'number' && imageLike.height > 0
        ? imageLike.height
        : 0;
    if (width > 0 && height > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(imageLike, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/png');
        if (/^data:image\//i.test(dataUrl)) return dataUrl;
      } catch {
        // Cross-origin images without CORS cannot be embedded from the canvas.
      }
    }
  }
  if (typeof imageWithElement.toDataURL === 'function') {
    try {
      const dataUrl = imageWithElement.toDataURL({ format: 'png' });
      if (/^data:image\//i.test(dataUrl)) return dataUrl;
    } catch {
      // Keep linked when Fabric cannot serialize the bitmap payload.
    }
  }
  return null;
}

function embedLinkedImageObject(object: fabric.FabricObject): boolean {
  if (!isLinkedImageObject(object) || isMissingLinkedImageObject(object)) return false;
  const image = object as fabric.FabricImage & {
    _src?: unknown;
    src?: unknown;
    missing?: unknown;
    broken?: unknown;
    linkMissing?: unknown;
    anchorworksOriginalLinkSource?: unknown;
    name?: unknown;
    set?: (props: Record<string, unknown>) => void;
  };
  const source = imageSource(image).trim();
  const dataUrl = imageElementDataUrl(image);
  if (!dataUrl) return false;
  const currentName = typeof image.name === 'string' ? image.name : '';
  const nextName = currentName.includes('[Embedded Image]') ? currentName : `${currentName ? `${currentName} ` : ''}[Embedded Image]`;
  const updates = {
    _src: dataUrl,
    src: dataUrl,
    anchorworksOriginalLinkSource: source,
    missing: undefined,
    broken: undefined,
    linkMissing: undefined,
    name: nextName,
  };
  const current = image as unknown as Record<string, unknown>;
  const changed = Object.entries(updates).some(([key, value]) => current[key] !== value);
  if (!changed) return false;
  if (typeof image.set === 'function') image.set(updates);
  else Object.assign(image, updates);
  return true;
}

function restoreEmbeddedImageLinkObject(object: fabric.FabricObject): boolean {
  if (!isEmbeddedImageObject(object)) return false;
  const image = object as fabric.FabricImage & {
    _src?: unknown;
    src?: unknown;
    anchorworksOriginalLinkSource?: unknown;
    name?: unknown;
    set?: (props: Record<string, unknown>) => void;
  };
  const originalSource = typeof image.anchorworksOriginalLinkSource === 'string'
    ? image.anchorworksOriginalLinkSource.trim()
    : '';
  if (!originalSource || /^data:image\//i.test(originalSource)) return false;
  const currentName = typeof image.name === 'string' ? image.name : '';
  const nextName = currentName.replace(/\s*\[Embedded Image\]/g, '').trim();
  const updates = {
    _src: originalSource,
    src: originalSource,
    anchorworksOriginalLinkSource: undefined,
    name: nextName || undefined,
  };
  const current = image as unknown as Record<string, unknown>;
  const changed = Object.entries(updates).some(([key, value]) => current[key] !== value);
  if (!changed) return false;
  if (typeof image.set === 'function') image.set(updates);
  else Object.assign(image, updates);
  return true;
}

export function selectLinkedImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isLinkedImageObject(o));
}

/** Select linked image objects intersecting the active object's artboard. */
export function selectLinkedImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isLinkedImageObject(o));
}

/** Select placed images that have no embedded data URL or linked source metadata. */
export function selectUnknownSourceImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isUnknownSourceImageObject(o));
}

/** Select unknown-source images intersecting the active object's artboard. */
export function selectUnknownSourceImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isUnknownSourceImageObject(o));
}

/** Select loaded linked images that can be embedded into the document. */
export function selectEmbeddableLinkedImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isEmbeddableLinkedImageObject(o));
}

/** Select embeddable linked images intersecting the active object's artboard. */
export function selectEmbeddableLinkedImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isEmbeddableLinkedImageObject(o));
}

/** Select linked images that are loaded as links but cannot currently be embedded. */
export function selectNotEmbeddableLinkedImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isNotEmbeddableLinkedImageObject(o));
}

/** Select non-embeddable linked images intersecting the active object's artboard. */
export function selectNotEmbeddableLinkedImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isNotEmbeddableLinkedImageObject(o));
}

function isImageHandoffRiskObject(object: fabric.FabricObject): boolean {
  return isMissingLinkedImageObject(object) || isNotEmbeddableLinkedImageObject(object) || isUnknownSourceImageObject(object);
}

/** Select placed images that could break package handoff: missing, unavailable, or unknown-source assets. */
export function selectImageHandoffRiskObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isImageHandoffRiskObject(o));
}

/** Select package-handoff image risks intersecting the active object's artboard. */
export function selectImageHandoffRiskActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isImageHandoffRiskObject(o));
}

/** Embed loaded linked images as data URLs while preserving their original link source. */
export function embedLinkedImageObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && embedLinkedImageObject(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Embed loaded linked images only on the active object's artboard. */
export function embedLinkedImageActiveArtboardObjects(): number {
  const canvas = getCanvas();
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!canvas || !inActiveArtboard) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && inActiveArtboard(object) && embedLinkedImageObject(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Restore embedded images back to their preserved original linked sources. */
export function restoreEmbeddedImageLinkObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && restoreEmbeddedImageLinkObject(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Restore embedded images back to links only on the active object's artboard. */
export function restoreEmbeddedImageLinkActiveArtboardObjects(): number {
  const canvas = getCanvas();
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!canvas || !inActiveArtboard) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && inActiveArtboard(object) && restoreEmbeddedImageLinkObject(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Select embedded images that can be restored to preserved original links. */
export function selectRestorableEmbeddedImageLinkObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isRestorableEmbeddedImageObject(o));
}

/** Select restorable embedded images intersecting the active object's artboard. */
export function selectRestorableEmbeddedImageLinkActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isRestorableEmbeddedImageObject(o));
}

function isMissingLinkedImage(image: fabric.FabricImage): boolean {
  const source = imageSource(image).trim();
  if (source.length === 0 || /^data:image\//i.test(source)) return false;
  const linkedImage = image as fabric.FabricImage & { missing?: unknown; broken?: unknown; linkMissing?: unknown; _element?: unknown; getElement?: () => unknown };
  if (linkedImage.missing === true || linkedImage.broken === true || linkedImage.linkMissing === true) return true;
  const element = typeof linkedImage.getElement === 'function' ? linkedImage.getElement() : linkedImage._element;
  if (!element) return true;
  const htmlImage = element as { complete?: boolean; naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  if (htmlImage.complete === false) return true;
  const naturalWidth = typeof htmlImage.naturalWidth === 'number' ? htmlImage.naturalWidth : htmlImage.width;
  const naturalHeight = typeof htmlImage.naturalHeight === 'number' ? htmlImage.naturalHeight : htmlImage.height;
  return (typeof naturalWidth === 'number' && naturalWidth <= 0) || (typeof naturalHeight === 'number' && naturalHeight <= 0);
}

export function isMissingLinkedImageObject(object: fabric.FabricObject): boolean {
  return isImageObject(object) && isMissingLinkedImage(object as fabric.FabricImage);
}

export function selectMissingLinkedImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isMissingLinkedImageObject(o));
}

/** Select missing linked image objects intersecting the active object's artboard. */
export function selectMissingLinkedImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isMissingLinkedImageObject(o));
}


/** Remove missing linked-image placeholders after Links panel review. */
export function fixMissingLinkedImageObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && isMissingLinkedImageObject(o));
}

/** Remove missing linked-image placeholders only on the active object's artboard. */
export function fixMissingLinkedImageActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && isMissingLinkedImageObject(o)) : 0;
}

function hasTransformedImageGeometry(object: fabric.FabricObject): boolean {
  if (object.type !== 'image') return false;
  const scaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
  const scaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
  const angle = typeof object.angle === 'number' && Number.isFinite(object.angle) ? object.angle : 0;
  const skewX = typeof object.skewX === 'number' && Number.isFinite(object.skewX) ? object.skewX : 0;
  const skewY = typeof object.skewY === 'number' && Number.isFinite(object.skewY) ? object.skewY : 0;
  return Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001 || Math.abs(angle) > 0.001 || Math.abs(skewX) > 0.001 || Math.abs(skewY) > 0.001;
}

export function selectTransformedImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasTransformedImageGeometry(o));
}

/** Select transformed image objects intersecting the active object's artboard. */
export function selectTransformedImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasTransformedImageGeometry(o));
}

type ImagePreflightReviewObject = fabric.FabricImage & {
  anchorworksPreflightIssue?: unknown;
  anchorworksEffectivePpi?: unknown;
  anchorworksTransformReview?: unknown;
  anchorworksMissingLinkReview?: unknown;
  anchorworksOriginalReviewStyle?: unknown;
  name?: unknown;
  set?: (props: Record<string, unknown>) => void;
};

function markTransformedImageIssue(object: fabric.FabricObject): boolean {
  if (!hasTransformedImageGeometry(object)) return false;
  const image = object as ImagePreflightReviewObject;
  const scaleX = typeof image.scaleX === 'number' && Number.isFinite(image.scaleX) ? image.scaleX : 1;
  const scaleY = typeof image.scaleY === 'number' && Number.isFinite(image.scaleY) ? image.scaleY : 1;
  const angle = typeof image.angle === 'number' && Number.isFinite(image.angle) ? image.angle : 0;
  const skewX = typeof image.skewX === 'number' && Number.isFinite(image.skewX) ? image.skewX : 0;
  const skewY = typeof image.skewY === 'number' && Number.isFinite(image.skewY) ? image.skewY : 0;
  const currentName = typeof image.name === 'string' ? image.name : '';
  const nextName = currentName.includes('[Transformed Image]') ? currentName : `${currentName ? `${currentName} ` : ''}[Transformed Image]`;
  const current = image as unknown as Record<string, unknown>;
  const transformReview = {
    scaleX: Number(scaleX.toFixed(4)),
    scaleY: Number(scaleY.toFixed(4)),
    angle: Number(angle.toFixed(3)),
    skewX: Number(skewX.toFixed(3)),
    skewY: Number(skewY.toFixed(3)),
  };
  const hasPrimaryIssue = typeof current.anchorworksPreflightIssue === 'string' && current.anchorworksPreflightIssue.length > 0;
  const updates = {
    anchorworksTransformReview: transformReview,
    name: nextName,
    ...(!hasPrimaryIssue ? {
      anchorworksPreflightIssue: 'transformed-image',
      anchorworksOriginalReviewStyle: originalImageReviewStyle(image),
      stroke: '#8b5cf6',
      strokeWidth: Math.max(typeof image.strokeWidth === 'number' && Number.isFinite(image.strokeWidth) ? image.strokeWidth : 0, 2),
      strokeUniform: true,
    } : {}),
  };
  const changed = JSON.stringify(current.anchorworksTransformReview ?? null) !== JSON.stringify(transformReview)
    || current.name !== nextName
    || (!hasPrimaryIssue && (current.anchorworksPreflightIssue !== 'transformed-image'
      || current.stroke !== '#8b5cf6'
      || current.strokeWidth !== updates.strokeWidth
      || current.strokeUniform !== true));
  if (!changed) return false;
  if (typeof image.set === 'function') image.set(updates);
  else Object.assign(image, updates);
  return true;
}

/** Mark transformed images for Links/Preflight review without changing placement. */
export function fixTransformedImageObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && markTransformedImageIssue(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Mark transformed images only on the active object's artboard. */
export function fixTransformedImageActiveArtboardObjects(): number {
  const canvas = getCanvas();
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!canvas || !inActiveArtboard) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && inActiveArtboard(object) && markTransformedImageIssue(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

export function imageNaturalDimensions(image: fabric.FabricImage): { width: number; height: number } | null {
  const metadata = image as fabric.FabricImage & { naturalWidth?: unknown; naturalHeight?: unknown; imageWidth?: unknown; imageHeight?: unknown; originalWidth?: unknown; originalHeight?: unknown; _element?: unknown; getElement?: () => unknown };
  const element = typeof metadata.getElement === 'function' ? metadata.getElement() : metadata._element;
  const htmlImage = element as { naturalWidth?: unknown; naturalHeight?: unknown; width?: unknown; height?: unknown } | undefined;
  const width = [metadata.naturalWidth, metadata.imageWidth, metadata.originalWidth, htmlImage?.naturalWidth, htmlImage?.width].find((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const height = [metadata.naturalHeight, metadata.imageHeight, metadata.originalHeight, htmlImage?.naturalHeight, htmlImage?.height].find((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  return width && height ? { width, height } : null;
}

export function imageEffectivePpi(image: fabric.FabricImage): number | null {
  const dimensions = imageNaturalDimensions(image);
  if (!dimensions) return null;
  const displayWidth = Math.abs((typeof image.width === 'number' && Number.isFinite(image.width) ? image.width : dimensions.width) * (typeof image.scaleX === 'number' && Number.isFinite(image.scaleX) ? image.scaleX : 1));
  const displayHeight = Math.abs((typeof image.height === 'number' && Number.isFinite(image.height) ? image.height : dimensions.height) * (typeof image.scaleY === 'number' && Number.isFinite(image.scaleY) ? image.scaleY : 1));
  if (displayWidth <= 0 || displayHeight <= 0) return null;
  const effectiveHorizontalPpi = dimensions.width / (displayWidth / CSS_PIXELS_PER_INCH);
  const effectiveVerticalPpi = dimensions.height / (displayHeight / CSS_PIXELS_PER_INCH);
  return Math.min(effectiveHorizontalPpi, effectiveVerticalPpi);
}

function hasLowEffectiveImageResolution(image: fabric.FabricImage): boolean {
  const effectivePpi = imageEffectivePpi(image);
  return effectivePpi !== null && effectivePpi < LOW_RESOLUTION_IMAGE_PPI;
}

function hasHighEffectiveImageResolution(image: fabric.FabricImage): boolean {
  const effectivePpi = imageEffectivePpi(image);
  return effectivePpi !== null && effectivePpi > HIGH_RESOLUTION_IMAGE_PPI;
}

export function selectLowResolutionImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isImageObject(o) && hasLowEffectiveImageResolution(o as fabric.FabricImage));
}

/** Select low-resolution image objects intersecting the active object's artboard. */
export function selectLowResolutionImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isImageObject(o) && hasLowEffectiveImageResolution(o as fabric.FabricImage));
}

type ResolutionReviewImage = ImagePreflightReviewObject;

function originalImageReviewStyle(image: ImagePreflightReviewObject): Record<string, unknown> | undefined {
  const current = image as unknown as Record<string, unknown>;
  if (current.anchorworksOriginalReviewStyle && typeof current.anchorworksOriginalReviewStyle === 'object') {
    return current.anchorworksOriginalReviewStyle as Record<string, unknown>;
  }
  return {
    stroke: current.stroke,
    strokeWidth: current.strokeWidth,
    strokeUniform: current.strokeUniform,
  };
}

function markMissingLinkedImageIssue(object: fabric.FabricObject): boolean {
  if (!isMissingLinkedImageObject(object)) return false;
  const image = object as ImagePreflightReviewObject;
  const currentName = typeof image.name === 'string' ? image.name : '';
  const nextName = currentName.includes('[Missing Link]') ? currentName : `${currentName ? `${currentName} ` : ''}[Missing Link]`;
  const source = imageSource(image).trim();
  const review = { source };
  const updates = {
    anchorworksPreflightIssue: 'missing-linked-image',
    anchorworksMissingLinkReview: review,
    anchorworksOriginalReviewStyle: originalImageReviewStyle(image),
    name: nextName,
    stroke: '#dc2626',
    strokeWidth: Math.max(typeof image.strokeWidth === 'number' && Number.isFinite(image.strokeWidth) ? image.strokeWidth : 0, 2),
    strokeUniform: true,
  };
  const current = image as unknown as Record<string, unknown>;
  const changed = Object.entries(updates).some(([key, value]) => {
    const existing = current[key];
    return typeof value === 'object' && value !== null
      ? JSON.stringify(existing ?? null) !== JSON.stringify(value)
      : existing !== value;
  });
  if (!changed) return false;
  if (typeof image.set === 'function') image.set(updates);
  else Object.assign(image, updates);
  return true;
}

function markLowResolutionImageIssue(object: fabric.FabricObject): boolean {
  if (!isImageObject(object)) return false;
  const image = object as ResolutionReviewImage;
  const effectivePpi = imageEffectivePpi(image);
  if (effectivePpi === null || effectivePpi >= LOW_RESOLUTION_IMAGE_PPI) return false;
  const roundedPpi = Math.max(1, Math.round(effectivePpi));
  const currentName = typeof image.name === 'string' ? image.name : '';
  const nextName = currentName.includes('[Low Resolution]') ? currentName : `${currentName ? `${currentName} ` : ''}[Low Resolution]`;
  const updates = {
    anchorworksPreflightIssue: 'low-resolution-image',
    anchorworksEffectivePpi: roundedPpi,
    anchorworksOriginalReviewStyle: originalImageReviewStyle(image),
    name: nextName,
    stroke: '#ef4444',
    strokeWidth: Math.max(typeof image.strokeWidth === 'number' && Number.isFinite(image.strokeWidth) ? image.strokeWidth : 0, 2),
    strokeUniform: true,
  };
  const changed = Object.entries(updates).some(([key, value]) => (image as unknown as Record<string, unknown>)[key] !== value);
  if (!changed) return false;
  if (typeof image.set === 'function') image.set(updates);
  else Object.assign(image, updates);
  return true;
}

/** Mark low-resolution images with visible review metadata for print handoff. */
export function fixLowResolutionImageObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && markLowResolutionImageIssue(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Mark low-resolution images only on the active object's artboard. */
export function fixLowResolutionImageActiveArtboardObjects(): number {
  const canvas = getCanvas();
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!canvas || !inActiveArtboard) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && inActiveArtboard(object) && markLowResolutionImageIssue(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

export function selectHighResolutionImageObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isImageObject(o) && hasHighEffectiveImageResolution(o as fabric.FabricImage));
}

/** Select high-resolution image objects intersecting the active object's artboard. */
export function selectHighResolutionImageActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isImageObject(o) && hasHighEffectiveImageResolution(o as fabric.FabricImage));
}

function markHighResolutionImageIssue(object: fabric.FabricObject): boolean {
  if (!isImageObject(object)) return false;
  const image = object as ResolutionReviewImage;
  const effectivePpi = imageEffectivePpi(image);
  if (effectivePpi === null || effectivePpi <= HIGH_RESOLUTION_IMAGE_PPI) return false;
  const roundedPpi = Math.max(1, Math.round(effectivePpi));
  const currentName = typeof image.name === 'string' ? image.name : '';
  const nextName = currentName.includes('[High Resolution]') ? currentName : `${currentName ? `${currentName} ` : ''}[High Resolution]`;
  const updates = {
    anchorworksPreflightIssue: 'high-resolution-image',
    anchorworksEffectivePpi: roundedPpi,
    anchorworksOriginalReviewStyle: originalImageReviewStyle(image),
    name: nextName,
    stroke: '#f59e0b',
    strokeWidth: Math.max(typeof image.strokeWidth === 'number' && Number.isFinite(image.strokeWidth) ? image.strokeWidth : 0, 2),
    strokeUniform: true,
  };
  const changed = Object.entries(updates).some(([key, value]) => (image as unknown as Record<string, unknown>)[key] !== value);
  if (!changed) return false;
  if (typeof image.set === 'function') image.set(updates);
  else Object.assign(image, updates);
  return true;
}

/** Mark over-sampled images with optimization metadata for package/export review. */
export function fixHighResolutionImageObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && markHighResolutionImageIssue(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Mark over-sampled images only on the active object's artboard. */
export function fixHighResolutionImageActiveArtboardObjects(): number {
  const canvas = getCanvas();
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!canvas || !inActiveArtboard) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && inActiveArtboard(object) && markHighResolutionImageIssue(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

function fixImagePreflightObject(object: fabric.FabricObject): boolean {
  if (!isImageObject(object)) return false;
  const fixedFilters = clearImageFilters(object);
  const fixedCrop = clearImageCrop(object);
  const markedMissingLinked = markMissingLinkedImageIssue(object);
  const markedTransform = markTransformedImageIssue(object);
  const markedLowResolution = markLowResolutionImageIssue(object);
  const markedHighResolution = markHighResolutionImageIssue(object);
  return fixedFilters || fixedCrop || markedMissingLinked || markedTransform || markedLowResolution || markedHighResolution;
}

function hasImagePreflightIssue(object: fabric.FabricObject): boolean {
  if (!isImageObject(object)) return false;
  const image = object as fabric.FabricImage;
  return hasImageFilters(object)
    || isCroppedImageObject(object)
    || isMissingLinkedImageObject(object)
    || hasTransformedImageGeometry(object)
    || hasLowEffectiveImageResolution(image)
    || hasHighEffectiveImageResolution(image);
}

function imageHasPreflightReviewMarker(object: fabric.FabricObject): boolean {
  if (!isImageObject(object)) return false;
  const current = object as unknown as Record<string, unknown>;
  return current.anchorworksPreflightIssue !== undefined
    || current.anchorworksEffectivePpi !== undefined
    || current.anchorworksTransformReview !== undefined
    || current.anchorworksMissingLinkReview !== undefined
    || current.anchorworksOriginalReviewStyle !== undefined;
}

function clearImagePreflightReviewMarker(object: fabric.FabricObject): boolean {
  if (!imageHasPreflightReviewMarker(object)) return false;
  const image = object as ImagePreflightReviewObject;
  const current = image as unknown as Record<string, unknown>;
  const originalStyle = current.anchorworksOriginalReviewStyle && typeof current.anchorworksOriginalReviewStyle === 'object'
    ? current.anchorworksOriginalReviewStyle as Record<string, unknown>
    : undefined;
  const updates: Record<string, unknown> = {
    anchorworksPreflightIssue: undefined,
    anchorworksEffectivePpi: undefined,
    anchorworksTransformReview: undefined,
    anchorworksMissingLinkReview: undefined,
    anchorworksOriginalReviewStyle: undefined,
  };
  if (originalStyle) {
    updates.stroke = originalStyle.stroke;
    updates.strokeWidth = originalStyle.strokeWidth;
    updates.strokeUniform = originalStyle.strokeUniform;
  }
  if (typeof image.set === 'function') image.set(updates);
  else Object.assign(image, updates);
  return true;
}

/** Select images carrying preflight review metadata or review outlines. */
export function selectImagePreflightReviewObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && imageHasPreflightReviewMarker(o));
}

/** Select marked image preflight review objects intersecting the active artboard. */
export function selectImagePreflightReviewActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => imageHasPreflightReviewMarker(o));
}

/** Clear image preflight review markers and restore saved object style. */
export function clearImagePreflightReviewObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && clearImagePreflightReviewMarker(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Clear image preflight review markers only on the active object's artboard. */
export function clearImagePreflightReviewActiveArtboardObjects(): number {
  const canvas = getCanvas();
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!canvas || !inActiveArtboard) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && inActiveArtboard(object) && clearImagePreflightReviewMarker(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

export type ImagePreflightSummary = {
  total: number;
  filtered: number;
  cropped: number;
  transformed: number;
  lowResolution: number;
  highResolution: number;
  missingLinked: number;
  reviewMarked: number;
};

export type ImageLinksSummary = {
  total: number;
  embedded: number;
  linked: number;
  missingLinked: number;
  embeddable: number;
  notEmbeddableLinked: number;
  restorable: number;
  unknownSource: number;
};

function emptyImagePreflightSummary(): ImagePreflightSummary {
  return {
    total: 0,
    filtered: 0,
    cropped: 0,
    transformed: 0,
    lowResolution: 0,
    highResolution: 0,
    missingLinked: 0,
    reviewMarked: 0,
  };
}

export function imageMatchesSummaryScope(object: fabric.FabricObject, inScope?: (object: fabric.FabricObject) => boolean): boolean {
  return isSelectableArtwork(object) && isImageObject(object) && (!inScope || inScope(object));
}

export function emptyImageLinksSummary(): ImageLinksSummary {
  return {
    total: 0,
    embedded: 0,
    linked: 0,
    missingLinked: 0,
    embeddable: 0,
    notEmbeddableLinked: 0,
    restorable: 0,
    unknownSource: 0,
  };
}

export function isRestorableEmbeddedImageObject(object: fabric.FabricObject): boolean {
  if (!isEmbeddedImageObject(object)) return false;
  const image = object as fabric.FabricImage & { anchorworksOriginalLinkSource?: unknown };
  const originalSource = typeof image.anchorworksOriginalLinkSource === 'string' ? image.anchorworksOriginalLinkSource.trim() : '';
  return originalSource.length > 0 && !/^data:image\//i.test(originalSource);
}

export function isEmbeddableLinkedImageObject(object: fabric.FabricObject): boolean {
  return isLinkedImageObject(object) && !isMissingLinkedImageObject(object) && imageElementDataUrl(object as fabric.FabricImage) !== null;
}

export function isNotEmbeddableLinkedImageObject(object: fabric.FabricObject): boolean {
  return isLinkedImageObject(object) && !isMissingLinkedImageObject(object) && imageElementDataUrl(object as fabric.FabricImage) === null;
}

export function collectImageLinksSummary(inScope?: (object: fabric.FabricObject) => boolean): ImageLinksSummary {
  const canvas = getCanvas();
  const summary = emptyImageLinksSummary();
  if (!canvas) return summary;
  for (const object of canvas.getObjects()) {
    if (!imageMatchesSummaryScope(object, inScope)) continue;
    const source = imageSource(object as fabric.FabricImage).trim();
    const embedded = isEmbeddedImageObject(object);
    const linked = isLinkedImageObject(object);
    const missingLinked = isMissingLinkedImageObject(object);
    const restorable = isRestorableEmbeddedImageObject(object);
    const embeddable = isEmbeddableLinkedImageObject(object);
    const notEmbeddableLinked = isNotEmbeddableLinkedImageObject(object);
    summary.total += 1;
    if (embedded) summary.embedded += 1;
    if (linked) summary.linked += 1;
    if (missingLinked) summary.missingLinked += 1;
    if (embeddable) summary.embeddable += 1;
    if (notEmbeddableLinked) summary.notEmbeddableLinked += 1;
    if (restorable) summary.restorable += 1;
    if (!source) summary.unknownSource += 1;
  }
  return summary;
}

/** Summarize placed-image Links panel state for the whole document. */
export function imageLinksSummary(): ImageLinksSummary {
  return collectImageLinksSummary();
}

/** Summarize placed-image Links panel state on the active object's artboard. */
export function imageLinksActiveArtboardSummary(): ImageLinksSummary {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? collectImageLinksSummary(inActiveArtboard) : emptyImageLinksSummary();
}

function collectImagePreflightSummary(inScope?: (object: fabric.FabricObject) => boolean): ImagePreflightSummary {
  const canvas = getCanvas();
  const summary = emptyImagePreflightSummary();
  if (!canvas) return summary;
  for (const object of canvas.getObjects()) {
    if (!imageMatchesSummaryScope(object, inScope)) continue;
    const image = object as fabric.FabricImage;
    const filtered = hasImageFilters(object);
    const cropped = isCroppedImageObject(object);
    const transformed = hasTransformedImageGeometry(object);
    const lowResolution = hasLowEffectiveImageResolution(image);
    const highResolution = hasHighEffectiveImageResolution(image);
    const missingLinked = isMissingLinkedImageObject(object);
    const reviewMarked = imageHasPreflightReviewMarker(object);
    if (filtered) summary.filtered += 1;
    if (cropped) summary.cropped += 1;
    if (transformed) summary.transformed += 1;
    if (lowResolution) summary.lowResolution += 1;
    if (highResolution) summary.highResolution += 1;
    if (missingLinked) summary.missingLinked += 1;
    if (reviewMarked) summary.reviewMarked += 1;
    if (filtered || cropped || transformed || lowResolution || highResolution || missingLinked || reviewMarked) summary.total += 1;
  }
  return summary;
}

/** Summarize Links/Preflight image handoff issues for the whole document. */
export function imagePreflightSummary(): ImagePreflightSummary {
  return collectImagePreflightSummary();
}

/** Summarize Links/Preflight image handoff issues on the active object's artboard. */
export function imagePreflightActiveArtboardSummary(): ImagePreflightSummary {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? collectImagePreflightSummary(inActiveArtboard) : emptyImagePreflightSummary();
}

/** Select all placed images with Links/Preflight handoff issues. */
export function selectAllImagePreflightObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasImagePreflightIssue(o));
}

/** Select image preflight issues intersecting the active object's artboard. */
export function selectAllImagePreflightActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasImagePreflightIssue(o));
}

/** Run the non-destructive image handoff fixes used by Links/Preflight review. */
export function fixAllImagePreflightObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && fixImagePreflightObject(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

/** Run non-destructive image handoff fixes only on the active object's artboard. */
export function fixAllImagePreflightActiveArtboardObjects(): number {
  const canvas = getCanvas();
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!canvas || !inActiveArtboard) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && inActiveArtboard(object) && fixImagePreflightObject(object)) changed += 1;
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

function hasTransformedGeometry(object: fabric.FabricObject): boolean {
  const scaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
  const scaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
  const angle = typeof object.angle === 'number' && Number.isFinite(object.angle) ? object.angle : 0;
  const skewX = typeof object.skewX === 'number' && Number.isFinite(object.skewX) ? object.skewX : 0;
  const skewY = typeof object.skewY === 'number' && Number.isFinite(object.skewY) ? object.skewY : 0;
  return Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001 || Math.abs(angle) > 0.001 || Math.abs(skewX) > 0.001 || Math.abs(skewY) > 0.001;
}

export function selectTransformedObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasTransformedGeometry(o));
}

/** Select transformed artwork intersecting the active object's artboard. */
export function selectTransformedActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasTransformedGeometry(o));
}

export function selectStrayPointObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isStrayPointPathArtwork(o));
}

/** Select stray point paths intersecting the active object's artboard. */
export function selectStrayPointActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isStrayPointPathArtwork(o));
}

/** Remove stray point paths left by imports or cleanup operations. */
export function fixStrayPointObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && isStrayPointPathArtwork(o));
}

/** Remove stray point paths only on the active object's artboard. */
export function fixStrayPointActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && isStrayPointPathArtwork(o)) : 0;
}

export function selectZeroLengthPathObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isZeroLengthPathObject(o));
}

/** Select zero-length paths intersecting the active object's artboard. */
export function selectZeroLengthPathActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isZeroLengthPathObject(o));
}

/** Remove zero-length paths that can break joins, output, and cleanup. */
export function fixZeroLengthPathObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && isZeroLengthPathObject(o));
}

/** Remove zero-length paths only on the active object's artboard. */
export function fixZeroLengthPathActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && isZeroLengthPathObject(o)) : 0;
}

/** Select zero-size objects that bloat imported documents. */
export function selectZeroSizeObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isZeroSizeObject(o));
}

/** Select zero-size objects intersecting the active object's artboard. */
export function selectZeroSizeActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isZeroSizeObject(o));
}

/** Remove zero-size objects left by imported AI/PDF files. */
export function fixZeroSizeObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && isZeroSizeObject(o));
}

/** Remove zero-size objects only on the active object's artboard. */
export function fixZeroSizeActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && isZeroSizeObject(o)) : 0;
}

const PATH_OBJECT_TYPES = ['path', 'polyline'];
const SHAPE_OBJECT_TYPES = ['rect', 'circle', 'ellipse', 'line', 'polygon'];
const GROUP_OBJECT_TYPES = ['group', 'activeselection'];

export function selectAllPaths(): number {
  return selectByType(PATH_OBJECT_TYPES);
}

/** Select path/polyline objects intersecting the active object's artboard. */
export function selectAllPathsActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => PATH_OBJECT_TYPES.includes(o.type ?? ''));
}

export function selectAllShapes(): number {
  return selectByType(SHAPE_OBJECT_TYPES);
}

/** Select shape objects intersecting the active object's artboard. */
export function selectAllShapesActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => SHAPE_OBJECT_TYPES.includes(o.type ?? ''));
}

export function selectAllGroups(): number {
  return selectByType(GROUP_OBJECT_TYPES);
}

/** Select group/active-selection objects intersecting the active object's artboard. */
export function selectAllGroupsActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => GROUP_OBJECT_TYPES.includes(o.type ?? ''));
}

/** Select empty groups or groups containing only cleanup junk. */
export function selectEmptyGroupObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isEmptyGroupObject(o));
}

/** Select empty cleanup groups intersecting the active object's artboard. */
export function selectEmptyGroupActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isEmptyGroupObject(o));
}

/** Remove empty groups or groups containing only cleanup junk. */
export function fixEmptyGroupObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && isEmptyGroupObject(o));
}

/** Remove empty cleanup groups only on the active object's artboard. */
export function fixEmptyGroupActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && isEmptyGroupObject(o)) : 0;
}

/**
 * Select every object sharing the active object's type (Illustrator/SignMaster
 * "Select Same → Object Type"). The three text variants are folded together so
 * picking any text selects all text. Returns the number selected, 0 if nothing
 * is active.
 */
function activeObjectTypeSet(): Set<string> | null {
  const canvas = getCanvas();
  if (!canvas) return null;
  const ref = canvas.getActiveObject();
  if (!ref) return null;
  // An ActiveSelection has no meaningful single type — use its first child.
  const refObj = (ref.type === 'activeselection')
    ? (ref as fabric.ActiveSelection).getObjects()[0]
    : ref;
  const type = refObj?.type;
  if (!type) return null;
  return new Set(TEXT_TYPES.includes(type) ? TEXT_TYPES : [type]);
}

export function selectSameType(): number {
  const types = activeObjectTypeSet();
  if (!types) return 0;
  return selectByType([...types]);
}

/** Select same-type objects intersecting the active object's artboard. */
export function selectSameTypeActiveArtboardObjects(): number {
  const types = activeObjectTypeSet();
  if (!types) return 0;
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => types.has(o.type ?? ''));
}


function isNoPaint(value: unknown): boolean {
  return value == null || value === false || (typeof value === 'string' && ['', 'none', 'transparent'].includes(value.trim().toLowerCase()));
}

function isStrokePainted(object: FabricObject): boolean {
  return !isNoPaint(object.stroke) && ((object.strokeWidth ?? 1) > 0);
}

export function isTruthyOverprintFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on' || normalized === 'overprint';
}

function hasOverprintMetadata(object: FabricObject): boolean {
  const source = object as unknown as Record<string, unknown>;
  const directKeys = ['overprint', 'fillOverprint', 'strokeOverprint', 'overprintFill', 'overprintStroke', '__overprint', '__fillOverprint', '__strokeOverprint'];
  if (directKeys.some((key) => isTruthyOverprintFlag(source[key]))) return true;
  const metadata = source.metadata ?? source.data ?? source.customData;
  if (!metadata || typeof metadata !== 'object') return false;
  const record = metadata as Record<string, unknown>;
  return directKeys.some((key) => isTruthyOverprintFlag(record[key]));
}

function isFillPainted(object: FabricObject): boolean {
  return !isNoPaint(object.fill);
}

function pointsEqual(a: [number, number] | null, b: [number, number] | null): boolean {
  return !!a && !!b && Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001;
}

function isPolylineOpen(object: FabricObject): boolean {
  const points = (object as unknown as { points?: Array<{ x?: unknown; y?: unknown }> }).points;
  if (!Array.isArray(points) || points.length < 2) return false;
  const first = points[0];
  const last = points[points.length - 1];
  const a: [number, number] | null = typeof first.x === 'number' && typeof first.y === 'number' ? [first.x, first.y] : null;
  const b: [number, number] | null = typeof last.x === 'number' && typeof last.y === 'number' ? [last.x, last.y] : null;
  return !pointsEqual(a, b);
}

function isLineOpen(object: FabricObject): boolean {
  const line = object as unknown as { x1?: unknown; y1?: unknown; x2?: unknown; y2?: unknown };
  if (typeof line.x1 !== 'number' || typeof line.y1 !== 'number' || typeof line.x2 !== 'number' || typeof line.y2 !== 'number') return false;
  return !pointsEqual([line.x1, line.y1], [line.x2, line.y2]);
}

function isPathOpen(object: FabricObject): boolean {
  const commands = (object as fabric.Path).path;
  if (!Array.isArray(commands)) return false;
  let subpathStart: [number, number] | null = null;
  let current: [number, number] | null = null;
  let subpathHasDrawn = false;
  let hasOpenSubpath = false;

  const finishSubpath = () => {
    if (subpathHasDrawn && !pointsEqual(subpathStart, current)) hasOpenSubpath = true;
  };

  for (const command of commands as unknown[][]) {
    const type = typeof command[0] === 'string' ? command[0].toUpperCase() : '';
    if (type === 'M') {
      finishSubpath();
      const x = command[1];
      const y = command[2];
      subpathStart = typeof x === 'number' && typeof y === 'number' ? [x, y] : null;
      current = subpathStart;
      subpathHasDrawn = false;
    } else if (type === 'L') {
      const x = command[1];
      const y = command[2];
      if (typeof x === 'number' && typeof y === 'number') {
        current = [x, y];
        subpathHasDrawn = true;
      }
    } else if (type === 'Q') {
      const x = command[3];
      const y = command[4];
      if (typeof x === 'number' && typeof y === 'number') {
        current = [x, y];
        subpathHasDrawn = true;
      }
    } else if (type === 'C') {
      const x = command[5];
      const y = command[6];
      if (typeof x === 'number' && typeof y === 'number') {
        current = [x, y];
        subpathHasDrawn = true;
      }
    } else if (type === 'Z') {
      current = subpathStart;
      subpathHasDrawn = false;
    }
  }
  finishSubpath();
  return hasOpenSubpath;
}

function isOpenPathArtwork(object: FabricObject): boolean {
  if (object.type === 'path') return isPathOpen(object);
  if (object.type === 'polyline') return isPolylineOpen(object);
  if (object.type === 'line') return isLineOpen(object);
  return false;
}

function isCompoundPathArtwork(object: FabricObject): boolean {
  if (object.type !== 'path') return false;
  const commands = (object as fabric.Path).path;
  if (!Array.isArray(commands)) return false;
  return commands.filter((command) => Array.isArray(command) && typeof command[0] === 'string' && command[0].toUpperCase() === 'M').length > 1;
}

function isStrayPointPathArtwork(object: FabricObject): boolean {
  if (object.type !== 'path') return false;
  const commands = (object as fabric.Path).path;
  if (!Array.isArray(commands) || commands.length === 0) return false;
  let moveCount = 0;
  for (const command of commands as unknown[][]) {
    const type = typeof command[0] === 'string' ? command[0].toUpperCase() : '';
    if (type === 'M') {
      moveCount += 1;
      continue;
    }
    if (type === 'Z') continue;
    return false;
  }
  return moveCount > 0;
}

function distanceBetweenPoints(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pathCommandEndPoint(command: unknown[]): [number, number] | null {
  const type = typeof command[0] === 'string' ? command[0].toUpperCase() : '';
  const xIndex = type === 'C' ? 5 : type === 'Q' ? 3 : type === 'M' || type === 'L' ? 1 : -1;
  const yIndex = xIndex >= 0 ? xIndex + 1 : -1;
  const x = command[xIndex];
  const y = command[yIndex];
  return typeof x === 'number' && typeof y === 'number' ? [x, y] : null;
}

function isZeroSizeObject(object: FabricObject): boolean {
  if (object.type === 'line' || object.type === 'path') return false;
  const width = typeof object.width === 'number' && Number.isFinite(object.width) ? object.width : 0;
  const height = typeof object.height === 'number' && Number.isFinite(object.height) ? object.height : 0;
  const scaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? Math.abs(object.scaleX) : 1;
  const scaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? Math.abs(object.scaleY) : 1;
  return width * scaleX < 0.5 && height * scaleY < 0.5;
}

function groupChildren(object: FabricObject): FabricObject[] {
  const children = (object as unknown as { _objects?: unknown })._objects;
  return Array.isArray(children) ? children.filter((child): child is FabricObject => !!child && typeof child === 'object') : [];
}

function isGroupObject(object: FabricObject): boolean {
  return GROUP_OBJECT_TYPES.includes(object.type ?? '');
}

function isEmptyGroupObject(object: FabricObject): boolean {
  if (!isGroupObject(object)) return false;
  const children = groupChildren(object);
  return children.length === 0 || children.every(isCleanupRepairObject);
}

function isZeroLengthPathObject(object: FabricObject): boolean {
  if (object.type === 'line') {
    const line = object as unknown as { x1?: unknown; y1?: unknown; x2?: unknown; y2?: unknown };
    return typeof line.x1 === 'number' && typeof line.y1 === 'number' && typeof line.x2 === 'number' && typeof line.y2 === 'number' && distanceBetweenPoints([line.x1, line.y1], [line.x2, line.y2]) < 0.001;
  }
  if (object.type !== 'path') return false;
  const commands = (object as fabric.Path).path;
  if (!Array.isArray(commands) || commands.length === 0 || isStrayPointPathArtwork(object)) return false;
  let current: [number, number] | null = null;
  let hasDrawCommand = false;
  let hasLength = false;
  for (const command of commands as unknown[][]) {
    const type = typeof command[0] === 'string' ? command[0].toUpperCase() : '';
    if (type === 'M') {
      current = pathCommandEndPoint(command);
    } else if (type === 'L' || type === 'Q' || type === 'C') {
      const next = pathCommandEndPoint(command);
      if (current && next && distanceBetweenPoints(current, next) >= 0.001) hasLength = true;
      if (next) current = next;
      hasDrawCommand = true;
    }
  }
  return hasDrawCommand && !hasLength;
}

function selectMatchingObjects(predicate: (object: FabricObject) => boolean): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getObjects().filter(predicate);
  if (objs.length === 0) return 0;
  canvas.discardActiveObject();
  if (objs.length === 1) canvas.setActiveObject(objs[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
  canvas.requestRenderAll();
  return objs.length;
}

function removeMatchingObjects(predicate: (object: FabricObject) => boolean): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getObjects().filter(predicate);
  if (objs.length === 0) return 0;
  canvas.discardActiveObject();
  for (const object of objs) canvas.remove(object);
  canvas.requestRenderAll();
  updateSelection();
  return objs.length;
}

export function isSelectableArtwork(object: FabricObject): boolean {
  return !(object as { excludeFromExport?: boolean }).excludeFromExport && object.selectable !== false;
}

function hasObjectName(object: FabricObject): boolean {
  const name = (object as { name?: unknown }).name;
  return typeof name === 'string' && name.trim().length > 0;
}

export function artboardBounds(): Array<{ left: number; top: number; right: number; bottom: number }> {
  return useEditor.getState().artboards.map((artboard) => ({
    left: artboard.x,
    top: artboard.y,
    right: artboard.x + artboard.width,
    bottom: artboard.y + artboard.height,
  }));
}

export function firstArtboardBounds(): { left: number; top: number; right: number; bottom: number } | null {
  return artboardBounds()[0] ?? null;
}

export function objectBoundingBox(object: FabricObject): { left: number; top: number; right: number; bottom: number } | null {
  const rect = object.getBoundingRect();
  if (![rect.left, rect.top, rect.width, rect.height].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  return { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
}

export function isOutsideBounds(box: { left: number; top: number; right: number; bottom: number }, bounds: { left: number; top: number; right: number; bottom: number }): boolean {
  return box.right <= bounds.left || box.left >= bounds.right || box.bottom <= bounds.top || box.top >= bounds.bottom;
}

export function isInsideBounds(box: { left: number; top: number; right: number; bottom: number }, bounds: { left: number; top: number; right: number; bottom: number }): boolean {
  return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
}

function artboardBoundsForObject(box: { left: number; top: number; right: number; bottom: number }): { left: number; top: number; right: number; bottom: number } | null {
  const boundsList = artboardBounds();
  return boundsList.find((bounds) => isInsideBounds(box, bounds)) ?? boundsList.find((bounds) => !isOutsideBounds(box, bounds)) ?? null;
}


/** Select every selectable object on the canvas (Illustrator Select→All).
 *  Returns the number selected. */
export function selectAllObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && o.visible !== false);
}

/** Select every visible, selectable object (SignMaster-style quick batch select).
 *  Locked objects remain skipped so accidental edits stay protected. */
export function selectVisibleObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && o.visible !== false && !o.lockMovementX && !o.lockMovementY);
}

/** Select visible, editable artwork intersecting the active object's artboard. */
export function selectVisibleActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => o.visible !== false && !o.lockMovementX && !o.lockMovementY);
}

/** Select every unlocked object, including currently hidden artwork so users can
 *  reveal or inspect protected-vs-editable batches from the menus/palette. */
export function selectUnlockedObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && !o.lockMovementX && !o.lockMovementY);
}

/** Select unlocked artwork intersecting the active object's artboard. */
export function selectUnlockedActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => !o.lockMovementX && !o.lockMovementY);
}

/** Select every locked object so protected artwork can be found, inspected, or
 *  unlocked from complex Illustrator-style documents. */
export function selectLockedObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isObjectLocked(o));
}

/** Select locked artwork intersecting the active object's artboard. */
export function selectLockedActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isObjectLocked(o));
}

/** Select every hidden object so invisible artwork can be inspected or revealed. */
export function selectHiddenObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && o.visible === false);
}

/** Select hidden artwork intersecting the active object's artboard. */
export function selectHiddenActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => o.visible === false);
}


/** Remove hidden artwork from imported documents after audit/reveal review. */
export function fixHiddenObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && o.visible === false);
}

/** Remove hidden artwork only on the active object's artboard. */
export function fixHiddenActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && o.visible === false) : 0;
}

/** Select named objects for layer/object naming audits. */
export function selectNamedObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasObjectName(o));
}

/** Select named artwork intersecting the active object's artboard. */
export function selectNamedActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasObjectName(o));
}

/** Select unnamed objects for layer/object naming audits. */
export function selectUnnamedObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && !hasObjectName(o));
}

/** Select unnamed artwork intersecting the active object's artboard. */
export function selectUnnamedActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => !hasObjectName(o));
}

/** Select every object currently clipped by a clipping mask. */
export function selectClippingMaskedObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && !!o.clipPath);
}

/** Select clipped artwork intersecting the active object's artboard. */
export function selectClippingMaskedActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => !!o.clipPath);
}

/** Select open path artwork before Join/Cleanup/Outline workflows. */
export function selectOpenPathObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isOpenPathArtwork(o));
}

/** Select open path artwork intersecting the active object's artboard. */
export function selectOpenPathActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isOpenPathArtwork(o));
}

/** Select compound paths before Release Compound Path / fill-rule audits. */
export function selectCompoundPathObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isCompoundPathArtwork(o));
}

/** Select compound paths intersecting the active object's artboard. */
export function selectCompoundPathActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isCompoundPathArtwork(o));
}

/** Select objects with no visible fill and no visible stroke. */
export function selectUnpaintedObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && !isFillPainted(o) && !isStrokePainted(o));
}

/** Select unpainted artwork intersecting the active object's artboard. */
export function selectUnpaintedActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => !isFillPainted(o) && !isStrokePainted(o));
}

/** Remove invisible no-fill/no-stroke artwork from imported files. */
export function fixUnpaintedObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && !isFillPainted(o) && !isStrokePainted(o));
}

/** Remove invisible no-fill/no-stroke artwork only on the active object's artboard. */
export function fixUnpaintedActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && !isFillPainted(o) && !isStrokePainted(o)) : 0;
}

function isCleanupRepairObject(object: FabricObject): boolean {
  return isEmptyTextObject(object) || isStrayPointPathArtwork(object) || isZeroLengthPathObject(object) || isZeroSizeObject(object) || isEmptyGroupObject(object) || (!isGroupObject(object) && !isFillPainted(object) && !isStrokePainted(object));
}

/** Remove common imported cleanup junk in one pass. */
export function fixAllCleanupObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && isCleanupRepairObject(o));
}

/** Remove common imported cleanup junk only on the active object's artboard. */
export function fixAllCleanupActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && isCleanupRepairObject(o)) : 0;
}

function isFullyTransparentObject(object: FabricObject): boolean {
  return typeof object.opacity === 'number' && Number.isFinite(object.opacity) && object.opacity <= 0.001;
}

/** Select objects with zero opacity that are invisible but still exported. */
export function selectFullyTransparentObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && isFullyTransparentObject(o));
}

/** Select zero-opacity artwork intersecting the active object's artboard. */
export function selectFullyTransparentActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => isFullyTransparentObject(o));
}

/** Remove zero-opacity exported artwork after audit/review. */
export function fixFullyTransparentObjects(): number {
  return removeMatchingObjects((o) => isSelectableArtwork(o) && isFullyTransparentObject(o));
}

/** Remove zero-opacity exported artwork only on the active object's artboard. */
export function fixFullyTransparentActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? removeMatchingObjects((o) => isSelectableArtwork(o) && inActiveArtboard(o) && isFullyTransparentObject(o)) : 0;
}

export function hasTransparencyAppearance(object: FabricObject): boolean {
  const opacity = typeof object.opacity === 'number' && Number.isFinite(object.opacity) ? object.opacity : 1;
  const blendMode = normalizeString((object as unknown as MatchableObject).globalCompositeOperation) ?? 'source-over';
  return opacity < 1 || (blendMode !== 'source-over' && blendMode !== 'normal');
}

export function hasDashedStroke(object: FabricObject): boolean {
  return Array.isArray(object.strokeDashArray) && object.strokeDashArray.some((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
}

export function hasThinStroke(object: FabricObject): boolean {
  return isStrokePainted(object) && typeof object.strokeWidth === 'number' && Number.isFinite(object.strokeWidth) && object.strokeWidth > 0 && object.strokeWidth < THIN_STROKE_WIDTH;
}

/** Select every object carrying a live drop shadow/glow effect. */
export function selectDropShadowObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && !!o.shadow);
}

/** Select shadowed artwork intersecting the active object's artboard. */
export function selectDropShadowActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => !!o.shadow);
}

/** Select objects with non-default opacity or blend mode. */
export function selectTransparencyObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasTransparencyAppearance(o));
}

/** Select transparent/blended artwork intersecting the active object's artboard. */
export function selectTransparencyActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasTransparencyAppearance(o));
}

/** Normalize opacity and blend mode for print-safe handoff. */
export function fixTransparencyObjects(): number {
  return fixTransparencyAppearance();
}

/** Normalize opacity and blend mode only on the active object's artboard. */
export function fixTransparencyActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? fixTransparencyAppearance(inActiveArtboard) : 0;
}

/** Select objects with dashed stroke patterns. */
export function selectDashedStrokeObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasDashedStroke(o));
}

/** Select dashed stroke artwork intersecting the active object's artboard. */
export function selectDashedStrokeActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasDashedStroke(o));
}

/** Clear dashed stroke patterns for solid-line print/cut handoff. */
export function fixDashedStrokeObjects(): number {
  return fixDashedStrokes();
}

/** Clear dashed stroke patterns only on the active object's artboard. */
export function fixDashedStrokeActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? fixDashedStrokes(inActiveArtboard) : 0;
}

/** Select painted hairline strokes below the print/cut audit threshold. */
export function selectThinStrokeObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasThinStroke(o));
}

/** Select thin stroke artwork intersecting the active object's artboard. */
export function selectThinStrokeActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasThinStroke(o));
}

/** Raise hairline strokes to the print/cut audit threshold. */
export function fixThinStrokeObjects(): number {
  return fixThinStrokes();
}

/** Raise hairline strokes to the print/cut audit threshold only on the active object's artboard. */
export function fixThinStrokeActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? fixThinStrokes(inActiveArtboard) : 0;
}

/** Select objects carrying imported overprint flags for print preflight. */
export function selectOverprintObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasOverprintMetadata(o));
}

/** Select overprint artwork intersecting the active object's artboard. */
export function selectOverprintActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasOverprintMetadata(o));
}

/** Clear all imported overprint flags for print-safe knockout handoff. */
export function fixOverprintObjects(): number {
  return clearOverprints();
}

/** Clear all imported overprint flags only on the active object's artboard. */
export function fixOverprintActiveArtboardObjects(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? clearOverprints(inActiveArtboard) : 0;
}

/** Select white artwork carrying overprint flags, which can disappear on output. */
export function selectWhiteOverprintObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasWhiteOverprint(o));
}

/** Select white-overprint artwork intersecting the active object's artboard. */
export function selectWhiteOverprintActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasWhiteOverprint(o));
}

/** Clear overprint flags only from white fill/stroke artwork. */
export function fixWhiteOverprintObjects(): number {
  return clearWhiteOverprints();
}

/** Clear white-overprint flags only on the active object's artboard. */
export function fixWhiteOverprintActiveArtboardObjects(): number {
  return clearWhiteOverprintsOnActiveArtboard();
}

/** Fix common print handoff risks in one preflight pass. */
export function fixAllPrepressRisks(): number {
  return fixPrepressRisks();
}

/** Fix common print handoff risks only on the active object's artboard. */
export function fixAllPrepressRisksActiveArtboard(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? fixPrepressRisks(inActiveArtboard) : 0;
}

/** Select artwork using spot/separation inks for separations preview audits. */
export function selectSpotColorObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasSpotPaint(o));
}

/** Select spot/separation ink artwork intersecting the active object's artboard. */
export function selectSpotColorActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasSpotPaint(o));
}

/** Convert spot/separation inks to process CMYK for CMYK-only print output. */
export function fixSpotColorObjects(): number {
  return transformPrepressPaints((value) => processPaintFromSpot(value));
}

/** Convert spot/separation inks to process CMYK only on the active object's artboard. */
export function fixSpotColorActiveArtboardObjects(): number {
  return transformPrepressPaintsOnActiveArtboard((value) => processPaintFromSpot(value));
}

/** Select artwork using RGB/screen colors before CMYK print handoff. */
export function selectRgbColorObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasRgbPaint(o));
}

/** Select RGB/screen-color artwork intersecting the active object's artboard. */
export function selectRgbColorActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasRgbPaint(o));
}

/** Convert RGB/screen colors to process CMYK for print handoff. */
export function fixRgbColorObjects(): number {
  return transformPrepressPaints((value) => processPaintFromRgb(value));
}

/** Convert RGB/screen colors to process CMYK only on the active object's artboard. */
export function fixRgbColorActiveArtboardObjects(): number {
  return transformPrepressPaintsOnActiveArtboard((value) => processPaintFromRgb(value));
}

/** Select artwork using DeviceGray/grayscale paints before CMYK handoff. */
export function selectGrayscaleColorObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasGrayscalePaint(o));
}

/** Select grayscale artwork intersecting the active object's artboard. */
export function selectGrayscaleColorActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasGrayscalePaint(o));
}

/** Convert DeviceGray/grayscale paints to CMYK 100K equivalents. */
export function fixGrayscaleColorObjects(): number {
  return transformPrepressPaints((value) => processPaintFromGrayscale(value));
}

/** Convert DeviceGray/grayscale paints to CMYK 100K equivalents only on the active object's artboard. */
export function fixGrayscaleColorActiveArtboardObjects(): number {
  return transformPrepressPaintsOnActiveArtboard((value) => processPaintFromGrayscale(value));
}

/** Select artwork using Lab/CIELAB paints before CMYK handoff. */
export function selectLabColorObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasLabPaint(o));
}

/** Select Lab/CIELAB artwork intersecting the active object's artboard. */
export function selectLabColorActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasLabPaint(o));
}

/** Convert Lab/CIELAB paints to process CMYK. */
export function fixLabColorObjects(): number {
  return transformPrepressPaints((value) => processPaintFromLab(value));
}

/** Convert Lab/CIELAB paints to process CMYK only on the active object's artboard. */
export function fixLabColorActiveArtboardObjects(): number {
  return transformPrepressPaintsOnActiveArtboard((value) => processPaintFromLab(value));
}

/** Select artwork using any non-CMYK print-risk color space. */
export function selectNonCmykColorObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasNonCmykPaint(o));
}

/** Select non-CMYK color artwork intersecting the active object's artboard. */
export function selectNonCmykColorActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasNonCmykPaint(o));
}

/** Convert spot, Lab, grayscale, and RGB paints to process CMYK in one preflight pass. */
export function fixNonCmykColorObjects(): number {
  return transformPrepressPaints((value) => processPaintFromNonCmyk(value));
}

/** Convert non-CMYK paints to process CMYK only on the active object's artboard. */
export function fixNonCmykColorActiveArtboardObjects(): number {
  return transformPrepressPaintsOnActiveArtboard((value) => processPaintFromNonCmyk(value));
}

function cmykChannel(value: unknown, keys: string[]): number | null {
  for (const key of keys) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    return raw <= 1 ? raw * 100 : raw;
  }
  return null;
}

export function cmykPaintChannels(value: unknown): { c: number; m: number; y: number; k: number } | null {
  if (!value || typeof value !== 'object') return null;
  const c = cmykChannel(value, ['c', 'cyan']);
  const m = cmykChannel(value, ['m', 'magenta']);
  const y = cmykChannel(value, ['y', 'yellow']);
  const k = cmykChannel(value, ['k', 'black', 'key']);
  return c == null || m == null || y == null || k == null ? null : { c, m, y, k };
}

function labChannel(value: unknown, keys: string[], min: number, max: number): number | null {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    return Math.max(min, Math.min(max, raw));
  }
  return null;
}

export function labPaintChannels(value: unknown): { l: number; a: number; b: number } | null {
  if (!value || typeof value !== 'object' || cmykPaintChannels(value) || rgbPaintChannels(value)) return null;
  const record = value as Record<string, unknown>;
  const mode = normalizeString(record.mode) ?? normalizeString(record.type) ?? normalizeString(record.colorType) ?? normalizeString(record.kind);
  const l = labChannel(value, ['l', 'lightness'], 0, 100);
  const a = labChannel(value, ['a', 'greenRed'], -128, 127);
  const b = labChannel(value, ['b', 'blueYellow'], -128, 127);
  return (mode === 'lab' || mode === 'cielab' || mode === 'device-lab' || mode === 'devicelab') && l != null && a != null && b != null ? { l, a, b } : null;
}

function grayChannel(value: unknown, keys: string[]): number | null {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    return Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw));
  }
  return null;
}

export function grayscalePaintValue(value: unknown): number | null {
  if (!value || typeof value !== 'object' || cmykPaintChannels(value) || rgbPaintChannels(value)) return null;
  const record = value as Record<string, unknown>;
  const mode = normalizeString(record.mode) ?? normalizeString(record.type) ?? normalizeString(record.colorType) ?? normalizeString(record.kind);
  const gray = grayChannel(value, ['gray', 'grey', 'g', 'k', 'black', 'shade', 'tint', 'value']);
  if (gray == null) return mode === 'gray' || mode === 'grey' || mode === 'grayscale' || mode === 'devicegray' ? 0 : null;
  return mode === 'gray' || mode === 'grey' || mode === 'grayscale' || mode === 'devicegray' || 'gray' in record || 'grey' in record ? gray : null;
}

function rgbChannel(value: unknown, keys: string[]): number | null {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    return Math.max(0, Math.min(255, raw <= 1 ? raw * 255 : raw));
  }
  return null;
}

export function rgbPaintChannels(value: unknown): { r: number; g: number; b: number } | null {
  if (!value || typeof value !== 'object') return null;
  const r = rgbChannel(value, ['r', 'red']);
  const g = rgbChannel(value, ['g', 'green']);
  const b = rgbChannel(value, ['b', 'blue']);
  return r == null || g == null || b == null ? null : { r, g, b };
}

export function parseRgbString(value: string): { r: number; g: number; b: number } | null {
  const normalized = value.trim().toLowerCase();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(normalized);
  if (shortHex) {
    const [, hex] = shortHex;
    return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16) };
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (hex) {
    const [, raw] = hex;
    return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16) };
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(normalized);
  if (rgb) {
    const channels = rgb[1].split(',').slice(0, 3).map((part) => Number(part.trim().replace('%', '')));
    if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) {
      const percent = rgb[1].includes('%');
      const [r, g, b] = channels.map((channel) => Math.max(0, Math.min(255, percent ? channel * 2.55 : channel)));
      return { r, g, b };
    }
  }
  const named: Record<string, { r: number; g: number; b: number }> = {
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    cyan: { r: 0, g: 255, b: 255 },
    magenta: { r: 255, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 },
  };
  return named[normalized] ?? null;
}

export function paintName(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'spotName', 'swatchName', 'colorName', 'ink']) {
    const raw = record[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim().toLowerCase();
  }
  return '';
}

export function isSpotPaint(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.spot === true || record.isSpot === true || record.spotColor === true || record.separation === true || record.isSeparation === true) return true;
  const mode = normalizeString(record.mode) ?? normalizeString(record.type) ?? normalizeString(record.colorType) ?? normalizeString(record.kind);
  if (mode === 'spot' || mode === 'separation' || mode === 'pantone') return true;
  const name = paintName(value);
  return name.startsWith('pantone ') || name.startsWith('pms ') || name.startsWith('spot ') || name.includes(' spot');
}

function isLabPaint(value: unknown): boolean {
  return labPaintChannels(value) !== null;
}

export function isGrayscalePaint(value: unknown): boolean {
  const gray = grayscalePaintValue(value);
  return gray !== null && gray > 0.001 && gray < 99.999;
}

function isDefaultRgbEndpoint(channels: { r: number; g: number; b: number }): boolean {
  return (channels.r <= 0.001 && channels.g <= 0.001 && channels.b <= 0.001) || (channels.r >= 254.999 && channels.g >= 254.999 && channels.b >= 254.999);
}

export function isRgbPaint(value: unknown): boolean {
  if (typeof value === 'string') {
    const channels = parseRgbString(value);
    return channels !== null && !isDefaultRgbEndpoint(channels);
  }
  if (!value || typeof value !== 'object' || cmykPaintChannels(value)) return false;
  const record = value as Record<string, unknown>;
  const mode = normalizeString(record.mode) ?? normalizeString(record.type) ?? normalizeString(record.colorType) ?? normalizeString(record.kind);
  const channels = rgbPaintChannels(value);
  if (channels) return !isDefaultRgbEndpoint(channels);
  return mode === 'rgb' || mode === 'srgb' || mode === 'screen';
}

export function isWhitePaint(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
    return normalized === '#fff' || normalized === '#ffffff' || normalized === 'white' || normalized === 'rgb(255,255,255)' || normalized === 'rgba(255,255,255,1)';
  }
  const channels = cmykPaintChannels(value);
  if (channels && channels.c <= 0.001 && channels.m <= 0.001 && channels.y <= 0.001 && channels.k <= 0.001) return true;
  const name = paintName(value);
  return name === 'white' || name === 'paper' || name === '[paper]';
}

export function isRegistrationPaint(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'registration' || normalized === '[registration]' || normalized === 'all' || normalized === '[all]';
  }
  const channels = cmykPaintChannels(value);
  if (channels && channels.c >= 99 && channels.m >= 99 && channels.y >= 99 && channels.k >= 99) return true;
  const name = paintName(value);
  return name === 'registration' || name === '[registration]' || name === 'all' || name === '[all]';
}

export function isRichBlackPaint(value: unknown): boolean {
  if (isRegistrationPaint(value)) return false;
  const channels = cmykPaintChannels(value);
  if (!channels) return false;
  return channels.k >= 90 && channels.c + channels.m + channels.y >= 30;
}

export function isOverInkLimitPaint(value: unknown, limit = 300): boolean {
  if (isRegistrationPaint(value)) return false;
  const channels = cmykPaintChannels(value);
  if (!channels) return false;
  return channels.c + channels.m + channels.y + channels.k > limit;
}

function hasPaintMatching(object: FabricObject, predicate: (value: unknown) => boolean): boolean {
  const record = object as unknown as { fill?: unknown; stroke?: unknown; _objects?: FabricObject[] };
  if (predicate(record.fill) || predicate(record.stroke)) return true;
  return (record._objects ?? []).some((child) => hasPaintMatching(child, predicate));
}

function hasRichBlackPaint(object: FabricObject): boolean {
  return hasPaintMatching(object, isRichBlackPaint);
}

function hasOverInkLimitPaint(object: FabricObject): boolean {
  return hasPaintMatching(object, isOverInkLimitPaint);
}

function hasSpotPaint(object: FabricObject): boolean {
  return hasPaintMatching(object, isSpotPaint);
}

function hasRgbPaint(object: FabricObject): boolean {
  return hasPaintMatching(object, isRgbPaint);
}

function hasGrayscalePaint(object: FabricObject): boolean {
  return hasPaintMatching(object, isGrayscalePaint);
}

function hasLabPaint(object: FabricObject): boolean {
  return hasPaintMatching(object, isLabPaint);
}

function hasNonCmykPaint(object: FabricObject): boolean {
  return hasPaintMatching(object, (value) => isSpotPaint(value) || isLabPaint(value) || isGrayscalePaint(value) || isRgbPaint(value));
}

function hasWhiteOverprint(object: FabricObject): boolean {
  const record = object as unknown as { fill?: unknown; stroke?: unknown; fillOverprint?: unknown; overprintFill?: unknown; strokeOverprint?: unknown; overprintStroke?: unknown; overprint?: unknown; _objects?: FabricObject[] };
  const allOverprint = record.overprint === true;
  if ((record.fillOverprint === true || record.overprintFill === true || allOverprint) && isWhitePaint(record.fill)) return true;
  if ((record.strokeOverprint === true || record.overprintStroke === true || allOverprint) && isWhitePaint(record.stroke)) return true;
  return (record._objects ?? []).some(hasWhiteOverprint);
}

export function activeArtboardObjectPredicate(): ((object: FabricObject) => boolean) | null {
  const bounds = activeArtboardBounds();
  if (!bounds) return null;
  return (object) => {
    const box = objectBoundingBox(object);
    return box !== null && !isOutsideBounds(box, bounds);
  };
}

function hasRegistrationPaint(object: FabricObject): boolean {
  return hasPaintMatching(object, isRegistrationPaint);
}

export function hasPrintMarkKind(object: FabricObject): boolean {
  return typeof (object as unknown as { printMarkKind?: unknown }).printMarkKind === 'string';
}

/** Select editable crop/registration/bleed/page-info marks generated for print handoff. */
export function selectPrintMarkObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasPrintMarkKind(o));
}

/** Select print handoff marks intersecting the active object's artboard. */
export function selectPrintMarkActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasPrintMarkKind(o));
}

/** Select artwork using rich black CMYK mixes that may over-ink in print. */
export function selectRichBlackObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasRichBlackPaint(o));
}

/** Convert rich black CMYK mixes to 100K process black for safer print output. */
export function fixRichBlackObjects(): number {
  return fixPrepressPaints(isRichBlackPaint);
}

/** Convert rich black CMYK mixes only on the active object's artboard. */
export function fixRichBlackActiveArtboardObjects(): number {
  return fixPrepressPaintsOnActiveArtboard(isRichBlackPaint);
}

/** Select rich black artwork intersecting the active object's artboard. */
export function selectRichBlackActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasRichBlackPaint(o));
}

/** Select artwork above the safe total ink coverage threshold. */
export function selectOverInkLimitObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasOverInkLimitPaint(o));
}

/** Select over-ink artwork intersecting the active object's artboard. */
export function selectOverInkLimitActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasOverInkLimitPaint(o));
}

/** Reduce CMY channels proportionally so CMYK total ink coverage is at or below 300%. */
export function fixOverInkLimitObjects(): number {
  return transformPrepressPaints((value) => reducedInkPaint(value));
}

/** Reduce over-ink CMYK paints only on the active object's artboard. */
export function fixOverInkLimitActiveArtboardObjects(): number {
  return transformPrepressPaintsOnActiveArtboard((value) => reducedInkPaint(value));
}

/** Select artwork using registration/all-plates color outside generated marks. */
export function selectRegistrationColorObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasRegistrationPaint(o));
}

/** Convert registration/all-plates artwork to 100K process black outside generated marks. */
export function fixRegistrationColorObjects(): number {
  return fixPrepressPaints(isRegistrationPaint, (object) => !hasPrintMarkKind(object));
}

/** Convert registration/all-plates artwork only on the active object's artboard. */
export function fixRegistrationColorActiveArtboardObjects(): number {
  return fixPrepressPaintsOnActiveArtboard(isRegistrationPaint, (object) => !hasPrintMarkKind(object));
}

/** Select registration-color artwork intersecting the active object's artboard. */
export function selectRegistrationColorActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasRegistrationPaint(o));
}

export function activeArtboardBounds(): { left: number; top: number; right: number; bottom: number } | null {
  const canvas = getCanvas();
  if (!canvas) return null;
  const ref = canvas.getActiveObject();
  if (!ref || !isSelectableArtwork(ref)) return null;
  const refBox = objectBoundingBox(ref);
  return refBox ? artboardBoundsForObject(refBox) : null;
}

function selectObjectsByActiveArtboard(predicate: (box: { left: number; top: number; right: number; bottom: number }, bounds: { left: number; top: number; right: number; bottom: number }) => boolean, objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const bounds = activeArtboardBounds();
  if (!bounds) return 0;
  return selectMatchingObjects((o) => {
    if (!isSelectableArtwork(o) || !objectPredicate(o)) return false;
    const box = objectBoundingBox(o);
    return box !== null && predicate(box, bounds);
  });
}

/** Select all selectable artwork intersecting the active object's artboard. */
export function selectActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds));
}

/** Select artwork intersecting the same artboard as the active object. */
export function selectSameArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds));
}

/** Select artwork fully contained by the active object's artboard. */
export function selectInsideActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => isInsideBounds(box, bounds));
}

/** Select artwork crossing the active object's artboard trim edge. */
export function selectOverflowingActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds) && !isInsideBounds(box, bounds));
}

/** Select artwork that does not intersect the active object's artboard. */
export function selectOtherArtboardsObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => isOutsideBounds(box, bounds));
}

/** Select artwork whose bounding box sits completely outside the first artboard. */
export function selectOutsideArtboardObjects(): number {
  const bounds = firstArtboardBounds();
  if (!bounds) return 0;
  return selectMatchingObjects((o) => {
    if (!isSelectableArtwork(o)) return false;
    const box = objectBoundingBox(o);
    return box !== null && isOutsideBounds(box, bounds);
  });
}

/** Select artwork whose bounding box sits completely outside every artboard. */
export function selectOutsideAnyArtboardObjects(): number {
  const boundsList = artboardBounds();
  if (boundsList.length === 0) return 0;
  return selectMatchingObjects((o) => {
    if (!isSelectableArtwork(o)) return false;
    const box = objectBoundingBox(o);
    return box !== null && boundsList.every((bounds) => isOutsideBounds(box, bounds));
  });
}


/** Remove artwork whose bounding box sits completely outside the first artboard. */
export function fixOutsideArtboardObjects(): number {
  const bounds = firstArtboardBounds();
  if (!bounds) return 0;
  return removeMatchingObjects((o) => {
    if (!isSelectableArtwork(o)) return false;
    const box = objectBoundingBox(o);
    return box !== null && isOutsideBounds(box, bounds);
  });
}

/** Remove pasteboard artwork whose bounding box sits completely outside every artboard. */
export function fixOutsideAnyArtboardObjects(): number {
  const boundsList = artboardBounds();
  if (boundsList.length === 0) return 0;
  return removeMatchingObjects((o) => {
    if (!isSelectableArtwork(o)) return false;
    const box = objectBoundingBox(o);
    return box !== null && boundsList.every((bounds) => isOutsideBounds(box, bounds));
  });
}

/** Select artwork whose bounding box is fully contained by the first artboard. */
export function selectInsideArtboardObjects(): number {
  const bounds = firstArtboardBounds();
  if (!bounds) return 0;
  return selectMatchingObjects((o) => {
    if (!isSelectableArtwork(o)) return false;
    const box = objectBoundingBox(o);
    return box !== null && isInsideBounds(box, bounds);
  });
}

/** Select artwork whose bounding box is fully contained by any artboard. */
export function selectInsideAnyArtboardObjects(): number {
  const boundsList = artboardBounds();
  if (boundsList.length === 0) return 0;
  return selectMatchingObjects((o) => {
    if (!isSelectableArtwork(o)) return false;
    const box = objectBoundingBox(o);
    return box !== null && boundsList.some((bounds) => isInsideBounds(box, bounds));
  });
}

/** Select artwork that intersects the first artboard but extends past its trim edge. */
export function selectOverflowingArtboardObjects(): number {
  const bounds = firstArtboardBounds();
  if (!bounds) return 0;
  return selectMatchingObjects((o) => {
    if (!isSelectableArtwork(o)) return false;
    const box = objectBoundingBox(o);
    return box !== null && !isOutsideBounds(box, bounds) && !isInsideBounds(box, bounds);
  });
}

/** Select artwork that intersects any artboard but extends past that artboard's trim edge. */
export function selectOverflowingAnyArtboardObjects(): number {
  const boundsList = artboardBounds();
  if (boundsList.length === 0) return 0;
  return selectMatchingObjects((o) => {
    if (!isSelectableArtwork(o)) return false;
    const box = objectBoundingBox(o);
    return box !== null && boundsList.some((bounds) => !isOutsideBounds(box, bounds) && !isInsideBounds(box, bounds));
  });
}

function hasCustomStrokeAppearance(object: FabricObject): boolean {
  if (!isStrokePainted(object)) return false;
  const cap = normalizeString((object as unknown as MatchableObject).strokeLineCap) ?? 'butt';
  const join = normalizeString((object as unknown as MatchableObject).strokeLineJoin) ?? 'miter';
  const miterLimit = (object as unknown as { strokeMiterLimit?: unknown }).strokeMiterLimit;
  const hasCustomMiter = typeof miterLimit === 'number' && Number.isFinite(miterLimit) && Math.abs(miterLimit - 4) > 0.001;
  return cap !== 'butt' || join !== 'miter' || hasCustomMiter;
}

function hasNonScalingStroke(object: FabricObject): boolean {
  return isStrokePainted(object) && (object as { strokeUniform?: boolean }).strokeUniform === true;
}

function hasPatternFill(object: FabricObject): boolean {
  return patternSignature((object as unknown as MatchableObject).patternSpec) !== null;
}

function hasGradientFill(object: FabricObject): boolean {
  return gradientSignature(object.fill) !== null;
}

/** Select painted strokes with non-default cap/join/miter styling. */
export function selectCustomStrokeObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasCustomStrokeAppearance(o));
}

/** Select custom stroke artwork intersecting the active object's artboard. */
export function selectCustomStrokeActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasCustomStrokeAppearance(o));
}

/** Select painted strokes configured to stay constant while objects scale. */
export function selectNonScalingStrokeObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasNonScalingStroke(o));
}

/** Select non-scaling stroke artwork intersecting the active object's artboard. */
export function selectNonScalingStrokeActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasNonScalingStroke(o));
}

/** Select every object carrying pattern-fill metadata. */
export function selectPatternFillObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasPatternFill(o));
}

/** Select pattern-fill artwork intersecting the active object's artboard. */
export function selectPatternFillActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasPatternFill(o));
}

/** Select every object with a Fabric gradient fill. */
export function selectGradientFillObjects(): number {
  return selectMatchingObjects((o) => isSelectableArtwork(o) && hasGradientFill(o));
}

/** Select gradient-fill artwork intersecting the active object's artboard. */
export function selectGradientFillActiveArtboardObjects(): number {
  return selectObjectsByActiveArtboard((box, bounds) => !isOutsideBounds(box, bounds), (o) => hasGradientFill(o));
}

/** Clear the current selection (Illustrator Select→Deselect). Returns the
 *  number of objects that were deselected. */
export function deselectAll(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const n = canvas.getActiveObjects().length;
  if (n > 0) {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }
  return n;
}


export type GuideReleaseBounds = { left: number; top: number; right: number; bottom: number };

export function releasedGuideLineCoords(guide: Pick<UserGuide, 'axis' | 'pos'>, bounds: GuideReleaseBounds): [number, number, number, number] {
  return guide.axis === 'v'
    ? [guide.pos, bounds.top, guide.pos, bounds.bottom]
    : [bounds.left, guide.pos, bounds.right, guide.pos];
}

function guideReleaseBounds(canvas: fabric.Canvas): GuideReleaseBounds {
  const artboards = useEditor.getState().artboards;
  if (artboards.length > 0) {
    return artboards.reduce<GuideReleaseBounds>((bounds, artboard) => ({
      left: Math.min(bounds.left, artboard.x),
      top: Math.min(bounds.top, artboard.y),
      right: Math.max(bounds.right, artboard.x + artboard.width),
      bottom: Math.max(bounds.bottom, artboard.y + artboard.height),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  }
  const width = typeof canvas.getWidth === 'function' ? canvas.getWidth() : canvas.width ?? 1000;
  const height = typeof canvas.getHeight === 'function' ? canvas.getHeight() : canvas.height ?? 1000;
  return { left: 0, top: 0, right: Math.max(1, width), bottom: Math.max(1, height) };
}

/**
 * Make guides from the selection (Illustrator View→Guides→Make Guides): drop a
 * persistent ruler guide at each selected object's four bounding-box edges. The
 * objects are kept (not consumed). Returns the number of guides added.
 */
export function makeGuidesFromSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objs = canvas.getActiveObjects();
  if (objs.length === 0) return 0;
  const addGuide = useEditor.getState().addUserGuide;
  let n = 0;
  for (const o of objs) {
    const r = o.getBoundingRect();
    addGuide('v', r.left);
    addGuide('v', r.left + r.width);
    addGuide('h', r.top);
    addGuide('h', r.top + r.height);
    n += 4;
  }
  return n;
}


/**
 * Release persistent ruler guides into editable line objects (Illustrator
 * View→Guides→Release Guides). The guide list is cleared after conversion.
 * Returns the number of editable guide lines created.
 */
export function releaseGuides(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const state = useEditor.getState();
  const guides = state.userGuides;
  if (guides.length === 0) return 0;
  const bounds = guideReleaseBounds(canvas);
  const lines = guides.map((guide) => new fabric.Line(releasedGuideLineCoords(guide, bounds), {
    name: 'Released Guide',
    stroke: '#2563eb',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
    fill: '',
    opacity: 0.9,
    selectable: true,
    evented: true,
    excludeFromExport: false,
  }));
  canvas.add(...lines);
  state.clearUserGuides();
  canvas.discardActiveObject();
  if (lines.length === 1) canvas.setActiveObject(lines[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(lines, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return lines.length;
}

/**
 * Drop four ruler guides inset by `marginMm` from the first artboard's edges —
 * a safe-area / margin frame for layout. Returns the number of guides added.
 */
export function makeMarginGuides(marginMm: number): number {
  const MM_TO_PX = 3.7795;
  const abs = useEditor.getState().artboards;
  if (abs.length === 0) return 0;
  const a = abs[0];
  const m = Math.max(0, marginMm) * MM_TO_PX;
  if (m * 2 >= a.width || m * 2 >= a.height) return 0;
  const addGuide = useEditor.getState().addUserGuide;
  addGuide('v', a.x + m);
  addGuide('v', a.x + a.width - m);
  addGuide('h', a.y + m);
  addGuide('h', a.y + a.height - m);
  return 4;
}

/** Flip every selected object about its own centre. `'x'` mirrors horizontally,
 *  `'y'` vertically (Illustrator's Object→Transform→Reflect). */
export function flipSelection(axis: 'x' | 'y'): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = canvas.getActiveObjects();
  objs.forEach((o: FabricObject) => {
    if (axis === 'x') o.set('flipX', !o.flipX);
    else o.set('flipY', !o.flipY);
    o.setCoords();
  });
  if (objs.length) {
    canvas.requestRenderAll();
    pushHistory();
  }
}
