/**
 * Auto-save support. Periodically captures the current canvas state to
 * localStorage so the user can recover their work after a refresh or crash.
 *
 * In addition to the snapshot loop, this module exposes a small status feed
 * — `getAutoSaveStatus()` / `subscribeAutoSaveStatus()` — that the MenuBar's
 * save indicator chip reads. We mark `dirty = true` when Fabric reports an
 * object change, and `dirty = false` after each successful autosave write.
 */

import { getCanvas } from './canvasEngine';
import { getAutoSaveInterval } from './preferences';
import { useEditor, type CutPath } from '../store/editor';
import { recordLibError } from './errorLog';
import { toast } from './toast';
import { t } from './i18n';

// Re-exported so callers (e.g. PreferencesDialog) can read the effective
// interval without pulling in `./preferences` separately.
export { getAutoSaveInterval };

const AUTOSAVE_KEY = 'vector.autosave';

export interface AutoSaveEntry {
  json: object;
  ts: number;
  /** Vinyl-cutter cut paths. Saved alongside the canvas so a reload
   *  / crash doesn't lose the contour work. Optional for forwards-
   *  compatibility with older autosave entries written before the
   *  cut-contour feature shipped. */
  cutPaths?: CutPath[];
}

export interface AutoSaveStatus {
  /** Wall-clock timestamp of the last successful autosave; null until first save. */
  lastSavedAt: number | null;
  /** True when the user has made changes since the last autosave. */
  dirty: boolean;
}

let timer: number | null = null;

// Status state — exposed via subscribers for the MenuBar chip.
let status: AutoSaveStatus = { lastSavedAt: null, dirty: false };
const statusListeners = new Set<(s: AutoSaveStatus) => void>();

// Cleanup function for the Fabric event listeners we attach inside
// `startAutoSave`. Lets us detach cleanly on `stopAutoSave`.
let detachCanvasListeners: (() => void) | null = null;

function setStatus(patch: Partial<AutoSaveStatus>) {
  status = { ...status, ...patch };
  // Hand subscribers a fresh object so React diffs cleanly.
  const snapshot = { ...status };
  for (const fn of statusListeners) fn(snapshot);
}

// Failure latch: once localStorage starts rejecting writes (quota exceeded)
// every autosave tick fails identically. Toast once per session so the user
// learns their work is no longer being snapshotted; later failures only go
// to the error log.
let failureToastShown = false;

function persistOnce() {
  const canvas = getCanvas();
  if (!canvas) return;
  try {
    const json = canvas.toJSON();
    const ts = Date.now();
    const cutPaths = useEditor.getState().cutPaths;
    const entry: AutoSaveEntry = {
      json: json as object,
      ts,
      // Omit the field entirely when no cut paths exist — keeps the
      // serialised payload small for the 99% case where users aren't
      // doing print-and-cut, and the entry remains shape-compatible
      // with the older v1 reader.
      ...(cutPaths.length > 0 ? { cutPaths } : {}),
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(entry));
    setStatus({ lastSavedAt: ts, dirty: false });
  } catch (e) {
    // Quota exceeded, private mode, or a canvas serialisation error — keep
    // autosaving (never throw out of the interval callback), but make the
    // failure visible: from here on every snapshot is silently lost. The
    // message stays accurate for non-quota causes too (the same catch covers
    // canvas.toJSON() throws), with quota called out when detectable.
    recordLibError('autosave', e);
    if (!failureToastShown) {
      failureToastShown = true;
      const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
      toast.warn(quota
        ? t('Autosave failed: storage quota exceeded. Recent changes are not being saved.')
        : t('Autosave failed — recent changes are not being saved.'));
    }
  }
}

/**
 * Attach Fabric listeners that flip `dirty` on any object mutation. Called
 * lazily from `startAutoSave` so it runs after `initCanvas`. Safe to call
 * multiple times.
 */
function attachCanvasListeners() {
  if (detachCanvasListeners) return;
  const canvas = getCanvas();
  if (!canvas) return;
  const markDirty = () => {
    if (!status.dirty) setStatus({ dirty: true });
  };
  canvas.on('object:added', markDirty);
  canvas.on('object:modified', markDirty);
  canvas.on('object:removed', markDirty);
  // Cut-path mutations need the same dirty-bit flip so autosave fires
  // after a contour/trace/regmark is generated. Subscribe to the
  // zustand store and watch for cutPaths identity changes.
  let prevCutPaths = useEditor.getState().cutPaths;
  const unsubCuts = useEditor.subscribe((state) => {
    if (state.cutPaths !== prevCutPaths) {
      prevCutPaths = state.cutPaths;
      markDirty();
    }
  });
  detachCanvasListeners = () => {
    canvas.off('object:added', markDirty);
    canvas.off('object:modified', markDirty);
    canvas.off('object:removed', markDirty);
    unsubCuts();
  };
}

export function startAutoSave(intervalMs?: number) {
  stopAutoSave();
  // Resolve the effective interval at boot: explicit argument wins (mainly
  // useful for tests), then App Preferences (`vector.prefs.autosaveIntervalMs`),
  // then the 30s default. `0` is the documented "off" sentinel — callers can
  // pick that to suspend the loop without unmounting the listeners.
  const ms = typeof intervalMs === 'number' ? intervalMs : getAutoSaveInterval();
  // Seed `lastSavedAt` from a prior session's entry so the chip can render a
  // useful "Saved Nm ago" immediately without waiting for the first tick.
  const prev = getLastAutoSave();
  if (prev) setStatus({ lastSavedAt: prev.ts, dirty: false });
  attachCanvasListeners();
  if (ms > 0) {
    timer = window.setInterval(persistOnce, ms);
  }
}

export function stopAutoSave() {
  if (timer != null) {
    window.clearInterval(timer);
    timer = null;
  }
  if (detachCanvasListeners) {
    detachCanvasListeners();
    detachCanvasListeners = null;
  }
}

export function getLastAutoSave(): AutoSaveEntry | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'json' in parsed && 'ts' in parsed) {
      return parsed as AutoSaveEntry;
    }
  } catch {
    /* corrupt entry — ignore */
  }
  return null;
}

export function clearAutoSave() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
  setStatus({ lastSavedAt: null, dirty: false });
}

/** Returns a fresh snapshot of the current autosave status. */
export function getAutoSaveStatus(): AutoSaveStatus {
  return { ...status };
}

/**
 * Subscribe to status changes (dirty toggles, save timestamps). The callback
 * is invoked immediately with the current state, then again on every change.
 * Returns an unsubscribe function.
 */
export function subscribeAutoSaveStatus(fn: (s: AutoSaveStatus) => void): () => void {
  statusListeners.add(fn);
  fn({ ...status });
  return () => { statusListeners.delete(fn); };
}
