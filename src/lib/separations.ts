// Separations — true spot-colour plate workflow.
//
// A "plate" is one separable ink in the document: a named spot colour
// (PANTONE 185 C, Spot Varnish, …), a process colour used by vector paint
// (hex / CMYK object), or — reported for honesty, never exported — the
// gradients/patterns bucket, which always prints as process.
//
// Three layers:
//   1. collectDocumentColors(canvas) — the inventory the dialog lists.
//   2. isolatePlate(canvas, key)     — non-destructive per-plate preview:
//      objects that don't carry the plate's paint get visible=false at every
//      nesting depth; a restore() puts every flag back verbatim. Renders
//      (and therefore PNG export) skip invisible objects.
//   3. exportPlates(keys, format)    — per-plate files through the EXISTING
//      exporters: SVG comes from canvas.toSVG() exactly like io.exportSVG(),
//      with non-plate top-level objects temporarily flagged excludeFromExport
//      (StaticCanvas.toSVG skips them) and non-plate group children marked
//      visible=false (fabric serialises them as visibility:hidden). Every
//      toggle is restored in a finally block. PNG renders the isolated
//      canvas at 2x via canvas.toDataURL. Downloads route through
//      io.download / io.downloadDataURL so plate files behave exactly like
//      every other export in the app.
//
// Colour classification reuses the preflight predicates from selectionOps
// (isSpotPaint / cmykPaintChannels / rgbPaintChannels / parseRgbString) so a
// colour the Preflight auditor calls a spot ink is the same colour this
// workflow separates.
//
// DEFERRED (honest scoping): DXF and PDF plate export. io2.exportDXF and
// io2.exportPDFReal both read the live canvas through getCanvas() and accept
// no custom content, so plates cannot ride them without modifying
// parallel-owned plumbing. SVG + PNG ship now; DXF/PDF remain a follow-up
// once an exporter accepts explicit object sets.
//
// Known limitation: a group mixing plate A and plate B members exports with
// the non-plate members serialised as visibility:hidden (visually correct,
// but present in the file) — non-destructive isolation cannot split a group.

import type * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { download, downloadDataURL } from './io';
import { isSelectableArtwork, isSpotPaint, cmykPaintChannels, rgbPaintChannels, parseRgbString, normalizeString } from './selectionOps';
import { gradientSignature, patternSignature } from './selection/selectByAttribute';

/** Anything paint-ish living on an object, including group members. */
type SeparationsObject = fabric.FabricObject & {
  _objects?: fabric.FabricObject[];
  excludeFromExport?: boolean;
};

export type PlateKind = 'spot' | 'process' | 'gradient';

export interface PlateInfo {
  /** Stable plate id, e.g. 'spot:pantone 185 c' or 'process:#ff0000'. */
  key: string;
  kind: PlateKind;
  /** Display name — spot ink name, hex, or CMYK percentages. */
  name: string;
  /** Preview chip colour (approximate for CMYK / channel-less spots). */
  hex: string;
  /** Number of top-level objects carrying this plate's paint. */
  objects: number;
  /** False for the gradients/patterns bucket — process-only, never separated. */
  exportable: boolean;
}

const GRADIENT_PLATE_KEY = 'special:gradient';
const SPOT_FALLBACK_HEX = '#9ca3af';

/* ------------------------------------------------------------------ *
 * 1. Paint → plate classification (pure)
 * ------------------------------------------------------------------ */

