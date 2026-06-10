/**
 * Blend (Illustrator Object→Blend) — generate N intermediate copies between
 * adjacent selected objects, interpolating geometry and appearance. The original
 * endpoints are kept; generated steps are inserted between each pair.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { assignObjectId } from './objectId';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const numberOr = (value: unknown, fallback: number) => isFiniteNumber(value) ? value : fallback;

const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;

export function blendAngle(a: unknown, b: unknown, t: number): number {
  const start = numberOr(a, 0);
  const end = numberOr(b, 0);
  const delta = ((end - start + 540) % 360) - 180;
  return normalizeAngle(start + delta * t);
}

type Rgba = [number, number, number, number];

export function parseBlendColor(value: string): Rgba | null {
  const trimmed = value.trim();
  const hex = trimmed.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), 1];
  if (/^[0-9a-f]{6}$/i.test(hex)) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(trimmed);
  if (!rgb) return null;
  const parts = rgb[1].split(',').map(part => Number(part.trim()));
  if (parts.length !== 3 && parts.length !== 4) return null;
  if (!parts.every(Number.isFinite)) return null;
  const alpha = parts.length === 4 ? Math.max(0, Math.min(1, parts[3])) : 1;
  return [
    Math.max(0, Math.min(255, parts[0])),
    Math.max(0, Math.min(255, parts[1])),
    Math.max(0, Math.min(255, parts[2])),
    alpha,
  ];
}

const toChannel = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (n: number) => toChannel(n).toString(16).padStart(2, '0');
const toAlpha = (n: number) => Number(Math.max(0, Math.min(1, n)).toFixed(3));

/** Interpolate flat hex/rgb/rgba colours; falls back to `a` for unsupported paints. */
export function blendColor(a: unknown, b: unknown, t: number): string {
  const av = typeof a === 'string' ? a : '';
  const bv = typeof b === 'string' ? b : '';
  const ra = parseBlendColor(av), rb = parseBlendColor(bv);
  if (!ra || !rb) return av;
  const red = lerp(ra[0], rb[0], t);
  const green = lerp(ra[1], rb[1], t);
  const blue = lerp(ra[2], rb[2], t);
  const alpha = lerp(ra[3], rb[3], t);
  if (alpha < 1) return `rgba(${toChannel(red)}, ${toChannel(green)}, ${toChannel(blue)}, ${toAlpha(alpha)})`;
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function blendNumberArray(a: unknown, b: unknown, t: number): number[] | undefined {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return undefined;
  const left = a.map(Number);
  const right = b.map(Number);
  if (!left.every(Number.isFinite) || !right.every(Number.isFinite)) return undefined;
  return left.map((value, index) => lerp(value, right[index], t));
}

const OPTIONAL_NUMBER_PROPS = ['rx', 'ry', 'radius', 'fontSize', 'charSpacing', 'lineHeight'] as const;

function assignOptionalNumberProps(props: Record<string, unknown>, a: BlendEndpoint, b: BlendEndpoint, t: number) {
  for (const key of OPTIONAL_NUMBER_PROPS) {
    if (!isFiniteNumber(a[key]) || !isFiniteNumber(b[key])) continue;
    props[key] = lerp(a[key], b[key], t);
  }
}

function blendShadow(a: unknown, b: unknown, t: number): fabric.Shadow | undefined {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return undefined;
  const left = a as { color?: unknown; blur?: unknown; offsetX?: unknown; offsetY?: unknown };
  const right = b as { color?: unknown; blur?: unknown; offsetX?: unknown; offsetY?: unknown };
  const color = blendColor(left.color, right.color, t);
  if (!color) return undefined;
  return new fabric.Shadow({
    color,
    blur: lerp(numberOr(left.blur, 0), numberOr(right.blur, 0), t),
    offsetX: lerp(numberOr(left.offsetX, 0), numberOr(right.offsetX, 0), t),
    offsetY: lerp(numberOr(left.offsetY, 0), numberOr(right.offsetY, 0), t),
  });
}

export type BlendEndpoint = Record<string, unknown>;
export type BlendSpacingMode = 'specifiedSteps' | 'specifiedDistance' | 'smoothColor';
export type BlendOrientation = 'page' | 'path';
export type BlendOptions = { reverse?: boolean; spacingMode?: BlendSpacingMode; distancePx?: number; orientation?: BlendOrientation };
export type BlendStepMetadata = {
  kind: 'blendStep';
  blendId: string;
  sourceIds: [string, string];
  pairIndex: number;
  stepIndex: number;
  stepsInPair: number;
  t: number;
  spacingMode: BlendSpacingMode;
  orientation: BlendOrientation;
  reverse: boolean;
};

type BlendTaggedObject = fabric.FabricObject & { __blend?: unknown };

export function getBlendStepMetadata(object: unknown): BlendStepMetadata | null {
  const raw = (object as { __blend?: unknown } | null | undefined)?.__blend;
  if (!raw || typeof raw !== 'object') return null;
  const metadata = raw as Partial<BlendStepMetadata>;
  if (metadata.kind !== 'blendStep') return null;
  if (!isFiniteNumber(metadata.pairIndex) || !isFiniteNumber(metadata.stepIndex) || !isFiniteNumber(metadata.stepsInPair) || !isFiniteNumber(metadata.t)) return null;
  const spacingMode = metadata.spacingMode === 'specifiedDistance' || metadata.spacingMode === 'smoothColor' ? metadata.spacingMode : 'specifiedSteps';
  const orientation = metadata.orientation === 'path' ? 'path' : 'page';
  const sourceIds: [string, string] = Array.isArray(metadata.sourceIds) && typeof metadata.sourceIds[0] === 'string' && typeof metadata.sourceIds[1] === 'string'
    ? [metadata.sourceIds[0], metadata.sourceIds[1]]
    : ['', ''];
  const blendId = typeof metadata.blendId === 'string' && metadata.blendId.trim() ? metadata.blendId : sourceIds[0] && sourceIds[1] ? sourceIds.join('→') : '';
  return {
    kind: 'blendStep',
    blendId,
    sourceIds,
    pairIndex: Math.max(0, Math.floor(metadata.pairIndex)),
    stepIndex: Math.max(1, Math.floor(metadata.stepIndex)),
    stepsInPair: Math.max(0, Math.floor(metadata.stepsInPair)),
    t: Math.max(0, Math.min(1, metadata.t)),
    spacingMode,
    orientation,
    reverse: metadata.reverse === true,
  };
}

export function isBlendStepObject(object: unknown): object is BlendTaggedObject {
  return getBlendStepMetadata(object) !== null;
}

function orderedBlendEndpoints<T>(endpoints: T[], options: BlendOptions = {}): T[] {
  return options.reverse ? [...endpoints].reverse() : endpoints;
}

function endpointDistance(a: BlendEndpoint, b: BlendEndpoint): number {
  const dx = numberOr(b.left, 0) - numberOr(a.left, 0);
  const dy = numberOr(b.top, 0) - numberOr(a.top, 0);
  return Math.hypot(dx, dy);
}

export function endpointAngle(a: BlendEndpoint, b: BlendEndpoint): number {
  const dx = numberOr(b.left, 0) - numberOr(a.left, 0);
  const dy = numberOr(b.top, 0) - numberOr(a.top, 0);
  if (dx === 0 && dy === 0) return numberOr(a.angle, 0);
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function colorDistance(a: unknown, b: unknown): number | null {
  if (typeof a !== 'string' || typeof b !== 'string') return null;
  const left = parseBlendColor(a);
  const right = parseBlendColor(b);
  if (!left || !right) return null;
  const dr = right[0] - left[0];
  const dg = right[1] - left[1];
  const db = right[2] - left[2];
  const da = (right[3] - left[3]) * 255;
  return Math.hypot(dr, dg, db, da);
}

export function resolveSmoothColorSteps(a: BlendEndpoint, b: BlendEndpoint): number {
  const fillDistance = colorDistance(a.fill, b.fill) ?? 0;
  const strokeDistance = colorDistance(a.stroke, b.stroke) ?? 0;
  const shadowDistance = colorDistance((a.shadow as { color?: unknown } | undefined)?.color, (b.shadow as { color?: unknown } | undefined)?.color) ?? 0;
  const maxDistance = Math.max(fillDistance, strokeDistance, shadowDistance);
  if (maxDistance <= 0) return 0;
  return Math.max(1, Math.min(200, Math.ceil(maxDistance / 24) - 1));
}

export function resolveBlendPairSteps(a: BlendEndpoint, b: BlendEndpoint, fallbackSteps: number, options: BlendOptions = {}): number {
  if (options.spacingMode === 'specifiedDistance') {
    const distancePx = numberOr(options.distancePx, 0);
    if (distancePx <= 0) return 0;
    const intervals = Math.max(1, Math.round(endpointDistance(a, b) / distancePx));
    return Math.max(0, Math.min(200, intervals - 1));
  }
  if (options.spacingMode === 'smoothColor') return resolveSmoothColorSteps(a, b);
  return Math.max(0, Math.min(200, Math.floor(fallbackSteps)));
}

export function buildBlendProps(a: BlendEndpoint, b: BlendEndpoint, t: number, options: BlendOptions = {}): Record<string, unknown> {
  const props: Record<string, unknown> = {
    left: lerp(numberOr(a.left, 0), numberOr(b.left, 0), t),
    top: lerp(numberOr(a.top, 0), numberOr(b.top, 0), t),
    width: lerp(numberOr(a.width, 0), numberOr(b.width, 0), t),
    height: lerp(numberOr(a.height, 0), numberOr(b.height, 0), t),
    scaleX: lerp(numberOr(a.scaleX, 1), numberOr(b.scaleX, 1), t),
    scaleY: lerp(numberOr(a.scaleY, 1), numberOr(b.scaleY, 1), t),
    skewX: lerp(numberOr(a.skewX, 0), numberOr(b.skewX, 0), t),
    skewY: lerp(numberOr(a.skewY, 0), numberOr(b.skewY, 0), t),
    angle: options.orientation === 'path' ? endpointAngle(a, b) : blendAngle(a.angle, b.angle, t),
    opacity: lerp(numberOr(a.opacity, 1), numberOr(b.opacity, 1), t),
    strokeWidth: lerp(numberOr(a.strokeWidth, 1), numberOr(b.strokeWidth, 1), t),
    fill: blendColor(a.fill, b.fill, t),
    stroke: blendColor(a.stroke, b.stroke, t),
  };

  assignOptionalNumberProps(props, a, b, t);

  const dash = blendNumberArray(a.strokeDashArray, b.strokeDashArray, t);
  if (dash) props.strokeDashArray = dash;

  const shadow = blendShadow(a.shadow, b.shadow, t);
  if (shadow) props.shadow = shadow;

  if (typeof a.strokeLineCap === 'string' && typeof b.strokeLineCap === 'string') props.strokeLineCap = t < 0.5 ? a.strokeLineCap : b.strokeLineCap;
  if (typeof a.strokeLineJoin === 'string' && typeof b.strokeLineJoin === 'string') props.strokeLineJoin = t < 0.5 ? a.strokeLineJoin : b.strokeLineJoin;
  if (typeof a.globalCompositeOperation === 'string' && typeof b.globalCompositeOperation === 'string') props.globalCompositeOperation = t < 0.5 ? a.globalCompositeOperation : b.globalCompositeOperation;

  return props;
}


export function buildBlendInsertPlan(endpointIndexes: number[], steps: number | number[]): number[] {
  if (endpointIndexes.length < 2) return [];
  const plan: number[] = [];
  for (let pairIndex = 0; pairIndex < endpointIndexes.length - 1; pairIndex++) {
    const pairSteps = Array.isArray(steps) ? Math.max(0, Math.floor(steps[pairIndex] ?? 0)) : Math.max(0, Math.floor(steps));
    if (pairSteps < 1) continue;
    const baseIndex = Math.min(endpointIndexes[pairIndex], endpointIndexes[pairIndex + 1]);
    const priorInsertionsBeforePair = plan.filter(index => index <= baseIndex).length;
    for (let stepIndex = 1; stepIndex <= pairSteps; stepIndex++) {
      plan.push(baseIndex + priorInsertionsBeforePair + stepIndex);
    }
  }
  return plan;
}

export function buildBlendMetadata(pairIndex: number, stepIndex: number, stepsInPair: number, options: BlendOptions = {}, sourceIds: [string, string] = ['', '']): BlendStepMetadata {
  const blendId = sourceIds[0] && sourceIds[1]
    ? `${options.reverse === true ? 'reverse' : 'forward'}:${sourceIds[0]}→${sourceIds[1]}:${pairIndex}`
    : `${options.reverse === true ? 'reverse' : 'forward'}:${pairIndex}`;
  return {
    kind: 'blendStep',
    blendId,
    sourceIds,
    pairIndex,
    stepIndex,
    stepsInPair,
    t: stepsInPair > 0 ? stepIndex / (stepsInPair + 1) : 0,
    spacingMode: options.spacingMode ?? 'specifiedSteps',
    orientation: options.orientation ?? 'page',
    reverse: options.reverse === true,
  };
}

function rebuildBlendMetadata(metadata: BlendStepMetadata, updates: Partial<Pick<BlendStepMetadata, 'sourceIds' | 'stepIndex' | 'reverse'>> = {}): BlendStepMetadata {
  return buildBlendMetadata(
    metadata.pairIndex,
    updates.stepIndex ?? metadata.stepIndex,
    metadata.stepsInPair,
    { spacingMode: metadata.spacingMode, orientation: metadata.orientation, reverse: updates.reverse ?? metadata.reverse },
    updates.sourceIds ?? metadata.sourceIds,
  );
}

export function resolveBlendPairStepCounts(endpoints: BlendEndpoint[], steps: number, options: BlendOptions = {}): number[] {
  const ordered = orderedBlendEndpoints(endpoints, options);
  if (ordered.length < 2) return [];
  return ordered.slice(0, -1).map((start, index) => resolveBlendPairSteps(start, ordered[index + 1], steps, options));
}

export function estimateBlendStepCount(endpoints: BlendEndpoint[], steps: number, options: BlendOptions = {}): number {
  return resolveBlendPairStepCounts(endpoints, steps, options).reduce((sum, count) => sum + count, 0);
}

export function buildBlendSequence(endpoints: BlendEndpoint[], steps: number, options: BlendOptions = {}): Record<string, unknown>[] {
  const ordered = orderedBlendEndpoints(endpoints, options);
  const pairStepCounts = resolveBlendPairStepCounts(endpoints, steps, options);
  if (ordered.length < 2) return [];
  const sequence: Record<string, unknown>[] = [];
  for (let pairIndex = 0; pairIndex < ordered.length - 1; pairIndex++) {
    const start = ordered[pairIndex];
    const end = ordered[pairIndex + 1];
    const pairSteps = pairStepCounts[pairIndex] ?? 0;
    for (let stepIndex = 1; stepIndex <= pairSteps; stepIndex++) {
      sequence.push(buildBlendProps(start, end, stepIndex / (pairSteps + 1), options));
    }
  }
  return sequence;
}

export async function blendObjectsOnCanvas(canvas: fabric.Canvas, objects: fabric.FabricObject[], steps: number, options: BlendOptions = {}): Promise<fabric.FabricObject[]> {
  if (objects.length < 2) return [];
  const all = canvas.getObjects();
  for (const object of objects) assignObjectId(object);
  const sorted = orderedBlendEndpoints([...objects].sort((x, y) => all.indexOf(x) - all.indexOf(y)), options);
  const pairSteps = resolveBlendPairStepCounts(sorted as unknown as BlendEndpoint[], steps, options);
  const insertPlan = buildBlendInsertPlan(sorted.map(object => all.indexOf(object)), pairSteps);
  const created: fabric.FabricObject[] = [];
  for (let pairIndex = 0; pairIndex < sorted.length - 1; pairIndex++) {
    const A = sorted[pairIndex];
    const B = sorted[pairIndex + 1];
    const stepsForPair = pairSteps[pairIndex] ?? 0;
    for (let stepIndex = 1; stepIndex <= stepsForPair; stepIndex++) {
      const metadata = buildBlendMetadata(pairIndex, stepIndex, stepsForPair, options, [String((A as { _id?: string })._id ?? ''), String((B as { _id?: string })._id ?? '')]);
      const object = await A.clone();
      object.set({
        ...buildBlendProps(A as unknown as BlendEndpoint, B as unknown as BlendEndpoint, metadata.t, options),
        __blend: metadata,
      });
      object.setCoords();
      canvas.add(object);
      const insertIndex = insertPlan[created.length];
      if (Number.isFinite(insertIndex)) canvas.moveObjectTo(object, insertIndex);
      created.push(object);
    }
  }
  return created;
}

/** Blend `steps` intermediate copies between each adjacent selected object. */
export async function blendSelection(steps: number, options: BlendOptions = {}): Promise<number> {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const created = await blendObjectsOnCanvas(canvas, canvas.getActiveObjects(), steps, options);
  if (created.length === 0) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return created.length;
}

function selectBlendObjects(objects: fabric.FabricObject[]): number {
  const canvas = getCanvas();
  if (!canvas || objects.length === 0) return 0;
  canvas.discardActiveObject();
  canvas.setActiveObject(objects.length === 1 ? objects[0] : new fabric.ActiveSelection(objects, { canvas }));
  canvas.requestRenderAll();
  return objects.length;
}

export function selectBlendSteps(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  return selectBlendObjects(canvas.getObjects().filter(isBlendStepObject));
}

function activeBlendLookup(): { blendIds: Set<string>; sourceIds: Set<string>; activeObjectIds: Set<string> } {
  const canvas = getCanvas();
  const blendIds = new Set<string>();
  const sourceIds = new Set<string>();
  const activeObjectIds = new Set<string>();
  if (!canvas) return { blendIds, sourceIds, activeObjectIds };
  for (const object of canvas.getActiveObjects()) {
    const objectId = String((object as { _id?: string })._id ?? '');
    if (objectId) activeObjectIds.add(objectId);
    const metadata = getBlendStepMetadata(object);
    if (!metadata) continue;
    if (metadata.blendId) blendIds.add(metadata.blendId);
    for (const sourceId of metadata.sourceIds) if (sourceId) sourceIds.add(sourceId);
  }
  return { blendIds, sourceIds, activeObjectIds };
}

export function selectBlendStepsFromSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const { blendIds, activeObjectIds } = activeBlendLookup();
  if (blendIds.size === 0 && activeObjectIds.size === 0) return 0;
  return selectBlendObjects(canvas.getObjects().filter(object => {
    const metadata = getBlendStepMetadata(object);
    if (!metadata) return false;
    if (blendIds.has(metadata.blendId)) return true;
    return metadata.sourceIds.some(sourceId => activeObjectIds.has(sourceId));
  }));
}

export function selectBlendEndpointsFromSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const { sourceIds } = activeBlendLookup();
  if (sourceIds.size === 0) return 0;
  const endpoints = canvas.getObjects().filter(object => sourceIds.has(String((object as { _id?: string })._id ?? '')));
  return selectBlendObjects(endpoints);
}

