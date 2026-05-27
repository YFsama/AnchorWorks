import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAutoSaveStatus,
  getLastAutoSave,
  clearAutoSave,
  subscribeAutoSaveStatus,
} from '../autosave';

/**
 * autosave.ts exposes a small status feed + localStorage cache. We avoid
 * `startAutoSave` here because it pokes the real canvas via `getCanvas()`
 * and sets a 30 s interval — irrelevant for the pure-state slice we cover.
 */
describe('autosave', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the in-memory status to a known baseline.
    clearAutoSave();
  });

  it('getAutoSaveStatus returns the default { null, false } baseline', () => {
    const s = getAutoSaveStatus();
    expect(s.lastSavedAt).toBeNull();
    expect(s.dirty).toBe(false);
  });

  it('getLastAutoSave returns null when storage is empty', () => {
    expect(getLastAutoSave()).toBeNull();
  });

  it('getLastAutoSave returns null when storage is corrupt JSON', () => {
    localStorage.setItem('vector.autosave', '{not-json');
    expect(getLastAutoSave()).toBeNull();
  });

  it('getLastAutoSave returns null when entry is missing fields', () => {
    localStorage.setItem('vector.autosave', JSON.stringify({ foo: 'bar' }));
    expect(getLastAutoSave()).toBeNull();
  });

  it('getLastAutoSave round-trips a manually written entry', () => {
    const entry = { json: { canvas: 'x' }, ts: 1234567890 };
    localStorage.setItem('vector.autosave', JSON.stringify(entry));
    expect(getLastAutoSave()).toEqual(entry);
  });

  it('clearAutoSave removes the storage entry and resets status', () => {
    localStorage.setItem('vector.autosave', JSON.stringify({ json: {}, ts: 5 }));
    clearAutoSave();
    expect(localStorage.getItem('vector.autosave')).toBeNull();
    const s = getAutoSaveStatus();
    expect(s.lastSavedAt).toBeNull();
    expect(s.dirty).toBe(false);
  });

  it('subscribeAutoSaveStatus fires synchronously on subscribe', () => {
    const seen: Array<{ lastSavedAt: number | null; dirty: boolean }> = [];
    const unsub = subscribeAutoSaveStatus((s) => seen.push(s));
    expect(seen).toHaveLength(1);
    expect(seen[0].lastSavedAt).toBeNull();
    expect(seen[0].dirty).toBe(false);
    unsub();
  });

  it('subscribeAutoSaveStatus fires again on clearAutoSave', () => {
    const seen: Array<{ lastSavedAt: number | null; dirty: boolean }> = [];
    const unsub = subscribeAutoSaveStatus((s) => seen.push(s));
    clearAutoSave();
    // One initial + at least one for the clear call.
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1].lastSavedAt).toBeNull();
    unsub();
  });

  it('subscribeAutoSaveStatus returns a working unsubscribe', () => {
    const seen: Array<{ lastSavedAt: number | null; dirty: boolean }> = [];
    const unsub = subscribeAutoSaveStatus((s) => seen.push(s));
    unsub();
    const before = seen.length;
    clearAutoSave();
    expect(seen.length).toBe(before);
  });

  it('snapshots are fresh objects (not the same reference)', () => {
    const a = getAutoSaveStatus();
    const b = getAutoSaveStatus();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
