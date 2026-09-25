/**
 * Keymap registry — parsing, matching, rebinding, conflicts, persistence.
 *
 * `keymap.ts` is the single source of truth for every refactor-friendly
 * shortcut in App.tsx: the MenuBar/ShortcutsDialog render from BINDINGS,
 * the keydown handler resolves events through comboMatchesEvent, and user
 * rebinds persist to localStorage['vector.keymap']. These tests pin each
 * half of that contract:
 *
 *  - parseCombo: modifier synonyms, key aliases, punctuation edge cases
 *  - comboMatchesEvent: cmd === ctrlKey||metaKey, Shift semantics split
 *    between letters (strict) and punctuation (lenient, so '?' and 'Ctrl+='
 *    keep working on US layouts)
 *  - eventToCombo: the rebind-capture serializer
 *  - getBinding/setBinding/reset*: override lifecycle + subscriber notify
 *  - persistence: overrides survive a module reload, corrupt storage is
 *    dropped, the storage key is removed when the last override goes away
 *  - BINDINGS hygiene: stable unique ids, unique default combos (two
 *    bindings silently sharing a combo would shadow each other in the
 *    resolver), tool bindings spliced in by registerTools
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BINDINGS,
  comboMatchesEvent,
  eventToCombo,
  findBinding,
  getBinding,
  isOverridden,
  parseCombo,
  resetAll,
  resetBinding,
  setBinding,
  snapshotKeymap,
  subscribeKeymap,
} from '../keymap';

const STORAGE_KEY = 'vector.keymap';

/** Minimal KeyboardEvent factory — jsdom supports the standard ctor. */
function keyEvent(opts: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, ...opts });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  resetAll();
  vi.restoreAllMocks();
});

/* ---------------------------- parseCombo ---------------------------- */

describe('parseCombo', () => {
  it('splits modifiers from the base key and lower-cases everything', () => {
    expect(parseCombo('Ctrl+Shift+S')).toEqual({
      cmd: true, shift: true, alt: false, key: 's', raw: 'Ctrl+Shift+S',
    });
  });

  it('treats Ctrl / Cmd / Meta / Control / Command as the same "cmd" modifier', () => {
    for (const combo of ['Ctrl+K', 'Cmd+K', 'Meta+K', 'Control+K', 'Command+K']) {
      expect(parseCombo(combo).cmd).toBe(true);
    }
    expect(parseCombo('K').cmd).toBe(false);
  });

  it('treats Alt / Option / Opt as the same "alt" modifier', () => {
    for (const combo of ['Alt+Y', 'Option+Y', 'Opt+Y']) {
      expect(parseCombo(combo).alt).toBe(true);
    }
  });

  it('resolves the documented key aliases', () => {
    expect(parseCombo('Esc').key).toBe('escape');
    expect(parseCombo('Return').key).toBe('enter');
    expect(parseCombo('Space').key).toBe(' ');
    expect(parseCombo('Spacebar').key).toBe(' ');
    expect(parseCombo('Del').key).toBe('delete');
    expect(parseCombo('Ins').key).toBe('insert');
    expect(parseCombo('Plus').key).toBe('+');
    expect(parseCombo('Minus').key).toBe('-');
    expect(parseCombo('Equal').key).toBe('=');
    expect(parseCombo('Equals').key).toBe('=');
  });

  it('keeps arrow names and function keys verbatim (lower-cased)', () => {
    expect(parseCombo('Alt+ArrowRight').key).toBe('arrowright');
    expect(parseCombo('F1').key).toBe('f1');
  });

  it('preserves a trailing literal "+" as the base key ("Ctrl++")', () => {
    const p = parseCombo('Ctrl++');
    expect(p.cmd).toBe(true);
    expect(p.key).toBe('+');
  });

  it('tolerates stray whitespace around segments', () => {
    const p = parseCombo('  Ctrl +  G ');
    expect(p).toMatchObject({ cmd: true, key: 'g' });
  });

  it('returns an empty key for blank input or modifier-only strings', () => {
    expect(parseCombo('').key).toBe('');
    expect(parseCombo('   ').key).toBe('');
    expect(parseCombo('Ctrl+Shift').key).toBe('');
    expect(parseCombo('Ctrl').key).toBe('');
  });
});

/* ------------------------- comboMatchesEvent ------------------------- */

