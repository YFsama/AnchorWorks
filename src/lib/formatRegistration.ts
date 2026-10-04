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
 *
 * Registration itself stays fully synchronous: only the inline metadata
 * (id / label / ext / keywords / description) is evaluated at module load,
 * so `getFormat` / `findFormatByExt` / `listFormats` keep answering
 * immediately at boot. Every heavyweight dependency — io2 (JPG / JSON /
 * PDF / DXF, which drags printPrep along), io3's optimized SVG export,
 * pdfImporter, svgImport, plotter (which drags cutOptimize) and
 * pltImporter — is imported dynamically *inside* the export/import
 * closures. All of these only run on explicit user action, so the first
 * `await import()` hit is imperceptible, and none of them pin the entry
 * chunk anymore. The dynamic `import()` resolves to the same module
 * instance the rest of the app uses (e.g. `defaultPlotterOptions` is the
 * live binding shared with the PlotterDialog), so semantics are
 * unchanged.
 *
 * Kept static on purpose: io.ts (tiny, and `importSVGString` is needed
 * by two import paths) and cutContour.ts (`detectRegMarks` — still
 * statically pinned by MenuBar/App/pathSimplify, so making it lazy here
 * wouldn't move the needle yet).
 */

import { registerFormat } from './formats';
import { download, downloadDataURL, exportPNG, importSVGString } from './io';
import { detectRegMarks } from './cutContour';
import { useEditor } from '../store/editor';
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
    export: async () => {
      const { exportSVGOptimized } = await import('./io3');
      download('design.svg', exportSVGOptimized(), 'image/svg+xml');
    },
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
        const { importSVGSmartFile } = await import('./svgImport');
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
    export: async () => {
      const { exportJPG } = await import('./io2');
      downloadDataURL('design.jpg', exportJPG(2));
    },
  });

  registerFormat({
    id: 'json',
    label: 'JSON',
    ext: 'json',
    mime: 'application/json',
    mode: 'both',
    category: 'Project',
    description: t('Fabric canvas state — round-trips objects but loses artboards & symbols.'),
    export: async () => {
      const { exportJSON } = await import('./io2');
      exportJSON();
    },
    import: async (input) => {
      if (input instanceof File) {
        const { importJSON } = await import('./io2');
        await importJSON(input);
      }
    },
  });

  // PDF — export via the browser print dialog, import via the vector
  // operator-list walker in pdfImporter.ts (paths + colours come through as
  // editable SVG geometry; text is skipped with a warning). 'pdf' is the
  // first ext-match for drag-drop because it registers before 'pdf-vector'.
  registerFormat({
    id: 'pdf',
    label: 'PDF',
    ext: 'pdf',
    mime: 'application/pdf',
    mode: 'both',
    category: 'Document',
    keywords: 'import vector acrobat reader',
    description: t('PDF via the browser print dialog (use Print Prep dialog for crop / bleed / registration marks). Imports vector artwork as editable paths.'),
    export: async () => {
      const { exportPDF } = await import('./io2');
      exportPDF();
    },
    import: async (input) => {
      if (typeof input === 'string') return; // PDFs are binary-only — needs a File
      const { importPdfFile } = await import('./pdfImporter');
      await importPdfFile(input);
    },
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
    export: async () => {
      const { exportPDFReal } = await import('./io2');
      await exportPDFReal();
    },
  });

  registerFormat({
    id: 'dxf',
    label: 'DXF',
    ext: 'dxf',
    mime: 'application/dxf',
    mode: 'export',
    category: 'CAD',
    description: t('AutoCAD DXF — LINE / LWPOLYLINE entities only, curves flattened, no text or hatching.'),
    export: async () => {
      const { exportDXF } = await import('./io2');
      exportDXF();
    },
  });

  // PLT / HP-GL — vinyl cutter language. Export uses the dialect set in the
  // Plotter dialog (saved on defaultPlotterOptions when the user changes it);
  // import auto-detects Roland / Graphtec / bare-HPGL flavours and converts
  // back to fabric paths via the SVG import pipeline. This is the round-trip
  // most cutter-driver software (Roland CutStudio, Wentai, Artcut) expects.
  registerFormat({
    id: 'plt',
    label: 'PLT',
    ext: 'plt',
    mime: 'application/vnd.hp-hpgl',
    mode: 'both',
    category: 'CAD',
    keywords: 'hpgl plotter cutter vinyl roland graphtec',
    description: t('HP-GL vinyl-cutter format — exports with the dialect from the Plotter dialog; imports Roland / Graphtec / bare HP-GL.'),
    export: async () => {
      // `defaultPlotterOptions` is an `export const` (never reassigned) on
      // the lazily-resolved module instance — the very object PlotterDialog
      // reads as its fallback/reset baseline — so the dialect persisted
      // from the dialog is what gets exported here.
      const { buildPlotterOutput, defaultPlotterOptions } = await import('./plotter');
      download('design.plt', buildPlotterOutput('hpgl', defaultPlotterOptions), 'application/vnd.hp-hpgl');
    },
    import: async (input) => {
      const text = typeof input === 'string' ? input : await input.text();
      const { parsePlt, polylinesToSvg } = await import('./pltImporter');
      try {
        const res = parsePlt(text);
        if (res.polylines.length === 0) {
          toast.warn(t('PLT file had no cuttable geometry.'), { title: t('Nothing imported') });
          return;
        }
        // Auto-detect Roland-style 4-corner registration marks BEFORE
        // dropping the polylines onto the canvas. When found, lift them
        // out of the editable geometry and re-create them as proper
        // CutPath regmarks so they render in amber and survive a round-
        // trip back to the cutter. The remaining polylines become
        // ordinary editable paths via the existing SVG import pipeline.
        const reg = detectRegMarks(res.polylines);
        let polysForCanvas = res.polylines;
        let regNote = '';
        if (reg) {
          const markIdxSet = new Set(reg.markIndexes);
          polysForCanvas = res.polylines.filter((_, i) => !markIdxSet.has(i));
          // Regenerate canonical Roland L-marks at the detected bounds —
          // matches the generator's geometry exactly so a roundtrip
          // (import → preview → export) doesn't drift the mark positions.
          const editor = useEditor.getState();
          editor.clearCutPaths('regmark');
          editor.addCutPaths(
            reg.markIndexes.map((i, k) => ({
              id: `regmark-imported-${Date.now().toString(36)}-${k}`,
              points: res.polylines[i].points,
              closed: false,
              kind: 'regmark' as const,
              passes: 1,
            })),
          );
          regNote = ` · ${t('4 reg marks detected')}`;
        }
        await importSVGString(polylinesToSvg(polysForCanvas));
        const dialectLabel = res.dialect === 'roland-camm' ? 'Roland CAMM'
          : res.dialect === 'graphtec-fc' ? 'Graphtec FC' : t('bare HP-GL');
        const pageNote = res.pageSizeMm
          ? ` · ${res.pageSizeMm.w.toFixed(0)}×${res.pageSizeMm.h.toFixed(0)} mm`
          : '';
        const warnNote = res.warnings.length > 0 ? ` · ${res.warnings.length} warning(s)` : '';
        toast.success(
          `${polysForCanvas.length} polylines${pageNote}${regNote}${warnNote}`,
          { title: `${t('Imported PLT')} (${dialectLabel})` },
        );
      } catch (err) {
        toast.error((err as Error).message, { title: t('PLT import failed') });
        throw err;
      }
    },
  });
}
