/**
 * App-level preferences — the typed wrapper around `localStorage.vector.prefs`.
 *
 * These are NOT per-document settings (those live on the editor store's
 * `doc` slice and are serialised into project files). They are global,
 * one-per-installation knobs surfaced by `PreferencesDialog`:
 *
 *  - defaultDocWidth / defaultDocHeight / defaultDocBackground — used by
 *    "File > New" if/when that flow stops reloading the page.
 *  - autosaveIntervalMs — consumed by `autosave.ts` via `getAutoSaveInterval()`.
 *    `0` disables autosave entirely.
 *
 * Store-backed prefs (theme, snap, smart guides, anchor snap, high contrast,
 * AI config) are intentionally NOT mirrored here — they each have their own
 * persistence path. This module only owns the orphans.
 */

const STORAGE_KEY = 'vector.prefs';

export interface AppPreferences {
  defaultDocWidth: number;
  defaultDocHeight: number;
  defaultDocBackground: string;
  /** Autosave loop period in milliseconds. 0 disables autosave. */
  autosaveIntervalMs: number;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultDocWidth: 800,
  defaultDocHeight: 600,
  defaultDocBackground: '#ffffff',
  autosaveIntervalMs: 30000,
};

/**
 * Read the persisted prefs, layered over the defaults so a partial
 * (e.g. forward-compatible older) blob still hydrates cleanly. SSR-safe.
 */
export function loadPreferences(): AppPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return { ...DEFAULT_PREFERENCES, ...sanitize(parsed) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Persist the full prefs object. Callers should pass a complete object. */
export function savePreferences(p: AppPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(p)));
  } catch {
    /* quota exceeded or storage disabled — silently drop */
  }
}

/**
 * Convenience accessor read by `autosave.ts`. Falls back to the 30 s default
 * when nothing is set; returns whatever the user picked otherwise (including
 * `0`, which is the explicit "off" sentinel).
 */
export function getAutoSaveInterval(): number {
  const v = loadPreferences().autosaveIntervalMs;
  return typeof v === 'number' && v >= 0 ? v : DEFAULT_PREFERENCES.autosaveIntervalMs;
}

/** Coerce numeric / string fields back into sensible ranges. */
function sanitize(p: Partial<AppPreferences>): Partial<AppPreferences> {
  const out: Partial<AppPreferences> = {};
  if (typeof p.defaultDocWidth === 'number' && isFinite(p.defaultDocWidth) && p.defaultDocWidth > 0) {
    out.defaultDocWidth = Math.round(p.defaultDocWidth);
  }
  if (typeof p.defaultDocHeight === 'number' && isFinite(p.defaultDocHeight) && p.defaultDocHeight > 0) {
    out.defaultDocHeight = Math.round(p.defaultDocHeight);
  }
  if (typeof p.defaultDocBackground === 'string' && p.defaultDocBackground) {
    out.defaultDocBackground = p.defaultDocBackground;
  }
  if (typeof p.autosaveIntervalMs === 'number' && isFinite(p.autosaveIntervalMs) && p.autosaveIntervalMs >= 0) {
    out.autosaveIntervalMs = Math.round(p.autosaveIntervalMs);
  }
  return out;
}
