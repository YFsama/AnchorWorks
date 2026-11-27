import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Session-restore boot decision — the pure slice of the save / restore rework.
 *
 * `decideSessionOffer()` decides what (if anything) the app shows at launch
 * for a leftover `vector.autosave` entry:
 *
 *   - a blocking modal is reserved for a REAL crash (exit mark `clean:false`)
 *     that left unsaved work behind,
 *   - a clean (or unknown — pre-marker, i.e. first launch after an upgrade)
 *     exit with unsaved work gets a non-blocking prompt,
 *   - everything else stays silent.
 *
 * Every branch below is a table row: no storage, no canvas, no React.
 */
type AutoSaveModule = typeof import('../autosave');

async function freshAutosave(): Promise<AutoSaveModule> {
  vi.resetModules();
  return import('../autosave');
}

const RECT = { type: 'rect', left: 10, top: 10, width: 20, height: 30 };
const CUT = { id: 'c1', points: [[0, 0], [1, 0], [1, 1]], closed: true, kind: 'outline' };

function entry(objects: unknown[], extra: Record<string, unknown> = {}) {
  return { json: { version: '7.4.0', objects }, ts: 1_700_000_000_000, ...extra };
}

/** Unsaved work: 5 canvas changes, project file never saved this session. */
const UNSAVED = entry([RECT], { changeSeq: 5 });
/** Fully saved: every change (4) is in the project file. */
const SAVED = entry([RECT], { changeSeq: 4, savedSeq: 4 });
/** Written by a build that predates the change counter. */
const LEGACY = entry([RECT]);
/** Written by an old build on an empty canvas — the "restore nothing" entry. */
const LEGACY_EMPTY = entry([]);
/** Pre-marker exit (first launch after upgrading from a build without them). */
const NO_MARK = null;

beforeEach(() => {
  localStorage.clear();
});

describe('decideSessionOffer — decision table', () => {
  it('no entry → none, regardless of how the last session ended', async () => {
    const { decideSessionOffer } = await freshAutosave();
    for (const exitClean of [false, true, NO_MARK]) {
      for (const canvasEmpty of [true, false]) {
        expect(decideSessionOffer({ entry: null, exitClean, canvasEmpty })).toBe('none');
      }
    }
  });

  it('crash (clean === false) + unsaved work → modal', async () => {
    const { decideSessionOffer } = await freshAutosave();
    expect(decideSessionOffer({ entry: UNSAVED, exitClean: false, canvasEmpty: true })).toBe('modal');
  });

  it('crash + legacy entry (no change counter) → modal — old entries count as unsaved', async () => {
    const { decideSessionOffer } = await freshAutosave();
    expect(decideSessionOffer({ entry: LEGACY, exitClean: false, canvasEmpty: true })).toBe('modal');
  });

  it('clean exit + unsaved work → quiet (never a modal for a normal close)', async () => {
    const { decideSessionOffer } = await freshAutosave();
    expect(decideSessionOffer({ entry: UNSAVED, exitClean: true, canvasEmpty: true })).toBe('quiet');
  });

  it('no exit mark (upgrade from an older build) + unsaved work → quiet — unknown is not treated as a crash', async () => {
    const { decideSessionOffer } = await freshAutosave();
    expect(decideSessionOffer({ entry: UNSAVED, exitClean: NO_MARK, canvasEmpty: true })).toBe('quiet');
    // Same for a caller that passes `undefined` for a missing mark.
    expect(decideSessionOffer({ entry: UNSAVED, exitClean: undefined, canvasEmpty: true })).toBe('quiet');
    expect(decideSessionOffer({ entry: LEGACY, exitClean: NO_MARK, canvasEmpty: true })).toBe('quiet');
  });

  it('no unsaved changes (everything is in the project file) → none, even after a crash', async () => {
    const { decideSessionOffer } = await freshAutosave();
    for (const exitClean of [false, true, NO_MARK]) {
      expect(decideSessionOffer({ entry: SAVED, exitClean, canvasEmpty: true })).toBe('none');
    }
  });

  it('savedSeq ahead of changeSeq (edit made during the save write) still counts as saved', async () => {
    const { decideSessionOffer } = await freshAutosave();
    expect(decideSessionOffer({ entry: entry([RECT], { changeSeq: 3, savedSeq: 5 }), exitClean: false, canvasEmpty: true })).toBe('none');
  });

  it('entry is an empty canvas (old-build objects=0 entry) → none', async () => {
    const { decideSessionOffer } = await freshAutosave();
    for (const exitClean of [false, true, NO_MARK]) {
      expect(decideSessionOffer({ entry: LEGACY_EMPTY, exitClean, canvasEmpty: true })).toBe('none');
    }
  });

  it('canvas already has content → none (an entry must never clobber live work)', async () => {
    const { decideSessionOffer } = await freshAutosave();
    for (const exitClean of [false, true, NO_MARK]) {
      expect(decideSessionOffer({ entry: UNSAVED, exitClean, canvasEmpty: false })).toBe('none');
    }
  });

  it('cut paths alone are content: a cut-path-only entry is offered', async () => {
    const { decideSessionOffer } = await freshAutosave();
    const cutOnly = entry([], { cutPaths: [CUT], changeSeq: 2 });
    expect(decideSessionOffer({ entry: cutOnly, exitClean: false, canvasEmpty: true })).toBe('modal');
    expect(decideSessionOffer({ entry: cutOnly, exitClean: true, canvasEmpty: true })).toBe('quiet');
    // …and once saved they go quiet like any other entry.
    const cutSaved = entry([], { cutPaths: [CUT], changeSeq: 2, savedSeq: 2 });
    expect(decideSessionOffer({ entry: cutSaved, exitClean: false, canvasEmpty: true })).toBe('none');
  });

  it('a change counter of 0 with a non-empty canvas but no project save is still unsaved', async () => {
    const { decideSessionOffer } = await freshAutosave();
    // savedSeq is absent → the project file was never written this session.
    expect(decideSessionOffer({ entry: entry([RECT], { changeSeq: 0 }), exitClean: true, canvasEmpty: true })).toBe('quiet');
  });

  it('dismissed only silences the quiet prompt — a crash still gets its modal', async () => {
    const { decideSessionOffer } = await freshAutosave();
    expect(decideSessionOffer({ entry: UNSAVED, exitClean: true, canvasEmpty: true, dismissed: true })).toBe('none');
    expect(decideSessionOffer({ entry: UNSAVED, exitClean: false, canvasEmpty: true, dismissed: true })).toBe('modal');
  });

  it('malformed counters are never read as "saved"', async () => {
    const { decideSessionOffer } = await freshAutosave();
    const bad = entry([RECT], { changeSeq: '7', savedSeq: '7' });
    expect(decideSessionOffer({ entry: bad, exitClean: false, canvasEmpty: true })).toBe('modal');
    const partial = entry([RECT], { changeSeq: 7 });
    expect(decideSessionOffer({ entry: partial, exitClean: false, canvasEmpty: true })).toBe('modal');
  });

  it('unknown entry shape (no objects array) is treated as content, never as an empty entry', async () => {
    const { decideSessionOffer, isAutoSaveEntryEmpty } = await freshAutosave();
    const odd = { json: { version: '7.4.0' } as object, ts: 1 };
    expect(isAutoSaveEntryEmpty(odd)).toBe(false);
    expect(decideSessionOffer({ entry: odd, exitClean: false, canvasEmpty: true })).toBe('modal');
  });
});

