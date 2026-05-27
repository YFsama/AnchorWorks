/**
 * Central keymap registry for Anchorworks.
 * ----------------------------------------------------------------
 * Every refactor-friendly shortcut in App.tsx is registered here with a
 * stable `id` and a `defaultCombo`. Users may override any combo through
 * the KeymapEditor; overrides persist to `localStorage['vector.keymap']`.
 *
 * Combo grammar (case-insensitive):
 *   '<Modifier>+<Modifier>+<Key>'
 *   Modifiers: Ctrl, Cmd, Meta, Shift, Alt, Option
 *   Key: a printable character, an arrow name, or a special label
 *
 *   `Ctrl` and `Cmd`/`Meta` both map to the platform's "command" modifier
 *   (Meta on macOS, Control elsewhere) — matches how App.tsx already
 *   treats `e.ctrlKey || e.metaKey` as a single `cmd` flag.
 *
 * Excluded shortcuts (left hardcoded in App.tsx, NOT in BINDINGS):
 *   - Arrow keys / Shift+Arrows (multi-key arrow group with a Shift
 *     multiplier — can't be expressed cleanly as a single combo)
 *   - Escape (deselect-or-fallthrough behaviour — see App.tsx comment)
 *   - Delete / Backspace (two equivalent keys for the same action)
 *   - Spacebar pan toggle (separate keydown/keyup pair in its own effect)
 *   - Eraser size +/- (lives in EraserHUD.tsx, not the main handler)
 */

import { listTools } from './tools/types';
import { registerBuiltInTools } from './tools/registerTools';

// Ensure the tool registry is populated before BINDINGS evaluates its spread
// below. BINDINGS initialises at module load; ES-module evaluation order has
// keymap.ts running before App.tsx's `registerBuiltInTools()` call, so without
// this side-effect call the tool bindings would land as an empty splice.
// `registerBuiltInTools` is idempotent.
registerBuiltInTools();

const STORAGE_KEY = 'vector.keymap';

/** One row in the user-visible shortcut table. */
export interface ShortcutBinding {
  /** Stable lookup id — never localised, never reassigned. */
  id: string;
  /** Translation key (English source) for the human-readable label. */
  label: string;
  /** Default key combo, mirrors what App.tsx hardcoded historically. */
  defaultCombo: string;
}

/** Parsed combo, ready for fast comparison against a KeyboardEvent. */
export interface ParsedCombo {
  cmd: boolean;
  shift: boolean;
  alt: boolean;
  /** Lower-cased base key (no modifiers). Empty when combo is unparseable. */
  key: string;
  /** Echo of the input combo (canonical, post-trim) for display. */
  raw: string;
}

/**
 * Registry — order matches the order branches appear in App.tsx's keydown
 * handler so the table reads top-to-bottom the way the resolver checks them.
 */
