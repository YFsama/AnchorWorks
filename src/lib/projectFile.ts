/**
 * Project file serialization — native save/open of complete Anchorworks
 * projects to `.vstudio.json` on disk.
 *
 * Why this exists: the existing "Export JSON" / "Open JSON" path only roundtrips
 * the raw Fabric canvas (`canvas.toJSON()`), which loses artboards, symbols,
 * and document settings (page size, DPI, background, unit). This module
 * gathers the whole editor state into a versioned envelope so users can save
 * and reopen real projects.
 *
 * Storage strategy:
 * - The on-disk envelope (`ProjectFile`) contains the document settings, the
 *   Fabric canvas JSON, artboards, and symbols.
 * - When opened, artboards are pushed into the Zustand store *and* mirrored to
 *   localStorage under `vector.artboards` so existing artboards code keeps
 *   working without change. Symbols are written to `vector.symbols`.
 *
 * File picker:
 * - Uses the File System Access API (`showSaveFilePicker` / `showOpenFilePicker`)
 *   when available so subsequent saves can write back to the same file without
 *   re-prompting. Otherwise falls back to a hidden `<a download>` + `<input
 *   type="file">` pair — same UX users already know from "Export JSON".
 */

import type { Artboard, DocSettings, SymbolEntry } from '../types';
import { useEditor } from '../store/editor';
import { getCanvas, resizeCanvas, setBackground, pushHistory } from './canvasEngine';
import { getArtboards } from './artboards';
import { getSymbols } from './symbols';
import { download } from './io';
import { t } from './i18n';
import { toast } from './toast';
import { addRecent } from './recentFiles';
import { isTauri, callNative } from './runtime';

export interface ProjectFile {
  kind: 'anchorworks-project';
  version: 1;
  createdAt: number;
  doc: DocSettings;
  canvas: object;
  artboards: Artboard[];
  symbols: SymbolEntry[];
}

const FILE_EXT = '.vstudio.json';
const DEFAULT_NAME = 'design' + FILE_EXT;
const ARTBOARDS_KEY = 'vector.artboards';
const SYMBOLS_KEY = 'vector.symbols';

// Module-scope handle so a "Save" after "Open" can write back to the same file.
// Typed loosely because `FileSystemFileHandle` isn't in lib.dom in every TS
// target the project might compile against.
let currentHandle: FileSystemFileHandleLike | null = null;
let currentName: string | null = null;
// Native path: under Tauri we don't have a `FileSystemFileHandle`; instead
// we cache the absolute OS path returned by `fs_save_project`/`fs_open_project`
// so quick-save can write back without re-prompting. Mutually exclusive with
// `currentHandle` — only one is set at a time, picked by the active shell.
let currentNativePath: string | null = null;

// Pub/sub for `currentName` — App.tsx subscribes to compose the document
// (and Tauri-shell window) title from the open project's filename. Same
// pattern as `subscribeRecent` / `subscribeAutoSaveStatus`.
const nameListeners = new Set<(name: string | null) => void>();
function emitName(): void {
  for (const fn of nameListeners) fn(currentName);
}
/** Read the open project's filename (null when nothing's been saved yet). */
export function getCurrentProjectName(): string | null { return currentName; }
/** Subscribe to project-name changes; callback fires immediately with the
 *  current value and then on every save / open / close. */
export function subscribeCurrentProjectName(fn: (name: string | null) => void): () => void {
  nameListeners.add(fn);
  fn(currentName);
  return () => { nameListeners.delete(fn); };
}