describe('hasUnsavedChanges / isAutoSaveEntryEmpty', () => {
  it('unsaved ⇔ changeSeq > savedSeq', async () => {
    const { hasUnsavedChanges } = await freshAutosave();
    expect(hasUnsavedChanges(entry([RECT], { changeSeq: 6, savedSeq: 5 }))).toBe(true);
    expect(hasUnsavedChanges(entry([RECT], { changeSeq: 5, savedSeq: 5 }))).toBe(false);
    expect(hasUnsavedChanges(entry([RECT], { changeSeq: 4, savedSeq: 5 }))).toBe(false);
  });

  it('legacy entries without both counters are assumed unsaved (never lose work)', async () => {
    const { hasUnsavedChanges } = await freshAutosave();
    expect(hasUnsavedChanges(LEGACY)).toBe(true);
    expect(hasUnsavedChanges(entry([RECT], { changeSeq: 3 }))).toBe(true);
    expect(hasUnsavedChanges(entry([RECT], { savedSeq: 3 }))).toBe(true);
  });

  it('an empty entry has nothing unsaved', async () => {
    const { hasUnsavedChanges } = await freshAutosave();
    expect(hasUnsavedChanges(LEGACY_EMPTY)).toBe(false);
    expect(hasUnsavedChanges(entry([], { cutPaths: [CUT], changeSeq: 9 }))).toBe(true);
  });

  it('empty ⇔ no objects AND no cut paths', async () => {
    const { isAutoSaveEntryEmpty, countAutoSaveObjects } = await freshAutosave();
    expect(isAutoSaveEntryEmpty(LEGACY_EMPTY)).toBe(true);
    expect(isAutoSaveEntryEmpty(entry([RECT]))).toBe(false);
    expect(isAutoSaveEntryEmpty(entry([], { cutPaths: [CUT] }))).toBe(false);
    expect(isAutoSaveEntryEmpty(entry([], { cutPaths: [] }))).toBe(true);
    expect(countAutoSaveObjects(entry([RECT, RECT]))).toBe(2);
    expect(countAutoSaveObjects(LEGACY_EMPTY)).toBe(0);
    expect(countAutoSaveObjects({ json: { version: '1' } as object, ts: 1 })).toBeNull();
  });
});