describe('comboMatchesEvent', () => {
  it('matches a plain cmd+letter combo from either ctrlKey or metaKey', () => {
    // The App.tsx contract: cmd === e.ctrlKey || e.metaKey — so the same
    // binding serves Windows (Control) and macOS (Meta).
    expect(comboMatchesEvent('Ctrl+K', keyEvent({ key: 'k', ctrlKey: true }))).toBe(true);
    expect(comboMatchesEvent('Ctrl+K', keyEvent({ key: 'k', metaKey: true }))).toBe(true);
    expect(comboMatchesEvent('Ctrl+K', keyEvent({ key: 'k' }))).toBe(false);
    expect(comboMatchesEvent('Ctrl+K', keyEvent({ key: 'k', ctrlKey: true, metaKey: true }))).toBe(true);
  });

  it('requires the base key to match exactly (case-insensitive)', () => {
    expect(comboMatchesEvent('Ctrl+Z', keyEvent({ key: 'z', ctrlKey: true }))).toBe(true);
    expect(comboMatchesEvent('Ctrl+Z', keyEvent({ key: 'Z', ctrlKey: true }))).toBe(true);
    expect(comboMatchesEvent('Ctrl+Z', keyEvent({ key: 'y', ctrlKey: true }))).toBe(false);
  });

  it('keeps Ctrl+letter and Ctrl+Shift+letter distinct (strict Shift for letters)', () => {
    // Group (Ctrl+G) vs Ungroup (Ctrl+Shift+G) must not shadow each other.
    expect(comboMatchesEvent('Ctrl+G', keyEvent({ key: 'g', ctrlKey: true }))).toBe(true);
    expect(comboMatchesEvent('Ctrl+G', keyEvent({ key: 'g', ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(comboMatchesEvent('Ctrl+Shift+G', keyEvent({ key: 'g', ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(comboMatchesEvent('Ctrl+Shift+G', keyEvent({ key: 'g', ctrlKey: true }))).toBe(false);
    // Note browsers report key:'G' when Shift is held — still matches.
    expect(comboMatchesEvent('Ctrl+Shift+G', keyEvent({ key: 'G', ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it('accepts either Shift state for punctuation combos (US-layout leniency)', () => {
    // '+' shares a physical key with '=' — Zoom In must fire for both
    // Ctrl+= and Ctrl+Shift+= without two bindings.
    expect(comboMatchesEvent('Ctrl+=', keyEvent({ key: '=', ctrlKey: true }))).toBe(true);
    expect(comboMatchesEvent('Ctrl+=', keyEvent({ key: '=', ctrlKey: true, shiftKey: true }))).toBe(true);
    // '?' is Shift+'/' on US layouts — the bare-'?' combo must still match.
    expect(comboMatchesEvent('?', keyEvent({ key: '?', shiftKey: true }))).toBe(true);
  });

  it('requires Shift exactly when the combo spells it out on non-letters', () => {
    expect(comboMatchesEvent('Shift+H', keyEvent({ key: 'H', shiftKey: true }))).toBe(true);
    expect(comboMatchesEvent('Shift+H', keyEvent({ key: 'h' }))).toBe(false);
  });

  it('requires alt to match in both directions', () => {
    expect(comboMatchesEvent('Ctrl+Alt+Y', keyEvent({ key: 'y', ctrlKey: true, altKey: true }))).toBe(true);
    expect(comboMatchesEvent('Ctrl+Alt+Y', keyEvent({ key: 'y', ctrlKey: true }))).toBe(false);
    // A stray Alt held during Ctrl+Y must NOT satisfy Ctrl+Alt+Y semantics…
    expect(comboMatchesEvent('Ctrl+Y', keyEvent({ key: 'y', ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('rejects modifier-less combos when cmd is held, and vice versa', () => {
    expect(comboMatchesEvent('D', keyEvent({ key: 'd' }))).toBe(true);
    expect(comboMatchesEvent('D', keyEvent({ key: 'd', ctrlKey: true }))).toBe(false);
    expect(comboMatchesEvent('Ctrl+D', keyEvent({ key: 'd' }))).toBe(false);
  });

  it('never matches an unparseable or empty combo', () => {
    const e = keyEvent({ key: 'k', ctrlKey: true });
    expect(comboMatchesEvent('', e)).toBe(false);
    expect(comboMatchesEvent('Ctrl', e)).toBe(false);
    expect(comboMatchesEvent('Ctrl+Shift', e)).toBe(false);
  });
});

/* --------------------------- eventToCombo --------------------------- */

describe('eventToCombo', () => {
  it('serialises modifiers in Ctrl, Shift, Alt order with an upper-cased base', () => {
    expect(eventToCombo(keyEvent({ key: 'k', ctrlKey: true }))).toBe('Ctrl+K');
    expect(eventToCombo(keyEvent({ key: 'g', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+G');
    expect(eventToCombo(keyEvent({ key: 'y', ctrlKey: true, shiftKey: true, altKey: true }))).toBe('Ctrl+Shift+Alt+Y');
    // Meta alone is enough — same "cmd" collapse as parseCombo.
    expect(eventToCombo(keyEvent({ key: 's', metaKey: true }))).toBe('Ctrl+S');
  });

  it('leaves multi-char keys verbatim and single punctuation unchanged', () => {
    expect(eventToCombo(keyEvent({ key: 'ArrowLeft', altKey: true }))).toBe('Alt+ArrowLeft');
    expect(eventToCombo(keyEvent({ key: '=' , ctrlKey: true }))).toBe('Ctrl+=');
    expect(eventToCombo(keyEvent({ key: ',', ctrlKey: true }))).toBe('Ctrl+,');
  });

  it('returns "" for a bare modifier press so the capture UI keeps listening', () => {
    for (const key of ['Control', 'Meta', 'Shift', 'Alt']) {
      expect(eventToCombo(keyEvent({ key, ctrlKey: true }))).toBe('');
    }
  });

  it('round-trips through parseCombo into the same semantics', () => {
    const combo = eventToCombo(keyEvent({ key: 'j', ctrlKey: true, shiftKey: true }));
    expect(combo).toBe('Ctrl+Shift+J');
    expect(comboMatchesEvent(combo, keyEvent({ key: 'j', ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(comboMatchesEvent(combo, keyEvent({ key: 'j', ctrlKey: true }))).toBe(false);
  });
});

/* ------------------- rebinding / reset / subscribe ------------------- */

describe('binding lifecycle', () => {
  it('returns the default combo for known ids and "" for unknown ids', () => {
    expect(getBinding('edit.undo')).toBe('Ctrl+Z');
    expect(getBinding('tool.rectangle')).toBeDefined(); // tool splice (below)
    expect(getBinding('no.such.binding')).toBe('');
  });

  it('setBinding overrides, persists and notifies; resetBinding reverts', () => {
    const listener = vi.fn();
    const unsub = subscribeKeymap(listener);

    setBinding('edit.undo', 'Ctrl+Alt+Z');
    expect(getBinding('edit.undo')).toBe('Ctrl+Alt+Z');
    expect(isOverridden('edit.undo')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ 'edit.undo': 'Ctrl+Alt+Z' });

    resetBinding('edit.undo');
    expect(getBinding('edit.undo')).toBe('Ctrl+Z');
    expect(isOverridden('edit.undo')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    // Last override removed → the storage key is gone entirely.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    unsub();
  });

  it('resetBinding on a non-overridden binding is a no-op (no notify)', () => {
    const listener = vi.fn();
    const unsub = subscribeKeymap(listener);
    resetBinding('edit.redo'); // never overridden in this test
    expect(listener).not.toHaveBeenCalled();
    expect(getBinding('edit.redo')).toBe('Ctrl+Y');
    unsub();
  });

  it('resetAll clears every override at once', () => {
    setBinding('edit.undo', 'Ctrl+Alt+Z');
    setBinding('edit.copy', 'Ctrl+Alt+C');
    const listener = vi.fn();
    const unsub = subscribeKeymap(listener);

    resetAll();
    expect(getBinding('edit.undo')).toBe('Ctrl+Z');
    expect(getBinding('edit.copy')).toBe('Ctrl+C');
    expect(isOverridden('edit.copy')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('resetAll with nothing overridden does not notify', () => {
    const listener = vi.fn();
    const unsub = subscribeKeymap(listener);
    resetAll();
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it('unsubscribe stops delivery', () => {
    const listener = vi.fn();
    const unsub = subscribeKeymap(listener);
    setBinding('edit.cut', 'Ctrl+Alt+X');
    unsub();
    setBinding('edit.cut', 'Ctrl+Alt+Y');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber does not break the keymap', () => {
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    const u1 = subscribeKeymap(bad);
    const u2 = subscribeKeymap(good);
    expect(() => setBinding('edit.paste', 'Ctrl+Alt+V')).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });

  it('findBinding returns the definition; snapshot mirrors the effective map', () => {
    const b = findBinding('edit.duplicate');
    expect(b).toMatchObject({ id: 'edit.duplicate', label: 'Duplicate', defaultCombo: 'Ctrl+D' });
    expect(findBinding('no.such.binding')).toBeUndefined();

    setBinding('edit.duplicate', 'Ctrl+Alt+D');
    const snap = snapshotKeymap();
    expect(snap['edit.duplicate']).toBe('Ctrl+Alt+D');
    // Snapshot covers every registered binding.
    for (const binding of BINDINGS) {
      expect(snap[binding.id]).toBe(getBinding(binding.id));
    }
  });
});

/* ---------------------------- persistence ---------------------------- */

describe('persistence across a module reload', () => {
  async function freshKeymap() {
    vi.resetModules();
    return import('../keymap');
  }

  it('overrides written before reload are live after reload', async () => {
    setBinding('edit.undo', 'Ctrl+Alt+Shift+Z');
    setBinding('view.zoomIn', 'Ctrl+ArrowUp');
    const reloaded = await freshKeymap();
    expect(reloaded.getBinding('edit.undo')).toBe('Ctrl+Alt+Shift+Z');
    expect(reloaded.getBinding('view.zoomIn')).toBe('Ctrl+ArrowUp');
    expect(reloaded.getBinding('edit.redo')).toBe('Ctrl+Y'); // untouched default
    expect(reloaded.isOverridden('edit.undo')).toBe(true);
  });

  it('corrupt JSON in storage is ignored (start fresh, no throw)', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const reloaded = await freshKeymap();
    expect(reloaded.getBinding('edit.undo')).toBe('Ctrl+Z');
    expect(reloaded.isOverridden('edit.undo')).toBe(false);
  });

  it('non-object JSON payloads are ignored', async () => {
    localStorage.setItem(STORAGE_KEY, '"just a string"');
    const first = await freshKeymap();
    expect(first.getBinding('edit.undo')).toBe('Ctrl+Z');

    localStorage.setItem(STORAGE_KEY, '42');
    const second = await freshKeymap();
    expect(second.getBinding('edit.undo')).toBe('Ctrl+Z');
  });

  it('an empty-storage reload yields exactly the default keymap', async () => {
    localStorage.removeItem(STORAGE_KEY);
    const reloaded = await freshKeymap();
    expect(reloaded.snapshotKeymap()).toEqual(
      Object.fromEntries(BINDINGS.map(b => [b.id, b.defaultCombo])),
    );
  });
});

/* ------------------------- BINDINGS hygiene ------------------------- */

describe('BINDINGS registry', () => {
  it('ids are stable and unique', () => {
    const ids = BINDINGS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BINDINGS) {
      expect(b.id).toMatch(/^[a-z][a-zA-Z0-9.]*$/);
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.defaultCombo.length).toBeGreaterThan(0);
    }
  });

  it('no two bindings default to the same combo (resolver shadowing)', () => {
    // Two rows sharing a combo would mean the first App.tsx branch always
    // wins and the second shortcut is dead on arrival — this has regression
    // value every time someone adds a binding or a tool shortcut.
    const combos = BINDINGS.map(b => parseCombo(b.defaultCombo))
      .filter(p => p.key)
      .map(p => `${p.cmd ? 'C' : ''}${p.shift ? 'S' : ''}${p.alt ? 'A' : ''}+${p.key}`);
    const dupes = combos.filter((c, i) => combos.indexOf(c) !== i);
    expect(dupes).toEqual([]);
  });

  it('includes the documented anchor ids across every section', () => {
    const ids = new Set(BINDINGS.map(b => b.id));
    for (const id of [
      'window.commandPalette', 'edit.undo', 'edit.redoShift',
      'edit.copy', 'edit.pasteInPlace',
      'edit.group', 'edit.ungroup', 'edit.compoundPath',
      'view.zoomIn', 'view.zoomOut', 'view.zoomFit',
      'file.new', 'file.open', 'file.saveProject', 'file.exportSvg',
      'align.left', 'distribute.horizontal',
      'edit.selectAll', 'edit.selectInverse',
      'text.createOutlines', 'text.findReplace',
      'help.shortcuts', 'help.helpCenter',
    ]) {
      expect(ids.has(id), `missing binding ${id}`).toBe(true);
    }
  });

  it('auto-registers toolbar tools as tool.<id> bindings', () => {
    const toolBindings = BINDINGS.filter(b => b.id.startsWith('tool.'));
    // registerTools.ts ships ~16 icon+shortcut tools; the splice must not be
    // empty (the module-load ordering comment in keymap.ts guards this).
    expect(toolBindings.length).toBeGreaterThanOrEqual(10);
    for (const b of toolBindings) {
      // Single-key or Shift+single-key — never a cmd/alt combo.
      const p = parseCombo(b.defaultCombo);
      expect(p.cmd, `${b.id}`).toBe(false);
      expect(p.alt, `${b.id}`).toBe(false);
      expect(p.key.length, `${b.id}`).toBeLessThanOrEqual(2); // letter / digit / F-keys
    }
  });

  it('every default combo parses to a real base key', () => {
    for (const b of BINDINGS) {
      const p = parseCombo(b.defaultCombo);
      expect(p.key, `${b.id} has unparseable combo "${b.defaultCombo}"`).not.toBe('');
    }
  });
});