/** Minimal shape we depend on from the File System Access API. */
interface FileSystemFileHandleLike {
  name?: string;
  createWritable: () => Promise<{
    write: (data: Blob | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
  getFile: () => Promise<File>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

interface WindowWithFsAccess {
  showSaveFilePicker?: (opts: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
  showOpenFilePicker?: (opts: OpenFilePickerOptions) => Promise<FileSystemFileHandleLike[]>;
}

function fsAccess(): WindowWithFsAccess {
  return window as unknown as WindowWithFsAccess;
}

function pickerTypes() {
  return [
    {
      description: 'Anchorworks project',
      accept: { 'application/json': [FILE_EXT] as string[] },
    },
  ];
}

/** Gather the current editor state into a `ProjectFile` envelope. */
export function buildProject(): ProjectFile {
  const canvas = getCanvas();
  const doc = useEditor.getState().doc;
  const canvasJSON: object = canvas ? (canvas.toJSON() as object) : {};
  return {
    kind: 'anchorworks-project',
    version: 1,
    createdAt: Date.now(),
    doc: { ...doc },
    canvas: canvasJSON,
    artboards: getArtboards().map((a) => ({ ...a })),
    symbols: getSymbols().map((s) => ({ ...s })),
  };
}

function isProjectFile(value: unknown): value is ProjectFile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.kind === 'anchorworks-project'
    && typeof v.version === 'number'
    && typeof v.doc === 'object'
    && typeof v.canvas === 'object';
}

/**
 * Apply a parsed project file to the editor. Validates the envelope, restores
 * document settings, reloads the canvas, replaces artboards, and persists
 * symbols so the SymbolsPanel picks them up via its existing storage path.
 */
export async function applyProject(p: ProjectFile): Promise<void> {
  if (!isProjectFile(p)) throw new Error('Not a Anchorworks project file');
  if (p.version !== 1) {
    throw new Error(`Unsupported project version: ${p.version}`);
  }

  const canvas = getCanvas();
  if (!canvas) throw new Error('Canvas not ready');

  // 1) Document settings — size + background. We let Zustand drive the canvas
  // dimensions explicitly so subsequent zoomFit() math stays consistent.
  const docPatch: Partial<DocSettings> = {};
  if (typeof p.doc.width === 'number') docPatch.width = p.doc.width;
  if (typeof p.doc.height === 'number') docPatch.height = p.doc.height;
  if (typeof p.doc.background === 'string') docPatch.background = p.doc.background;
  if (typeof p.doc.dpi === 'number') docPatch.dpi = p.doc.dpi;
  if (typeof p.doc.unit === 'string') docPatch.unit = p.doc.unit;
  useEditor.getState().setDoc(docPatch);
  if (docPatch.width && docPatch.height) {
    resizeCanvas(docPatch.width, docPatch.height);
  }
  if (typeof docPatch.background === 'string') {
    setBackground(docPatch.background);
  }

  // 2) Canvas contents — clear, then loadFromJSON. We swallow Fabric's
  // resolution into a render call at the end.
  await canvas.loadFromJSON(p.canvas);
  canvas.requestRenderAll();

  // 3) Artboards — replace in Zustand and mirror to localStorage so
  // `loadArtboardsFromStorage` and the ArtboardsPanel stay in sync.
  const artboards = Array.isArray(p.artboards) ? p.artboards : [];
  useEditor.getState().setArtboards(artboards);
  try { localStorage.setItem(ARTBOARDS_KEY, JSON.stringify(artboards)); } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent('vector:artboards-changed')); } catch { /* ignore */ }

  // 4) Symbols — write straight to localStorage so the SymbolsPanel reads them
  // on its next `getSymbols()` call.
  const symbols = Array.isArray(p.symbols) ? p.symbols : [];
  try { localStorage.setItem(SYMBOLS_KEY, JSON.stringify(symbols)); } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent('vector:symbols-changed')); } catch { /* ignore */ }

  // Seed a history entry so the open is undoable back to whatever was there.
  pushHistory();
}

function serializeProject(): string {
  return JSON.stringify(buildProject());
}

/**
 * Capture a tiny PNG thumbnail of the current canvas for the Recent Files
 * menu. Multiplier 0.1 keeps the data URI well under a few KB so we can
 * safely persist a handful of them in localStorage. Returns `undefined`
 * if the canvas isn't ready or the export throws.
 */
function capturePreview(): string | undefined {
  try {
    const canvas = getCanvas();
    if (!canvas) return undefined;
    return canvas.toDataURL({ format: 'png', multiplier: 0.1 });
  } catch {
    return undefined;
  }
}

async function writeToHandle(handle: FileSystemFileHandleLike, body: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(new Blob([body], { type: 'application/json' }));
  await writable.close();
}

/**
 * Save the project to a user-chosen file. Uses the File System Access API
 * when available so subsequent quick-saves go to the same file. Falls back
 * to the standard `<a download>` path via `io.ts#download`.
 */
export async function saveProjectToFile(name?: string): Promise<void> {
  const suggestedName = name || currentName || DEFAULT_NAME;
  const body = serializeProject();

  // Native shell: route through Tauri's `fs_save_project` so the user sees
  // the OS file dialog and the bytes land via the Rust file system (no
  // browser download folder, no per-domain Quota, atomic write on POSIX).
  if (isTauri()) {
    try {
      const chosen = await callNative<string | null>(
        'fs_save_project',
        { bytes: body, suggestedName, path: null },
        async () => null, // unreachable — isTauri() guards
      );
      if (!chosen) return; // user cancelled
      currentNativePath = chosen;
      currentHandle = null;
      // The full absolute path is fine for window-title basename derivation;
      // store the leaf name as currentName so the rest of the UI keeps
      // working without seeing the OS path.
      const leaf = chosen.split(/[\\/]/).pop() ?? suggestedName;
      currentName = leaf;
      emitName();
      addRecent(leaf, capturePreview());
      toast.success(`${t('Saved')} ${leaf}`);
      return;
    } catch (err) {
      toast.error(formatErr(err), { title: t('Save failed') });
      return;
    }
  }

  const fs = fsAccess();
  if (typeof fs.showSaveFilePicker === 'function') {
    try {
      const handle = await fs.showSaveFilePicker({
        suggestedName,
        types: pickerTypes(),
      });
      await writeToHandle(handle, body);
      currentHandle = handle;
      currentName = handle.name ?? suggestedName;
      emitName();
      addRecent(currentName, capturePreview());
      toast.success(`${t('Saved')} ${currentName}`);
      return;
    } catch (err) {
      // User cancelled — no toast, no error log. AbortError is the canonical
      // cancel signal; any other shape we treat as a real failure.
      if (isAbortError(err)) return;
      toast.error(formatErr(err), { title: t('Save failed') });
      return;
    }
  }

  // Fallback: classic download.
  try {
    download(suggestedName, body, 'application/json');
    currentName = suggestedName;
    emitName();
    addRecent(suggestedName, capturePreview());
    toast.success(`${t('Saved')} ${suggestedName}`);
  } catch (err) {
    toast.error(formatErr(err), { title: t('Save failed') });
  }
}

