/**
 * Extended I/O v3 — raster image import, optimized SVG export, multi-page PDF
 * tiling, and a rough image-trace utility.
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { exportSVG, importSVGString } from './io';
import { printHtmlDocument } from './printer';
import { toast } from './toast';
import { t } from './i18n';
import { logger } from './debug';
import { findFormatByExt, listImporters } from './formats';
// Vite-native Web Worker import — the `?worker` suffix produces a class that
// instantiates the bundled worker chunk. Image trace walks every pixel of a
// raster (up to 256×256) and on larger inputs that's enough to stall the UI;
// running it off the main thread keeps the editor responsive.
import TraceWorker from './workers/trace.worker.ts?worker';

/* ----------------------------------------------------------------- */
/* Assets registry (persisted in localStorage as `vector.assets`)    */
/* ----------------------------------------------------------------- */

export interface StoredAsset {
  id: string;
  kind: 'image' | 'svg';
  name: string;
  /** Base64 data URL of the original (raster) or raw SVG string for vectors. */
  data: string;
  /** Tiny base64 PNG thumbnail for the panel. */
  thumb: string;
  addedAt: number;
}

const ASSET_KEY = 'vector.assets';
const ASSET_LIMIT = 12;

export function getStoredAssets(): StoredAsset[] {
  try {
    const raw = localStorage.getItem(ASSET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredAsset[]) : [];
  } catch {
    return [];
  }
}

export function saveAsset(asset: StoredAsset) {
  const list = getStoredAssets().filter((a) => a.id !== asset.id);
  list.unshift(asset);
  while (list.length > ASSET_LIMIT) list.pop();
  try {
    localStorage.setItem(ASSET_KEY, JSON.stringify(list));
  } catch {
    /* quota exceeded — silently drop */
  }
  window.dispatchEvent(new CustomEvent('vector:assets-changed'));
}

export function removeAsset(id: string) {
  const list = getStoredAssets().filter((a) => a.id !== id);
  localStorage.setItem(ASSET_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('vector:assets-changed'));
}

/** Renders a small PNG thumbnail from a source data URL or SVG markup. */
async function makeThumbnail(src: string, isSvg = false): Promise<string> {
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const tw = 64;
      const ratio = img.width > 0 ? img.height / img.width : 1;
      const th = Math.max(16, Math.round(tw * ratio));
      const c = document.createElement('canvas');
      c.width = tw;
      c.height = th;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(img, 0, 0, tw, th);
      }
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    if (isSvg) {
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(src)));
    } else {
      img.src = src;
    }
  });
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/* ----------------------------------------------------------------- */
/* 1. Raster image import                                            */
/* ----------------------------------------------------------------- */

const RASTER_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

