/**
 * Extended I/O v3 — raster image import, optimized SVG export, multi-page PDF
 * tiling, and a rough image-trace utility.
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { exportSVG } from './io';
import { toast } from './toast';
import { t } from './i18n';
import { logger } from './debug';
import { findFormatByExt } from './formats';
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

export async function importImageFile(file: File): Promise<void> {
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

  // Center on visible canvas
  const sw = (img.width ?? 0) * (img.scaleX ?? 1);
  const sh = (img.height ?? 0) * (img.scaleY ?? 1);
  img.set({
    left: (cw - sw) / 2,
    top: (ch - sh) / 2,
  });
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
}

/**
 * Multi-page PDF helper — each provided SVG becomes one printed page.
 * Falls back to a single empty page if the array is empty.
 */
export function exportPDFMultiPage(svgs: string[]): void {
  const pages = svgs.length ? svgs : [exportSVG()];
  const html = `<!doctype html><html><head><title>PDF Export</title><style>
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { page-break-after: always; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
    .page:last-child { page-break-after: auto; }
    svg { max-width: 100%; max-height: 100%; display: block; }
  </style></head><body>
    ${pages.map((s) => `<div class="page">${s}</div>`).join('')}
    <script>window.onload = () => { setTimeout(() => { window.print(); }, 200); };</script>
  </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 8000);
}

/**
 * Split the current canvas into a grid of `pageW x pageH` pixel tiles and
 * send each tile as its own print page. Uses canvas raster snapshots so the
 * pages are guaranteed to line up regardless of vector content.
 */
export function tilePrint(opts: TilePrintOptions): void {
  const canvas = getCanvas();
  if (!canvas) return;
  const cw = canvas.getWidth();
  const ch = canvas.getHeight();
  const cols = opts.cols ?? Math.max(1, Math.ceil(cw / opts.pageW));
  const rows = opts.rows ?? Math.max(1, Math.ceil(ch / opts.pageH));

  // Capture a high-res snapshot of the whole canvas once, then crop tiles.
  const multiplier = 2;
  const fullUrl = canvas.toDataURL({ format: 'png', multiplier });

  const img = new Image();
  img.onload = () => {
    const tileW = img.width / cols;
    const tileH = img.height / rows;
    const tileDataUrls: string[] = [];
    const tmp = document.createElement('canvas');
    tmp.width = Math.ceil(tileW);
    tmp.height = Math.ceil(tileH);
    const ctx = tmp.getContext('2d');
    if (!ctx) return;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.clearRect(0, 0, tmp.width, tmp.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(
          img,
          c * tileW, r * tileH, tileW, tileH,
          0, 0, tmp.width, tmp.height,
        );
        tileDataUrls.push(tmp.toDataURL('image/png'));
      }
    }
    sendTilesToPrint(tileDataUrls, opts.pageW, opts.pageH, cols, rows);
  };
  img.src = fullUrl;
}

function sendTilesToPrint(tiles: string[], pageW: number, pageH: number, cols: number, rows: number) {
  const pages = tiles
    .map((url, i) => {
      const r = Math.floor(i / cols) + 1;
      const c = (i % cols) + 1;
      return `<div class="page">
        <div class="label">Tile ${r}/${rows} × ${c}/${cols}</div>
        <img src="${url}" />
      </div>`;
    })
    .join('');
  const html = `<!doctype html><html><head><title>Tile Print</title><style>
    @page { size: ${pageW}px ${pageH}px; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { width: ${pageW}px; height: ${pageH}px; position: relative; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    .page img { width: 100%; height: 100%; object-fit: fill; display: block; }
    .label { position: absolute; top: 4px; left: 6px; font: 10px system-ui, sans-serif; color: #888; }
  </style></head><body>
    ${pages}
    <script>window.onload = () => { setTimeout(() => { window.print(); }, 200); };</script>
  </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 8000);
}

/* ----------------------------------------------------------------- */
/* 4. Drag-and-drop                                                  */
/* ----------------------------------------------------------------- */

const ACCEPT_EXT = ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'json'];

/** Attach drag/drop listeners; returns a teardown function.
 *
 * Toggles the `dragging-files` class on the host element while a drag
 * carrying files is over the canvas, so CSS can show a visible drop target
 * (dashed accent2 outline + tint — see index.css `.canvas-host.dragging-files`).
 * Uses a depth counter to ignore dragenter/dragleave between child elements
 * (canvas, ArtboardLayer, Rulers, etc.) — the class only clears when the
 * drag leaves the wrapper entirely or a drop happens. */
export function attachDragDrop(el: HTMLElement): () => void {
  let depth = 0;
  const isFileDrag = (e: DragEvent): boolean =>
    !!e.dataTransfer && Array.from(e.dataTransfer.items).some((it) => it.kind === 'file');
  const onDragOver = (e: DragEvent) => {
    if (isFileDrag(e)) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    }
  };
  const onDragEnter = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    depth++;
    if (depth === 1) el.classList.add('dragging-files');
  };
  const onDragLeave = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) el.classList.remove('dragging-files');
  };
  const onDrop = async (e: DragEvent) => {
    depth = 0;
    el.classList.remove('dragging-files');
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      const ext = (f.name.split('.').pop() ?? '').toLowerCase();
      if (!ACCEPT_EXT.includes(ext)) continue;
      try {
        // Prefer the format registry — same SVG/JSON paths as the menu and
        // CommandPalette, so future format additions (e.g. .ai, .pdf import)
        // pick up drag-drop support for free by registering an `import`
        // handler. Raster imports stay hardcoded for now because the raster
        // pipeline goes through `importImageFile` (places an Image object on
        // canvas) and isn't a "format" the registry models yet.
        const handler = findFormatByExt(ext);
        if (handler?.import) {
          await handler.import(f);
        } else if (RASTER_EXTS.includes(ext)) {
          await importImageFile(f);
        }
      } catch (err) {
        logger.error('io', `drop import failed: ${f.name} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  el.addEventListener('dragover', onDragOver);
  el.addEventListener('dragenter', onDragEnter);
  el.addEventListener('dragleave', onDragLeave);
  el.addEventListener('drop', onDrop);
  return () => {
    el.removeEventListener('dragover', onDragOver);
    el.removeEventListener('dragenter', onDragEnter);
    el.removeEventListener('dragleave', onDragLeave);
    el.removeEventListener('drop', onDrop);
    el.classList.remove('dragging-files');
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
export async function traceSelectedImage(): Promise<void> {
  const canvas = getCanvas();
  if (!canvas) return;
  const active = canvas.getActiveObject();
  if (!active || active.type !== 'image') {
    alert('Select a raster image first.');
    return;
  }
  const img = active as fabric.FabricImage;
  const el = img.getElement() as HTMLImageElement | HTMLCanvasElement;
  if (!el) return;

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
  if (!ctx) return;
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
    return;
  } finally {
    window.clearTimeout(toastTimer);
    if (toastId) toast.dismiss(toastId);
  }

  if (sampled.length < 3) {
    alert('Could not extract enough outline pixels. Try a higher-contrast image.');
    return;
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
}
