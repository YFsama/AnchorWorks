import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Session save / restore rework — the stateful half (the pure decision table
 * lives in sessionOffer.test.ts). Covers:
 *
 *   1. An empty canvas never produces a "recoverable" entry; a stale entry is
 *      removed only after two consecutive empty ticks, and only when it was
 *      written by THIS session (a previous session's work is never deleted
 *      behind the user's back).
 *   2. changeSeq / savedSeq bookkeeping: unsaved ⇔ changeSeq > savedSeq, with
 *      legacy entries assumed unsaved.
 *   3. The `vector.sessionExit` mark: boot arms it, page unload clears it.
 *   4. One-shot boot decision + the non-blocking prompt + restore helpers.
 *
 * autosave.ts keeps counters and latches as module state, so every test
 * re-imports its module graph fresh via vi.resetModules().
 */
type AutoSaveModule = typeof import('../autosave');
type CanvasEngineModule = typeof import('../canvasEngine');
type EditorModule = typeof import('../../store/editor');
type ToastModule = typeof import('../toast');
type ConfirmModule = typeof import('../confirm');
type ToastItem = import('../toast').Toast;

const KEY = 'vector.autosave';
const EXIT_KEY = 'vector.sessionExit';

const RECT = { type: 'rect', left: 10, top: 10, width: 20, height: 30 };
const CUT = { id: 'c1', points: [[0, 0], [1, 0], [1, 1]] as Array<[number, number]>, closed: true, kind: 'outline' as const };

/** Minimal fabric.Canvas stand-in: mutable object list + captured listeners. */
function makeCanvas(objects: unknown[] = []) {
  const handlers = new Map<string, Set<() => void>>();
  const calls = { loadFromJSON: [] as unknown[], renderAll: 0 };
  const stub = {
    getObjects: vi.fn(() => objects),
    toJSON: vi.fn(() => ({ version: '7.4.0', objects: [...objects] })),
    on: vi.fn((ev: string, fn: () => void) => {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev)!.add(fn);
    }),
    off: vi.fn((ev: string, fn: () => void) => { handlers.get(ev)?.delete(fn); }),
    loadFromJSON: vi.fn(async (json: { objects?: unknown[] }) => {
      calls.loadFromJSON.push(json);
      objects.splice(0, objects.length, ...(json.objects ?? []));
    }),
    renderAll: vi.fn(() => { calls.renderAll += 1; }),
  };
  const fire = (ev: string) => { handlers.get(ev)?.forEach((fn) => fn()); };
  return { stub, fire, calls };
}

const readEntry = () => {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
};