export async function importImageFile(
  file: File,
  /**
   * Optional viewport-space cursor coords (clientX/clientY of a drop event).
   * When provided, the imported image is centred on the corresponding canvas
   * point so a drag-drop lands where the user actually let go of the file.
   * Omit to fall back to "centre on visible canvas" (toolbar / menu imports).
   */
  dropAt?: { clientX: number; clientY: number },
): Promise<void> {
  const canvas = getCanvas();
  if (!canvas) return;
  const dataUrl = await readFileAsDataURL(file);
  const img = await fabric.FabricImage.fromURL(dataUrl);

  const cw = canvas.getWidth();
  const ch = canvas.getHeight();
  const iw = img.width ?? 1;
  const ih = img.height ?? 1;

  // Fit within 70% of canvas if larger
  const maxW = cw * 0.7;
  const maxH = ch * 0.7;
  if (iw > maxW || ih > maxH) {
    const s = Math.min(maxW / iw, maxH / ih);
    img.scale(s);
  }

  const sw = (img.width ?? 0) * (img.scaleX ?? 1);
  const sh = (img.height ?? 0) * (img.scaleY ?? 1);

  // Drop-at-cursor: convert clientX/Y → canvas-space via the inverse
  // viewport transform (vpt[0]/[3] = zoom, vpt[4]/[5] = pan), then
  // subtract the canvas element's screen origin. Fabric's getPointer
  // would do this for us but requires a true Event object — we only have
  // numeric coords from the drop handler, so do the math directly.
  let leftMid: number;
  let topMid: number;
  if (dropAt) {
    const el = canvas.upperCanvasEl as HTMLCanvasElement | undefined;
    const rect = el?.getBoundingClientRect();
    const vpt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
    const sx = dropAt.clientX - (rect?.left ?? 0);
    const sy = dropAt.clientY - (rect?.top ?? 0);
    const cx = (sx - vpt[4]) / vpt[0];
    const cy = (sy - vpt[5]) / vpt[3];
    leftMid = cx - sw / 2;
    topMid = cy - sh / 2;
  } else {
    // Centre on visible canvas (toolbar / menu / paste flows).
    leftMid = (cw - sw) / 2;
    topMid = (ch - sh) / 2;
  }
  img.set({ left: leftMid, top: topMid });
  (img as fabric.FabricImage & { _src?: string })._src = dataUrl;

  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.requestRenderAll();
  pushHistory();

  // Add to asset library
  try {
    const thumb = await makeThumbnail(dataUrl, false);
    saveAsset({
      id: `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'image',
      name: file.name || 'image',
      data: dataUrl,
      thumb,
      addedAt: Date.now(),
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Paste an image or SVG from the *system* clipboard (Illustrator's external
 * paste) — distinct from the in-app object clipboard on Ctrl+V. Uses the async
 * Clipboard API: raster image blobs import as images, `image/svg+xml` or text
 * that looks like SVG imports as vectors. Returns 'empty' when the clipboard
 * holds nothing usable, 'failed' if the API is unavailable/blocked, else 'ok'.
 */
export async function pasteFromSystemClipboard(): Promise<'ok' | 'empty' | 'failed'> {
  if (!navigator.clipboard?.read) return 'failed';
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes('image/svg+xml')) {
        const blob = await item.getType('image/svg+xml');
        await importSVGString(await blob.text());
        return 'ok';
      }
      const imgType = item.types.find((ty) => ty.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        await importImageFile(new File([blob], `pasted.${imgType.split('/')[1] || 'png'}`, { type: imgType }));
        return 'ok';
      }
    }
    // Fall back to clipboard text that is actually SVG markup (e.g. Copy as SVG).
    const text = await navigator.clipboard.readText?.();
    if (text && /<svg[\s>]/i.test(text)) { await importSVGString(text); return 'ok'; }
    return 'empty';
  } catch {
    return 'failed';
  }
}

/** Place a previously-stored asset back on the canvas at its center. */
export async function insertAsset(asset: StoredAsset): Promise<void> {
  const canvas = getCanvas();
  if (!canvas) return;
  if (asset.kind === 'image') {
    const img = await fabric.FabricImage.fromURL(asset.data);
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const iw = img.width ?? 1;
    const ih = img.height ?? 1;
    const maxW = cw * 0.7;
    const maxH = ch * 0.7;
    if (iw > maxW || ih > maxH) {
      const s = Math.min(maxW / iw, maxH / ih);
      img.scale(s);
    }
    const sw = (img.width ?? 0) * (img.scaleX ?? 1);
    const sh = (img.height ?? 0) * (img.scaleY ?? 1);
    img.set({ left: (cw - sw) / 2, top: (ch - sh) / 2 });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    pushHistory();
  } else {
    const result = await fabric.loadSVGFromString(asset.data);
    const objs = result.objects.filter(Boolean) as fabric.FabricObject[];
    // Mirror importSVGString — disable objectCaching so zooming stays crisp.
    for (const o of objs) o.set({ objectCaching: false });
    const group = fabric.util.groupSVGElements(objs, result.options);
    group.set({ objectCaching: false });
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const gw = (group.width ?? 0) * (group.scaleX ?? 1);
    const gh = (group.height ?? 0) * (group.scaleY ?? 1);
    group.set({ left: (cw - gw) / 2, top: (ch - gh) / 2 });
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    pushHistory();
  }
}

/* ----------------------------------------------------------------- */
/* 2. Optimized SVG export                                           */
/* ----------------------------------------------------------------- */

/**
 * Strips unused namespace declarations and runs a light pretty-print pass
 * so the output is easier to read and a few bytes smaller.
 */
export function exportSVGOptimized(): string {
  let svg = exportSVG();
  if (!svg) return '';

  // Drop common unused namespaces fabric emits.
  const unused = [
    'xmlns:xlink="http://www.w3.org/1999/xlink"',
    'xmlns:svg="http://www.w3.org/2000/svg"',
    'xml:space="preserve"',
  ];
  for (const a of unused) {
    if (svg.includes(a) && !svg.includes('xlink:')) svg = svg.replace(' ' + a, '');
  }
  if (!/xlink:/.test(svg)) {
    svg = svg.replace(/\s+xmlns:xlink="[^"]*"/g, '');
  }

  // Collapse multiple spaces inside tag wrappers, then pretty-print
  svg = svg.replace(/>\s+</g, '><');
  svg = prettyPrintXML(svg);
  return svg;
}

function prettyPrintXML(xml: string): string {
  const lines: string[] = [];
  let depth = 0;
  const indent = '  ';
  const tokens = xml.split(/(<[^>]+>)/).filter(Boolean);
  for (const tok of tokens) {
    if (!tok.startsWith('<')) {
      const trimmed = tok.trim();
      if (trimmed) lines.push(indent.repeat(depth) + trimmed);
      continue;
    }
    const isClosing = tok.startsWith('</');
    const isSelfClosing = tok.endsWith('/>') || /^<\?/.test(tok) || /^<!--/.test(tok) || /^<!DOCTYPE/i.test(tok);
    if (isClosing) depth = Math.max(0, depth - 1);
    lines.push(indent.repeat(depth) + tok);
    if (!isClosing && !isSelfClosing) depth++;
  }
  return lines.join('\n');
}

/* ----------------------------------------------------------------- */
/* 3. Multi-page (tiled) PDF export via window.print                 */
/* ----------------------------------------------------------------- */

export interface TilePrintOptions {
  /** Tile width in pixels (canvas units). */
  pageW: number;
  /** Tile height in pixels. */
  pageH: number;
  /** Optional explicit grid; if omitted, derived from canvas size. */
  cols?: number;
  rows?: number;
  /** Glue overlap in CANVAS px shared between neighbouring tiles, so the
   *  printed pages can be taped together with a margin. 0 = butt-join. */
  overlapPx?: number;
  /** Optional canvas-space bounds to crop instead of the whole canvas. */
  bounds?: { left: number; top: number; width: number; height: number };
  /** Physical page margin in CSS pixels. */
  marginPx?: number;
}

/**
 * Multi-page PDF helper — each provided SVG becomes one printed page.
 * Falls back to a single empty page if the array is empty. Transport is
 * picked by `printHtmlDocument` (iframe + window.print on the web, native
 * PrintOperation under the Tauri shell).
 */
export function exportPDFMultiPage(svgs: string[]): void {
  const pages = svgs.length ? svgs : [exportSVG()];
  printHtmlDocument({
    title: 'PDF Export',
    // Many pages can take seconds to settle before onload fires the print —
    // keep the iframe alive as long as the pre-refactor code did.
    iframeRemovalMs: 8000,
    css: `
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { page-break-after: always; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
    .page:last-child { page-break-after: auto; }
    svg { max-width: 100%; max-height: 100%; display: block; }`,
    body: pages.map((s) => `<div class="page">${s}</div>`).join(''),
  });
}

/**
 * Split the requested canvas bounds into a grid of `pageW x pageH` pixel tiles
 * and send each tile as its own print page. Uses raster snapshots so the pages
 * are guaranteed to line up regardless of vector content.
 */
export function tilePrint(opts: TilePrintOptions): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const source = opts.bounds && opts.bounds.width > 0 && opts.bounds.height > 0
    ? opts.bounds
    : { left: 0, top: 0, width: canvas.getWidth(), height: canvas.getHeight() };
  const cw = source.width;
  const ch = source.height;
  const cols = opts.cols ?? Math.max(1, Math.ceil(cw / opts.pageW));
  const rows = opts.rows ?? Math.max(1, Math.ceil(ch / opts.pageH));

  // Capture a high-res snapshot of the chosen source bounds once, then crop tiles.
  const multiplier = 2;
  const fullUrl = canvas.toDataURL({
    format: 'png',
    multiplier,
    left: source.left,
    top: source.top,
    width: source.width,
    height: source.height,
  });

  // Overlap is given in canvas px; the snapshot is `multiplier`× that.
  const overlap = Math.max(0, opts.overlapPx ?? 0) * multiplier;

  const img = new Image();
  img.onload = () => {
    const tileW = img.width / cols;
    const tileH = img.height / rows;
    // Each tile crops its own cell PLUS `overlap` into the next cell so the
    // taped seam shares content. Edge tiles get white padding where the crop
    // runs past the snapshot.
    const cropW = tileW + overlap;
    const cropH = tileH + overlap;
    const tileDataUrls: string[] = [];
    const tmp = document.createElement('canvas');
    tmp.width = Math.ceil(cropW);
    tmp.height = Math.ceil(cropH);
    const ctx = tmp.getContext('2d');
    if (!ctx) return;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.clearRect(0, 0, tmp.width, tmp.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        const sx = c * tileW;
        const sy = r * tileH;
        const sw = Math.min(cropW, img.width - sx);
        const sh = Math.min(cropH, img.height - sy);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        tileDataUrls.push(tmp.toDataURL('image/png'));
      }
    }
    sendTilesToPrint(tileDataUrls, opts.pageW, opts.pageH, cols, rows, Math.max(0, opts.marginPx ?? 0));
  };
  img.src = fullUrl;
}

function sendTilesToPrint(tiles: string[], pageW: number, pageH: number, cols: number, rows: number, marginPx: number) {
  printHtmlDocument({
    title: 'Tile Print',
    // Tile pages are raster data-URLs — heavy to decode before onload.
    iframeRemovalMs: 8000,
    css: `
    @page { size: ${pageW}px ${pageH}px; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { width: ${pageW}px; height: ${pageH}px; position: relative; page-break-after: always; overflow: hidden; box-sizing: border-box; padding: ${marginPx}px; }
    .page:last-child { page-break-after: auto; }
    .tile { width: 100%; height: 100%; overflow: hidden; }
    .page img { width: 100%; height: 100%; object-fit: fill; display: block; }
    .label { position: absolute; top: 4px; left: 6px; font: 10px system-ui, sans-serif; color: #888; }`,
    body: tiles
      .map((url, i) => {
        const r = Math.floor(i / cols) + 1;
        const c = (i % cols) + 1;
        return `<div class="page">
        <div class="label">Tile ${r}/${rows} × ${c}/${cols}</div>
        <div class="tile"><img src="${url}" /></div>
      </div>`;
      })
      .join(''),
  });
}

/* ----------------------------------------------------------------- */
/* 4. Drag-and-drop                                                  */
/* ----------------------------------------------------------------- */

/** MIME types accepted as rasters when a dropped file carries no extension. */
const RASTER_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Lower-cased extension of a file name; '' when the name carries none. */
function fileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * True when a drag event carries files. `types` is the reliable signal while
 * a drag hovers (browsers withhold `items` details there); `items` covers
 * engines that omit `types`.
 */
function carriesFiles(e: DragEvent): boolean {
  const dt = e.dataTransfer;
  if (!dt) return false;
  if (Array.from(dt.types ?? []).includes('Files')) return true;
  return Array.from(dt.items ?? []).some((it) => it.kind === 'file');
}

/** A dropped directory surfaces as a File with no readable contents. */
function isDroppedFolder(file: File): boolean {
  const entry = (file as File & { webkitGetAsEntry?: () => { isDirectory?: boolean } | null }).webkitGetAsEntry?.();
  return !!entry?.isDirectory;
}

/** File extensions this build can open, rasters first — for the "Supported:" hint. */
function supportedDropTypes(): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ext of [...RASTER_EXTS, ...listImporters().map((h) => h.ext)].map((e) => e.toUpperCase())) {
    if (!seen.has(ext)) { seen.add(ext); out.push(ext); }
  }
  return out.join(', ');
}

/** Screen point at the centre of the visible canvas — where out-of-canvas drops land. */
function viewportCentreClient(): { clientX: number; clientY: number } {
  const rect = (getCanvas()?.upperCanvasEl as HTMLCanvasElement | undefined)?.getBoundingClientRect();
  return {
    clientX: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
    clientY: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
  };
}

/**
 * Full-window "release to import" affordance for a file drag hovering over
 * the chrome (panels, top bar, tool rail) instead of the canvas. Built
 * imperatively because it follows the drag lifecycle, not React state.
 * `pointer-events: none` keeps whatever sits under the cursor the drop target.
 */
function createDropOverlay(): { setVisible(visible: boolean): void; dispose(): void } {
  let root: HTMLDivElement | null = null;
  const build = (): HTMLDivElement => {
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '120',
      pointerEvents: 'none',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      boxSizing: 'border-box',
      border: '3px dashed var(--accent2)',
      background: 'color-mix(in oklab, var(--accent2) 6%, transparent)',
    });
    const pill = document.createElement('div');
    Object.assign(pill.style, {
      marginTop: '56px',
      padding: '8px 14px',
      borderRadius: '8px',
      background: 'var(--panel)',
      color: 'var(--ink)',
      border: '1px solid var(--border)',
      boxShadow: '0 8px 24px rgb(0 0 0 / 0.35)',
      fontSize: '13px',
      fontWeight: '600',
      lineHeight: '1.4',
      textAlign: 'center',
    });
    const detail = document.createElement('div');
    detail.textContent = t('Files land at the centre of your view');
    Object.assign(detail.style, { fontSize: '11px', fontWeight: '400', opacity: '0.75' });
    pill.append(t('Release to import'), detail);
    el.appendChild(pill);
    return el;
  };
  return {
    setVisible(visible: boolean) {
      if (!visible) { root?.remove(); return; }
      root ??= build();
      if (!root.isConnected) document.body.appendChild(root);
    },
    dispose() { root?.remove(); root = null; },
  };
}

