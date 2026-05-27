/**
 * Native-menu bridge for the Tauri shell.
 *
 * `src-tauri/src/lib.rs#build_app_menu` defines a top-level menu (File /
 * Edit / View / Document / Help) whose every item carries a stable string
 * id ("file.save", "edit.undo", …). When the user picks an item, the Rust
 * side broadcasts `menu-action` with the id; this module listens for the
 * event and dispatches to the same handlers the DOM MenuBar uses.
 *
 * Keeping the two surfaces in sync means the in-DOM MenuBar can stay
 * visible (Windows/Linux convention) or be hidden under macOS — both
 * surfaces route through one set of action functions.
 *
 * No-op when not running under Tauri; the PWA build dynamically imports
 * `@tauri-apps/api/event` only after the `isTauri()` check, so the module
 * doesn't add weight to the web bundle.
 */

import { isTauri } from './runtime';
import {
  zoomBy, zoomFit, undo, redo, duplicateSelection, groupSelection, ungroupSelection, getCanvas,
} from './canvasEngine';
import * as fabric from 'fabric';
import { isOutlineMode, setOutlineMode } from './outlineView';
import { saveProjectQuick, saveProjectToFile, openProjectFromFile } from './projectFile';
import { getFormat } from './formats';
import { useEditor } from '../store/editor';
import type { ToolId } from '../types';

type Handler = () => void | Promise<void>;

/** id → handler table. Each id matches an item in `build_app_menu` (lib.rs).
 *  Add to both sides at once — a missing handler logs a warning instead of
 *  failing silently so omissions surface during development. */
const HANDLERS: Record<string, Handler> = {
  // File
  'file.save': () => { void saveProjectQuick(); },
  'file.saveAs': () => { void saveProjectToFile(); },
  'file.open': () => { void openProjectFromFile(); },
  'file.new': () => { location.reload(); },
  'file.newFromTemplate': () => useEditor.getState().setModal('showTemplates', true),
  'file.importImage': () => {
    // Tauri side will land an OS file picker in a later T1 slice; for now
    // route through the existing hidden <input type="file"> the MenuBar
    // already wires by clicking the same DOM ref the in-app menu uses.
    document.querySelector<HTMLInputElement>('input[data-import-image]')?.click();
  },
  'file.exportSvg': () => { void getFormat('svg')?.export?.(); },
  'file.exportPng': () => { void getFormat('png')?.export?.(); },
  'file.exportPdf': () => { void getFormat('pdf')?.export?.(); },
  'file.exportPdfVector': () => { void getFormat('pdf-vector')?.export?.(); },
  'file.exportDxf': () => { void getFormat('dxf')?.export?.(); },
  'file.exportJson': () => { void getFormat('json')?.export?.(); },
  'file.print': () => useEditor.getState().setModal('showPrint', true),
  'file.plotter': () => useEditor.getState().setModal('showPlotter', true),

  // Edit
  'edit.undo': () => undo(),
  'edit.redo': () => redo(),
  'edit.duplicate': () => duplicateSelection(),
  'edit.selectAll': () => {
    const c = getCanvas();
    if (!c) return;
    const objs = c.getObjects().filter(o => !(o as { excludeFromExport?: boolean }).excludeFromExport);
    if (!objs.length) return;
    c.discardActiveObject();
    const sel = new fabric.ActiveSelection(objs, { canvas: c });
    c.setActiveObject(sel);
    c.requestRenderAll();
  },
  'edit.group': () => groupSelection(),
  'edit.ungroup': () => ungroupSelection(),

  // View
  'view.zoomIn': () => zoomBy(1.25),
  'view.zoomOut': () => zoomBy(1 / 1.25),
  'view.zoomFit': () => zoomFit(),
  'view.outline': () => setOutlineMode(!isOutlineMode()),
  'view.toggleTheme': () => {
    const s = useEditor.getState();
    s.setTheme(s.theme === 'light' ? 'dark' : 'light');
  },

  // Document
  'doc.settings': () => useEditor.getState().setModal('showDocSettings', true),
  'doc.repeat': () => useEditor.getState().setModal('showRepeat', true),

  // Help — the About item is a custom dialog inside MenuBar.tsx, so the
  // native menu surfaces the Help Center / Preferences / Shortcuts but
  // defers "About" to the existing in-DOM button. A future iteration can
  // expose a global event for opening About from outside the component.
  'help.helpCenter': () => useEditor.getState().setModal('showHelpCenter', true),
  'help.commandPalette': () => useEditor.getState().setModal('showCommandPalette', true),
  'help.preferences': () => useEditor.getState().setModal('showPreferences', true),
  'help.shortcuts': () => useEditor.getState().setModal('showShortcuts', true),
  'help.about': () => {
    // Trigger the existing About button — same affordance as a normal
    // click. Falls back to a no-op if the button isn't mounted (e.g.,
    // during first paint).
    document.querySelector<HTMLButtonElement>('button[aria-label="About"]')?.click();
  },
};

