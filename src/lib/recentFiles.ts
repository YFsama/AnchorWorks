/**
 * Recent Files — small localStorage-backed registry of recently saved /
 * opened Anchorworks projects. Surfaces in the File menu so users can
 * see what they've been working on at a glance.
 *
 * Storage:
 * - Key: `vector.recentFiles`
 * - Envelope: `{ v: 1, files: RecentFile[] }`
 *
 * FS Access API caveat: the browser's File System Access API does not let
 * web pages programmatically open a known file by name (every read requires
 * fresh user consent). So this module stores only metadata — the name, a
 * timestamp, and a small preview thumbnail — that the menu can render.
 * Clicking a recent entry re-opens the standard file picker; the consumer
 * surfaces the name so the user can find it again.
 *
 * Pub/sub: `subscribeRecent` notifies listeners on every write so the menu
 * can re-render without polling. Same shape as `autosave.ts`'s status feed.
 */

const STORAGE_KEY = 'vector.recentFiles';
const STORAGE_VERSION = 1;
const MAX_ENTRIES = 8;

export interface RecentFile {
  name: string;
  ts: number;
  /** Optional SVG/PNG data URI thumbnail captured at save time. */
  preview?: string;
}

interface PersistedEnvelope {
  v: number;
  files: RecentFile[];
}

const listeners = new Set<(files: RecentFile[]) => void>();

function isRecentFile(value: unknown): value is RecentFile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === 'string'
    && typeof v.ts === 'number'
    && (v.preview === undefined || typeof v.preview === 'string');
}

function read(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return [];
    const env = parsed as Partial<PersistedEnvelope>;
    if (!Array.isArray(env.files)) return [];
    // Tolerate older / unknown versions by best-effort filtering.
    return env.files.filter(isRecentFile).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function write(files: RecentFile[]): void {
  try {
    const env: PersistedEnvelope = { v: STORAGE_VERSION, files: files.slice(0, MAX_ENTRIES) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch {
    /* quota exceeded — drop the preview from the largest entry and retry once */
    try {
      const trimmed = files.slice(0, MAX_ENTRIES).map((f) => ({ name: f.name, ts: f.ts }));
      const env: PersistedEnvelope = { v: STORAGE_VERSION, files: trimmed };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(env));
    } catch {
      /* give up silently — recents are best-effort */
    }
  }
}

function emit(files: RecentFile[]): void {
  const snapshot = files.slice();
  for (const fn of listeners) fn(snapshot);
}

/** Returns the recent files list, most-recent first, max 8 entries. */
export function getRecent(): RecentFile[] {
  return read();
}

/**
 * Add (or move) a file to the front of the recents list. Dedupes by name,
 * trims to 8, persists, and notifies subscribers. If a fresh `preview` is
 * provided it replaces any older thumbnail.
 */
export function addRecent(name: string, preview?: string): void {
  if (!name) return;
  const existing = read();
  const filtered = existing.filter((f) => f.name !== name);
  const entry: RecentFile = { name, ts: Date.now() };
  if (preview) entry.preview = preview;
  const next = [entry, ...filtered].slice(0, MAX_ENTRIES);
  write(next);
  emit(next);
}

/** Clear all recent files and notify subscribers. */
export function clearRecent(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  emit([]);
}

/**
 * Subscribe to recent-files changes. The callback is invoked immediately
 * with the current list, then again on every mutation. Returns an
 * unsubscribe function.
 */
export function subscribeRecent(fn: (files: RecentFile[]) => void): () => void {
  listeners.add(fn);
  fn(read());
  return () => { listeners.delete(fn); };
}
