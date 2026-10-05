import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { t, useI18n, ensureZhLoaded } from '../i18n';
import { zhDict } from '../i18n-zh';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('i18n.t', () => {
  beforeEach(() => {
    useI18n.setState({ lang: 'en' });
  });

  afterEach(() => {
    useI18n.setState({ lang: 'en' });
  });

  it('returns the English source string in en mode', () => {
    expect(t('Fill')).toBe('Fill');
    expect(t('Cancel')).toBe('Cancel');
  });

  it('returns enOverrides when the display text differs from the key', () => {
    expect(t('Proof print settings')).toBe('A4 portrait, fit, 10 mm margin');
    expect(t('2×2 repeat')).toBe('2×2');
  });

  it('returns the Chinese translation after switching to zh', async () => {
    useI18n.setState({ lang: 'zh' });
    // The zh dictionary is a lazy chunk — wait for it before asserting.
    await ensureZhLoaded();
    expect(t('Fill')).toBe('填充');
    expect(t('Cancel')).toBe('取消');
    expect(t('Preferences')).toBe('偏好设置');
  });

  it('falls back to the key itself for unknown keys', async () => {
    expect(t('___no-such-key___')).toBe('___no-such-key___');
    useI18n.setState({ lang: 'zh' });
    await ensureZhLoaded();
    expect(t('___no-such-key___')).toBe('___no-such-key___');
  });

  it('never returns a non-string while the zh chunk is pending', () => {
    // Regression guard for the pre-load window: an unloaded dictionary
    // must render English (or the override), never undefined/crash.
    // The ready flag alone only drives React re-renders, so forcing it
    // false must not change t()'s output shape.
    useI18n.setState({ lang: 'zh', zhReady: false });
    expect(typeof t('Fill')).toBe('string');
    expect(t('Fill').length).toBeGreaterThan(0);
  });

  it('switches back to English correctly', async () => {
    useI18n.setState({ lang: 'zh' });
    await ensureZhLoaded();
    expect(t('Fill')).toBe('填充');
    useI18n.setState({ lang: 'en' });
    expect(t('Fill')).toBe('Fill');
  });
});

// ---------------------------------------------------------------------------
// Static dictionary-integrity guards.
//
// zhDict is an exact-match lookup keyed by the English source string, so a
// key whose bytes drift from the call site (straight vs curly quotes, a
// stray escape backslash, reworded text) silently falls back to English in
// the Chinese UI. These tests statically cross-check the dictionary against
// the component corpus to catch that class of bug at test time:
//
//   1. Every zhDict key must be referenced by src (as raw bytes, as the
//      parsed value of some string literal, or via a t(`…`) template that
//      can compose it). Catches dead keys AND byte-form mismatches.
//   2. Every t('…') literal containing quote/apostrophe characters — the
//      near-miss-prone class — must have a zhDict entry.
//
// Strings without quotes are allowed to be untranslated by design (the key
// IS the English fallback), so the full zero-missing assertion is scoped to
// the risky class only.
// ---------------------------------------------------------------------------

interface CorpusData {
  /** Raw source text of every scanned file, joined. */
  raw: string;
  /** Parsed values of all string literals in the corpus. */
  literalValues: Set<string>;
  /** Static-chunk lists of every t(`…`) template call. */
  templates: string[][];
  /** Quote-containing t('…')/t("…") literal values, with their file. */
  riskyLiterals: Array<{ value: string; file: string }>;
}

let corpusCache: CorpusData | null = null;

/** Scan src once (excluding the i18n modules and tests) and cache the result. */
function getCorpus(): CorpusData {
  if (corpusCache) return corpusCache;
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const files: string[] = [];
  (function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(p);
      } else if (/\.(tsx?|html|css)$/.test(entry.name)) {
        files.push(p.replace(/\\/g, '/'));
      }
    }
  })(srcRoot);
  const scanned = files.filter((f) => !/(^|\/)i18n(-zh)?\.ts$/.test(f));
  const literalValues = new Set<string>();
  const templates: string[][] = [];
  const riskyLiterals: Array<{ value: string; file: string }> = [];
  const parts: string[] = [];
  for (const f of scanned) {
    const text = readFileSync(f, 'utf8');
    parts.push(text);
    for (const m of text.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) literalValues.add(unescapeLiteral(m[1]));
    for (const m of text.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) literalValues.add(unescapeLiteral(m[1]));
    for (const m of text.matchAll(/\bt\(\s*`([^`]*)`\s*\)/g)) templates.push(m[1].split(/\$\{[^}]*\}/));
    for (const m of text.matchAll(/\bt\(\s*(['"])((?:[^\\]|\\.)*?)\1/g)) {
      const value = unescapeLiteral(m[2]);
      if (/["'“”‘’]/.test(value)) riskyLiterals.push({ value, file: f });
    }
  }
  corpusCache = { raw: parts.join('\n'), literalValues, templates, riskyLiterals };
  return corpusCache;
}

/** Decode a TS/JS string-literal body (the part between the quotes) to its runtime value. */
function unescapeLiteral(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const c = s[i + 1];
      if (c === 'n') { out += '\n'; i++; continue; }
      if (c === 't') { out += '\t'; i++; continue; }
      if (c === 'u') {
        const hex = s.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
          continue;
        }
      }
      out += c;
      i++;
      continue;
    }
    out += s[i];
  }
  return out;
}

/** True when a t(`A${x}B`) template can compose `value` from known literals. */
function composedByTemplate(value: string, templates: string[][], literalValues: Set<string>): boolean {
  for (const chunks of templates) {
    if (chunks.length < 2) continue;
    if (!value.startsWith(chunks[0]) || !value.endsWith(chunks[chunks.length - 1])) continue;
    let pos = chunks[0].length;
    const holes: string[] = [];
    let ok = true;
    for (let i = 1; i < chunks.length; i++) {
      const at = value.indexOf(chunks[i], pos);
      if (at < 0) { ok = false; break; }
      holes.push(value.slice(pos, at));
      pos = at + chunks[i].length;
    }
    if (ok && holes.every((h) => literalValues.has(h))) return true;
  }
  return false;
}

describe('i18n dictionary integrity (static)', () => {
  it('every zhDict key is referenced by src — no dead or byte-mismatched keys', () => {
    const { raw, literalValues, templates } = getCorpus();
    const failures: string[] = [];
    for (const key of Object.keys(zhDict)) {
      const alive = raw.includes(key)
        || literalValues.has(key)
        || composedByTemplate(key, templates, literalValues);
      if (!alive) failures.push(key.length > 90 ? `${key.slice(0, 90)}…` : key);
    }
    expect(
      failures,
      `${failures.length} zhDict keys are not referenced by any component (dead keys or byte-form ` +
      `mismatches that silently break the Chinese translation). Align or remove them in src/lib/i18n-zh.ts.`,
    ).toEqual([]);
  });

  it('every quote-containing t() literal has a zhDict entry (near-miss guard)', () => {
    const { riskyLiterals } = getCorpus();
    const dictKeys = new Set(Object.keys(zhDict));
    const failures = riskyLiterals
      .filter(({ value }) => !dictKeys.has(value))
      .map(({ value, file }) => `${file}: t(${JSON.stringify(value)})`);
    expect(
      failures,
      `${failures.length} t() literals containing quote characters have no zhDict entry — these are the ` +
      `near-miss-prone strings whose translations silently fall back to English when the key bytes drift.`,
    ).toEqual([]);
  });
});
