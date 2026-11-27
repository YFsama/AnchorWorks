/**
 * Auto-save support. Periodically captures the current canvas state to
 * localStorage so the user can recover their work after a crash.
 *
 * Session model — what gets offered at the next launch, and how:
 *
 *   - An EMPTY canvas (no objects, no cut paths) is never snapshotted. An
 *     empty document has nothing to recover, so it must not leave a
 *     "recoverable" entry behind. A stale entry is removed only after two
 *     consecutive empty ticks, and only when THIS session wrote it.
 *   - `vector.sessionExit` records whether the previous session ended
 *     cleanly. Boot arms it (`clean: false`); page unload and the Tauri
 *     window-close request clear it. Only a `clean: false` mark turns an
 *     unsaved entry into the BLOCKING recovery modal — after a normal close
 *     (or with no mark at all, i.e. the first launch after an upgrade) the
 *     same entry gets a non-blocking prompt instead.
 *   - `changeSeq` (canvas mutations this session) and `savedSeq` (the same
 *     counter at the last project-file save) are stored in the entry:
 *     unsaved ⇔ changeSeq > savedSeq. Entries from older builds carry
 *     neither and are treated as unsaved — better one prompt too many than
 *     lost work.
 *
 * `decideSessionOffer()` is the pure decision table; `resolveSessionOffer()`
 * is its one-shot boot wrapper.
 *
 * In addition to the snapshot loop, this module exposes a small status feed
 * — `getAutoSaveStatus()` / `subscribeAutoSaveStatus()` — that the MenuBar's
 * save indicator chip reads. We mark `dirty = true` when Fabric reports an
 * object change, and `dirty = false` after each successful autosave write
 * (or on a tick that finds the canvas empty — nothing is pending then).
 */

import { getCanvas, pushHistory } from './canvasEngine';
import { getAutoSaveInterval } from './preferences';
import { useEditor, type CutPath } from '../store/editor';
import { recordLibError } from './errorLog';
import { toast, subscribeToasts } from './toast';
import { t } from './i18n';
import { showConfirm } from './confirm';
import { isTauri } from './runtime';
import { logger } from './debug';

// Re-exported so callers (e.g. PreferencesDialog) can read the effective
// interval without pulling in `./preferences` separately.
export { getAutoSaveInterval };

const AUTOSAVE_KEY = 'vector.autosave';
/** `{ clean, at }` — armed as `clean: false` at boot, cleared on a normal exit. */
const SESSION_EXIT_KEY = 'vector.sessionExit';
/** `ts` of the entry the user last ignored in the quiet prompt. */
const SESSION_DISMISS_KEY = 'vector.sessionDismiss';
/** Consecutive empty ticks before this session's own stale entry is removed. */
const EMPTY_TICKS_BEFORE_REMOVE = 2;
/**
 * `discardSessionAndReload()` stops autosave before reloading. If that
 * reload is somehow cancelled and the page lives on, autosave resumes after
 * this delay (the timer dies with the page when the reload does happen).
 */
const RELOAD_RESUME_MS = 2000;

export interface AutoSaveEntry {
  json: object;
  ts: number;
  /** Vinyl-cutter cut paths. Saved alongside the canvas so a reload
   *  / crash doesn't lose the contour work. Optional for forwards-
   *  compatibility with older autosave entries written before the
   *  cut-contour feature shipped. */
  cutPaths?: CutPath[];
  /** Canvas mutations so far in the session that wrote the entry. Absent
   *  on entries written by builds before the counter existed. */
  changeSeq?: number;
  /** `changeSeq` at the last successful project-file save. Absent until a
   *  project was actually saved in that session — "never saved" must never
   *  read as "saved". */
  savedSeq?: number;
  /** Identifies the page load that wrote the entry. Scoped cleanup
   *  (empty-canvas removal, save bookkeeping) only ever touches entries of
   *  the current session; a previous session's entry is its last copy. */
  sid?: string;
}

export interface AutoSaveStatus {
  /** Wall-clock timestamp of the last successful autosave; null until first save. */
  lastSavedAt: number | null;
  /** True when the user has made changes since the last autosave. */
  dirty: boolean;
}

