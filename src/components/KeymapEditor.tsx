/**
 * KeymapEditor — dialog for customising every shortcut registered in
 * `src/lib/keymap.ts`. Lets the user record a new key combination per
 * binding, reset individual rows, or wipe every override at once.
 *
 * Mount lives in App.tsx, gated on the `showKeymapEditor` store flag.
 * Open via Help menu → "Customize Shortcuts…" or the command palette.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { isMac } from '../lib/runtime';
import {
  BINDINGS,
  getBinding,
  setBinding,
  resetBinding,
  resetAll,
  isOverridden,
  eventToCombo,
  subscribeKeymap,
} from '../lib/keymap';

/** Display the combo as discrete <kbd> chips (mirrors MenuBar/CommandPalette). */
function Kbd({ combo }: { combo: string }) {
  const isMacPlatform = isMac();
  if (!combo) return <span className="text-muted/60 italic text-[10px]">—</span>;
  const parts = combo.split('+').map((p) => {
    const k = p.trim();
    if (isMacPlatform && /^Ctrl$/i.test(k)) return '⌘';
    if (isMacPlatform && /^Alt$/i.test(k)) return '⌥';
    if (isMacPlatform && /^Shift$/i.test(k)) return '⇧';
    if (isMacPlatform && /^Meta$/i.test(k)) return '⌘';
    return k;
  });
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {parts.map((p, i) => (
        <kbd
          key={i}
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-sm bg-panel3 border border-border text-[10px] font-medium font-mono text-ink leading-none tabular-nums"
        >
          {p}
        </kbd>
      ))}
    </span>
  );
}