export function selectAllBlendEndpoints(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const sourceIds = new Set<string>();
  for (const object of canvas.getObjects()) {
    const metadata = getBlendStepMetadata(object);
    if (!metadata) continue;
    for (const sourceId of metadata.sourceIds) if (sourceId) sourceIds.add(sourceId);
  }
  if (sourceIds.size === 0) return 0;
  return selectBlendObjects(canvas.getObjects().filter(object => sourceIds.has(String((object as { _id?: string })._id ?? ''))));
}

export function selectAllBlendGroups(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const sourceIds = new Set<string>();
  let hasBlendStep = false;
  for (const object of canvas.getObjects()) {
    const metadata = getBlendStepMetadata(object);
    if (!metadata) continue;
    hasBlendStep = true;
    for (const sourceId of metadata.sourceIds) if (sourceId) sourceIds.add(sourceId);
  }
  if (!hasBlendStep) return 0;
  return selectBlendObjects(canvas.getObjects().filter(object => {
    if (isBlendStepObject(object)) return true;
    return sourceIds.has(String((object as { _id?: string })._id ?? ''));
  }));
}

export function selectBlendGroupFromSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const { blendIds, sourceIds, activeObjectIds } = activeBlendLookup();
  if (blendIds.size === 0 && sourceIds.size === 0 && activeObjectIds.size === 0) return 0;
  const matchedBlendIds = new Set(blendIds);
  const matchedSourceIds = new Set(sourceIds);
  for (const object of canvas.getObjects()) {
    const metadata = getBlendStepMetadata(object);
    if (!metadata) continue;
    if (matchedBlendIds.has(metadata.blendId) || metadata.sourceIds.some(sourceId => activeObjectIds.has(sourceId))) {
      if (metadata.blendId) matchedBlendIds.add(metadata.blendId);
      for (const sourceId of metadata.sourceIds) if (sourceId) matchedSourceIds.add(sourceId);
    }
  }
  return selectBlendObjects(canvas.getObjects().filter(object => {
    const metadata = getBlendStepMetadata(object);
    if (metadata) return matchedBlendIds.has(metadata.blendId);
    const objectId = String((object as { _id?: string })._id ?? '');
    return matchedSourceIds.has(objectId) || activeObjectIds.has(objectId);
  }));
}