/** `vector.sessionExit` — whether the session that wrote it ended cleanly. */
export interface SessionExitMark {
  clean: boolean;
  /** Wall-clock timestamp of the last write. */
  at: number;
}

export interface SessionOfferInput {
  entry: AutoSaveEntry | null;
  /** `false` = the last session crashed / was killed; `true` = normal exit;
   *  `null` / `undefined` = no mark (first launch after an upgrade). */
  exitClean: boolean | null | undefined;
  /** False when the live canvas already has objects or cut paths. */
  canvasEmpty: boolean;
  /** The user already ignored a prompt for this very entry. */
  dismissed?: boolean;
}

/**
 * What to show at launch for a leftover autosave entry:
 *   `modal` — blocking crash-recovery dialog,
 *   `quiet` — non-blocking prompt,
 *   `none`  — nothing.
 */
export type SessionOffer = 'none' | 'modal' | 'quiet';

let timer: number | null = null;

// Status state — exposed via subscribers for the MenuBar chip.
let status: AutoSaveStatus = { lastSavedAt: null, dirty: false };
const statusListeners = new Set<(s: AutoSaveStatus) => void>();

// Cleanup function for the Fabric event listeners we attach inside
// `startAutoSave`. Lets us detach cleanly on `stopAutoSave`.
let detachCanvasListeners: (() => void) | null = null;

// ---- Session bookkeeping (all per page load; modules are singletons) ----
/** Canvas mutations this session — bumped by the same dirty-marking hooks. */
let changeSeq = 0;
/** `changeSeq` at the last successful project-file save; null = never. */
let savedSeq: number | null = null;
/** Id of this page load, stamped into every entry it writes. */
let sessionId: string | null = null;
/** Consecutive autosave ticks that found the canvas empty. */
let emptyStreak = 0;
/** The exit mark of the PREVIOUS session, read once at boot. */
let previousExit: SessionExitMark | null = null;
let exitCaptured = false;
/** Latch so a re-run boot effect can never show a second prompt. */
let offerResolved = false;

function setStatus(patch: Partial<AutoSaveStatus>) {
  status = { ...status, ...patch };
  // Hand subscribers a fresh object so React diffs cleanly.
  const snapshot = { ...status };
  for (const fn of statusListeners) fn(snapshot);
}

function getSessionId(): string {
  if (sessionId) return sessionId;
  let id = '';
  try { id = globalThis.crypto?.randomUUID?.() ?? ''; } catch { /* fall through */ }
  sessionId = id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return sessionId;
}

// ---- Pure helpers on an entry --------------------------------------------

function entryObjects(entry: AutoSaveEntry): unknown {
  return (entry.json as { objects?: unknown } | null)?.objects;
}

/** Number of canvas objects recorded in an entry; null for an unrecognised shape. */
export function countAutoSaveObjects(entry: AutoSaveEntry): number | null {
  const objects = entryObjects(entry);
  return Array.isArray(objects) ? objects.length : null;
}

/**
 * True only when the entry is PROVABLY empty: a real, empty `objects` array
 * and no cut paths. Anything we don't recognise counts as content — an entry
 * must never be dropped or skipped on a guess.
 */
export function isAutoSaveEntryEmpty(entry: AutoSaveEntry): boolean {
  return countAutoSaveObjects(entry) === 0 && !(entry.cutPaths && entry.cutPaths.length > 0);
}

/**
 * Does the entry hold work that is not in a project file?
 * Unsaved ⇔ changeSeq > savedSeq. Entries without both counters (older
 * builds, or a session that never saved a project) are assumed unsaved.
 */
export function hasUnsavedChanges(entry: AutoSaveEntry): boolean {
  if (isAutoSaveEntryEmpty(entry)) return false;
  const seq = entry.changeSeq;
  const saved = entry.savedSeq;
  if (typeof seq !== 'number' || !Number.isFinite(seq)) return true;
  if (typeof saved !== 'number' || !Number.isFinite(saved)) return true;
  return seq > saved;
}

/**
 * Pure boot decision — what to show for a leftover autosave entry.
 *
 *   no entry | canvas already has content | entry is empty | nothing unsaved
 *     → `none`
 *   last session crashed (clean === false) + unsaved work  → `modal`
 *   clean / unknown exit + unsaved work (not ignored)        → `quiet`
 *
 * Side effects (dropping an empty entry) belong to `resolveSessionOffer`.
 */
