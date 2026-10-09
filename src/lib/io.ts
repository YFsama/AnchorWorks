import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { callNative, isTauri } from './runtime';
import { toast } from './toast';
import { t } from './i18n';

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

export function exportSVG(): string {
  const canvas = getCanvas();
  if (!canvas) return '';
  return canvas.toSVG();
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