export interface DropImportSummary {
  /** Files that reached the canvas. */
  imported: number;
  /** Files whose importer or image decode threw. */
  failed: number;
  /** Files this build cannot open (unsupported extension, dropped folder). */
  unsupported: number;
}

const MAX_NAMED_FILES = 3;

/** `.vstudio.json` / `.awk.json` by name — enough to order a drop; the content decides what opens. */
const PROJECT_FILE_NAME = /\.(vstudio|awk)\.json$/i;

/** `"a.png", "b.svg"` — at most three names, an ellipsis standing in for the rest. */
function quoteNames(files: File[]): string {
  const shown = files.slice(0, MAX_NAMED_FILES).map((f) => `"${f.name}"`).join(', ');
  return files.length > MAX_NAMED_FILES ? `${shown} …` : shown;
}

/** Every outcome of one drop, worded for the user — never a raw exception. */
function reportDropImport(r: { imported: number; total: number; unreadable: File[]; failed: File[]; unsupported: File[]; folders: File[] }): void {
  const nothingImported = r.imported === 0 && r.unreadable.length === 0 && r.failed.length === 0;
  const skippedTitle = nothingImported ? t('Nothing imported') : undefined;
  if (r.folders.length) {
    toast.warn(`${t("Couldn't import")} ${quoteNames(r.folders)}. ${t("Folders can't be imported — drop the files inside instead.")}`, { title: skippedTitle });
  }
  if (r.unsupported.length) {
    toast.warn(`${t("Couldn't import")} ${quoteNames(r.unsupported)}. ${t('Unsupported file type.')} ${t('Supported:')} ${supportedDropTypes()}`, { title: skippedTitle });
  }
  if (r.unreadable.length) {
    toast.error(`${t("Couldn't open")} ${quoteNames(r.unreadable)}. ${t('The file may be damaged or not a valid image.')}`, { title: t('Import failed') });
  }
  if (r.failed.length) {
    toast.warn(`${t("Couldn't import")} ${quoteNames(r.failed)}. ${t('The file could not be read. It may be damaged or use features that are not supported.')}`, { title: t('Import failed') });
  }
  // One short confirmation for a multi-file drop; a single file speaks for itself.
  if (r.imported > 0 && r.total > 1) {
    const tally = r.imported === r.total ? `${r.imported}` : `${r.imported} / ${r.total}`;
    toast.success(`${tally} ${t('files imported')}`, { title: t('Import') });
  }
}

