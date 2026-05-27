import { describe, it, expect, beforeEach } from 'vitest';
import { getRecent, addRecent, clearRecent, subscribeRecent } from '../recentFiles';

/**
 * recentFiles is a thin localStorage wrapper. jsdom provides a working
 * `localStorage`, so we just need to wipe it between tests for isolation.
 * The module also keeps an in-memory subscriber set; subscribers are local
 * to each test (added + removed via the returned unsubscribe).
 */
describe('recentFiles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getRecent returns empty array when localStorage is empty', () => {
    expect(getRecent()).toEqual([]);
  });

  it('addRecent adds an entry that getRecent can read back', () => {
    addRecent('design.vec');
    const list = getRecent();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('design.vec');
    expect(typeof list[0].ts).toBe('number');
  });

  it('addRecent stores the preview when supplied', () => {
    addRecent('with-thumb.vec', 'data:image/png;base64,AAA');
    const list = getRecent();
    expect(list[0].preview).toBe('data:image/png;base64,AAA');
  });

  it('addRecent dedupes by name — same name twice yields a single entry', () => {
    addRecent('dup.vec');
    const firstTs = getRecent()[0].ts;
    // Sleep a microtick so ts can plausibly differ (Date.now resolution is ms).
    // We still mainly check dedupe + most-recent-wins behaviour.
    addRecent('dup.vec');
    const list = getRecent();
    expect(list).toHaveLength(1);
    expect(list[0].ts).toBeGreaterThanOrEqual(firstTs);
  });

  it('addRecent caps the list at 8 entries (FIFO, newest first)', () => {
    for (let i = 0; i < 12; i++) addRecent(`file-${i}.vec`);
    const list = getRecent();
    expect(list).toHaveLength(8);
    // Newest is at index 0; oldest surviving entry should be file-4.
    expect(list[0].name).toBe('file-11.vec');
    expect(list[list.length - 1].name).toBe('file-4.vec');
  });

  it('clearRecent empties the list', () => {
    addRecent('a.vec');
    addRecent('b.vec');
    expect(getRecent()).toHaveLength(2);
    clearRecent();
    expect(getRecent()).toEqual([]);
  });

  it('subscribeRecent fires immediately on subscribe with current state', () => {
    addRecent('seed.vec');
    const seen: number[] = [];
    const unsub = subscribeRecent((files) => seen.push(files.length));
    expect(seen).toEqual([1]);
    unsub();
  });

  it('subscribeRecent fires on add and clear', () => {
    const seen: number[] = [];
    const unsub = subscribeRecent((files) => seen.push(files.length));
    // The initial call records 0.
    addRecent('one.vec');
    addRecent('two.vec');
    clearRecent();
    // 0 (initial) → 1 (after first add) → 2 (after second) → 0 (after clear)
    expect(seen).toEqual([0, 1, 2, 0]);
    unsub();
  });

  it('subscribeRecent unsubscribe stops firing', () => {
    const seen: number[] = [];
    const unsub = subscribeRecent((files) => seen.push(files.length));
    unsub();
    addRecent('after-unsub.vec');
    // Only the initial sync fire should be recorded.
    expect(seen).toEqual([0]);
  });

  it('addRecent with empty name is a no-op', () => {
    addRecent('');
    expect(getRecent()).toEqual([]);
  });
});
