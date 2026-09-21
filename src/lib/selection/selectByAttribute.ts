/**
 * Select Same / select-by-attribute — the signature family behind
 * "Select → Same → …" plus the two selection commands that drive it.
 *
 * Moved verbatim from selectionOps.ts (behaviour identical); re-exported
 * from selectionOps.ts so existing importers (canvasEngine back-compat,
 * tests) are unchanged.
 */

import * as fabric from 'fabric';
import { getCanvas } from '../canvasEngine';
import {
  normalizeString,
  TEXT_TYPES,
  artboardBounds,
  firstArtboardBounds,
  objectBoundingBox,
  isOutsideBounds,
  isInsideBounds,
  isSelectableArtwork,
  activeArtboardBounds,
  type MatchableObject,
} from '../selectionOps';

type FabricObject = fabric.FabricObject;

export type SelectSameProp = 'fill' | 'fillAppearance' | 'stroke' | 'fillStroke' | 'strokeAppearance' | 'strokeWidth' | 'opacity' | 'fontFamily' | 'fontSize' | 'textAppearance' | 'objectX' | 'objectY' | 'objectPosition' | 'objectRight' | 'objectBottom' | 'objectBounds' | 'objectCenterX' | 'objectCenterY' | 'objectCenter' | 'objectWidth' | 'objectHeight' | 'objectSize' | 'objectArea' | 'objectAspectRatio' | 'objectScale' | 'objectSkew' | 'objectRotation' | 'objectTransform' | 'artboardPlacement' | 'artboardAnyPlacement' | 'globalCompositeOperation' | 'strokeLineCap' | 'strokeLineJoin' | 'strokeDashArray' | 'name' | 'shadow' | 'patternSpec' | 'symbolId' | 'clipPath' | 'appearance' | 'gradientFill' | 'overprint' | 'printMarkKind';

export function shadowSignature(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const shadow = value as { color?: unknown; blur?: unknown; offsetX?: unknown; offsetY?: unknown };
  const color = normalizeString(shadow.color);
  if (!color) return null;
  const numberPart = [shadow.blur, shadow.offsetX, shadow.offsetY]
    .map((n) => (typeof n === 'number' && Number.isFinite(n) ? Number(n).toFixed(3) : '0.000'))
    .join('|');
  return `${color}|${numberPart}`;
}

export function patternSignature(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const pattern = value as { kind?: unknown; size?: unknown; color1?: unknown; color2?: unknown };
  const kind = normalizeString(pattern.kind);
  const color1 = normalizeString(pattern.color1);
  const color2 = normalizeString(pattern.color2);
  const size = typeof pattern.size === 'number' && Number.isFinite(pattern.size) ? Number(pattern.size).toFixed(3) : null;
  return kind && size && color1 && color2 ? `${kind}|${size}|${color1}|${color2}` : null;
}

export function gradientSignature(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const gradient = value as { type?: unknown; coords?: Record<string, unknown>; colorStops?: Array<{ offset?: unknown; color?: unknown }> };
  const type = normalizeString(gradient.type);
  if (type !== 'linear' && type !== 'radial') return null;
  const coords = gradient.coords ?? {};
  const coordPart = ['x1', 'y1', 'x2', 'y2', 'r1', 'r2']
    .map((key) => numericSignature(coords[key], 0))
    .join(',');
  const stops = Array.isArray(gradient.colorStops) ? gradient.colorStops : [];
  if (stops.length < 2) return null;
  const stopPart = stops
    .map((stop) => `${numericSignature(stop.offset, 0)}:${normalizeString(stop.color) ?? ''}`)
    .join(',');
  return `${type}|${coordPart}|${stopPart}`;
}

function overprintFlag(object: MatchableObject, keys: string[]): boolean {
  return keys.some((key) => object[key] === true);
}

export function overprintSignature(object: MatchableObject): string | null {
  const fill = overprintFlag(object, ['fillOverprint', 'overprintFill']);
  const stroke = overprintFlag(object, ['strokeOverprint', 'overprintStroke']);
  const both = object.overprint === true;
  if (!fill && !stroke && !both) return null;
  return `fill:${fill || both}|stroke:${stroke || both}`;
}

function numericSignature(value: unknown, fallback = 0): string {
  return (typeof value === 'number' && Number.isFinite(value) ? value : fallback).toFixed(3);
}

function paintSignature(value: unknown): string {
  return typeof value === 'string' ? normalizeString(value) ?? '' : '';
}