export function decideSessionOffer({ entry, exitClean, canvasEmpty, dismissed = false }: SessionOfferInput): SessionOffer {
  if (!entry) return 'none';
  // Live work on the canvas wins — an entry must never clobber it.
  if (!canvasEmpty) return 'none';
  if (isAutoSaveEntryEmpty(entry)) return 'none';
  if (!hasUnsavedChanges(entry)) return 'none';
  if (exitClean === false) return 'modal';
  return dismissed ? 'none' : 'quiet';
}

// ---- Session exit mark ----------------------------------------------------

export function readSessionExitMark(): SessionExitMark | null {
  try {
    const raw = localStorage.getItem(SESSION_EXIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { clean?: unknown; at?: unknown };
    if (parsed && typeof parsed === 'object' && typeof parsed.clean === 'boolean') {
      return { clean: parsed.clean, at: typeof parsed.at === 'number' ? parsed.at : 0 };
    }
  } catch {
    /* corrupt mark — treat as absent */
  }
  return null;
}

function writeSessionExit(clean: boolean): void {
  try {
    localStorage.setItem(SESSION_EXIT_KEY, JSON.stringify({ clean, at: Date.now() }));
  } catch {
    /* storage blocked — the mark simply stays "not clean" */
  }
}

/**
 * Arm the exit mark at boot and report how the PREVIOUS session ended:
 * `true` (clean), `false` (crash / killed) or `null` (no mark). Idempotent —
 * StrictMode double-invokes the boot effect, and the second call must not
 * re-read the `clean: false` mark the first one just wrote.
 */
export function beginSession(): boolean | null {
  if (!exitCaptured) {
    exitCaptured = true;
    previousExit = readSessionExitMark();
  }
  writeSessionExit(false);
  return previousExit ? previousExit.clean : null;
}

/** How the previous session ended, once `beginSession()` has run. */
export function previousSessionExit(): boolean | null {
  return previousExit ? previousExit.clean : null;
}

/** Record how this session is ending. Idempotent; last write wins. */
export function markSessionExit(clean: boolean): void {
  writeSessionExit(clean);
}

// ---- Other live instances -------------------------------------------------

/**
 * Web Locks name held for the page's lifetime. The browser releases it by
 * itself when a page is closed OR crashes, which makes it a heartbeat-free
 * answer to "is another instance of the app still running?" — something the
 * exit mark alone cannot tell. A second tab / window booted while the first
 * is alive would otherwise read the first one's armed mark as a crash and
 * raise the recovery modal for work that is still open elsewhere.
 */
const SESSION_LOCK = 'vector.session';

type InstanceLiveness = 'alone' | 'shared' | 'unknown';
let instanceLiveness: InstanceLiveness = 'unknown';
let livenessProbe: Promise<void> | null = null;

/**
 * Boot-time probe, once per page load: is any other instance holding the
 * session lock? Then hold it for this page too. Never rejects. Without the
 * Web Locks API (or on error) the result stays `unknown` and the exit mark
 * decides on its own — the probe can only ever DOWNGRADE a crash to
 * "unknown", so a failure here never hides recoverable work.
 */
export function probeInstanceLiveness(): Promise<void> {
  livenessProbe ??= (async () => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) return;
    try {
      const state = await locks.query();
      instanceLiveness = (state.held ?? []).some((lock) => lock.name === SESSION_LOCK) ? 'shared' : 'alone';
      // Held until the page goes away: the callback's promise never settles.
      // Argument order is (name, options, callback) — Chromium rejects any
      // other shape with a TypeError.
      void locks.request(SESSION_LOCK, { ifAvailable: true }, () => new Promise<void>(() => {}))
        .catch((e) => console.warn('session lock could not be acquired — other windows cannot detect this one', e));
    } catch {
      /* leave 'unknown' */
    }
  })();
  return livenessProbe;
}