/**
 * Import the files of one drop. Rasters dropped on the canvas land under the
 * cursor (later ones cascade 16px so they don't stack exactly); dropped
 * anywhere else in the window they land on the centre of the current view.
 * Registry formats (SVG, JSON, PDF, PLT) go through their own importer, which
 * places them itself. Failures are collected and reported once at the end.
 */
export async function importDroppedFiles(
  files: File[],
  dropAt: { clientX: number; clientY: number },
  overCanvas: boolean,
): Promise<DropImportSummary> {
  const anchor = overCanvas ? dropAt : viewportCentreClient();
  const folders: File[] = [];
  const unsupported: File[] = [];
  const unreadable: File[] = [];
  const failed: File[] = [];
  let imported = 0;
  let cascade = 0;
  // A saved project in the drop opens first, so the other files land inside
  // the project it opens instead of in the design that project replaces.
  const ordered = [...files].sort((a, b) => Number(PROJECT_FILE_NAME.test(b.name)) - Number(PROJECT_FILE_NAME.test(a.name)));
  for (const f of ordered) {
    if (isDroppedFolder(f)) { folders.push(f); continue; }
    const ext = fileExt(f.name);
    // Honour the format registry so drag-drop for newly-registered formats
    // (PLT, JSON, SVG) Just Works; its importer wins over the raster path.
    const handler = findFormatByExt(ext);
    const isRaster = RASTER_EXTS.includes(ext) || RASTER_MIMES.includes(f.type);
    if (!handler?.import && !isRaster) { unsupported.push(f); continue; }
    let taken = true;
    try {
      if (handler?.import) {
        taken = (await handler.import(f)) !== false;
      } else {
        await importImageFile(f, { clientX: anchor.clientX + cascade, clientY: anchor.clientY + cascade });
        cascade += 16;
      }
      if (taken) imported += 1;
    } catch (err) {
      (handler?.import ? failed : unreadable).push(f);
      logger.error('io', `drop import failed: ${f.name} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  reportDropImport({
    imported,
    total: imported + folders.length + unsupported.length + unreadable.length + failed.length,
    folders,
    unsupported,
    unreadable,
    failed,
  });
  return { imported, failed: failed.length + unreadable.length, unsupported: unsupported.length + folders.length };
}

/** A file drag that goes silent for this long is treated as over (left the window, cancelled). */
const DRAG_WATCHDOG_MS = 2000;

/** Attach the window-level drag/drop listeners; returns a teardown function.
 *
 * The whole application window accepts file drops — users rarely aim a
 * dragged file at the canvas precisely, and before this a drop that landed
 * on a panel or the top bar did nothing at all (on Windows the browser then
 * opened the file in the tab). Two drop zones share one handler:
 *
 *  • over `canvasHost` — the image is placed under the cursor and the host
 *    keeps its `dragging-files` class (dashed accent2 ring — see index.css
 *    `.canvas-host.dragging-files`);
 *  • anywhere else in the window — a full-window dashed overlay says "release
 *    to import", and rasters land on the centre of the current view.
 *
 * Drag state follows `dragenter`/`dragover` recency rather than an
 * enter/leave depth counter: `dragleave` also fires for every child element
 * the pointer crosses, and a child that unmounts mid-drag never reports its
 * leave. A `dragleave` only clears the affordance when no enter/over followed
 * in the same frame; a watchdog clears it if the drag goes silent.
 *
 * Events another in-app drop target already accepted (the Gang Sheet Builder
 * intake) arrive with `defaultPrevented` and are left alone. */
export function attachDragDrop(canvasHost: HTMLElement): () => void {
  let dragging = false;
  let sawHover = 0;
  let watchdog = 0;
  const overlay = createDropOverlay();

  const clearDrag = () => {
    window.clearTimeout(watchdog);
    if (!dragging) return;
    dragging = false;
    canvasHost.classList.remove('dragging-files');
    overlay.setVisible(false);
  };
  const onHover = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    if (e.defaultPrevented) { clearDrag(); return; }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    const overCanvas = e.target instanceof Node && canvasHost.contains(e.target);
    dragging = true;
    sawHover++;
    canvasHost.classList.toggle('dragging-files', overCanvas);
    overlay.setVisible(!overCanvas);
    window.clearTimeout(watchdog);
    watchdog = window.setTimeout(clearDrag, DRAG_WATCHDOG_MS);
  };
  const onLeave = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    const seen = sawHover;
    window.requestAnimationFrame(() => { if (sawHover === seen) clearDrag(); });
  };
  const onDrop = (e: DragEvent) => {
    const isFiles = carriesFiles(e);
    const overCanvas = e.target instanceof Node && canvasHost.contains(e.target);
    if (isFiles) clearDrag();
    // Not a file drop (text, a URL, a layer being reordered): leave it to the browser.
    if (!isFiles || e.defaultPrevented) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    void importDroppedFiles(files, { clientX: e.clientX, clientY: e.clientY }, overCanvas);
  };
  window.addEventListener('dragenter', onHover);
  window.addEventListener('dragover', onHover);
  window.addEventListener('dragleave', onLeave);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('dragenter', onHover);
    window.removeEventListener('dragover', onHover);
    window.removeEventListener('dragleave', onLeave);
    window.removeEventListener('drop', onDrop);
    clearDrag();
    overlay.dispose();
  };
}

/* ----------------------------------------------------------------- */
/* 5. Rough image trace                                              */
/* ----------------------------------------------------------------- */

/* ------------------------- trace worker plumbing ------------------------- */

interface TraceResponseOk { id: number; ok: true; polygon: Array<[number, number]> }
interface TraceResponseErr { id: number; ok: false; error: string }
type TraceResponse = TraceResponseOk | TraceResponseErr;

interface TracePending {
  resolve: (polygon: Array<[number, number]>) => void;
  reject: (err: Error) => void;
}

let traceWorkerInstance: Worker | null = null;
let traceWorkerFailed = false;
let nextTraceReqId = 1;
const tracePending = new Map<number, TracePending>();

function getTraceWorker(): Worker | null {
  if (traceWorkerFailed) return null;
  if (traceWorkerInstance) return traceWorkerInstance;
  try {
    const w = new TraceWorker();
    w.onmessage = (ev: MessageEvent<TraceResponse>): void => {
      const data = ev.data;
      const entry = tracePending.get(data.id);
      if (!entry) return;
      tracePending.delete(data.id);
      if (data.ok) entry.resolve(data.polygon);
      else entry.reject(new Error(data.error));
    };
    w.onerror = (ev: ErrorEvent): void => {
      // A worker-level error breaks the RPC stream — reject everything pending.
      const err = new Error(ev.message || 'worker error');
      for (const p of tracePending.values()) p.reject(err);
      tracePending.clear();
    };
    traceWorkerInstance = w;
    return w;
  } catch (err) {
    // Routed through logger.warn — same reasoning as the boolean fallback.
    logger.warn('trace', `trace worker unavailable, falling back to main thread: ${err instanceof Error ? err.message : String(err)}`);
    traceWorkerFailed = true;
    return null;
  }
}

/**
 * Synchronous main-thread implementation of the trace algorithm. Used as a
 * fallback when the Web Worker cannot be created (SSR / unsupported envs).
 */
function tracePolygonMainThread(imageData: ImageData, threshold: number): Array<[number, number]> {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  const isInk = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = (y * w + x) * 4;
    const a = data[i + 3];
    if (a < 64) return false;
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return lum < threshold;
  };

  const edges: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isInk(x, y)) continue;
      if (!isInk(x - 1, y) || !isInk(x + 1, y) || !isInk(x, y - 1) || !isInk(x, y + 1)) {
        edges.push({ x, y });
      }
    }
  }
  if (edges.length < 3) return [];

  const cx = edges.reduce((s, p) => s + p.x, 0) / edges.length;
  const cy = edges.reduce((s, p) => s + p.y, 0) / edges.length;
  edges.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

  const target = Math.min(edges.length, 96);
  const step = edges.length / target;
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < target; i++) {
    const p = edges[Math.floor(i * step)];
    sampled.push([p.x, p.y]);
  }
  return sampled;
}

function traceOnWorker(imageData: ImageData, threshold: number): Promise<Array<[number, number]>> {
  const w = getTraceWorker();
  if (!w) {
    // Synchronous fallback when the worker is unavailable.
    try {
      return Promise.resolve(tracePolygonMainThread(imageData, threshold));
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
  return new Promise<Array<[number, number]>>((resolve, reject) => {
    const id = nextTraceReqId++;
    tracePending.set(id, { resolve, reject });
    w.postMessage({ id, imageData, threshold });
  });
}

/**
 * Trace the currently-selected raster image into a closed polygon outline.
 * Algorithm: render to an offscreen canvas, threshold to B/W (luminance < 128 = ink),
 * collect edge pixels around the ink region, and order them by angle around the centroid.
 * Quality is intentionally rough — this is a demo, not Potrace.
 *
 * NOTE: as of this iteration the pixel-walking phase runs in a Web Worker
 * (see `./workers/trace.worker.ts`). If the worker can't be created the
 * algorithm transparently falls back to the main thread.
 */
export async function traceSelectedImage(): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  const active = canvas.getActiveObject();
  if (!active || active.type !== 'image') return false;
  const img = active as fabric.FabricImage;
  const el = img.getElement() as HTMLImageElement | HTMLCanvasElement;
  if (!el) return false;

  const srcW = (el as HTMLImageElement).naturalWidth || (el as HTMLCanvasElement).width;
  const srcH = (el as HTMLImageElement).naturalHeight || (el as HTMLCanvasElement).height;

  // Scale down to keep the trace tractable
  const maxDim = 256;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(8, Math.round(srcW * scale));
  const h = Math.max(8, Math.round(srcH * scale));

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(el, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  // If the trace takes longer than ~200ms, surface a toast so the user knows
  // something is happening. Clear it on completion (success or failure).
  let toastId: string | null = null;
  const toastTimer = window.setTimeout(() => {
    toastId = toast.info(t('Tracing image…'));
  }, 200);

  let sampled: Array<[number, number]>;
  try {
    sampled = await traceOnWorker(imageData, 128);
  } catch (err) {
    logger.error('trace', `failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    window.clearTimeout(toastTimer);
    if (toastId) toast.dismiss(toastId);
  }

  if (sampled.length < 3) {
    toast.warn(t('Could not extract enough outline pixels. Try a higher-contrast image.'));
    return false;
  }

  // Map back to the image's on-canvas coordinate space.
  const imgW = (img.width ?? srcW);
  const imgH = (img.height ?? srcH);
  const sx = (img.scaleX ?? 1) * (imgW / w);
  const sy = (img.scaleY ?? 1) * (imgH / h);
  const left = img.left ?? 0;
  const top = img.top ?? 0;

  const points = sampled.map(([x, y]) => ({ x: x * sx, y: y * sy }));
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const polyPts = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));

  const poly = new fabric.Polygon(polyPts, {
    left: left + minX,
    top: top + minY,
    fill: '',
    stroke: '#ff7a3d',
    strokeWidth: 1,
  });
  canvas.add(poly);
  canvas.setActiveObject(poly);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
