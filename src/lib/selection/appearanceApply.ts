/**
 * Appearance apply helpers — the prepress paint machinery that applies
 * fill / stroke / opacity / overprint / dash fixes to canvas objects
 * (process-colour conversion, ink limiting, overprint clearing, thin /
 * dashed stroke and transparency fixes).
 *
 * Moved verbatim from selectionOps.ts (behaviour identical). The exported
 * entry points are imported back into selectionOps.ts; the module-private
 * in-object walkers stay private.
 */

import type * as fabric from 'fabric';
import { getCanvas, pushHistory } from '../canvasEngine';
import { updateSelection } from '../selectionApply';
import {
  THIN_STROKE_WIDTH,
  isSelectableArtwork,
  activeArtboardObjectPredicate,
  isTruthyOverprintFlag,
  isWhitePaint,
  paintName,
  isSpotPaint,
  isGrayscalePaint,
  isRgbPaint,
  isRegistrationPaint,
  isRichBlackPaint,
  isOverInkLimitPaint,
  hasDashedStroke,
  hasTransparencyAppearance,
  hasThinStroke,
  hasPrintMarkKind,
  cmykPaintChannels,
  labPaintChannels,
  grayscalePaintValue,
  rgbPaintChannels,
  parseRgbString,
} from '../selectionOps';

type FabricObject = fabric.FabricObject;

const PROCESS_BLACK = { c: 0, m: 0, y: 0, k: 100, name: 'Process Black' };

function cloneProcessBlack(): { c: number; m: number; y: number; k: number; name: string } {
  return { ...PROCESS_BLACK };
}

export function processPaintFromSpot(value: unknown): { c: number; m: number; y: number; k: number; name: string } | null {
  if (!isSpotPaint(value)) return null;
  const channels = cmykPaintChannels(value);
  if (!channels) return cloneProcessBlack();
  const sourceName = paintName(value);
  const processName = sourceName.replace(/^(pantone|pms|spot)\s+/i, '').replace(/\s+spot\b/i, '').trim();
  return {
    c: Number(channels.c.toFixed(3)),
    m: Number(channels.m.toFixed(3)),
    y: Number(channels.y.toFixed(3)),
    k: Number(channels.k.toFixed(3)),
    name: processName ? `Process ${processName}` : 'Process Color',
  };
}

function rgbToProcessCmyk(channels: { r: number; g: number; b: number }, name: string): { c: number; m: number; y: number; k: number; name: string } {
  const r = channels.r / 255;
  const g = channels.g / 255;
  const b = channels.b / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100, name };
  return {
    c: Number((((1 - r - k) / (1 - k)) * 100).toFixed(3)),
    m: Number((((1 - g - k) / (1 - k)) * 100).toFixed(3)),
    y: Number((((1 - b - k) / (1 - k)) * 100).toFixed(3)),
    k: Number((k * 100).toFixed(3)),
    name,
  };
}

function pivotLab(value: number): number {
  const cubed = value ** 3;
  return cubed > 0.008856 ? cubed : (value - 16 / 116) / 7.787;
}

function labToRgbChannels(channels: { l: number; a: number; b: number }): { r: number; g: number; b: number } {
  const y = (channels.l + 16) / 116;
  const x = channels.a / 500 + y;
  const z = y - channels.b / 200;
  const xyz = {
    x: 95.047 * pivotLab(x),
    y: 100 * pivotLab(y),
    z: 108.883 * pivotLab(z),
  };
  const linear = {
    r: xyz.x * 0.032406 + xyz.y * -0.015372 + xyz.z * -0.004986,
    g: xyz.x * -0.009689 + xyz.y * 0.018758 + xyz.z * 0.000415,
    b: xyz.x * 0.000557 + xyz.y * -0.00204 + xyz.z * 0.01057,
  };
  const gamma = (value: number) => {
    const normalized = Math.max(0, Math.min(1, value));
    return normalized > 0.0031308 ? 1.055 * normalized ** (1 / 2.4) - 0.055 : 12.92 * normalized;
  };
  return {
    r: Math.round(gamma(linear.r) * 255),
    g: Math.round(gamma(linear.g) * 255),
    b: Math.round(gamma(linear.b) * 255),
  };
}

export function processPaintFromLab(value: unknown): { c: number; m: number; y: number; k: number; name: string } | null {
  const lab = labPaintChannels(value);
  return lab ? rgbToProcessCmyk(labToRgbChannels(lab), 'Process Lab') : null;
}

export function processPaintFromGrayscale(value: unknown): { c: number; m: number; y: number; k: number; name: string } | null {
  if (!isGrayscalePaint(value)) return null;
  const gray = grayscalePaintValue(value);
  if (gray == null) return null;
  return { c: 0, m: 0, y: 0, k: Number(gray.toFixed(3)), name: 'Process Gray' };
}

export function processPaintFromRgb(value: unknown): { c: number; m: number; y: number; k: number; name: string } | null {
  if (!isRgbPaint(value)) return null;
  const channels = typeof value === 'string' ? parseRgbString(value) : rgbPaintChannels(value);
  return channels ? rgbToProcessCmyk(channels, 'Process RGB') : null;
}

