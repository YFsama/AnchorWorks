/**
 * Format registry — pluggable I/O for the editor's file types.
 *
 * Today's I/O surface is spread across io.ts / io2.ts / io3.ts as hand-coded
 * `exportSVG()` / `importJSON()` / `exportDXF()` etc. functions, with each
 * MenuBar entry directly importing the specific function it needs. That's
 * cheap for a fixed format list but every new format costs edits in three
 * places (the implementation, the MenuBar import, the menu-item array) and
 * can't be discovered at runtime — e.g. for a CommandPalette "Export as…"
 * filter, or for an AI skill that introspects "which formats can I save?"
 *
 * This module declares a `FormatHandler` interface and a tiny registry the
 * existing exporters can opt into one at a time. The first round is purely
 * additive — registering a handler doesn't change any existing call site —
 * so any consumer (MenuBar, CommandPalette, Help, AI skills) can begin
 * reading from the registry as soon as it's useful, while the historical
 * direct imports keep working.
 *
 * Future cycles will migrate the actual exporters/importers into the
 * registry one format at a time. See task #19 in the polish-loop backlog.
 */

export type FormatMode = 'import' | 'export' | 'both';

export interface FormatHandler {
  /** Stable machine id — used in URLs, command IDs, AI tool args. */
  id: string;
  /** User-visible short label, e.g. "SVG", "PNG", "G-code". Already
   *  user-facing; not i18n-keyed here because format names are usually
   *  proper nouns that read fine in any locale. */
  label: string;
  /** File extension without the leading dot, e.g. "svg", "png", "gcode". */
  ext: string;
  /** MIME type (best-effort — `image/svg+xml`, `application/pdf`, etc.).
   *  Optional because some niche formats don't have a registered MIME. */
  mime?: string;
  /** Whether this handler can read in, write out, or both. */
  mode: FormatMode;
  /** Free-form one-line description for menus / tooltips / AI prompts. */
  description?: string;
  /** Group key for UI categorisation — "Vector" / "Raster" / "Document" /
   *  "Plotter" — so a future export dialog can section the format list. */
  category?: string;
  /** Extra search keywords for fuzzy lookup in the CommandPalette
   *  ("save vector", "raster bitmap"). Space-separated. Mirrors the
   *  ToolHandler `keywords` pattern. */
  keywords?: string;
  /** Export entry point. Receives no arguments today — most exporters
   *  serialise the canvas and trigger a download or open a save dialog
   *  internally. Future signature can grow to accept options without
   *  breaking call sites because the registry call is named. */
  export?: () => Promise<void> | void;
  /**
   * Import entry point. Either a File (drag-drop / file picker) or a
   * string (SVG markup, JSON text). Implementations choose which they
   * accept; the registry doesn't coerce.
   */
  import?: (input: File | string) => Promise<void> | void;
}

const registry = new Map<string, FormatHandler>();

/** Register a format. Last-write-wins on the `id`. */
export function registerFormat(h: FormatHandler): void {
  registry.set(h.id, h);
}

/** Lookup by id. Returns undefined if not registered. */
export function getFormat(id: string): FormatHandler | undefined {
  return registry.get(id);
}

/** All registered formats. */
export function listFormats(): FormatHandler[] {
  return [...registry.values()];
}

/** Formats that can export (mode === 'export' or 'both'). */
export function listExporters(): FormatHandler[] {
  return listFormats().filter(h => h.mode !== 'import' && typeof h.export === 'function');
}

/** Formats that can import (mode === 'import' or 'both'). */
export function listImporters(): FormatHandler[] {
  return listFormats().filter(h => h.mode !== 'export' && typeof h.import === 'function');
}

/** Find a format by case-insensitive extension match. Useful for drag-drop
 *  dispatch and for the OS-level file-open hook in the Tauri build. */
export function findFormatByExt(ext: string): FormatHandler | undefined {
  const needle = ext.replace(/^\./, '').toLowerCase();
  for (const h of registry.values()) {
    if (h.ext.toLowerCase() === needle) return h;
  }
  return undefined;
}