/**
 * Open a `.vstudio.json` from disk and apply it to the editor. Uses the FS
 * Access API when available (so the handle can be reused for subsequent
 * saves); otherwise falls back to a hidden `<input type="file">`.
 */
export async function openProjectFromFile(): Promise<void> {
  // Native shell: ask Tauri for an OS file picker + the loaded bytes.
  if (isTauri()) {
    try {
      const opened = await callNative<{ path: string; name: string; bytes: string } | null>(
        'fs_open_project',
        undefined,
        async () => null,
      );
      if (!opened) return; // user cancelled
      const parsed = JSON.parse(opened.bytes);
      await applyProject(parsed as ProjectFile);
      currentNativePath = opened.path;
      currentHandle = null;
      currentName = opened.name;
      emitName();
      addRecent(opened.name, capturePreview());
      toast.success(`${t('Opened')} ${opened.name}`);
      return;
    } catch (err) {
      toast.error(formatErr(err), { title: t('Open failed') });
      return;
    }
  }

  const fs = fsAccess();
  if (typeof fs.showOpenFilePicker === 'function') {
    try {
      const [handle] = await fs.showOpenFilePicker({
        multiple: false,
        types: pickerTypes(),
      });
      if (!handle) return;
      const file = await handle.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text);
      await applyProject(parsed as ProjectFile);
      currentHandle = handle;
      currentName = handle.name ?? file.name;
      emitName();
      addRecent(currentName, capturePreview());
      toast.success(`${t('Opened')} ${currentName}`);
    } catch (err) {
      if (isAbortError(err)) return;
      toast.error(formatErr(err), { title: t('Open failed') });
    }
    return;
  }

  // Fallback: hidden file input.
  await new Promise<void>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${FILE_EXT},.json`;
    input.style.display = 'none';
    input.onchange = async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) { resolve(); return; }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        await applyProject(parsed as ProjectFile);
        currentHandle = null; // no handle in fallback mode
        currentName = file.name;
        emitName();
        addRecent(file.name, capturePreview());
        toast.success(`${t('Opened')} ${file.name}`);
      } catch (err) {
        toast.error(formatErr(err), { title: t('Open failed') });
      }
      resolve();
    };
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Save without prompting when we already have a handle from a prior open/save;
 * otherwise behave like `saveProjectToFile()`.
 */
export async function saveProjectQuick(): Promise<void> {
  // Native quick-save: write back to the path Tauri returned on the last
  // save/open without re-prompting. Mirrors the FS-Access path below.
  if (isTauri() && currentNativePath) {
    try {
      await callNative<string | null>(
        'fs_save_project',
        { bytes: serializeProject(), suggestedName: currentName ?? null, path: currentNativePath },
        async () => null,
      );
      if (currentName) addRecent(currentName, capturePreview());
      toast.success(`${t('Saved')} ${currentName ?? t('project')}`);
      return;
    } catch (err) {
      toast.error(formatErr(err), { title: t('Save failed') });
      return;
    }
  }
  if (currentHandle) {
    try {
      await writeToHandle(currentHandle, serializeProject());
      if (currentName) addRecent(currentName, capturePreview());
      toast.success(`${t('Saved')} ${currentName ?? t('project')}`);
      return;
    } catch (err) {
      // Handle may have been invalidated (file deleted, permissions revoked).
      // Fall through to the picker path so the user can choose a fresh
      // destination.
      currentHandle = null;
      toast.error(formatErr(err), { title: t('Save failed') });
    }
  }
  await saveProjectToFile(currentName ?? undefined);
}

/**
 * Re-open a file from the Recent Files list.
 *
 * NOTE on FS Access API limitations: the browser security model does not let
 * web pages programmatically open a known file by name — every read requires
 * fresh user consent through a picker. So "open recent" can't directly load
 * the previously-opened file; the best we can do is launch the standard
 * picker pre-filtered to `.vstudio.json` and surface a hint so the user
 * knows which file to pick.
 */
export async function openRecentFile(name: string): Promise<void> {
  toast.info(`${t('Pick this file in the picker to reopen it:')} "${name}"`);
  await openProjectFromFile();
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError';
}

function formatErr(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}