export function processPaintFromNonCmyk(value: unknown): { c: number; m: number; y: number; k: number; name: string } | null {
  return processPaintFromSpot(value) ?? processPaintFromLab(value) ?? processPaintFromGrayscale(value) ?? processPaintFromRgb(value);
}

export function reducedInkPaint(value: unknown, limit = 300): { c: number; m: number; y: number; k: number; name: string } | null {
  if (!isOverInkLimitPaint(value, limit)) return null;
  const channels = cmykPaintChannels(value);
  if (!channels) return null;
  const cmyTotal = channels.c + channels.m + channels.y;
  const cmyLimit = Math.max(0, limit - channels.k);
  const scale = cmyTotal > 0 ? Math.min(1, cmyLimit / cmyTotal) : 1;
  const next = {
    c: Number((channels.c * scale).toFixed(3)),
    m: Number((channels.m * scale).toFixed(3)),
    y: Number((channels.y * scale).toFixed(3)),
    k: Number(channels.k.toFixed(3)),
  };
  const overflow = next.c + next.m + next.y + next.k - limit;
  if (overflow > 0) {
    const key = next.c >= next.m && next.c >= next.y ? 'c' : next.m >= next.y ? 'm' : 'y';
    next[key] = Number(Math.max(0, next[key] - overflow).toFixed(3));
  }
  return { ...next, name: 'Ink Limit 300%' };
}

function transformPaintMatching(object: FabricObject, transform: (value: unknown) => unknown | null): number {
  const record = object as unknown as { fill?: unknown; stroke?: unknown; _objects?: FabricObject[]; set?: (key: string, value: unknown) => void };
  let changed = 0;
  for (const key of ['fill', 'stroke'] as const) {
    const next = transform(record[key]);
    if (!next) continue;
    if (record.set) record.set(key, next);
    else record[key] = next;
    changed += 1;
  }
  for (const child of record._objects ?? []) changed += transformPaintMatching(child, transform);
  return changed;
}

function fixPaintMatching(object: FabricObject, predicate: (value: unknown) => boolean): number {
  const record = object as unknown as { fill?: unknown; stroke?: unknown; _objects?: FabricObject[]; set?: (key: string, value: unknown) => void };
  let changed = 0;
  for (const key of ['fill', 'stroke'] as const) {
    if (!predicate(record[key])) continue;
    if (record.set) record.set(key, cloneProcessBlack());
    else record[key] = cloneProcessBlack();
    changed += 1;
  }
  for (const child of record._objects ?? []) changed += fixPaintMatching(child, predicate);
  return changed;
}

export function transformPrepressPaints(transform: (value: unknown) => unknown | null, objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && objectPredicate(object)) changed += transformPaintMatching(object, transform);
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

export function transformPrepressPaintsOnActiveArtboard(transform: (value: unknown) => unknown | null, objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!inActiveArtboard) return 0;
  return transformPrepressPaints(transform, (object) => inActiveArtboard(object) && objectPredicate(object));
}

export function fixPrepressPaintsOnActiveArtboard(predicate: (value: unknown) => boolean, objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  if (!inActiveArtboard) return 0;
  return fixPrepressPaints(predicate, (object) => inActiveArtboard(object) && objectPredicate(object));
}

export function fixPrepressPaints(predicate: (value: unknown) => boolean, objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && objectPredicate(object)) changed += fixPaintMatching(object, predicate);
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

function fixPrepressPaintsInObject(object: FabricObject): number {
  let changed = 0;
  changed += transformPaintMatching(object, (value) => processPaintFromNonCmyk(value));
  changed += fixPaintMatching(object, isRichBlackPaint);
  if (!hasPrintMarkKind(object)) changed += fixPaintMatching(object, isRegistrationPaint);
  changed += transformPaintMatching(object, (value) => reducedInkPaint(value));
  return changed;
}