export function fillStrokeSignature(object: MatchableObject): string | null {
  const fill = paintSignature(object.fill);
  const stroke = paintSignature(object.stroke);
  return fill || stroke ? `fill:${fill}|stroke:${stroke}` : null;
}

export function fillAppearanceSignature(object: MatchableObject): string | null {
  const solid = paintSignature(object.fill);
  const gradient = gradientSignature(object.fill) ?? '';
  const pattern = patternSignature(object.patternSpec) ?? '';
  if (!solid && !gradient && !pattern) return null;
  return [
    `fill:${solid}`,
    `gradient:${gradient}`,
    `pattern:${pattern}`,
    `opacity:${numericSignature(object.opacity, 1)}`,
    `blend:${normalizeString(object.globalCompositeOperation) ?? 'source-over'}`,
  ].join('|');
}

export function strokeAppearanceSignature(object: MatchableObject): string | null {
  const stroke = paintSignature(object.stroke);
  if (!stroke) return null;
  const dash = Array.isArray(object.strokeDashArray)
    ? object.strokeDashArray.map(Number).filter(Number.isFinite).map((n) => n.toFixed(3)).join(',')
    : '';
  return [
    `stroke:${stroke}`,
    `strokeWidth:${numericSignature(object.strokeWidth)}`,
    `dash:${dash}`,
    `cap:${normalizeString(object.strokeLineCap) ?? 'butt'}`,
    `join:${normalizeString(object.strokeLineJoin) ?? 'miter'}`,
  ].join('|');
}

export function textAppearanceSignature(object: MatchableObject): string | null {
  const type = typeof object.type === 'string' ? object.type : '';
  if (!TEXT_TYPES.includes(type)) return null;
  const fontFamily = normalizeString(object.fontFamily);
  if (!fontFamily) return null;
  return [
    `family:${fontFamily}`,
    `size:${numericSignature(object.fontSize)}`,
    `weight:${normalizeString(object.fontWeight) ?? 'normal'}`,
    `style:${normalizeString(object.fontStyle) ?? 'normal'}`,
    `tracking:${numericSignature(object.charSpacing)}`,
    `leading:${numericSignature(object.lineHeight, 1)}`,
  ].join('|');
}

export function objectPositionSignature(object: MatchableObject): string | null {
  const left = typeof object.left === 'number' && Number.isFinite(object.left) ? object.left : 0;
  const top = typeof object.top === 'number' && Number.isFinite(object.top) ? object.top : 0;
  return `left:${numericSignature(left)}|top:${numericSignature(top)}`;
}

export function objectXSignature(object: MatchableObject): string | null {
  const left = typeof object.left === 'number' && Number.isFinite(object.left) ? object.left : 0;
  return `left:${numericSignature(left)}`;
}

export function objectYSignature(object: MatchableObject): string | null {
  const top = typeof object.top === 'number' && Number.isFinite(object.top) ? object.top : 0;
  return `top:${numericSignature(top)}`;
}

export function objectRightSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  const left = typeof object.left === 'number' && Number.isFinite(object.left) ? object.left : 0;
  return `right:${numericSignature(left + size.width)}`;
}

export function objectBottomSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  const top = typeof object.top === 'number' && Number.isFinite(object.top) ? object.top : 0;
  return `bottom:${numericSignature(top + size.height)}`;
}

function scaledSize(object: MatchableObject): { width: number; height: number } | null {
  const width = typeof object.width === 'number' && Number.isFinite(object.width) ? object.width : null;
  const height = typeof object.height === 'number' && Number.isFinite(object.height) ? object.height : null;
  if (!width || !height) return null;
  const scaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
  const scaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
  const actualWidth = Math.abs(width * scaleX);
  const actualHeight = Math.abs(height * scaleY);
  if (actualWidth <= 0 || actualHeight <= 0) return null;
  return { width: actualWidth, height: actualHeight };
}

export function objectCenterSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  const left = typeof object.left === 'number' && Number.isFinite(object.left) ? object.left : 0;
  const top = typeof object.top === 'number' && Number.isFinite(object.top) ? object.top : 0;
  return `centerX:${numericSignature(left + size.width / 2)}|centerY:${numericSignature(top + size.height / 2)}`;
}

export function objectCenterXSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  const left = typeof object.left === 'number' && Number.isFinite(object.left) ? object.left : 0;
  return `centerX:${numericSignature(left + size.width / 2)}`;
}

export function objectCenterYSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  const top = typeof object.top === 'number' && Number.isFinite(object.top) ? object.top : 0;
  return `centerY:${numericSignature(top + size.height / 2)}`;
}