function blendScopeObjects(scope: 'selection' | 'document'): fabric.FabricObject[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  if (scope === 'document') return canvas.getObjects();
  const active = canvas.getActiveObjects();
  const activeObjectIds = new Set(active.map(object => String((object as { _id?: string })._id ?? '')).filter(Boolean));
  if (activeObjectIds.size === 0) return active;
  const selected = new Set<fabric.FabricObject>(active);
  for (const object of canvas.getObjects()) {
    const metadata = getBlendStepMetadata(object);
    if (metadata?.sourceIds.some(sourceId => activeObjectIds.has(sourceId))) selected.add(object);
  }
  return [...selected];
}

function relatedBlendStepObjects(scope: 'selection' | 'document'): fabric.FabricObject[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  if (scope === 'document') return canvas.getObjects().filter(isBlendStepObject);
  const active = canvas.getActiveObjects();
  const { blendIds, activeObjectIds } = activeBlendLookup();
  if (blendIds.size === 0 && activeObjectIds.size === 0) return active.filter(isBlendStepObject);
  return canvas.getObjects().filter(object => {
    const metadata = getBlendStepMetadata(object);
    if (!metadata) return false;
    if (blendIds.has(metadata.blendId)) return true;
    return metadata.sourceIds.some(sourceId => activeObjectIds.has(sourceId));
  });
}