export function fixPrepressRisks(objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (!isSelectableArtwork(object) || !objectPredicate(object)) continue;
    changed += clearOverprintInObject(object);
    changed += fixTransparencyInObject(object);
    changed += fixDashedStrokeInObject(object);
    changed += fixThinStrokeInObject(object);
    changed += fixPrepressPaintsInObject(object);
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

function clearOverprintRecordFlags(record: Record<string, unknown>): boolean {
  const directKeys = ['overprint', 'fillOverprint', 'strokeOverprint', 'overprintFill', 'overprintStroke', '__overprint', '__fillOverprint', '__strokeOverprint'];
  let changed = false;
  for (const key of directKeys) {
    if (isTruthyOverprintFlag(record[key])) {
      record[key] = false;
      changed = true;
    }
  }
  return changed;
}

function clearOverprintInObject(object: FabricObject): number {
  const record = object as unknown as Record<string, unknown> & { _objects?: FabricObject[]; set?: (props: Record<string, unknown>) => void };
  let changed = 0;
  const updates: Record<string, unknown> = {};
  const directKeys = ['overprint', 'fillOverprint', 'strokeOverprint', 'overprintFill', 'overprintStroke', '__overprint', '__fillOverprint', '__strokeOverprint'];
  for (const key of directKeys) {
    if (isTruthyOverprintFlag(record[key])) updates[key] = false;
  }

  if (Object.keys(updates).length > 0) {
    if (record.set) record.set(updates);
    else Object.assign(record, updates);
    changed = 1;
  }

  for (const key of ['metadata', 'data', 'customData']) {
    const metadata = record[key];
    if (metadata && typeof metadata === 'object' && clearOverprintRecordFlags(metadata as Record<string, unknown>)) changed = 1;
  }

  for (const child of record._objects ?? []) changed += clearOverprintInObject(child);
  return changed;
}

export function clearOverprints(objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && objectPredicate(object)) changed += clearOverprintInObject(object);
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

function clearWhiteOverprintInObject(object: FabricObject): number {
  const record = object as unknown as { fill?: unknown; stroke?: unknown; fillOverprint?: boolean; overprintFill?: boolean; strokeOverprint?: boolean; overprintStroke?: boolean; overprint?: boolean; _objects?: FabricObject[]; set?: (props: Record<string, unknown>) => void };
  const updates: Record<string, unknown> = {};
  let changed = 0;
  const fillWhite = isWhitePaint(record.fill);
  const strokeWhite = isWhitePaint(record.stroke);
  if (fillWhite && record.fillOverprint === true) { updates.fillOverprint = false; changed += 1; }
  if (fillWhite && record.overprintFill === true) { updates.overprintFill = false; changed += 1; }
  if (strokeWhite && record.strokeOverprint === true) { updates.strokeOverprint = false; changed += 1; }
  if (strokeWhite && record.overprintStroke === true) { updates.overprintStroke = false; changed += 1; }
  if (record.overprint === true && (fillWhite || strokeWhite)) {
    updates.overprint = false;
    if (!fillWhite && record.fill != null) updates.fillOverprint = true;
    if (!strokeWhite && record.stroke != null) updates.strokeOverprint = true;
    changed += 1;
  }
  if (Object.keys(updates).length > 0) {
    if (record.set) record.set(updates);
    else Object.assign(record, updates);
  }
  for (const child of record._objects ?? []) changed += clearWhiteOverprintInObject(child);
  return changed;
}

export function clearWhiteOverprints(objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && objectPredicate(object)) changed += clearWhiteOverprintInObject(object);
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

export function clearWhiteOverprintsOnActiveArtboard(): number {
  const inActiveArtboard = activeArtboardObjectPredicate();
  return inActiveArtboard ? clearWhiteOverprints(inActiveArtboard) : 0;
}

function fixDashedStrokeInObject(object: FabricObject): number {
  const record = object as unknown as { strokeDashArray?: unknown; _objects?: FabricObject[]; set?: (key: string, value: unknown) => void };
  let changed = 0;
  if (hasDashedStroke(object)) {
    if (record.set) record.set('strokeDashArray', null);
    else record.strokeDashArray = null;
    changed += 1;
  }
  for (const child of record._objects ?? []) changed += fixDashedStrokeInObject(child);
  return changed;
}

function fixTransparencyInObject(object: FabricObject): number {
  const record = object as unknown as { opacity?: number; globalCompositeOperation?: string; _objects?: FabricObject[]; set?: (key: string, value: unknown) => void };
  let changed = 0;
  if (hasTransparencyAppearance(object)) {
    if (record.set) {
      record.set('opacity', 1);
      record.set('globalCompositeOperation', 'source-over');
    } else {
      record.opacity = 1;
      record.globalCompositeOperation = 'source-over';
    }
    changed += 1;
  }
  for (const child of record._objects ?? []) changed += fixTransparencyInObject(child);
  return changed;
}

export function fixTransparencyAppearance(objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && objectPredicate(object)) changed += fixTransparencyInObject(object);
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

export function fixDashedStrokes(objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && objectPredicate(object)) changed += fixDashedStrokeInObject(object);
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}

function fixThinStrokeInObject(object: FabricObject): number {
  const record = object as unknown as { strokeWidth?: number; _objects?: FabricObject[]; set?: (key: string, value: unknown) => void };
  let changed = 0;
  if (hasThinStroke(object)) {
    if (record.set) record.set('strokeWidth', THIN_STROKE_WIDTH);
    else record.strokeWidth = THIN_STROKE_WIDTH;
    changed += 1;
  }
  for (const child of record._objects ?? []) changed += fixThinStrokeInObject(child);
  return changed;
}

export function fixThinStrokes(objectPredicate: (object: FabricObject) => boolean = () => true): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  let changed = 0;
  for (const object of canvas.getObjects()) {
    if (isSelectableArtwork(object) && objectPredicate(object)) changed += fixThinStrokeInObject(object);
  }
  if (changed > 0) {
    canvas.requestRenderAll();
    pushHistory();
    updateSelection();
  }
  return changed;
}
