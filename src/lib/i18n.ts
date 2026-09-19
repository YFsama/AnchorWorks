/**
 * Tiny i18n for Anchorworks
 * ---------------------------------------------------------------
 * USAGE
 *   • In React components:
 *        const t = useT();              // subscribes to language changes
 *        return <button>{t('Cancel')}</button>;
 *   • In non-React code (one-shot reads):
 *        import { t } from './i18n';
 *        const label = t('Cancel');
 *
 * DICTIONARY LAYOUT (since the 0.13 code-split)
 *   • Keys are the English source string verbatim — an unknown key still
 *     renders sensibly in English, so the English "table" is just the key
 *     itself. Only keys whose display text differs from the key (mostly
 *     label/tooltip split pairs) live in `enOverrides` below.
 *   • Chinese translations live in `./i18n-zh.ts`, loaded LAZILY via
 *     dynamic import: English users never download that chunk. Until it
 *     arrives, `t()` falls back to English; when it lands, the store's
 *     `zhReady` flag flips and every `useT()` consumer re-renders.
 *
 * ADDING STRINGS
 *   • English: just call t('Your text') — the key IS the text. If the
 *     visible label must differ from the key (e.g. tooltip pair), add an
 *     `enOverrides` entry.
 *   • Chinese: append `"Your text": "你的文本",` to `zhDict` in
 *     `./i18n-zh.ts`.
 *
 * ADDING A NEW LANGUAGE
 *   1. Extend the `Lang` type union and `LANGUAGES` tuple.
 *   2. Create `i18n-<lang>.ts` exporting `<lang>Dict: Record<string,string>`
 *      (mirror `i18n-zh.ts`), and load it in `ensureLangDict` below.
 *   3. Extend `t()`'s lookup chain and the language switcher in
 *     `MenuBar.tsx`.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const LANGUAGES = ['en', 'zh'] as const;
export type Lang = (typeof LANGUAGES)[number];

interface I18nState {
  lang: Lang;
  /** True once the lazy Chinese dictionary has finished loading. */
  zhReady: boolean;
  setLang: (l: Lang) => void;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: 'en',
      zhReady: false,
      setLang: (lang) => {
        set({ lang });
        // Switching to Chinese may be the first time the chunk is needed.
        if (lang === 'zh') void ensureZhLoaded();
      },
    }),
    {
      name: 'vector.lang',
      storage: createJSONStorage(() => localStorage),
      // Persist only the language preference itself (zhReady re-derives
      // per session from the on-demand chunk load).
      partialize: (s) => ({ lang: s.lang }),
    },
  ),
);

/** Keys whose English display text differs from the key itself. */
const enOverrides: Record<string, string> = {
  "Weed rows": "Rows",
  "Weed columns": "Columns",
  "Proof tile job": "Proof",
  "Poster tile job": "Poster",
  "Banner tile job": "Banner",
  "Half size": "Half",
  "Original size": "Original",
  "Double size": "Double",
  "Columns short": "Cols",
  "Proof print": "Proof",
  "Office full page": "Office",
  "True size check": "True size",
  "Proof print settings": "A4 portrait, fit, 10 mm margin",
  "Office full page settings": "Letter portrait, fit, 5 mm margin",
  "Photo fill settings": "A4 landscape, fill, no margin",
  "True size check settings": "A4 portrait, actual size, 10 mm margin",
  "Proof prep": "Proof",
  "Press prep": "Press",
  "Sticker prep": "Sticker",
  "No prep": "None",
  "Proof prep settings": "Proof print prep",
  "Press prep settings": "Press print prep",
  "Sticker prep settings": "Sticker print prep",
  "No prep settings": "No print-prep marks",
  "2×2 repeat": "2×2",
  "3×3 repeat": "3×3",
  "Artboard row keyboard hint": "Enter focus · Ctrl/Cmd+D duplicate · Delete remove · R swap",
  "Saved Ns ago": "Saved {n}s ago",
  "Saved Nm ago": "Saved {n}m ago",
  "Saved Nh ago": "Saved {n}h ago",
  "Saved Nd ago": "Saved {n}d ago",
  "Nm ago": "{n}m ago",
  "Nh ago": "{n}h ago",
  "Nd ago": "{n}d ago",
  "Nw ago": "{n}w ago",
  "Nmo ago": "{n}mo ago",
  "Ny ago": "{n}y ago",
};

// The loaded Chinese dictionary — null until the lazy chunk arrives.
// Module-level (not store state) so t()'s hot path stays a plain property
// read; the store's `zhReady` flag exists purely to trigger re-renders.
let zhDict: Record<string, string> | null = null;
let zhLoadPromise: Promise<void> | null = null;

/** Load the Chinese dictionary chunk (idempotent, network-free once cached). */
export function ensureZhLoaded(): Promise<void> {
  if (zhDict) return Promise.resolve();
  if (!zhLoadPromise) {
    zhLoadPromise = import('./i18n-zh')
      .then((m) => {
        zhDict = m.zhDict;
        useI18n.setState({ zhReady: true });
      })
      .catch(() => {
        // Chunk fetch failed (offline first visit, SW not ready): stay on
        // the English fallback and allow a retry on the next call.
        zhLoadPromise = null;
      });
  }
  return zhLoadPromise;
}

/** Non-React lookup. Falls back to the key (English) when missing. */
export function t(k: string): string {
  if (useI18n.getState().lang === 'zh') {
    const zh = zhDict?.[k];
    if (zh !== undefined) return zh;
  }
  return enOverrides[k] ?? k;
}

/**
 * React hook returning a translator bound to the current language.
 * Components calling `useT()` automatically re-render when the language
 * changes OR when the lazy Chinese dictionary finishes loading: the
 * selector packs both signals into one subscription, and the returned
 * translator reads live state at call time (stable function reference).
 */
export function useT(): (k: string) => string {
  useI18n((s) => `${s.lang}:${s.zhReady}`);
  return t;
}

/**
 * True when the UI can render in the user's language without a flash.
 * English is always ready; Chinese becomes ready once its chunk lands.
 * App.tsx gates first paint on this for persisted-zh cold boots.
 */
export function useI18nReady(): boolean {
  const lang = useI18n((s) => s.lang);
  const zhReady = useI18n((s) => s.zhReady);
  return lang !== 'zh' || zhReady;
}

// Boot wiring (module side-effects):
//   1. Persisted-Chinese users start loading the chunk immediately.
//   2. Everyone else warms it during idle time, so opening the language
//      switcher (or a persisted-zh reload racing the gate) never waits.
if (typeof window !== 'undefined') {
  if (useI18n.getState().lang === 'zh') {
    void ensureZhLoaded();
  } else if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => { void ensureZhLoaded(); }, { timeout: 4000 });
  } else {
    setTimeout(() => { void ensureZhLoaded(); }, 4000);
  }
}