/** Fresh module graph with the canvas stub wired in and autosave on a 1 s tick. */
async function boot(objects: unknown[] = [], intervalMs = 1000) {
  vi.resetModules();
  const canvasEngine: CanvasEngineModule = await import('../canvasEngine');
  const editor: EditorModule = await import('../../store/editor');
  const autosave: AutoSaveModule = await import('../autosave');
  const made = makeCanvas(objects);
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(made.stub as never);
  autosave.startAutoSave(intervalMs);
  return { autosave, canvasEngine, editor, ...made };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/* ---------------------------------------------------------------------- */
/* 1. Empty canvas never produces a recoverable entry                      */
/* ---------------------------------------------------------------------- */

describe('autosave — empty canvas', () => {
  it('never writes a snapshot while the canvas is empty (no objects, no cut paths)', async () => {
    const { autosave } = await boot([]);
    try {
      vi.advanceTimersByTime(10_500); // ten ticks on an empty canvas
      expect(localStorage.getItem(KEY)).toBeNull();
      // Status stays at its baseline: "Not saved yet" is the truthful label.
      expect(autosave.getAutoSaveStatus()).toEqual({ lastSavedAt: null, dirty: false });
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('reports no pending changes once the canvas is empty again', async () => {
    const objects = [RECT];
    const { autosave, fire } = await boot(objects);
    try {
      vi.advanceTimersByTime(1000);
      expect(readEntry()).not.toBeNull();
      // User deletes the last object → dirty flips on…
      objects.length = 0;
      fire('object:removed');
      expect(autosave.getAutoSaveStatus().dirty).toBe(true);
      // …and the next (empty) tick clears it — there is nothing left to save.
      vi.advanceTimersByTime(1000);
      expect(autosave.getAutoSaveStatus().dirty).toBe(false);
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('cut paths alone keep the canvas "non-empty" and are snapshotted', async () => {
    const { autosave, editor } = await boot([]);
    try {
      editor.useEditor.getState().setCutPaths([CUT]);
      vi.advanceTimersByTime(1000);
      expect(readEntry()?.cutPaths).toEqual([CUT]);
      expect(autosave.getAutoSaveStatus().lastSavedAt).not.toBeNull();
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('does not touch lastSavedAt on an empty tick (no phantom "Saved just now")', async () => {
    const { autosave } = await boot([]);
    try {
      vi.advanceTimersByTime(3000);
      expect(autosave.getAutoSaveStatus().lastSavedAt).toBeNull();
    } finally {
      autosave.stopAutoSave();
    }
  });
});

/* ---------------------------------------------------------------------- */
/* 2. Removing a stale entry: two empty ticks, this session only           */
/* ---------------------------------------------------------------------- */

describe('autosave — stale entry removal', () => {
  it('removes this session’s own entry only after TWO consecutive empty ticks', async () => {
    const objects = [RECT];
    const { autosave, fire } = await boot(objects);
    try {
      vi.advanceTimersByTime(1000);
      expect(readEntry()).not.toBeNull();
      // The user clears everything.
      objects.length = 0;
      fire('object:removed');
      vi.advanceTimersByTime(1000); // empty tick #1 — transient-empty guard
      expect(readEntry()).not.toBeNull();
      vi.advanceTimersByTime(1000); // empty tick #2
      expect(localStorage.getItem(KEY)).toBeNull();
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('resets the streak when a non-empty tick comes in between', async () => {
    const objects: unknown[] = [RECT];
    const { autosave, fire } = await boot(objects);
    try {
      vi.advanceTimersByTime(1000); // written
      objects.length = 0; fire('object:removed');
      vi.advanceTimersByTime(1000); // empty #1
      expect(readEntry()).not.toBeNull();
      objects.push(RECT); fire('object:added');
      vi.advanceTimersByTime(1000); // non-empty — written again, streak reset
      expect(readEntry()).not.toBeNull();
      objects.length = 0; fire('object:removed');
      vi.advanceTimersByTime(1000); // empty #1 again
      expect(readEntry()).not.toBeNull();
      vi.advanceTimersByTime(1000); // empty #2
      expect(localStorage.getItem(KEY)).toBeNull();
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('never deletes an entry written by a PREVIOUS session, however long the canvas stays empty', async () => {
    const previous = { json: { version: '7.4.0', objects: [RECT] }, ts: 1, changeSeq: 3, sid: 'older-session' };
    localStorage.setItem(KEY, JSON.stringify(previous));
    const { autosave } = await boot([]);
    try {
      vi.advanceTimersByTime(60_000); // a minute of empty ticks
      expect(readEntry()).toEqual(previous);
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('does not delete an entry that has no session id (written by an older build)', async () => {
    const legacy = { json: { version: '7.4.0', objects: [RECT] }, ts: 1 };
    localStorage.setItem(KEY, JSON.stringify(legacy));
    const { autosave } = await boot([]);
    try {
      vi.advanceTimersByTime(60_000);
      expect(readEntry()).toEqual(legacy);
    } finally {
      autosave.stopAutoSave();
    }
  });
});

/* ---------------------------------------------------------------------- */
/* 3. changeSeq / savedSeq                                                 */
/* ---------------------------------------------------------------------- */

describe('autosave — changeSeq / savedSeq', () => {
  it('counts every canvas mutation and records the counter in the entry', async () => {
    const objects = [RECT];
    const { autosave, fire } = await boot(objects);
    try {
      fire('object:added');
      fire('object:modified');
      fire('object:removed');
      expect(autosave.getChangeSeq()).toBe(3);
      vi.advanceTimersByTime(1000);
      expect(readEntry()?.changeSeq).toBe(3);
      // No project save this session → savedSeq is absent → unsaved.
      expect(readEntry()?.savedSeq).toBeUndefined();
      expect(autosave.hasUnsavedChanges(readEntry() as never)).toBe(true);
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('cut-path changes bump the counter too', async () => {
    const objects = [RECT];
    const { autosave, editor } = await boot(objects);
    try {
      editor.useEditor.getState().setCutPaths([CUT]);
      expect(autosave.getChangeSeq()).toBe(1);
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('markProjectSaved() updates the entry already on disk — a crash before the next tick must not read as unsaved', async () => {
    const objects = [RECT];
    const { autosave, fire } = await boot(objects);
    try {
      fire('object:added');
      fire('object:modified');
      vi.advanceTimersByTime(1000);
      expect(readEntry()?.changeSeq).toBe(2);
      autosave.markProjectSaved();
      // The user closes the tab right after saving — before another tick.
      expect(readEntry()?.savedSeq).toBe(2);
      expect(autosave.hasUnsavedChanges(readEntry() as never)).toBe(false);
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('edits made after the project save are unsaved again', async () => {
    const objects = [RECT];
    const { autosave, fire } = await boot(objects);
    try {
      fire('object:added');
      autosave.markProjectSaved();
      fire('object:modified');
      vi.advanceTimersByTime(1000);
      expect(readEntry()).toMatchObject({ changeSeq: 2, savedSeq: 1 });
      expect(autosave.hasUnsavedChanges(readEntry() as never)).toBe(true);
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('markProjectSaved(seq) keeps an edit made DURING the save write unsaved', async () => {
    const objects = [RECT];
    const { autosave, fire } = await boot(objects);
    try {
      fire('object:added');
      fire('object:added');
      const seqAtSerialize = autosave.getChangeSeq(); // projectFile captures this before serialising
      fire('object:modified'); // …the user keeps editing while the file is being written
      autosave.markProjectSaved(seqAtSerialize);
      expect(autosave.hasUnsavedChanges({ json: {}, ts: 1, changeSeq: autosave.getChangeSeq(), savedSeq: seqAtSerialize })).toBe(true);
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('markProjectSaved() never marks a PREVIOUS session’s entry as saved', async () => {
    const previous = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 9, sid: 'older-session' };
    localStorage.setItem(KEY, JSON.stringify(previous));
    // Canvas is still empty, so nothing has overwritten the old entry yet.
    const { autosave } = await boot([]);
    try {
      autosave.markProjectSaved();
      expect(readEntry()).toEqual(previous);
      expect(autosave.hasUnsavedChanges(readEntry() as never)).toBe(true);
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('markProjectSaved() is harmless when nothing was ever snapshotted', async () => {
    const { autosave } = await boot([]);
    try {
      expect(() => autosave.markProjectSaved()).not.toThrow();
      expect(localStorage.getItem(KEY)).toBeNull();
    } finally {
      autosave.stopAutoSave();
    }
  });
});

/* ---------------------------------------------------------------------- */
/* 4. vector.sessionExit mark                                              */
/* ---------------------------------------------------------------------- */

describe('sessionExit mark', () => {
  async function fresh() {
    vi.resetModules();
    return import('../autosave');
  }

  it('beginSession() arms the mark as "not clean" and returns the PREVIOUS mark', async () => {
    const { beginSession, readSessionExitMark } = await fresh();
    localStorage.setItem(EXIT_KEY, JSON.stringify({ clean: true, at: 1 }));
    expect(beginSession()).toBe(true);
    const mark = readSessionExitMark();
    expect(mark?.clean).toBe(false);
    expect(typeof mark?.at).toBe('number');
  });

  it('beginSession() is idempotent under a StrictMode double-invoke', async () => {
    const { beginSession, readSessionExitMark } = await fresh();
    localStorage.setItem(EXIT_KEY, JSON.stringify({ clean: false, at: 1 }));
    expect(beginSession()).toBe(false);
    expect(beginSession()).toBe(false); // must not re-read the mark it just wrote
    expect(beginSession()).toBe(false);
    expect(readSessionExitMark()?.clean).toBe(false);
  });

  it('returns null when there is no mark (first launch after an upgrade = unknown)', async () => {
    const { beginSession, previousSessionExit } = await fresh();
    expect(beginSession()).toBeNull();
    expect(previousSessionExit()).toBeNull();
  });

  it('returns null for a corrupt mark', async () => {
    const { beginSession, readSessionExitMark } = await fresh();
    localStorage.setItem(EXIT_KEY, '{not-json');
    expect(beginSession()).toBeNull();
    expect(readSessionExitMark()?.clean).toBe(false);
  });

  it('markSessionExit(true) records a clean exit', async () => {
    const { beginSession, markSessionExit, readSessionExitMark } = await fresh();
    beginSession();
    markSessionExit(true);
    expect(readSessionExitMark()?.clean).toBe(true);
    markSessionExit(false);
    expect(readSessionExitMark()?.clean).toBe(false);
  });

  it('pagehide marks a clean exit (web shell)', async () => {
    const { beginSession, installSessionExitTracking, readSessionExitMark } = await fresh();
    beginSession();
    const dispose = installSessionExitTracking();
    window.dispatchEvent(new Event('pagehide'));
    expect(readSessionExitMark()?.clean).toBe(true);
    dispose();
  });

  it('beforeunload is the fallback and never prompts "Leave site?"', async () => {
    const { beginSession, installSessionExitTracking, readSessionExitMark } = await fresh();
    beginSession();
    const dispose = installSessionExitTracking();
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(readSessionExitMark()?.clean).toBe(true);
    expect(ev.defaultPrevented).toBe(false);
    dispose();
  });

  it('a page restored from the back/forward cache is re-armed as "not clean"', async () => {
    const { beginSession, installSessionExitTracking, readSessionExitMark } = await fresh();
    beginSession();
    const dispose = installSessionExitTracking();
    window.dispatchEvent(new Event('pagehide'));
    expect(readSessionExitMark()?.clean).toBe(true);
    const shown = new Event('pageshow');
    Object.defineProperty(shown, 'persisted', { value: true });
    window.dispatchEvent(shown);
    expect(readSessionExitMark()?.clean).toBe(false);
    dispose();
  });

  it('dispose() detaches every listener (StrictMode cleanup leaves nothing behind)', async () => {
    const { beginSession, installSessionExitTracking, markSessionExit, readSessionExitMark } = await fresh();
    beginSession();
    installSessionExitTracking()();
    markSessionExit(false);
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('beforeunload'));
    expect(readSessionExitMark()?.clean).toBe(false);
  });

  it('readSessionExitMark() returns null when nothing was written', async () => {
    const { readSessionExitMark } = await fresh();
    expect(readSessionExitMark()).toBeNull();
  });
});

/* ---------------------------------------------------------------------- */
/* 5. Boot decision, quiet prompt, restore, File ▸ New                     */
/* ---------------------------------------------------------------------- */

describe('boot decision wiring', () => {
  it('quiet for a clean exit with unsaved work, and runs exactly once per page load', async () => {
    const previous = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 };
    localStorage.setItem(KEY, JSON.stringify(previous));
    localStorage.setItem(EXIT_KEY, JSON.stringify({ clean: true, at: 1 }));
    const { autosave } = await boot();
    autosave.beginSession();
    expect(autosave.resolveSessionOffer(true)).toEqual({ offer: 'quiet', entry: previous });
    // Second call (e.g. a re-run effect) is a no-op — no duplicate prompt.
    expect(autosave.resolveSessionOffer(true)).toEqual({ offer: 'none', entry: null });
  });

  it('unknown exit (no mark) with unsaved work is quiet, never a modal', async () => {
    const previous = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 };
    localStorage.setItem(KEY, JSON.stringify(previous));
    const { autosave } = await boot();
    autosave.beginSession();
    expect(autosave.resolveSessionOffer(true)).toEqual({ offer: 'quiet', entry: previous });
  });

  it('modal after a crash with unsaved work', async () => {
    const previous = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 };
    localStorage.setItem(KEY, JSON.stringify(previous));
    localStorage.setItem(EXIT_KEY, JSON.stringify({ clean: false, at: 1 }));
    const { autosave } = await boot();
    autosave.beginSession();
    expect(autosave.resolveSessionOffer(true)).toEqual({ offer: 'modal', entry: previous });
  });

  it('an ignored entry is not offered again', async () => {
    const previous = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 };
    localStorage.setItem(KEY, JSON.stringify(previous));
    localStorage.setItem(EXIT_KEY, JSON.stringify({ clean: true, at: 1 }));
    localStorage.setItem('vector.sessionDismiss', '5');
    const { autosave } = await boot();
    autosave.beginSession();
    expect(autosave.resolveSessionOffer(true)).toEqual({ offer: 'none', entry: null });
    // …but the entry itself is kept for File ▸ Restore Last Session….
    expect(readEntry()).toEqual(previous);
  });

  it('an old-build empty entry is dropped on the spot', async () => {
    localStorage.setItem(KEY, JSON.stringify({ json: { version: '7.4.0', objects: [] }, ts: 5 }));
    const { autosave } = await boot();
    expect(autosave.resolveSessionOffer(true)).toEqual({ offer: 'none', entry: null });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('an unreadable entry is dropped instead of feeding a dead File ▸ Restore… item', async () => {
    localStorage.setItem(KEY, '{not-json');
    const { autosave } = await boot();
    expect(autosave.hasAutoSaveEntry()).toBe(true);
    expect(autosave.resolveSessionOffer(true)).toEqual({ offer: 'none', entry: null });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('nothing to offer without an entry', async () => {
    const { autosave } = await boot();
    expect(autosave.resolveSessionOffer(true)).toEqual({ offer: 'none', entry: null });
  });
});

describe('several instances of the app (second tab / window)', () => {
  /** The lock name autosave.ts holds for the page's lifetime. */
  const LOCK = 'vector.session';

  /**
   * Minimal LockManager. `held` names are reported as held by someone else.
   * `request` enforces the REAL web signature — (name, options, callback) —
   * exactly like Chromium does, so a swapped argument order fails here the
   * same way it fails in the browser (it once passed a looser fake).
   */
  function fakeLocks(held: string[]) {
    const locks = {
      query: vi.fn(async () => ({ held: held.map((name) => ({ name })), pending: [] })),
      request: vi.fn((name: string, options: unknown, grant: (lock: null) => void) => {
        if (typeof options !== 'object' || options === null || typeof grant !== 'function') {
          return Promise.reject(new TypeError(`parameter 3 is not of type 'Function' (${name})`));
        }
        grant(null);
        return new Promise<void>(() => {});
      }),
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    return locks;
  }

  async function bootWithCrashMark(entry: Record<string, unknown>) {
    localStorage.setItem(KEY, JSON.stringify(entry));
    localStorage.setItem(EXIT_KEY, JSON.stringify({ clean: false, at: 1 }));
    const { autosave } = await boot();
    autosave.beginSession();
    return autosave;
  }

  afterEach(() => { Reflect.deleteProperty(navigator, 'locks'); });

  it('an armed mark left by a STILL-RUNNING instance is not a crash ⇒ quiet, not a modal', async () => {
    const locks = fakeLocks([LOCK]);
    const autosave = await bootWithCrashMark({ json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 });
    await autosave.probeInstanceLiveness();
    expect(locks.query).toHaveBeenCalledTimes(1);
    expect(autosave.resolveSessionOffer(true).offer).toBe('quiet');
  });

  it('with no other instance alive the same mark is a real crash ⇒ modal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const locks = fakeLocks([]);
    const autosave = await bootWithCrashMark({ json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 });
    await autosave.probeInstanceLiveness();
    expect(autosave.resolveSessionOffer(true).offer).toBe('modal');
    // …and this page now holds the session lock itself, through the real
    // request(name, options, callback) shape (callback promise never settles).
    expect(locks.request).toHaveBeenCalledTimes(1);
    expect(locks.request.mock.calls[0][0]).toBe(LOCK);
    expect(locks.request.mock.calls[0][1]).toEqual({ ifAvailable: true });
    expect(typeof locks.request.mock.calls[0][2]).toBe('function');
    // The rejected shape would have surfaced as a console warning, never a throw.
    expect(warn).not.toHaveBeenCalled();
  });

  it('without the Web Locks API the exit mark decides on its own', async () => {
    Reflect.deleteProperty(navigator, 'locks');
    const autosave = await bootWithCrashMark({ json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 });
    await expect(autosave.probeInstanceLiveness()).resolves.toBeUndefined();
    expect(autosave.resolveSessionOffer(true).offer).toBe('modal');
  });

  it('a failing LockManager never blocks the boot decision', async () => {
    Object.defineProperty(navigator, 'locks', {
      value: { query: vi.fn(async () => { throw new Error('locks unavailable'); }), request: vi.fn() },
      configurable: true,
    });
    const autosave = await bootWithCrashMark({ json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 });
    await expect(autosave.probeInstanceLiveness()).resolves.toBeUndefined();
    expect(autosave.resolveSessionOffer(true).offer).toBe('modal');
  });

  it('the probe runs once per page load (StrictMode double-invoke included)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const locks = fakeLocks([]);
    const autosave = await bootWithCrashMark({ json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 });
    await Promise.all([autosave.probeInstanceLiveness(), autosave.probeInstanceLiveness()]);
    expect(locks.query).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a lock that cannot be acquired is reported, and still counts as a real crash here', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.defineProperty(navigator, 'locks', {
      value: {
        query: vi.fn(async () => ({ held: [], pending: [] })),
        request: vi.fn(() => Promise.reject(new Error('sandboxed'))),
      },
      configurable: true,
    });
    const autosave = await bootWithCrashMark({ json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 });
    await autosave.probeInstanceLiveness();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(autosave.resolveSessionOffer(true).offer).toBe('modal');
  });
});

describe('quiet prompt (toast)', () => {
  it('is a sticky toast with Restore / Ignore actions', async () => {
    vi.resetModules();
    const canvasEngine: CanvasEngineModule = await import('../canvasEngine');
    const autosave: AutoSaveModule = await import('../autosave');
    const toastMod: ToastModule = await import('../toast');
    const made = makeCanvas([]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(made.stub as never);

    const entry = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 } as never;
    let live: ToastItem[] = [];
    toastMod.subscribeToasts((list) => { live = list; });
    autosave.showQuietSessionOffer(entry);

    expect(live).toHaveLength(1);
    expect(live[0].duration).toBe(0);
    expect(live[0].action?.label).toBe('Restore');
    expect(live[0].actions?.map((a) => a.label)).toEqual(['Ignore']);
  });

  it('Ignore remembers the dismissed entry so it is not offered again — and keeps the data', async () => {
    vi.resetModules();
    const autosave: AutoSaveModule = await import('../autosave');
    const toastMod: ToastModule = await import('../toast');
    const entry = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 };
    localStorage.setItem(KEY, JSON.stringify(entry));

    let live: ToastItem[] = [];
    toastMod.subscribeToasts((list) => { live = list; });
    autosave.showQuietSessionOffer(entry as never);
    live[0].actions![0].onClick();

    expect(autosave.isSessionOfferDismissed(entry as never)).toBe(true);
    expect(autosave.decideSessionOffer({ entry: entry as never, exitClean: true, canvasEmpty: true, dismissed: true })).toBe('none');
    // The entry itself is untouched — File ▸ Restore Last Session… still has it.
    expect(readEntry()).toEqual(entry);
  });

  it('the toast’s own ✕ counts as Ignore too (no way to silence it "just once" by accident)', async () => {
    vi.resetModules();
    const autosave: AutoSaveModule = await import('../autosave');
    const toastMod: ToastModule = await import('../toast');
    const entry = { json: { version: '7.4.0', objects: [RECT] }, ts: 7, changeSeq: 3 };
    let live: ToastItem[] = [];
    toastMod.subscribeToasts((list) => { live = list; });
    autosave.showQuietSessionOffer(entry as never);
    toastMod.toast.dismiss(live[0].id);
    expect(autosave.isSessionOfferDismissed(entry as never)).toBe(true);
  });
});

describe('restoreLastSession', () => {
  async function bootForRestore(objects: unknown[], entry: Record<string, unknown> | null) {
    vi.resetModules();
    if (entry) localStorage.setItem(KEY, JSON.stringify(entry));
    const canvasEngine: CanvasEngineModule = await import('../canvasEngine');
    const editor: EditorModule = await import('../../store/editor');
    const confirmMod: ConfirmModule = await import('../confirm');
    const autosave: AutoSaveModule = await import('../autosave');
    const made = makeCanvas(objects);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(made.stub as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    return { autosave, editor, confirmMod, ...made };
  }

  it('loads the canvas + cut paths and re-snapshots immediately', async () => {
    const entry = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, cutPaths: [CUT], changeSeq: 3 };
    const { autosave, editor, stub } = await bootForRestore([], entry);
    await expect(autosave.restoreLastSession()).resolves.toBe(true);
    expect(stub.loadFromJSON).toHaveBeenCalledWith(entry.json);
    expect(stub.getObjects()).toHaveLength(1);
    expect(editor.useEditor.getState().cutPaths).toEqual([CUT]);
    // Fresh snapshot: newer timestamp, same content, and owned by THIS session…
    const after = readEntry()!;
    expect(after.ts).toBeGreaterThan(5);
    expect((after.json as { objects: unknown[] }).objects).toHaveLength(1);
    expect(typeof after.sid).toBe('string');
    // …so clearing the canvas now retires it like any other this-session entry.
    stub.getObjects().length = 0;
    editor.useEditor.getState().setCutPaths([]);
    autosave.startAutoSave(1000);
    try {
      vi.advanceTimersByTime(2100);
      expect(localStorage.getItem(KEY)).toBeNull();
    } finally {
      autosave.stopAutoSave();
    }
  });

  it('asks before replacing a canvas that already has content (danger confirm)', async () => {
    const entry = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 };
    const { autosave, confirmMod, stub } = await bootForRestore([RECT], entry);
    const ask = vi.spyOn(confirmMod, 'showConfirm');

    // Declined → nothing is touched.
    ask.mockResolvedValueOnce(false);
    await expect(autosave.restoreLastSession()).resolves.toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0].danger).toBe(true);
    expect(stub.loadFromJSON).not.toHaveBeenCalled();
    expect(readEntry()?.ts).toBe(5);

    // Accepted → restored.
    ask.mockResolvedValueOnce(true);
    await expect(autosave.restoreLastSession()).resolves.toBe(true);
    expect(stub.loadFromJSON).toHaveBeenCalledTimes(1);
  });

  it('does not ask when the canvas is empty', async () => {
    const entry = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 };
    const { autosave, confirmMod } = await bootForRestore([], entry);
    const ask = vi.spyOn(confirmMod, 'showConfirm');
    await expect(autosave.restoreLastSession()).resolves.toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks when only cut paths are on the canvas', async () => {
    const entry = { json: { version: '7.4.0', objects: [] }, ts: 5, cutPaths: [CUT], changeSeq: 3 };
    const { autosave, editor, confirmMod } = await bootForRestore([], entry);
    editor.useEditor.getState().setCutPaths([CUT]);
    const ask = vi.spyOn(confirmMod, 'showConfirm').mockResolvedValue(false);
    await expect(autosave.restoreLastSession()).resolves.toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('a failed restore keeps the entry (the only copy is never thrown away)', async () => {
    const entry = { json: { version: '7.4.0', objects: [RECT] }, ts: 5, changeSeq: 3 };
    const { autosave, stub } = await bootForRestore([], entry);
    stub.loadFromJSON.mockRejectedValueOnce(new Error('bad geometry'));
    await expect(autosave.restoreLastSession()).resolves.toBe(false);
    expect(readEntry()).toEqual(entry);
  });

  it('reports "nothing to restore" instead of failing silently', async () => {
    const { autosave, stub } = await bootForRestore([], null);
    const toastMod: ToastModule = await import('../toast');
    const warn = vi.spyOn(toastMod.toast, 'warn').mockImplementation(() => 't1');
    await expect(autosave.restoreLastSession()).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(stub.loadFromJSON).not.toHaveBeenCalled();
  });
});

describe('hasAutoSaveEntry', () => {
  it('tracks whether a restore target exists', async () => {
    const { autosave } = await boot([RECT]);
    expect(autosave.hasAutoSaveEntry()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(autosave.hasAutoSaveEntry()).toBe(true);
    autosave.clearAutoSave();
    expect(autosave.hasAutoSaveEntry()).toBe(false);
  });
});

describe('File ▸ New — discardSessionAndReload', () => {
  it('clears the entry and stops autosave so no tick can re-write it before the page unloads', async () => {
    const objects = [RECT];
    const { autosave } = await boot(objects);
    vi.advanceTimersByTime(1000);
    expect(readEntry()).not.toBeNull();

    const reload = vi.fn();
    autosave.discardSessionAndReload(reload);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEY)).toBeNull();
    // A tick was due 600 ms later — it must not resurrect the entry.
    vi.advanceTimersByTime(1500);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('resumes autosaving if the page somehow survives the reload', async () => {
    const objects = [RECT];
    const { autosave } = await boot(objects);
    vi.advanceTimersByTime(1000);
    autosave.discardSessionAndReload(vi.fn());
    // Resume timer (2 s) → loop restarts on the preference interval (30 s default).
    vi.advanceTimersByTime(2000 + 30_000);
    expect(readEntry()?.json).toEqual({ version: '7.4.0', objects: [RECT] });
  });

  it('is safe to call when nothing was ever saved', async () => {
    const { autosave } = await boot([]);
    const reload = vi.fn();
    expect(() => autosave.discardSessionAndReload(reload)).not.toThrow();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

/* ---------------------------------------------------------------------- */
/* 6. Tauri capability guard                                               */
/* ---------------------------------------------------------------------- */

/**
 * `installSessionExitTracking()` registers `onCloseRequested` under Tauri.
 * Tauri's runtime keeps the window open as soon as a JS listener exists for
 * the close-requested event and relies on the JS side to destroy the window
 * (see tauri/src/manager/window.rs: `api.prevent_close()` when
 * `has_js_listener`). Without `core:window:allow-destroy` that destroy is
 * rejected and the window can never be closed again — so pin the grant here.
 */
describe('Tauri capability keeps the window closable', () => {
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const capDir = join(srcRoot, 'src-tauri', 'capabilities');

  it('grants core:window:allow-destroy to the main window', () => {
    const files = readdirSync(capDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    const granted = new Set<string>();
    let coversMain = false;
    for (const f of files) {
      const cap = JSON.parse(readFileSync(join(capDir, f), 'utf8')) as {
        windows?: string[];
        permissions?: string[];
      };
      if (!cap.permissions) continue;
      // `core:default` expands to core:event:default (allow-listen / unlisten).
      for (const p of cap.permissions) granted.add(p);
      if (cap.windows?.includes('main') || cap.windows === undefined) coversMain = true;
    }
    expect(coversMain).toBe(true);
    expect(granted.has('core:window:allow-destroy')).toBe(true);
    const eventListen = granted.has('core:default') || granted.has('core:event:default') || granted.has('core:event:allow-listen');
    const eventUnlisten = granted.has('core:default') || granted.has('core:event:default') || granted.has('core:event:allow-unlisten');
    expect(eventListen && eventUnlisten).toBe(true);
  });
});