export function objectSizeSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  return `width:${numericSignature(size.width)}|height:${numericSignature(size.height)}`;
}

export function objectBoundsSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  const left = typeof object.left === 'number' && Number.isFinite(object.left) ? object.left : 0;
  const top = typeof object.top === 'number' && Number.isFinite(object.top) ? object.top : 0;
  return `left:${numericSignature(left)}|top:${numericSignature(top)}|right:${numericSignature(left + size.width)}|bottom:${numericSignature(top + size.height)}`;
}

export function objectWidthSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  return `width:${numericSignature(size.width)}`;
}

export function objectHeightSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  return `height:${numericSignature(size.height)}`;
}

export function objectAreaSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  return `area:${numericSignature(size.width * size.height)}`;
}

export function objectAspectRatioSignature(object: MatchableObject): string | null {
  const size = scaledSize(object);
  if (!size) return null;
  return `aspect:${numericSignature(size.width / size.height)}`;
}

export function objectScaleSignature(object: MatchableObject): string | null {
  const scaleX = typeof object.scaleX === 'number' && Number.isFinite(object.scaleX) ? object.scaleX : 1;
  const scaleY = typeof object.scaleY === 'number' && Number.isFinite(object.scaleY) ? object.scaleY : 1;
  return `scaleX:${numericSignature(scaleX)}|scaleY:${numericSignature(scaleY)}`;
}

export function objectSkewSignature(object: MatchableObject): string | null {
  const skewX = typeof object.skewX === 'number' && Number.isFinite(object.skewX) ? object.skewX : 0;
  const skewY = typeof object.skewY === 'number' && Number.isFinite(object.skewY) ? object.skewY : 0;
  return `skewX:${numericSignature(skewX)}|skewY:${numericSignature(skewY)}`;
}

export function objectRotationSignature(object: MatchableObject): string | null {
  if (typeof object.angle !== 'number' || !Number.isFinite(object.angle)) return 'angle:0.000';
  const normalized = ((object.angle % 360) + 360) % 360;
  return `angle:${numericSignature(normalized)}`;
}

export function objectTransformSignature(object: MatchableObject): string | null {
  return [
    objectScaleSignature(object),
    objectSkewSignature(object),
    objectRotationSignature(object),
  ].join('|');
}

export function artboardPlacementSignature(object: MatchableObject): string | null {
  if (typeof object.getBoundingRect !== 'function') return null;
  const bounds = firstArtboardBounds();
  if (!bounds) return null;
  const box = objectBoundingBox(object as unknown as FabricObject);
  if (!box) return null;
  if (isOutsideBounds(box, bounds)) return 'outside-artboard';
  if (isInsideBounds(box, bounds)) return 'inside-artboard';
  return 'overflowing-artboard';
}

export function artboardAnyPlacementSignature(object: MatchableObject): string | null {
  if (typeof object.getBoundingRect !== 'function') return null;
  const boundsList = artboardBounds();
  if (boundsList.length === 0) return null;
  const box = objectBoundingBox(object as unknown as FabricObject);
  if (!box) return null;
  if (boundsList.some((bounds) => isInsideBounds(box, bounds))) return 'inside-any-artboard';
  if (boundsList.some((bounds) => !isOutsideBounds(box, bounds))) return 'overflowing-any-artboard';
  return 'outside-any-artboard';
}

export function appearanceSignature(object: MatchableObject): string {
  const shadow = shadowSignature(object.shadow) ?? '';
  const pattern = patternSignature(object.patternSpec) ?? '';
  const gradient = gradientSignature(object.fill) ?? '';
  const dash = Array.isArray(object.strokeDashArray)
    ? object.strokeDashArray.map(Number).filter(Number.isFinite).map((n) => n.toFixed(3)).join(',')
    : '';
  return [
    `fill:${paintSignature(object.fill)}`,
    `stroke:${paintSignature(object.stroke)}`,
    `strokeWidth:${numericSignature(object.strokeWidth)}`,
    `opacity:${numericSignature(object.opacity, 1)}`,
    `blend:${normalizeString(object.globalCompositeOperation) ?? 'source-over'}`,
    `dash:${dash}`,
    `cap:${normalizeString(object.strokeLineCap) ?? 'butt'}`,
    `join:${normalizeString(object.strokeLineJoin) ?? 'miter'}`,
    `shadow:${shadow}`,
    `pattern:${pattern}`,
    `gradient:${gradient}`,
  ].join('|');
}