let unsubscribers: Array<() => void> = [];

/** Read the file at `path` via Tauri's fs plugin and route through the
 *  existing project-apply pipeline. Used by both the file-association
 *  cold-launch path and the single-instance second-launch forward. */
async function openFileNative(path: string): Promise<void> {
  try {
    const { callNative } = await import('./runtime');
    const text = await callNative<string>(
      'fs_read_path',
      { path },
      async () => { throw new Error('fs_read_path is Tauri-only'); },
    );
    const lower = path.toLowerCase();
    if (lower.endsWith('.svg')) {
      const { getFormat } = await import('./formats');
      await getFormat('svg')?.import?.(text);
    } else {
      const { applyProject } = await import('./projectFile');
      await applyProject(JSON.parse(text));
    }
  } catch (err) {
    const { toast } = await import('./toast');
    toast.error((err as Error).message, { title: 'Open failed' });
  }
}

/** Install the native-menu + file-open listeners. Idempotent — calling
 *  twice is a no-op so App.tsx can call it from a `useEffect` without
 *  bookkeeping. */
export async function installNativeMenuListener(): Promise<void> {
  if (!isTauri() || unsubscribers.length) return;
  const { listen } = await import('@tauri-apps/api/event');

  unsubscribers.push(await listen<string>('menu-action', (event) => {
    const id = event.payload;
    const handler = HANDLERS[id];
    if (!handler) {
      console.warn(`[tauriMenu] unknown menu id "${id}" — register a handler in tauriMenu.ts`);
      return;
    }
    try { void handler(); }
    catch (err) { console.error(`[tauriMenu] handler for "${id}" threw`, err); }
  }));

  // Single-instance plugin forwards file paths from the second-launch
  // argv. Each entry is an absolute path that already exists; we route
  // through `openFileNative` so `.svg` and `.vstudio.json` both work.
  unsubscribers.push(await listen<string[]>('file-open', (event) => {
    for (const path of event.payload) void openFileNative(path);
  }));

  // Deep-link plugin emits `deep-link://new-url` for every URL routed
  // to the running instance under one of the registered schemes. We
  // recognise three forms:
  //   anchorworks://open?path=/abs/path/to/file
  //     → open the file via fs_read_path (same path as file-association)
  //   anchorworks://command/<id>
  //     → run the matching entry in the menu-action HANDLERS table
  //   anchorworks://tool/<toolId>
  //     → switch to the named tool (rect, ellipse, pen, …)
  // Unknown shapes log a warning rather than failing silently.
  unsubscribers.push(await listen<string[]>('deep-link://new-url', (event) => {
    for (const raw of event.payload) handleDeepLink(raw);
  }));
}

function handleDeepLink(raw: string) {
  let url: URL;
  try { url = new URL(raw); }
  catch { console.warn(`[tauriMenu] deep link rejected — not a URL: ${raw}`); return; }

  // url.host carries the verb in the `scheme://host/path` parse (e.g.
  // `anchorworks://open?…` → host = "open"). The leading slash gets
  // stripped from the path so command/<id> shows up as pathname `/<id>`.
  const verb = url.host || url.pathname.split('/').filter(Boolean)[0];
  switch (verb) {
    case 'open': {
      const p = url.searchParams.get('path');
      if (!p) { console.warn('[tauriMenu] anchorworks://open missing ?path='); return; }
      void openFileNative(p);
      return;
    }
    case 'command': {
      const id = url.pathname.replace(/^\/+/, '');
      const handler = HANDLERS[id];
      if (!handler) { console.warn(`[tauriMenu] deep-link command unknown: ${id}`); return; }
      try { void handler(); }
      catch (err) { console.error(`[tauriMenu] deep-link command "${id}" threw`, err); }
      return;
    }
    case 'tool': {
      const id = url.pathname.replace(/^\/+/, '');
      // Trust the store's `setTool` to ignore unknown ids — the cast is
      // narrowing the string from "anything the OS handed us" to "the
      // shape setTool expects". Unknown values flow through as no-ops
      // rather than failing loud, which matches the rest of the
      // deep-link handler's "log and move on" disposition.
      useEditor.getState().setTool(id as ToolId);
      return;
    }
    default:
      console.warn(`[tauriMenu] deep link unrecognised verb "${verb}" — raw: ${raw}`);
  }
}

/** Tear down all listeners. Used by HMR / hot-reload paths; not normally
 *  required in production since the app lives for the window's lifetime. */
export function uninstallNativeMenuListener(): void {
  for (const u of unsubscribers) u();
  unsubscribers = [];
}