function channelsToHex(channels: { r: number; g: number; b: number }): string {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(channels.r)}${part(channels.g)}${part(channels.b)}`;
}

/** Naive (non-colour-managed) CMYK → RGB, only good enough for chips. */
function cmykToHex(c: number, m: number, y: number, k: number): string {
  const f = (channel: number) => (1 - Math.min(100, Math.max(0, channel)) / 100) * (1 - Math.min(100, Math.max(0, k)) / 100) * 255;
  return channelsToHex({ r: f(c), g: f(m), b: f(y) });
}

/** Approximate on-screen colour of any paint value, for the dialog chip. */
export function paintHex(value: unknown): string {
  if (typeof value === 'string') {
    const channels = parseRgbString(value);
    return channels ? channelsToHex(channels) : SPOT_FALLBACK_HEX;
  }
  if (!value || typeof value !== 'object') return SPOT_FALLBACK_HEX;
  const rgb = rgbPaintChannels(value);
  if (rgb) return channelsToHex(rgb);
  const cmyk = cmykPaintChannels(value);
  if (cmyk) return cmykToHex(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
  return SPOT_FALLBACK_HEX;
}

/** Display-case paint name (paintName lowercases; keys still use that form). */
function rawPaintName(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'spotName', 'swatchName', 'colorName', 'ink']) {
    const raw = record[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

/** Classify one fill/stroke value into a plate descriptor, or null for none. */
export function plateFromPaint(paint: unknown): Omit<PlateInfo, 'objects'> | null {
  if (paint == null) return null;
  if (typeof paint === 'string') {
    const normalized = paint.trim().toLowerCase();
    if (!normalized || normalized === 'transparent' || normalized === 'none') return null;
    const channels = parseRgbString(normalized);
    if (!channels) return null;
    const hex = channelsToHex(channels);
    return { key: `process:${hex}`, kind: 'process', name: hex.toUpperCase(), hex, exportable: true };
  }
  if (typeof paint !== 'object') return null;
  if (gradientSignature(paint) || patternSignature(paint)) {
    return { key: GRADIENT_PLATE_KEY, kind: 'gradient', name: 'Gradients & patterns', hex: '#8a8a98', exportable: false };
  }
  if (isSpotPaint(paint)) {
    const rawName = rawPaintName(paint);
    const name = rawName || 'Unnamed spot';
    return { key: `spot:${name.toLowerCase()}`, kind: 'spot', name, hex: paintHex(paint), exportable: true };
  }
  const cmyk = cmykPaintChannels(paint);
  if (cmyk) {
    const parts = [cmyk.c, cmyk.m, cmyk.y, cmyk.k].map((v) => Math.round(v));
    return { key: `process:cmyk:${parts.join(',')}`, kind: 'process', name: `CMYK ${parts.join(' ')}`, hex: cmykToHex(parts[0], parts[1], parts[2], parts[3]), exportable: true };
  }
  const rgb = rgbPaintChannels(paint);
  if (rgb) {
    const hex = channelsToHex(rgb);
    return { key: `process:${hex}`, kind: 'process', name: hex.toUpperCase(), hex, exportable: true };
  }
  const record = paint as Record<string, unknown>;
  const mode = normalizeString(record.mode) ?? normalizeString(record.type);
  if (mode === 'rgb' || mode === 'srgb' || mode === 'screen') {
    return { key: 'process:rgb', kind: 'process', name: 'RGB', hex: '#808080', exportable: true };
  }
  return null;
}

/**
 * Groups are pure containers in fabric v6: their own fill/stroke never
 * render (the default Group fill is a vestigial "rgb(0,0,0)"), so plate
 * classification must read only their children — otherwise every group
 * would phantom-add a black process plate.
 */
function isPaintContainer(object: fabric.FabricObject): boolean {
  const type = (object as { type?: string }).type;
  return type === 'group' || type === 'activeselection';
}

/** Collect every fill/stroke value on an object tree (groups recursed). */
function collectObjectPaints(object: fabric.FabricObject, out: unknown[]): void {
  const record = object as SeparationsObject & { fill?: unknown; stroke?: unknown };
  if (!isPaintContainer(record)) {
    if (record.fill !== undefined && record.fill !== null) out.push(record.fill);
    if (record.stroke !== undefined && record.stroke !== null) out.push(record.stroke);
  }
  for (const child of record._objects ?? []) collectObjectPaints(child, out);
}

/**
 * Inventory every separable colour in the document. Ordering is deliberate:
 * spot plates first (document order — they're the headline of a separation),
 * then process plates by object count, then the gradients/patterns note.
 */
export function collectDocumentColors(canvas: fabric.Canvas | null): PlateInfo[] {
  if (!canvas) return [];
  const plates = new Map<string, PlateInfo>();
  const order: string[] = [];
  for (const object of canvas.getObjects()) {
    // Same artwork gate as the preflight selectors: overlays and locked
    // chrome (excludeFromExport / selectable=false) are not document ink.
    if (!isSelectableArtwork(object)) continue;
    const paints: unknown[] = [];
    collectObjectPaints(object, paints);
    const seen = new Set<string>();
    for (const paint of paints) {
      const plate = plateFromPaint(paint);
      if (!plate || seen.has(plate.key)) continue;
      seen.add(plate.key);
      const existing = plates.get(plate.key);
      if (existing) existing.objects += 1;
      else {
        order.push(plate.key);
        plates.set(plate.key, { ...plate, objects: 1 });
      }
    }
  }
  const indexOf = (key: string) => order.indexOf(key);
  const spots = order.filter((key) => plates.get(key)!.kind === 'spot');
  const process = order
    .filter((key) => plates.get(key)!.kind === 'process')
    .sort((a, b) => plates.get(b)!.objects - plates.get(a)!.objects || indexOf(a) - indexOf(b));
  const gradients = order.filter((key) => plates.get(key)!.kind === 'gradient');
  return [...spots, ...process, ...gradients].map((key) => plates.get(key)!);
}

/** Does this object (or any group member) carry the plate's paint? */
export function objectMatchesPlate(object: fabric.FabricObject, key: string): boolean {
  const record = object as SeparationsObject & { fill?: unknown; stroke?: unknown };
  if (!isPaintContainer(record)) {
    if (plateFromPaint(record.fill)?.key === key) return true;
    if (plateFromPaint(record.stroke)?.key === key) return true;
  }
  return (record._objects ?? []).some((child) => objectMatchesPlate(child, key));
}

/* ------------------------------------------------------------------ *
 * 2. Non-destructive plate isolation (preview + PNG feed)
 * ------------------------------------------------------------------ */

export interface PlateIsolationHandle {
  readonly plateKey: string | null;
  /** Restore every visibility flag this isolation changed. Idempotent. */
  restore(): void;
}

let activeIsolation: PlateIsolationHandle | null = null;

/** Restore whatever plate isolation is currently applied, if any. */
export function restorePlateIsolation(): void {
  activeIsolation?.restore();
}

function childrenOf(object: fabric.FabricObject): fabric.FabricObject[] {
  return (object as SeparationsObject)._objects ?? [];
}

/**
 * Hide everything that isn't on the plate. `key === null` clears any active
 * isolation without hiding anything (used when preview is switched off).
 * Only the `visible` flag is touched — nothing is removed, restyled, or
 * pushed to history — and restore() puts each flag back verbatim.
 */
export function isolatePlate(canvas: fabric.Canvas | null, key: string | null): PlateIsolationHandle {
  restorePlateIsolation();
  const snapshot: Array<[fabric.FabricObject, boolean]> = [];
  const handle: PlateIsolationHandle = {
    plateKey: key,
    restore() {
      if (activeIsolation !== handle) return;
      activeIsolation = null;
      for (const [object, visible] of snapshot) object.visible = visible;
      canvas?.requestRenderAll();
    },
  };
  activeIsolation = handle;
  if (!canvas || !key) return handle;
  const walk = (object: fabric.FabricObject): void => {
    snapshot.push([object, object.visible]);
    if (!objectMatchesPlate(object, key)) object.visible = false;
    for (const child of childrenOf(object)) walk(child);
  };
  canvas.getObjects().forEach(walk);
  canvas.requestRenderAll();
  return handle;
}

/* ------------------------------------------------------------------ *
 * 3. Per-plate export plumbing
 * ------------------------------------------------------------------ */

interface ExportStateSnapshot {
  visible: boolean;
  excludeFromExport: boolean;
}

/**
 * SVG markup for one plate, produced by the canvas's own toSVG() — the same
 * serialiser io.exportSVG() uses. Non-plate top-level objects are dropped via
 * a temporary excludeFromExport flag; non-plate children inside surviving
 * groups render visibility:hidden. Everything is restored in finally.
 */
export function plateSVG(canvas: fabric.Canvas | null, key: string): string {
  if (!canvas) return '';
  if (!canvas.getObjects().some((object) => isSelectableArtwork(object) && objectMatchesPlate(object, key))) return '';
  const snapshot = new Map<fabric.FabricObject, ExportStateSnapshot>();
  try {
    const mark = (object: fabric.FabricObject, depth: number): void => {
      const target = object as SeparationsObject;
      if (!objectMatchesPlate(object, key)) {
        snapshot.set(object, { visible: object.visible, excludeFromExport: !!target.excludeFromExport });
        if (depth === 0) target.excludeFromExport = true;
        else object.visible = false;
      }
      for (const child of childrenOf(object)) mark(child, depth + 1);
    };
    canvas.getObjects().forEach((object) => mark(object, 0));
    return canvas.toSVG();
  } finally {
    for (const [object, state] of snapshot) {
      object.visible = state.visible;
      (object as SeparationsObject).excludeFromExport = state.excludeFromExport;
    }
    canvas.requestRenderAll();
  }
}

/** PNG data-URL for one plate, rendered from the isolated canvas at `multiplier`. */
export function platePNG(canvas: fabric.Canvas | null, key: string, multiplier = 2): string {
  if (!canvas) return '';
  if (!canvas.getObjects().some((object) => isSelectableArtwork(object) && objectMatchesPlate(object, key))) return '';
  const isolation = isolatePlate(canvas, key);
  try {
    return canvas.toDataURL({ format: 'png', multiplier });
  } finally {
    isolation.restore();
  }
}

export type PlateExportFormat = 'svg' | 'png';
export type PlateExportStatus = 'exported' | 'skipped';
export type PlateSkipReason = 'not-found' | 'not-exportable' | 'empty';

export interface PlateExportResult {
  key: string;
  name: string;
  fileName: string;
  status: PlateExportStatus;
  /** Stable token when status === 'skipped'; the dialog maps it to t() text. */
  reason?: PlateSkipReason;
}

/** Browsers throttle bursts of downloads; stagger extras slightly. */
const DOWNLOAD_STAGGER_MS = 300;

function scheduleDownload(index: number, run: () => void): void {
  if (index <= 0) run();
  else setTimeout(run, index * DOWNLOAD_STAGGER_MS);
}

function sanitizeFileToken(token: string, fallback: string): string {
  const cleaned = token.replace(/[\\/:*?"<>|#]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

function plateFileName(plate: PlateInfo, format: PlateExportFormat, baseName: string): string {
  return `${sanitizeFileToken(baseName, 'design')}-${sanitizeFileToken(plate.name, plate.key)}.${format}`;
}

/**
 * Export plates as individual files. Sequential downloads (no zip in this
 * app — same as the existing multi-export flows), staggered so the browser
 * doesn't swallow them. Returns one result per requested key.
 */
export function exportPlates(keys: string[], format: PlateExportFormat, opts?: { baseName?: string; multiplier?: number }): PlateExportResult[] {
  const canvas = getCanvas();
  const baseName = opts?.baseName?.trim() || 'design';
  const multiplier = opts?.multiplier ?? 2;
  const inventory = new Map(collectDocumentColors(canvas).map((plate) => [plate.key, plate]));
  const results: PlateExportResult[] = [];
  let downloadIndex = 0;
  for (const key of keys) {
    const plate = inventory.get(key);
    if (!plate) {
      results.push({ key, name: key, fileName: '', status: 'skipped', reason: 'not-found' });
      continue;
    }
    if (!plate.exportable) {
      results.push({ key, name: plate.name, fileName: '', status: 'skipped', reason: 'not-exportable' });
      continue;
    }
    const fileName = plateFileName(plate, format, baseName);
    if (format === 'svg') {
      const markup = plateSVG(canvas, key);
      if (!markup) {
        results.push({ key, name: plate.name, fileName: '', status: 'skipped', reason: 'empty' });
        continue;
      }
      scheduleDownload(downloadIndex++, () => download(fileName, markup, 'image/svg+xml'));
    } else {
      const dataUrl = platePNG(canvas, key, multiplier);
      if (!dataUrl) {
        results.push({ key, name: plate.name, fileName: '', status: 'skipped', reason: 'empty' });
        continue;
      }
      scheduleDownload(downloadIndex++, () => downloadDataURL(fileName, dataUrl));
    }
    results.push({ key, name: plate.name, fileName, status: 'exported' });
  }
  return results;
}

/** Export a single plate. Convenience wrapper over exportPlates. */
export function exportPlate(key: string, format: PlateExportFormat, opts?: { baseName?: string; multiplier?: number }): PlateExportResult | null {
  return exportPlates([key], format, opts)[0] ?? null;
}
