import { describe, it, expect } from 'vitest';
// Import order matters: '../formatRegistration' pulls in io/cutContour/store/
// toast/i18n statically but must NOT execute any export/import closure at
// module scope — the heavyweight modules (io2/plotter/pltImporter/pdfImporter/
// svgImport/io3's exportSVGOptimized) are only reached via dynamic import
// inside those closures. Registration itself is synchronous.
import { registerBuiltInFormats } from '../formatRegistration';
import { getFormat, listFormats, listExporters, listImporters, findFormatByExt } from '../formats';

// Same side-effect wiring App.tsx does at module scope. registerFormat is
// last-write-wins on the id, so re-running the suite in one worker is safe.
registerBuiltInFormats();

const EXPECTED_IDS = ['svg', 'png', 'jpg', 'json', 'pdf', 'pdf-vector', 'dxf', 'plt'] as const;

describe('built-in format registry', () => {
  it('registers the full built-in format set', () => {
    const ids = listFormats().map((f) => f.id);
    for (const id of EXPECTED_IDS) {
      expect(ids, `expected ${id} in ${JSON.stringify(ids)}`).toContain(id);
    }
  });

  it('exposes synchronous metadata for every format', () => {
    for (const id of EXPECTED_IDS) {
      const f = getFormat(id);
      expect(f, `getFormat('${id}') must be defined`).toBeDefined();
      expect(f!.label.length, `${id}.label`).toBeGreaterThan(0);
      expect(f!.ext.length, `${id}.ext`).toBeGreaterThan(0);
      expect(f!.mode, `${id}.mode`).toMatch(/^(import|export|both)$/);
      if (f!.description !== undefined) {
        expect(f!.description.length, `${id}.description`).toBeGreaterThan(0);
      }
    }

    // Spot-check the entries consumers actually key off (CommandPalette
    // search reads keywords at module-eval time; io3 drag-drop reads ext).
    expect(getFormat('svg')).toMatchObject({
      label: 'SVG',
      ext: 'svg',
      mime: 'image/svg+xml',
      category: 'Vector',
      keywords: 'save vector',
      mode: 'both',
    });
    expect(getFormat('plt')).toMatchObject({
      ext: 'plt',
      category: 'CAD',
      keywords: 'hpgl plotter cutter vinyl roland graphtec',
      mode: 'both',
    });
    expect(getFormat('png')).toMatchObject({ ext: 'png', mode: 'export' });
    expect(getFormat('jpg')).toMatchObject({ ext: 'jpg', mode: 'export' });
    expect(getFormat('dxf')).toMatchObject({ ext: 'dxf', mode: 'export' });
    expect(getFormat('json')).toMatchObject({ ext: 'json', mode: 'both' });
    expect(getFormat('pdf')).toMatchObject({ ext: 'pdf', mode: 'both' });
    expect(getFormat('pdf-vector')).toMatchObject({ ext: 'pdf', mode: 'export' });
  });

  it('exposes export/import entry points as (lazy) functions without invoking them', () => {
    // The closures contain the dynamic imports — asserting they are functions
    // verifies the registration completed synchronously. Never call them
    // here: export writes files / opens dialogs, import mutates the canvas.
    for (const id of EXPECTED_IDS) {
      const f = getFormat(id)!;
      if (f.mode !== 'import') {
        expect(typeof f.export, `${id}.export`).toBe('function');
      }
      if (f.mode !== 'export') {
        expect(typeof f.import, `${id}.import`).toBe('function');
      }
    }
  });

  it('finds formats by extension (drag-drop dispatch path)', () => {
    expect(findFormatByExt('svg')?.id).toBe('svg');
    expect(findFormatByExt('plt')?.id).toBe('plt');
    expect(findFormatByExt('json')?.id).toBe('json');
    // Leading dot is stripped, match is case-insensitive.
    expect(findFormatByExt('.PLT')?.id).toBe('plt');
    expect(findFormatByExt('PNG')?.id).toBe('png');
    expect(findFormatByExt('made-up-ext')).toBeUndefined();
  });

  it('resolves the binary-PDF importer first for .pdf (registration-order dependency)', () => {
    // 'pdf' registers before 'pdf-vector' and both claim ext 'pdf';
    // findFormatByExt must return the one with an import handler so a
    // drag-dropped .pdf lands in pdfImporter, not the export-only entry.
    const f = findFormatByExt('pdf');
    expect(f?.id).toBe('pdf');
    expect(typeof f?.import).toBe('function');
  });

  it('classifies exporters vs importers by mode', () => {
    const exporters = listExporters().map((f) => f.id);
    const importers = listImporters().map((f) => f.id);
    // Export-only formats.
    expect(exporters).toContain('png');
    expect(importers).not.toContain('png');
    expect(exporters).toContain('pdf-vector');
    expect(importers).not.toContain('pdf-vector');
    expect(exporters).toContain('dxf');
    expect(importers).not.toContain('dxf');
    // Both-mode formats appear in both lists.
    expect(exporters).toContain('svg');
    expect(importers).toContain('svg');
    expect(exporters).toContain('plt');
    expect(importers).toContain('plt');
    expect(importers).toContain('pdf');
  });
});