export function KeymapEditor() {
  const t = useT();
  const open = useEditor((s) => s.showKeymapEditor);
  const setModal = useEditor((s) => s.setModal);
  // Subscribe to keymap changes so the table refreshes after each rebind.
  const [, setTick] = useState(0);
  useEffect(() => subscribeKeymap(() => setTick((n) => n + 1)), []);

  // Id currently waiting for a key capture. Null = no capture in progress.
  const [capturing, setCapturing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewedSearchAction, setReviewedSearchAction] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const firstBindingRef = useRef<HTMLButtonElement | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = useMemo(
    () => normalizedQuery.split('|').map((token) => token.trim()).filter(Boolean),
    [normalizedQuery],
  );
  const filteredBindings = useMemo(() => {
    if (queryTokens.length === 0) return BINDINGS;
    return BINDINGS.filter((binding) => {
      const haystack = `${binding.id} ${binding.label} ${t(binding.label)} ${binding.defaultCombo} ${getBinding(binding.id)}`.toLowerCase();
      return queryTokens.some((token) => haystack.includes(token));
    });
  }, [queryTokens, t]);

  const currentReviewIndex = Math.min(reviewIndex, Math.max(0, filteredBindings.length - 1));

  const focusBindingRow = (index: number) => {
    setReviewIndex(index);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-keymap-index="${index}"]`)?.focus();
    });
  };

  const handleBindingListKeys = (event: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (capturing || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const activeIndex = Number((document.activeElement as HTMLElement | null)?.dataset.keymapIndex ?? 0);
    const lastIndex = filteredBindings.length - 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : Math.max(0, Math.min(lastIndex, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
    focusBindingRow(nextIndex);
  };
  const handleSearchActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (capturing || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-keymap-search-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    event.preventDefault();
    const nextAction = actions[nextIndex];
    setReviewedSearchAction(nextAction?.dataset.keymapSearchActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  // Global capture listener — bound only while a row is in capture mode.
  useEffect(() => {
    if (!capturing) return;
    const onDown = (e: KeyboardEvent) => {
      // Escape cancels capture; Enter keeps current combo. Both are reserved
      // so users always have an escape hatch from rebinding.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setCapturing(null);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        setCapturing(null);
        return;
      }
      const combo = eventToCombo(e);
      if (!combo) return; // pure modifier — keep waiting
      e.preventDefault();
      e.stopPropagation();
      setBinding(capturing, combo);
      setCapturing(null);
    };
    // `capture: true` so we intercept the key before the global App.tsx
    // handler fires (otherwise Ctrl+S would download an SVG mid-rebind).
    window.addEventListener('keydown', onDown, true);
    return () => window.removeEventListener('keydown', onDown, true);
  }, [capturing]);

  // Escape closes the dialog when NOT in capture mode (capture mode owns Esc
  // for "cancel rebind"). Mirrors HelpCenter/AIPanel/ShortcutsDialog pattern.
  const closeDialog = useCallback(() => setModal('showKeymapEditor', false), [setModal]);
  useEscapeClose(open && !capturing, closeDialog);
  useFocusRestore(open);
  useEffect(() => {
    if (!open) return;
    const handoffQuery = window.sessionStorage.getItem('anchorworks.keymapSearch');
    const editFirst = window.sessionStorage.getItem('anchorworks.keymapEditFirst') === '1';
    if (editFirst) window.sessionStorage.removeItem('anchorworks.keymapEditFirst');
    if (handoffQuery) {
      window.sessionStorage.removeItem('anchorworks.keymapSearch');
      requestAnimationFrame(() => {
        setQuery(handoffQuery);
        if (editFirst) {
          const handoffTokens = handoffQuery.trim().toLowerCase().split('|').map((token) => token.trim()).filter(Boolean);
          const first = BINDINGS.find((binding) => {
            const haystack = `${binding.id} ${binding.label} ${t(binding.label)} ${binding.defaultCombo} ${getBinding(binding.id)}`.toLowerCase();
            return handoffTokens.some((token) => haystack.includes(token));
          });
          if (first) setCapturing(first.id);
        }
        searchRef.current?.focus();
      });
    } else {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, t]);

  if (!open) return null;
  const close = () => {
    setCapturing(null);
    setModal('showKeymapEditor', false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keymap-dialog-title"
    >
      <div
        className="w-[640px] max-w-[95vw] max-h-[85vh] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="keymap-dialog-title" className="dialog-title">{t('Customize Shortcuts…')}</h2>
          <button
            onClick={close}
            className="btn-dialog-close"
            aria-label={t('Close')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2 border-b border-border bg-panel">
          <input
            ref={searchRef}
            type="search"
            className="input w-full text-sm"
            placeholder={t('Search shortcuts…')}
            value={query}
            onChange={(event) => { setReviewIndex(0); setQuery(event.target.value); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && filteredBindings[0]) {
                event.preventDefault();
                setCapturing(filteredBindings[0].id);
                return;
              }
              if (event.key === 'ArrowDown' && filteredBindings[0]) {
                event.preventDefault();
                focusBindingRow(0);
                return;
              }
              if (event.key === 'Escape' && query) {
                event.preventDefault();
                event.stopPropagation();
                setQuery('');
              }
            }}
            aria-label={t('Search shortcuts…')}
            title={`${t('Press Enter to edit first search result')} · ${t('Press Arrow Down to focus first shortcut')}`}
          />
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <span className="text-[10px] text-muted tabular-nums" aria-live="polite">
              {normalizedQuery ? `${filteredBindings.length} / ${BINDINGS.length} ${t('matches')}` : `${BINDINGS.length} ${t('shortcuts')}`}
            </span>
            {query && (
              <div
                className="flex items-center gap-2"
                role="toolbar"
                aria-label={t('Shortcut search actions')}
                aria-describedby="keymap-search-action-review-status"
                title={t('Use arrow keys to review shortcut search actions')}
                onKeyDown={handleSearchActionKeys}
              >
                <span id="keymap-search-action-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedSearchAction || t('Shortcut search actions')}`}
                </span>
                <button
                  type="button"
                  className="btn !py-1.5 !px-2 text-xs shrink-0"
                  data-keymap-search-action
                  data-keymap-search-action-review={t('Edit first search result')}
                  onFocus={() => setReviewedSearchAction(t('Edit first search result'))}
                  onClick={() => {
                    const first = filteredBindings[0];
                    if (!first) return;
                    setCapturing(first.id);
                  }}
                  disabled={filteredBindings.length === 0}
                  title={t('Edit first search result')}
                >
                  {t('Edit First')}
                </button>
                <button
                  type="button"
                  className="btn !py-1.5 !px-2 text-xs shrink-0"
                  data-keymap-search-action
                  data-keymap-search-action-review={t('Clear search')}
                  onFocus={() => setReviewedSearchAction(t('Clear search'))}
                  onClick={() => { setReviewIndex(0); setQuery(''); }}
                  title={t('Clear search')}
                >
                  {t('Clear search')}
                </button>
              </div>
            )}
          </div>
        </div>
        <div id="keymap-review-status" className="sr-only" aria-live="polite">
          {filteredBindings[currentReviewIndex]
            ? `${t('Reviewing')} ${t(filteredBindings[currentReviewIndex].label)} ${currentReviewIndex + 1} / ${filteredBindings.length}. ${t('Click to rebind')}`
            : t('No shortcuts found.')}
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel2/95 backdrop-blur z-10">
              <tr className="field-label">
                <th className="text-left font-semibold py-2 px-4">{t('Action')}</th>
                <th className="text-left font-semibold py-2 px-2">{t('Shortcut')}</th>
                <th className="text-right font-semibold py-2 px-4">{t('Default')}</th>
              </tr>
            </thead>
            <tbody
              aria-label={t('Shortcut results')}
              aria-describedby="keymap-review-status"
              title={t('Use arrow keys to review shortcuts')}
              onKeyDown={handleBindingListKeys}
            >
              {filteredBindings.map((b, index) => {
                const current = getBinding(b.id);
                const isCapturing = capturing === b.id;
                const overridden = isOverridden(b.id);
                return (
                  <tr
                    key={b.id}
                    className={`border-t border-border/40 hover:bg-panel3/40 transition-colors ${index === currentReviewIndex ? 'bg-accent2/10' : ''}`}
                    aria-selected={index === currentReviewIndex}
                  >
                    <td className="py-1.5 px-4 text-ink/90">{t(b.label)}</td>
                    <td className="py-1.5 px-2">
                      <button
                        ref={index === 0 ? firstBindingRef : undefined}
                        type="button"
                        data-keymap-index={index}
                        onFocus={() => setReviewIndex(index)}
                        onClick={() => setCapturing(b.id)}
                        className={`inline-flex items-center gap-2 px-2 py-1 rounded text-left transition-colors ${
                          isCapturing
                            ? 'bg-accent2/15 ring-1 ring-accent2/40'
                            : 'hover:bg-panel3'
                        }`}
                        aria-label={`${t('Rebind')}: ${t(b.label)}`}
                        title={t('Click to rebind')}
                      >
                        {isCapturing ? (
                          <span className="text-[11px] text-ink italic">
                            {t('Press a key combination…')}
                          </span>
                        ) : (
                          <Kbd combo={current} />
                        )}
                      </button>
                    </td>
                    <td className="py-1.5 px-4 text-right">
                      {overridden ? (
                        <button
                          type="button"
                          onClick={() => resetBinding(b.id)}
                          className="text-[11px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors"
                          aria-label={`${t('Reset')}: ${t(b.label)}`}
                          title={`${t('Default')}: ${b.defaultCombo}`}
                        >
                          {t('Reset')}
                        </button>
                      ) : (
                        <span
                          className="text-[10px] text-muted/40 tabular-nums"
                          title={b.defaultCombo}
                        >
                          {b.defaultCombo}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredBindings.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 px-4 text-center text-muted text-sm">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span>{t('No shortcuts found.')}</span>
                      {query && (
                        <button
                          type="button"
                          className="btn !py-1 !px-2 text-[10px]"
                          onClick={() => { setReviewIndex(0); setQuery(''); searchRef.current?.focus(); }}
                        >
                          {t('Clear search')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-panel2 text-[11px]">
          <span className="text-muted">
            {t('Press a key combination…')} · <kbd className="kbd-inline">Esc</kbd> {t('Cancel')}
          </span>
          <button
            type="button"
            onClick={() => resetAll()}
            className="px-2 py-1 rounded text-muted hover:text-ink hover:bg-panel3 transition-colors"
          >
            {t('Reset All')}
          </button>
        </div>
      </div>
    </div>
  );
}