function endpointById(objects: fabric.FabricObject[], id: string): fabric.FabricObject | undefined {
  return objects.find(object => String((object as { _id?: string })._id ?? '') === id);
}

function isOrphanBlendStep(object: fabric.FabricObject, objects: fabric.FabricObject[]): boolean {
  const metadata = getBlendStepMetadata(object);
  if (!metadata) return false;
  if (!metadata.sourceIds[0] || !metadata.sourceIds[1]) return true;
  return !endpointById(objects, metadata.sourceIds[0]) || !endpointById(objects, metadata.sourceIds[1]);
}

export function selectOrphanBlendSteps(scope: 'selection' | 'document' = 'document'): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getObjects();
  return selectBlendObjects(blendScopeObjects(scope).filter(object => isOrphanBlendStep(object, objects)));
}

export function updateBlendSteps(scope: 'selection' | 'document' = 'selection'): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getObjects();
  const targets = blendScopeObjects(scope).filter(isBlendStepObject);
  let updated = 0;
  for (const object of targets) {
    const metadata = getBlendStepMetadata(object);
    if (!metadata || !metadata.sourceIds[0] || !metadata.sourceIds[1]) continue;
    const start = endpointById(objects, metadata.sourceIds[0]);
    const end = endpointById(objects, metadata.sourceIds[1]);
    if (!start || !end) continue;
    object.set({
      ...buildBlendProps(start as unknown as BlendEndpoint, end as unknown as BlendEndpoint, metadata.t, {
        spacingMode: metadata.spacingMode,
        orientation: metadata.orientation,
        reverse: metadata.reverse,
      }),
      __blend: metadata,
    });
    object.setCoords();
    updated += 1;
  }
  if (updated === 0) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return updated;
}

