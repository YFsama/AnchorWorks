/**
 * Built-in format registrations.
 *
 * First batch wired into the registry from task #19: SVG, PNG, JPG, JSON.
 * These are the four "always available" core formats; the heavier formats
 * (PDF, DXF, G-code, HP-GL) wrap external libraries or carry user-facing
 * options dialogs and migrate in later cycles.
 *
 * This module is imported for its side-effect from App.tsx (next to the
 * skill registrations). Each registration is a one-line `registerFormat`
 * call that delegates to the existing exporter/importer in io.ts / io2.ts
 * — zero behavioural change at the existing call sites, but every consumer
 * (CommandPalette, AI skills, drag-drop dispatch, the future Tauri OS
 * file-open hook) can now discover formats via the registry instead of
 * hard-coding the function list.
 */

import { registerFormat } from './formats';
import { download, downloadDataURL, exportPNG, importSVGString } from './io';
import { exportDXF, exportJPG, exportJSON, exportPDF, exportPDFReal, importJSON } from './io2';
import { exportSVGOptimized } from './io3';
import { importSVGSmartFile } from './svgImport';
import { toast } from './toast';
import { t } from './i18n';

export function registerBuiltInFormats(): void {
  registerFormat({
    id: 'svg',
    label: 'SVG',
    ext: 'svg',
    mime: 'image/svg+xml',
    mode: 'both',
    category: 'Vector',
    keywords: 'save vector',
    description: t('Scalable Vector Graphics — round-trips with all path data preserved.'),
    // Use `exportSVGOptimized` (strips Fabric's emitted unused xmlns + xml:space
    // attrs) rather than the raw `exportSVG`. That's also what the CommandPalette
    // "Export SVG" command uses — keep the two paths producing identical output
    // so a future migration from CommandPalette's hardcoded handler to the
    // registry's `getFormat('svg').export()` is a no-op.
    export: () => download('design.svg', exportSVGOptimized(), 'image/svg+xml'),
    // Smart import: pre-processes <style>/currentColor/gradients before
    // handing to Fabric, then surfaces a toast for anything we had to drop
    // (gradient refs that don't resolve, css vars that don't compute, etc.).
    // This is what the File menu already does manually; routing it through
    // the registry means drag-drop SVGs get the same treatment + warning
    // surface for free.
    import: async (input) => {
      if (typeof input === 'string') {
        await importSVGString(input);
        return;
      }
      try {
        const res = await importSVGSmartFile(input);
        if (res.warnings.length > 0) {
          const top = res.warnings.slice(0, 3).join(' • ');
          const extra = res.warnings.length > 3 ? ` (+${res.warnings.length - 3} more)` : '';
          toast.warn(top + extra, { title: t('SVG imported with warnings') });
        }
      } catch (err) {
        toast.error((err as Error).message, { title: t('SVG import failed') });
        throw err;
      }
    },
  });

  registerFormat({
    id: 'png',
    label: 'PNG',
    ext: 'png',
    mime: 'image/png',
    mode: 'export',
    category: 'Raster',
    keywords: 'raster bitmap',
    description: t('2× DPI lossless raster — best for handing off to non-vector tools.'),
    export: () => downloadDataURL('design.png', exportPNG(2)),
  });

  registerFormat({
    id: 'jpg',
    label: 'JPG',
    ext: 'jpg',
    mime: 'image/jpeg',
    mode: 'export',
    category: 'Raster',
    keywords: 'jpeg raster',
    description: t('Compressed raster — small file, lossy.'),
    export: () => downloadDataURL('design.jpg', exportJPG(2)),
  });

  registerFormat({
    id: 'json',
    label: 'JSON',
    ext: 'json',
    mime: 'application/json',
    mode: 'both',
    category: 'Project',
    description: t('Fabric canvas state — round-trips objects but loses artboards & symbols.'),
    export: () => exportJSON(),
    import: async (input) => {
      if (input instanceof File) await importJSON(input);
    },
  });

  registerFormat({
    id: 'pdf',
    label: 'PDF',
    ext: 'pdf',
    mime: 'application/pdf',
    mode: 'export',
    category: 'Document',
    description: t('PDF via the browser print dialog (use Print Prep dialog for crop / bleed / registration marks).'),
    export: () => exportPDF(),
  });

  // Vector PDF uses jsPDF + svg2pdf.js (no print-dialog round-trip). The
  // PrintDialog still calls `exportPDFReal` directly because it passes a
  // full options object (page size, orientation, crop/bleed marks); this
  // registry entry covers the no-args default path used by the CommandPalette
  // + File-menu shortcuts.
  registerFormat({
    id: 'pdf-vector',
    label: 'PDF (Vector)',
    ext: 'pdf',
    mime: 'application/pdf',
    mode: 'export',
    category: 'Document',
    keywords: 'vector pdf real',
    description: t('Real vector PDF — fonts and paths stay editable in PDF readers.'),
    export: () => exportPDFReal(),
  });

  registerFormat({
    id: 'dxf',
    label: 'DXF',
    ext: 'dxf',
    mime: 'application/dxf',
    mode: 'export',
    category: 'CAD',
    description: t('AutoCAD DXF — LINE / LWPOLYLINE entities only, curves flattened, no text or hatching.'),
    export: () => exportDXF(),
  });
}