export const BINDINGS: ShortcutBinding[] = [
  // -------- Command palette / general --------
  { id: 'window.commandPalette', label: 'Command Palette',     defaultCombo: 'Ctrl+K' },
  { id: 'window.preferences',    label: 'Preferences…',        defaultCombo: 'Ctrl+,' },
  { id: 'edit.undo',             label: 'Undo',                defaultCombo: 'Ctrl+Z' },
  { id: 'edit.redoShift',        label: 'Redo (Shift+Z)',      defaultCombo: 'Ctrl+Shift+Z' },
  { id: 'view.outline',          label: 'Outline View',        defaultCombo: 'Ctrl+Alt+Y' },
  { id: 'edit.redo',             label: 'Redo',                defaultCombo: 'Ctrl+Y' },
  { id: 'edit.duplicate',        label: 'Duplicate',           defaultCombo: 'Ctrl+D' },

  // -------- Clipboard --------
  { id: 'edit.copy',             label: 'Copy',                defaultCombo: 'Ctrl+C' },
  { id: 'edit.cut',              label: 'Cut',                 defaultCombo: 'Ctrl+X' },
  { id: 'edit.paste',            label: 'Paste',               defaultCombo: 'Ctrl+V' },

  // -------- Group --------
  { id: 'edit.ungroup',          label: 'Ungroup',             defaultCombo: 'Ctrl+Shift+G' },
  { id: 'edit.group',            label: 'Group',               defaultCombo: 'Ctrl+G' },

  // -------- Zoom --------
  { id: 'view.zoomIn',           label: 'Zoom In',             defaultCombo: 'Ctrl+=' },
  { id: 'view.zoomOut',          label: 'Zoom Out',            defaultCombo: 'Ctrl+-' },
  { id: 'view.zoomFit',          label: 'Fit to Page',         defaultCombo: 'Ctrl+0' },
  { id: 'view.actualSize',       label: 'Actual Size',         defaultCombo: 'Ctrl+1' },

  // -------- File --------
  { id: 'file.saveProject',      label: 'Save Project',        defaultCombo: 'Ctrl+Shift+S' },
  { id: 'view.toggleTheme',      label: 'Toggle Theme',        defaultCombo: 'Ctrl+Shift+L' },
  { id: 'file.open',             label: 'Open SVG / JSON…',    defaultCombo: 'Ctrl+O' },
  { id: 'file.exportSvg',        label: 'Export SVG',          defaultCombo: 'Ctrl+S' },
  { id: 'file.print',            label: 'Print',               defaultCombo: 'Ctrl+P' },

  // -------- Arrange (combined branches kept as one binding each — the
  // Shift modifier inside the branch routes Front vs. Forward; we expose
  // only the base combo here so customisers can rebind both halves
  // together) --------
  { id: 'arrange.forwardFront', label: 'Bring Forward / to Front', defaultCombo: 'Ctrl+]' },
  { id: 'arrange.backwardBack', label: 'Send Backward / to Back',  defaultCombo: 'Ctrl+[' },

  // -------- Selection --------
  { id: 'edit.selectAll',        label: 'Select All',          defaultCombo: 'Ctrl+A' },

  // -------- Help / dialogs --------
  { id: 'help.shortcuts',        label: 'Keyboard Shortcuts',  defaultCombo: '?' },
  { id: 'help.helpCenter',       label: 'Help Center',         defaultCombo: 'F1' },
  { id: 'help.debugPanel',       label: 'Debug Panel',         defaultCombo: 'Ctrl+Shift+D' },

  // -------- Tool shortcuts (single-key, no modifier) --------
  // Generated from the ToolHandler registry — adding a new toolbar tool in
  // registerTools.ts auto-registers its keyboard binding here. Filter on
  // `icon && shortcut` so non-toolbar tools (e.g. `directSelect`) and any
  // future modifier-less hold tool are excluded.
  ...listTools()
    .filter(h => h.icon && h.shortcut)
    .map((h): ShortcutBinding => ({
      id: `tool.${h.id}`,
      label: h.label,
      defaultCombo: h.shortcut!,
    })),
];

// ----------------------------------------------------------------
// Persistence
// ----------------------------------------------------------------

type Overrides = Record<string, string>;

let overrides: Overrides = readOverrides();

function readOverrides(): Overrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Overrides;
  } catch {
    /* localStorage blocked or corrupted JSON — start fresh */
  }
  return {};
}

function writeOverrides(): void {
  if (typeof window === 'undefined') return;
  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }
  } catch {
    /* ignore — private-mode / file:// origins */
  }
}

// ----------------------------------------------------------------
// Subscriptions
// ----------------------------------------------------------------

const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) {
    try { fn(); } catch { /* listener errors must not break the keymap */ }
  }
}

/** Subscribe to override changes. Returns an unsubscribe function. */
export function subscribeKeymap(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/** Lookup a binding definition by id. */
export function findBinding(id: string): ShortcutBinding | undefined {
  return BINDINGS.find((b) => b.id === id);
}

/** Current combo for a binding: user override > default > '' (if unknown). */
export function getBinding(id: string): string {
  const ov = overrides[id];
  if (ov) return ov;
  const def = BINDINGS.find((b) => b.id === id);
  return def ? def.defaultCombo : '';
}

/** Persist a user override and notify subscribers. */
export function setBinding(id: string, combo: string): void {
  overrides = { ...overrides, [id]: combo };
  writeOverrides();
  emit();
}

/** Remove an override for a single binding (reverts to its default). */
export function resetBinding(id: string): void {
  if (!(id in overrides)) return;
  const next: Overrides = { ...overrides };
  delete next[id];
  overrides = next;
  writeOverrides();
  emit();
}

/** Clear every override. */
export function resetAll(): void {
  if (Object.keys(overrides).length === 0) return;
  overrides = {};
  writeOverrides();
  emit();
}

/** True when a binding currently has a user override. */
export function isOverridden(id: string): boolean {
  return id in overrides;
}

// ----------------------------------------------------------------
// Combo parsing / matching
// ----------------------------------------------------------------

/** Special key aliases used in combos that don't map 1:1 to e.key. */
const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  spacebar: ' ',
  del: 'delete',
  ins: 'insert',
  plus: '+',
  minus: '-',
  equal: '=',
  equals: '=',
};