// Cached dynamic import (same shape as App.tsx's withProjectFile): the PWA
// build never pulls `@tauri-apps/api/window` into its chunk, and a StrictMode
// double-mounted effect shares one load instead of racing two.
let tauriWindowModule: Promise<typeof import('@tauri-apps/api/window')> | null = null;
function loadTauriWindowModule(): Promise<typeof import('@tauri-apps/api/window')> {
  tauriWindowModule ??= import('@tauri-apps/api/window');
  return tauriWindowModule;
}

/**
 * Mark the session clean on every normal-exit path. Returns a disposer that
 * detaches everything (StrictMode-safe, incl. a Tauri registration that
 * resolves only after its cleanup already ran).
 *
 *  - Web shell: `pagehide` (primary) + `beforeunload` (fallback). Neither
 *    calls `preventDefault`, so no "Leave site?" prompt ever appears.
 *  - Tauri shell: `onCloseRequested`. Note this is NOT a passive observer —
 *    once a JS listener exists Tauri keeps the window open and relies on the
 *    JS side to destroy it (see the note in the handler).
 */
export function installSessionExitTracking(): () => void {
  const markClean = () => writeSessionExit(true);
  // Back/forward cache: the page was frozen after a `pagehide` and is now
  // resumed — this session is live again, so re-arm the mark.
  const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) writeSessionExit(false); };
  window.addEventListener('pagehide', markClean);
  window.addEventListener('beforeunload', markClean);
  window.addEventListener('pageshow', onPageShow);

  let disposed = false;
  let unlistenClose: (() => void) | null = null;
  if (isTauri()) {
    void loadTauriWindowModule()
      .then((m) => m.getCurrentWindow().onCloseRequested(() => {
        // Deliberately NO event.preventDefault(): @tauri-apps/api answers an
        // un-prevented close request by destroying the window itself, which
        // is what actually closes the app. That destroy needs the
        // `core:window:allow-destroy` capability (src-tauri/capabilities) —
        // without it the window could never be closed again.
        writeSessionExit(true);
      }))
      .then((unlisten) => {
        // StrictMode: the cleanup may have run before this resolved.
        if (disposed) unlisten();
        else unlistenClose = unlisten;
      })
      .catch((e) => {
        // Let a later retry (or a re-mounted effect) load the chunk again.
        tauriWindowModule = null;
        console.warn('tauri window chunk failed to load — close tracking falls back to pagehide', e);
      });
  }
  return () => {
    disposed = true;
    window.removeEventListener('pagehide', markClean);
    window.removeEventListener('beforeunload', markClean);
    window.removeEventListener('pageshow', onPageShow);
    unlistenClose?.();
    unlistenClose = null;
  };
}

// ---- Snapshot loop --------------------------------------------------------

// Failure latch: once localStorage starts rejecting writes (quota exceeded)
// every autosave tick fails identically. Toast once per session so the user
// learns their work is no longer being snapshotted; later failures only go
// to the error log.
let failureToastShown = false;

