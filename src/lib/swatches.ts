/**
 * Swatches — a small persistent palette of reusable colours (Illustrator's
 * Swatches panel). Stored in localStorage so brand/spot colours survive reloads.
 * Pure storage + change-event; the panel renders and applies them.
 */
const KEY = 'vector.swatches';
const EVENT = 'vector:swatches-changed';

const DEFAULTS = ['#000000', '#ffffff', '#ff2e9a', '#3d9bff', '#22d3ee', '#22c55e', '#f59e0b', '#ef4444'];

const norm = (c: string) => c.trim().toLowerCase();

/** Current saved swatches (falls back to a starter palette). */
export function getSwatches(): string[] {
  if (typeof window === 'undefined') return [...DEFAULTS];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [...DEFAULTS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((c) => typeof c === 'string');
  } catch { /* corrupted — start fresh */ }
  return [...DEFAULTS];
}

function save(list: string[]): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota / blocked */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* SSR */ }
}

/** Add a colour if not already present (case-insensitive). Returns true if added. */
export function addSwatch(hex: string): boolean {
  if (!hex || !/^#?[0-9a-fA-F]{3,8}$/.test(hex.trim())) return false;
  const list = getSwatches();
  if (list.some((c) => norm(c) === norm(hex))) return false;
  save([...list, hex.trim()]);
  return true;
}

/** Remove a colour. */
export function removeSwatch(hex: string): void {
  save(getSwatches().filter((c) => norm(c) !== norm(hex)));
}

export const SWATCHES_EVENT = EVENT;