/** Normalise an individual segment of a combo to lower-case canonical form. */
function normSegment(seg: string): string {
  const s = seg.trim().toLowerCase();
  if (s in KEY_ALIASES) return KEY_ALIASES[s];
  return s;
}

/** Parse a combo string ('Ctrl+Shift+S') into modifier flags + base key. */
export function parseCombo(combo: string): ParsedCombo {
  const raw = (combo ?? '').trim();
  const out: ParsedCombo = { cmd: false, shift: false, alt: false, key: '', raw };
  if (!raw) return out;
  const parts = raw.split('+').map((p) => p.trim()).filter((p) => p.length > 0);
  // Allow trailing literal "+" — if user wants Ctrl+'+', they type "Ctrl++"
  // which split yields ['Ctrl', '', '']; preserve as '+' base key.
  if (raw.endsWith('+') && parts.length > 0 && !parts[parts.length - 1].endsWith('+')) {
    parts.push('+');
  }
  for (const part of parts) {
    const n = normSegment(part);
    if (n === 'ctrl' || n === 'cmd' || n === 'meta' || n === 'control' || n === 'command') {
      out.cmd = true;
    } else if (n === 'shift') {
      out.shift = true;
    } else if (n === 'alt' || n === 'option' || n === 'opt') {
      out.alt = true;
    } else {
      out.key = n;
    }
  }
  return out;
}

/**
 * Returns true iff a KeyboardEvent satisfies a combo's modifiers + base key.
 * Mirrors App.tsx semantics: `cmd` flag === `e.ctrlKey || e.metaKey`.
 *
 * Shift handling is intentionally split:
 *   - If the combo specifies Shift, the event must have shiftKey === true.
 *   - If the combo does NOT specify Shift, we still accept shiftKey === true
 *     when the base key is a *non-letter* that shares a physical key with
 *     a punctuation default (e.g. '+' = Shift+'='; '?' = Shift+'/'). This
 *     preserves the historical behavior where `Ctrl+=` and `Ctrl+Shift+=`
 *     both fired Zoom In on most keyboards.
 *   - For letter base keys, requiring an exact Shift match keeps Ctrl+G and
 *     Ctrl+Shift+G distinct.
 */
export function comboMatchesEvent(combo: string, e: KeyboardEvent): boolean {
  const p = parseCombo(combo);
  if (!p.key) return false;
  const cmd = e.ctrlKey || e.metaKey;
  if (p.cmd !== cmd) return false;
  if (p.alt !== e.altKey) return false;

  const eventKey = (e.key ?? '').toLowerCase();
  const isLetter = p.key.length === 1 && p.key >= 'a' && p.key <= 'z';
  if (p.shift) {
    if (!e.shiftKey) return false;
  } else if (isLetter) {
    // Letter combos: require shift to be off so 'g' and 'shift+g' differ.
    if (e.shiftKey) return false;
  }
  // Non-letter, non-shift combos accept either shift state — keeps '?' (which
  // already requires Shift on US layouts) and '=' (used for Zoom In) working.

  return eventKey === p.key;
}

/**
 * Serialise a live KeyboardEvent back into a combo string suitable for
 * `setBinding`. Used by the rebind capture UI.
 */
export function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const k = e.key;
  // Skip pure modifier presses — caller should keep listening.
  if (k === 'Control' || k === 'Meta' || k === 'Shift' || k === 'Alt') return '';
  // Normalise display: uppercase single letters, leave others verbatim.
  const display = k.length === 1 ? k.toUpperCase() : k;
  parts.push(display);
  return parts.join('+');
}

/** Snapshot the full effective keymap for diagnostics / export. */
export function snapshotKeymap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of BINDINGS) out[b.id] = getBinding(b.id);
  return out;
}