function persistOnce() {
  const canvas = getCanvas();
  if (!canvas) return;
  const cutPaths = useEditor.getState().cutPaths;
  // Test doubles may not implement getObjects; an UNKNOWN object list is
  // never treated as empty — we don't skip or delete on a guess.
  const objectCount = typeof canvas.getObjects === 'function' ? canvas.getObjects().length : null;
  if (objectCount === 0 && cutPaths.length === 0) {
    onEmptyTick();
    return;
  }
  emptyStreak = 0;
  try {
    const json = canvas.toJSON();
    const ts = Date.now();
    const entry: AutoSaveEntry = {
      json: json as object,
      ts,
      // Omit the field entirely when no cut paths exist — keeps the
      // serialised payload small for the 99% case where users aren't
      // doing print-and-cut, and the entry remains shape-compatible
      // with the older v1 reader.
      ...(cutPaths.length > 0 ? { cutPaths } : {}),
      changeSeq,
      ...(savedSeq != null ? { savedSeq } : {}),
      sid: getSessionId(),
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

/** An autosave tick that found nothing on the canvas. Writes no snapshot. */
function onEmptyTick(): void {
  emptyStreak += 1;
  // Nothing is on the canvas, so nothing can be pending — don't leave the
  // save chip on "Unsaved changes" (and the title on "●") for good.
  // `lastSavedAt` is deliberately untouched: no snapshot was written.
  if (status.dirty) setStatus({ dirty: false });
  if (emptyStreak < EMPTY_TICKS_BEFORE_REMOVE) return;
  // Only an entry THIS session wrote describes the canvas we are looking at.
  // A previous session's entry is the last copy of that work and is never
  // removed here — the boot decision or the user decides its fate.
  const existing = getLastAutoSave();
  if (existing && existing.sid === getSessionId()) clearAutoSave();
}

/**
 * Attach Fabric listeners that flip `dirty` on any object mutation and count
 * the mutation in `changeSeq`. Called lazily from `startAutoSave` so it runs
 * after `initCanvas`. Safe to call multiple times.
 */
function attachCanvasListeners() {
  if (detachCanvasListeners) return;
  const canvas = getCanvas();
  if (!canvas) return;
  const markDirty = () => {
    changeSeq += 1;
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
  emptyStreak = 0;
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

function parseEntry(raw: string | null): AutoSaveEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'json' in parsed && 'ts' in parsed) {
      return parsed as AutoSaveEntry;
    }
  } catch {
    /* corrupt entry — ignore */
  }
  return null;
}

export function getLastAutoSave(): AutoSaveEntry | null {
  try {
    return parseEntry(localStorage.getItem(AUTOSAVE_KEY));
  } catch {
    /* storage blocked — ignore */
  }
  return null;
}

/** True when an autosave entry exists (cheap: no parse). */
export function hasAutoSaveEntry(): boolean {
  try { return localStorage.getItem(AUTOSAVE_KEY) !== null; } catch { return false; }
}

export function clearAutoSave() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
  emptyStreak = 0;
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

// ---- Project-file bookkeeping --------------------------------------------

/** Canvas mutations so far this session. */
export function getChangeSeq(): number {
  return changeSeq;
}

/**
 * Call after the project file has been written successfully (or opened — the
 * file then matches the canvas). `seq` is the `getChangeSeq()` value captured
 * when the bytes were serialised; it defaults to the current counter.
 *
 * Also brings a snapshot of THIS session that is already on disk in sync, so
 * an exit before the next autosave tick doesn't leave a stale "unsaved"
 * entry. A previous session's entry describes other work and is left alone.
 */
export function markProjectSaved(seq: number = changeSeq): void {
  savedSeq = seq;
  const stored = getLastAutoSave();
  if (!stored || stored.sid !== getSessionId()) return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...stored, savedSeq: seq }));
  } catch {
    /* quota / storage blocked — the next tick writes the pair anyway */
  }
}

// ---- Boot decision + prompts ----------------------------------------------

/** True when the live canvas has no objects and no cut paths. */
export function isCanvasEmpty(): boolean {
  const canvas = getCanvas();
  if (!canvas) return true;
  return canvas.getObjects().length === 0 && useEditor.getState().cutPaths.length === 0;
}

/** The user ignored a prompt for exactly this entry. */
export function isSessionOfferDismissed(entry: AutoSaveEntry): boolean {
  try { return localStorage.getItem(SESSION_DISMISS_KEY) === String(entry.ts); } catch { return false; }
}

/** Remember that the user ignored the prompt for `entry` (data is kept). */
export function dismissSessionOffer(entry: AutoSaveEntry): void {
  try { localStorage.setItem(SESSION_DISMISS_KEY, String(entry.ts)); } catch { /* ignore */ }
}

const NO_OFFER: { offer: SessionOffer; entry: AutoSaveEntry | null } = { offer: 'none', entry: null };

/**
 * One-shot boot decision. Reads storage, runs `decideSessionOffer`, drops an
 * empty entry on the spot, and returns what to show. A second call (a re-run
 * effect) is a no-op so a prompt can never appear twice.
 */
export function resolveSessionOffer(canvasEmpty: boolean): { offer: SessionOffer; entry: AutoSaveEntry | null } {
  if (offerResolved) return NO_OFFER;
  offerResolved = true;
  const entry = getLastAutoSave();
  const exitClean = previousSessionExit();
  const offer = decideSessionOffer({
    entry,
    // A mark left "not clean" while ANOTHER instance still holds the session
    // lock is not evidence of a crash — that instance is simply still
    // running. Read it as "unknown" (quiet), never as a crash.
    exitClean: exitClean === false && instanceLiveness === 'shared' ? null : exitClean,
    canvasEmpty,
    dismissed: entry ? isSessionOfferDismissed(entry) : false,
  });
  if (entry && isAutoSaveEntryEmpty(entry)) {
    // Older builds snapshotted empty documents too — nothing to recover.
    clearAutoSave();
  } else if (!entry && hasAutoSaveEntry()) {
    // Unreadable leftover: nothing can ever restore it, so don't let it keep
    // a dead File ▸ Restore Last Session… entry alive.
    clearAutoSave();
  }
  return offer === 'none' ? NO_OFFER : { offer, entry };
}