export function relinkBlendEndpointFromSelection(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const active = canvas.getActiveObjects();
  if (active.length !== 2) return 0;
  const objects = canvas.getObjects();
  const [first, second] = active;
  const firstId = String((first as { _id?: string })._id ?? '');
  const secondId = String((second as { _id?: string })._id ?? '');
  const firstUsed = firstId ? objects.some(object => getBlendStepMetadata(object)?.sourceIds.includes(firstId)) : false;
  const secondUsed = secondId ? objects.some(object => getBlendStepMetadata(object)?.sourceIds.includes(secondId)) : false;
  if (firstUsed === secondUsed) return 0;
  const oldEndpoint = firstUsed ? first : second;
  const replacement = firstUsed ? second : first;
  const oldId = String((oldEndpoint as { _id?: string })._id ?? '');
  if (!oldId) return 0;
  assignObjectId(replacement);
  const replacementId = String((replacement as { _id?: string })._id ?? '');
  if (!replacementId || replacementId === oldId) return 0;
  let updated = 0;
  for (const object of objects) {
    const metadata = getBlendStepMetadata(object);
    if (!metadata || !metadata.sourceIds.includes(oldId)) continue;
    const sourceIds: [string, string] = [
      metadata.sourceIds[0] === oldId ? replacementId : metadata.sourceIds[0],
      metadata.sourceIds[1] === oldId ? replacementId : metadata.sourceIds[1],
    ];
    if (!sourceIds[0] || !sourceIds[1]) continue;
    const start = endpointById(objects, sourceIds[0]);
    const end = endpointById(objects, sourceIds[1]);
    if (!start || !end) continue;
    const nextMetadata = buildBlendMetadata(metadata.pairIndex, metadata.stepIndex, metadata.stepsInPair, {
      spacingMode: metadata.spacingMode,
      orientation: metadata.orientation,
      reverse: metadata.reverse,
    }, sourceIds);
    object.set({
      ...buildBlendProps(start as unknown as BlendEndpoint, end as unknown as BlendEndpoint, nextMetadata.t, {
        spacingMode: nextMetadata.spacingMode,
        orientation: nextMetadata.orientation,
        reverse: nextMetadata.reverse,
      }),
      __blend: nextMetadata,
    });
    object.setCoords();
    updated += 1;
  }
  if (updated === 0) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return updated;
}