export function selectSameSignature(object: MatchableObject, prop: SelectSameProp): string | number[] | number | null {
  const value = object[prop];
  if (prop === 'appearance') return appearanceSignature(object);
  if (prop === 'fillAppearance') return fillAppearanceSignature(object);
  if (prop === 'fillStroke') return fillStrokeSignature(object);
  if (prop === 'strokeAppearance') return strokeAppearanceSignature(object);
  if (prop === 'textAppearance') return textAppearanceSignature(object);
  if (prop === 'objectX') return objectXSignature(object);
  if (prop === 'objectY') return objectYSignature(object);
  if (prop === 'objectPosition') return objectPositionSignature(object);
  if (prop === 'objectRight') return objectRightSignature(object);
  if (prop === 'objectBottom') return objectBottomSignature(object);
  if (prop === 'objectBounds') return objectBoundsSignature(object);
  if (prop === 'objectCenterX') return objectCenterXSignature(object);
  if (prop === 'objectCenterY') return objectCenterYSignature(object);
  if (prop === 'objectCenter') return objectCenterSignature(object);
  if (prop === 'objectWidth') return objectWidthSignature(object);
  if (prop === 'objectHeight') return objectHeightSignature(object);
  if (prop === 'objectSize') return objectSizeSignature(object);
  if (prop === 'objectArea') return objectAreaSignature(object);
  if (prop === 'objectAspectRatio') return objectAspectRatioSignature(object);
  if (prop === 'objectScale') return objectScaleSignature(object);
  if (prop === 'objectSkew') return objectSkewSignature(object);
  if (prop === 'objectRotation') return objectRotationSignature(object);
  if (prop === 'objectTransform') return objectTransformSignature(object);
  if (prop === 'artboardPlacement') return artboardPlacementSignature(object);
  if (prop === 'artboardAnyPlacement') return artboardAnyPlacementSignature(object);
  if (prop === 'gradientFill') return gradientSignature(object.fill);
  if (prop === 'overprint') return overprintSignature(object);
  if (prop === 'printMarkKind') return normalizeString(value);
  if (prop === 'shadow') return shadowSignature(value);
  if (prop === 'patternSpec') return patternSignature(value);
  if (prop === 'symbolId') return normalizeString(value);
  if (prop === 'clipPath') return value ? 'clipPath' : null;
  if (prop === 'strokeDashArray') return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
  if (prop === 'strokeWidth' || prop === 'opacity' || prop === 'fontSize') return typeof value === 'number' ? value : null;
  return normalizeString(value);
}

export function sameSignature(a: string | number[] | number | null, b: string | number[] | number | null): boolean {
  if (a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return a.length === b.length && a.every((n, index) => Math.abs(n - b[index]) < 1e-6);
  }
  if (typeof a === 'number' || typeof b === 'number') return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6;
  return a === b;
}

/**
 * Select every object whose `fill` (or `stroke`) matches the active object's —
 * Illustrator's Select → Same → Fill / Stroke Color. Only flat string colours
 * match (gradients/patterns are skipped). Returns the count selected.
 */
export function selectSame(prop: SelectSameProp): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const ref = canvas.getActiveObject();
  if (!ref) return 0;
  const target = selectSameSignature(ref as unknown as MatchableObject, prop);
  if (target == null) return 0;

  const matches = canvas.getObjects().filter((object) => {
    if ((object as { excludeFromExport?: boolean }).excludeFromExport) return false;
    return sameSignature(selectSameSignature(object as unknown as MatchableObject, prop), target);
  });
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  if (matches.length === 1) canvas.setActiveObject(matches[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  return matches.length;
}

/** Select objects sharing a Select Same signature, scoped to the active object's artboard. */
export function selectSameActiveArtboard(prop: SelectSameProp): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const ref = canvas.getActiveObject();
  if (!ref) return 0;
  const target = selectSameSignature(ref as unknown as MatchableObject, prop);
  if (target == null) return 0;
  const bounds = activeArtboardBounds();
  if (!bounds) return 0;

  const matches = canvas.getObjects().filter((object) => {
    if (!isSelectableArtwork(object)) return false;
    if (!sameSignature(selectSameSignature(object as unknown as MatchableObject, prop), target)) return false;
    const box = objectBoundingBox(object);
    return box !== null && !isOutsideBounds(box, bounds);
  });
  if (matches.length === 0) return 0;
  canvas.discardActiveObject();
  if (matches.length === 1) canvas.setActiveObject(matches[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(matches, { canvas }));
  canvas.requestRenderAll();
  return matches.length;
}