/**
 * Non-blocking prompt for unsaved work after a NORMAL close: a sticky toast
 * with Restore / Ignore. Ignoring (or closing the toast) only silences the
 * prompt for this entry — the entry itself stays for File ▸ Restore Last
 * Session…. Returns the toast id.
 */
export function showQuietSessionOffer(entry: AutoSaveEntry): string {
  const id = toast.show({
    kind: 'info',
    title: t('Unsaved changes from your last session'),
    message: t('Anchorworks closed with changes that were not saved to a project file.'),
    duration: 0,
    action: {
      label: t('Restore'),
      // No follow-up toast here on purpose. Clicking this already dismisses
      // the prompt, and ToastHost never unmounts a leaving toast when another
      // one is emitted within its 200 ms exit window (the removal timer is
      // cleared by the `[live]` effect cleanup) — the result would be an
      // invisible, click-blocking box. The restored canvas is the feedback.
      onClick: () => { void restoreLastSession({ notify: false }); },
    },
    actions: [
      { label: t('Ignore'), onClick: () => dismissSessionOffer(entry) },
    ],
  });
  // The toast's own ✕ is labelled "Dismiss" — honour it as Ignore too,
  // otherwise a prompt the user closed would come back on the next launch.
  let unsubscribe = () => {};
  unsubscribe = subscribeToasts((live) => {
    if (live.some((x) => x.id === id)) return;
    unsubscribe();
    dismissSessionOffer(entry);
  });
  return id;
}

/**
 * Replace the canvas (and cut paths) with an autosave entry. On success the
 * work is re-snapshotted at once so it is protected before the next tick. On
 * failure the entry is left untouched — it is still the only copy.
 */
export async function restoreAutoSaveEntry(entry: AutoSaveEntry): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  try {
    await canvas.loadFromJSON(entry.json);
    canvas.renderAll();
    // Cut paths ride along as of project schema v2 / autosave entry v2.
    // "Restore" replaces the document, so an entry without paths clears them.
    useEditor.getState().setCutPaths(Array.isArray(entry.cutPaths) ? entry.cutPaths : []);
    pushHistory();
  } catch (err) {
    logger.error('autosave', `restore failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  persistOnce();
  return true;
}

/**
 * Restore the most recent autosave entry. When the canvas already has
 * content, a danger confirm asks before it is replaced. `notify: false`
 * skips the success toast (failures are always reported).
 */
export async function restoreLastSession(opts: { notify?: boolean } = {}): Promise<boolean> {
  const entry = getLastAutoSave();
  if (!entry) {
    toast.warn(t('No previous session to restore.'));
    return false;
  }
  if (!isCanvasEmpty()) {
    const ok = await showConfirm({
      title: t('Restore Last Session…'),
      message: t('Replace the current canvas with the previous session? This cannot be undone.'),
      confirmLabel: t('Restore'),
      danger: true,
    });
    if (!ok) return false;
  }
  const ok = await restoreAutoSaveEntry(entry);
  if (!ok) toast.error(t('The previous session could not be restored.'), { title: t('Restore Last Session…') });
  else if (opts.notify !== false) toast.success(t('Previous session restored'));
  return ok;
}

/**
 * File ▸ New: drop the recoverable session, then reload the page.
 * Autosave is stopped first so no tick can re-write the entry between the
 * clear and the unload — otherwise the reload would be greeted by a restore
 * prompt for the document that was just thrown away.
 */
export function discardSessionAndReload(reload: () => void = () => location.reload()): void {
  stopAutoSave();
  clearAutoSave();
  reload();
  window.setTimeout(() => startAutoSave(), RELOAD_RESUME_MS);
}