export async function applyBlendOptionsToSelection(steps: number, options: BlendOptions = {}, scope: 'selection' | 'document' = 'selection'): Promise<number> {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getObjects();
  const targets = relatedBlendStepObjects(scope);
  if (targets.length === 0) return 0;
  const groups = new Map<string, BlendStepMetadata>();
  for (const object of targets) {
    const metadata = getBlendStepMetadata(object);
    if (!metadata || !metadata.sourceIds[0] || !metadata.sourceIds[1]) continue;
    if (!endpointById(objects, metadata.sourceIds[0]) || !endpointById(objects, metadata.sourceIds[1])) continue;
    groups.set(metadata.blendId || metadata.sourceIds.join('→'), metadata);
  }
  if (groups.size === 0) return 0;
  const validGroupIds = new Set(groups.keys());
  const removableTargets = targets.filter(object => {
    const metadata = getBlendStepMetadata(object);
    return metadata ? validGroupIds.has(metadata.blendId || metadata.sourceIds.join('→')) : false;
  });
  for (const object of removableTargets) canvas.remove(object);
  const created: fabric.FabricObject[] = [];
  for (const metadata of groups.values()) {
    const start = endpointById(objects, metadata.sourceIds[0]);
    const end = endpointById(objects, metadata.sourceIds[1]);
    if (!start || !end) continue;
    const ordered = orderedBlendEndpoints([start, end], options);
    const sourceIds: [string, string] = [String((ordered[0] as { _id?: string })._id ?? ''), String((ordered[1] as { _id?: string })._id ?? '')];
    const stepsForPair = resolveBlendPairSteps(ordered[0] as unknown as BlendEndpoint, ordered[1] as unknown as BlendEndpoint, steps, options);
    const insertBase = Math.min(canvas.getObjects().indexOf(start), canvas.getObjects().indexOf(end));
    for (let stepIndex = 1; stepIndex <= stepsForPair; stepIndex++) {
      const nextMetadata = buildBlendMetadata(metadata.pairIndex, stepIndex, stepsForPair, options, sourceIds);
      const object = await ordered[0].clone();
      object.set({
        ...buildBlendProps(ordered[0] as unknown as BlendEndpoint, ordered[1] as unknown as BlendEndpoint, nextMetadata.t, options),
        __blend: nextMetadata,
      });
      object.setCoords();
      canvas.add(object);
      canvas.moveObjectTo(object, insertBase + stepIndex);
      created.push(object);
    }
  }
  canvas.discardActiveObject();
  if (created.length > 0) canvas.setActiveObject(created.length === 1 ? created[0] : new fabric.ActiveSelection(created, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return created.length || removableTargets.length;
}

export function reverseBlendSteps(scope: 'selection' | 'document' = 'selection'): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getObjects();
  const targets = blendScopeObjects(scope).filter(isBlendStepObject);
  let reversed = 0;
  for (const object of targets) {
    const metadata = getBlendStepMetadata(object);
    if (!metadata || !metadata.sourceIds[0] || !metadata.sourceIds[1]) continue;
    const sourceIds: [string, string] = [metadata.sourceIds[1], metadata.sourceIds[0]];
    const nextMetadata = rebuildBlendMetadata(metadata, {
      sourceIds,
      stepIndex: Math.max(1, metadata.stepsInPair - metadata.stepIndex + 1),
      reverse: !metadata.reverse,
    });
    const start = endpointById(objects, nextMetadata.sourceIds[0]);
    const end = endpointById(objects, nextMetadata.sourceIds[1]);
    if (!start || !end) continue;
    object.set({
      ...buildBlendProps(start as unknown as BlendEndpoint, end as unknown as BlendEndpoint, nextMetadata.t, {
        spacingMode: nextMetadata.spacingMode,
        orientation: nextMetadata.orientation,
        reverse: nextMetadata.reverse,
      }),
      __blend: nextMetadata,
    });
    object.setCoords();
    reversed += 1;
  }
  if (reversed === 0) return 0;
  canvas.requestRenderAll();
  pushHistory();
  return reversed;
}

export function releaseBlendSteps(scope: 'selection' | 'document' = 'selection'): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const targets = blendScopeObjects(scope).filter(isBlendStepObject);
  if (targets.length === 0) return 0;
  for (const object of targets) canvas.remove(object);
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  pushHistory();
  return targets.length;
}

export function removeOrphanBlendSteps(scope: 'selection' | 'document' = 'document'): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const objects = canvas.getObjects();
  const targets = blendScopeObjects(scope).filter(object => isOrphanBlendStep(object, objects));
  if (targets.length === 0) return 0;
  for (const object of targets) canvas.remove(object);
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  pushHistory();
  return targets.length;
}

export function expandBlendSteps(scope: 'selection' | 'document' = 'selection'): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const targets = blendScopeObjects(scope).filter(isBlendStepObject);
  if (targets.length === 0) return 0;
  for (const object of targets) object.set('__blend', undefined);
  canvas.requestRenderAll();
  pushHistory();
  return targets.length;
}
