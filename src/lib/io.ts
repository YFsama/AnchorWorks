import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { callNative, isTauri } from './runtime';
import { toast } from './toast';
import { t } from './i18n';
import { useEditor, type CutPath } from '../store/editor';

export async function importSVGFile(file: File) {
  const text = await file.text();
  await importSVGString(text);
}

export async function importSVGString(svg: string) {
  const canvas = getCanvas();
  if (!canvas) return;
  const result = await fabric.loadSVGFromString(svg);
  const objs = result.objects.filter(Boolean) as fabric.FabricObject[];
  // Fabric caches grouped objects to an internal bitmap by default. That
  // bitmap is rendered at the object's intrinsic size, so when the user
  // zooms in the canvas, the cache is scaled like a raster and looks
  // pixelated. Disabling `objectCaching` on the imported group and every
  // descendant makes Fabric re-paint vector paths each frame — slightly
  // more CPU per render but crisp at any zoom level.
  for (const o of objs) o.set({ objectCaching: false });
  const group = fabric.util.groupSVGElements(objs, result.options);
  group.set({ objectCaching: false });
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
}

export interface ExportSvgOptions {
  /** Append the store's cut paths as a `CutContour` spot layer for
   *  print-then-cut RIP workflows. */
  includeCutPaths?: boolean;
}

export function exportSVG(opts?: ExportSvgOptions): string {
  const canvas = getCanvas();
  if (!canvas) return '';
  const svg = canvas.toSVG();
  return opts?.includeCutPaths ? appendCutPathsToSvg(svg, useEditor.getState().cutPaths) : svg;
}

/**
 * mm → px factor for cut paths. CutPath points live in document mm-space and
 * the canvas SVG is authored in px, so both `d` coordinates and the stroke
 * width are converted with the fixed 96dpi convention (3.7795) the rest of
 * the cutter pipeline uses (printMarks, CutPathLayer, cutContour,
 * contourFromSelection) — not the per-document `doc.dpi`, which only drives
 * paper-preset sizing in paperSizes.ts.
 */
const CUT_MM_TO_PX = 3.7795;

/**
 * Append a RIP cut layer to a canvas SVG string, just before `</svg>`:
 * `<g id="cut-layer" data-cut="true">` holding one `<path>` per CutPath with
 * the de-facto spot-colour convention (Roland VersaWorks / Mimaki
 * RasterLink7) — class `CutContour` (`PerfCutContour` for perf/kiss cuts),
 * 100% magenta `#FF00FF` hairline stroke (default 0.25 mm), no fill, and
 * `data-cut-kind` carrying the CutPath kind. Coordinates are converted from
 * document mm to SVG px with the shared 96dpi factor (see CUT_MM_TO_PX).
 * A string without a `</svg>` closing tag is returned unchanged (fabric's
 * toSVG always emits one; anything else isn't an SVG document).
 */
export function appendCutPathsToSvg(svgString: string, cutPaths: CutPath[], opts?: { strokeMm?: number }): string {
  if (!cutPaths.length) return svgString;
  const strokePx = (opts?.strokeMm ?? 0.25) * CUT_MM_TO_PX;
  const paths = cutPaths
    .filter((cutPath) => cutPath.points.length > 0)
    .map((cutPath) => {
      const cls = (['perf', 'kiss'] as string[]).includes(cutPath.kind) ? 'PerfCutContour' : 'CutContour';
      const d = cutPath.points
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(x * CUT_MM_TO_PX).toFixed(3)} ${(y * CUT_MM_TO_PX).toFixed(3)}`)
        .join(' ') + (cutPath.closed ? ' Z' : '');
      return `<path class="${cls}" stroke="#FF00FF" fill="none" stroke-width="${strokePx.toFixed(3)}" data-cut-kind="${cutPath.kind}" d="${d}" />`;
    })
    .join('');
  if (!paths) return svgString;
  return svgString.replace(/<\/svg>\s*$/, `<g id="cut-layer" data-cut="true">${paths}</g></svg>`);
}

export function exportPNG(multiplier = 2): string {
  const canvas = getCanvas();
  if (!canvas) return '';
  return canvas.toDataURL({ format: 'png', multiplier });
}

/**
 * Decode a `data:` URL to raw bytes. Base64 payloads go through `atob`;
 * percent-encoded ones (fabric never emits those for rasters, but SVG data
 * URLs sometimes are) through `decodeURIComponent` + TextEncoder. Pure and
 * synchronous so the native save branch can reuse the exact bytes the web
 * path would have handed the browser.
 */
export function decodeDataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  if (/;base64/i.test(meta)) {
    const bin = atob(payload);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

/**
 * Hand export bytes to the Tauri `fs_save_bytes` command: OS save dialog +
 * Rust-side write. Wry registers no download handler, so `<a download>` is a
 * silent no-op on WKWebView / WebKitGTK — this is the only reliable export
 * channel under the native shell (Windows' WebView2 tolerates the anchor
 * trick, but we route it here too so all platforms behave identically).
 *
 * Returns false when the user cancelled the dialog (cancellation is not an
 * error — no toast) and toasts on real I/O failures. No-op (false) when not
 * running under Tauri; callers keep their web path.
 */
export async function saveBytesNative(filename: string, bytes: Uint8Array): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    // Array.from: JSON.stringify turns a bare Uint8Array into an indexed
    // object {"0":..} which serde can't map to Vec<u8> — a plain number[]
    // round-trips cleanly.
    const chosen = await callNative<string | null>(
      'fs_save_bytes',
      { bytes: Array.from(bytes), suggestedName: filename, path: null },
      async () => null, // unreachable — isTauri() guards
    );
    if (!chosen) return false; // user cancelled the dialog
    toast.success(`${t('Saved')} ${filename}`);
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err), { title: t('Export failed') });
    return false;
  }
}

export function download(filename: string, content: string | Blob, type = 'image/svg+xml') {
  if (isTauri()) {
    // Fire-and-forget keeps the sync signature every call site relies on;
    // failures surface through saveBytesNative's own toast.
    void (async () => {
      const bytes = typeof content === 'string'
        ? new TextEncoder().encode(content)
        : new Uint8Array(await content.arrayBuffer());
      await saveBytesNative(filename, bytes);
    })();
    return;
  }
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataURL(filename: string, dataUrl: string) {
  if (isTauri()) {
    void saveBytesNative(filename, decodeDataUrlToBytes(dataUrl));
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
