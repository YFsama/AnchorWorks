import { useRef, useState } from 'react';
import { ALL_FONTS, ensureFontLoaded, loadCustomFontFile } from '../lib/fonts';
import { getCanvas, pushHistory } from '../lib/canvasEngine';
import * as fabric from 'fabric';
import { Upload, Search } from 'lucide-react';
import { useT } from '../lib/i18n';

const RECENT_KEY = 'vector.recentFonts';
interface RecentFont { name: string; family: string; }

function loadRecentFonts(): RecentFont[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    if (Array.isArray(raw)) return raw.filter((r) => r && typeof r.name === 'string' && typeof r.family === 'string').slice(0, 6);
  } catch { /* ignore */ }
  return [];
}

function pushRecentFont(name: string, family: string): RecentFont[] {
  const next = [{ name, family }, ...loadRecentFonts().filter((r) => r.name !== name)].slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

function selectedFontFamily(): string {
  const c = getCanvas();
  if (!c) return '';
  const texts = c.getActiveObjects().filter((o) => o.type === 'i-text' || o.type === 'text' || o.type === 'textbox') as fabric.IText[];
  if (texts.length === 0) return '';
  const first = String(texts[0].fontFamily ?? '');
  return texts.every((text) => String(text.fontFamily ?? '') === first) ? first : '';
}

export function FontPicker() {
  const t = useT();
  const [filter, setFilter] = useState('');
  const [reviewedSearchAction, setReviewedSearchAction] = useState('');
  const [recent, setRecent] = useState<RecentFont[]>(loadRecentFonts);
  const fileRef = useRef<HTMLInputElement>(null);
  const firstFontRef = useRef<HTMLButtonElement>(null);
  const apply = (family: string, name: string) => {
    ensureFontLoaded(name);
    const c = getCanvas(); if (!c) return;
    // Apply to every selected text object so a multi-selection (e.g. Select All
    // Text Objects) restyles all of them, not just the active one.
    const texts = c.getActiveObjects().filter((o) => o.type === 'i-text' || o.type === 'text' || o.type === 'textbox') as fabric.IText[];
    if (texts.length === 0) return;
    for (const o of texts) o.set({ fontFamily: family });
    c.requestRenderAll();
    pushHistory();
    setRecent(pushRecentFont(name, family));
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const def = await loadCustomFontFile(f);
    apply(def.family, def.name);
    e.target.value = '';
  };
  const normalizedFilter = filter.trim().toLowerCase();
  const matchingFonts = ALL_FONTS.filter(f => f.name.toLowerCase().includes(normalizedFilter));
  const list = matchingFonts.slice(0, 80);
  const visibleFonts = !filter && recent.length > 0 ? [...recent, ...list] : list;
  const currentFontFamily = selectedFontFamily();
  const reviewedFont = visibleFonts.find((font) => font.family === currentFontFamily) ?? visibleFonts[0];
  const reviewedFontIndex = reviewedFont ? visibleFonts.findIndex((font) => font.family === reviewedFont.family && font.name === reviewedFont.name) : -1;
  const handleFontListKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-font-option]'));
    if (buttons.length === 0) return;
    event.preventDefault();
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const currentIndex = activeIndex >= 0 ? activeIndex : 0;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : Math.min(buttons.length - 1, Math.max(0, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)));
    const nextButton = buttons[nextIndex];
    if (nextButton?.dataset.fontFamily && nextButton.dataset.fontName) {
      apply(nextButton.dataset.fontFamily, nextButton.dataset.fontName);
    }
    requestAnimationFrame(() => nextButton?.focus());
  };
  const handleSearchActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-font-search-action]'))
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
    setReviewedSearchAction(nextAction?.dataset.fontSearchActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };
  return (
    <div className="panel-section p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="field-label !mb-0">{t('Font')}</h3>
        <button
          className="btn flex items-center gap-1"
          onClick={() => fileRef.current?.click()}
          title={t('Upload a custom font (TTF / OTF / WOFF)')}
          aria-label={t('Upload a custom font (TTF / OTF / WOFF)')}
        ><Upload size={12} aria-hidden="true" />{t('Upload')}</button>
        <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" hidden onChange={upload} />
      </div>
      {/* Search field — magnifier prefix matches the HelpCenter search so the
          two field-find UIs in the app read as one pattern, rather than the
          FontPicker looking like a generic number input that happens to take
          text. The wrapper carries the `.input-num` border/bg styling; the
          inner <input> is bare so the icon can sit inside the chrome. */}
      <div className="input-num mb-2 flex items-center gap-1.5 px-2 py-1 focus-within:border-accent2">
        <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
        <input
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && matchingFonts[0]) {
              e.preventDefault();
              apply(matchingFonts[0].family, matchingFonts[0].name);
              return;
            }
            if (e.key === 'ArrowDown' && list[0]) {
              e.preventDefault();
              requestAnimationFrame(() => firstFontRef.current?.focus());
              return;
            }
            if (e.key === 'Escape' && filter) {
              e.preventDefault();
              e.stopPropagation();
              setFilter('');
            }
          }}
          placeholder={t('Search fonts…')}
          aria-label={t('Search fonts…')}
          title={`${t('Press Enter to apply first search result')} · ${t('Press Arrow Down to focus first font')}`}
          className="flex-1 bg-transparent outline-none text-xs text-ink placeholder:text-muted/70 min-w-0"
        />
        <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
          {normalizedFilter ? `${matchingFonts.length} / ${ALL_FONTS.length} ${t('matches')}` : `${ALL_FONTS.length} ${t('fonts')}`}
        </span>
        {filter && (
          <div
            className="flex items-center gap-1.5 shrink-0"
            role="toolbar"
            aria-label={t('Font search actions')}
            aria-describedby="font-search-action-review-status"
            title={t('Use arrow keys to review font search actions')}
            onKeyDown={handleSearchActionKeys}
          >
            <span id="font-search-action-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedSearchAction || t('Font search actions')}`}
            </span>
            <button
              type="button"
              className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline"
              data-font-search-action
              data-font-search-action-review={t('Apply first search result')}
              onFocus={() => setReviewedSearchAction(t('Apply first search result'))}
              onClick={() => { if (matchingFonts[0]) apply(matchingFonts[0].family, matchingFonts[0].name); }}
              disabled={matchingFonts.length === 0}
              title={t('Apply first search result')}
            >
              {t('Apply First')}
            </button>
            <button
              type="button"
              className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0"
              data-font-search-action
              data-font-search-action-review={t('Clear search')}
              onFocus={() => setReviewedSearchAction(t('Clear search'))}
              onClick={() => setFilter('')}
              title={t('Clear search')}
            >
              {t('Clear search')}
            </button>
          </div>
        )}
      </div>
      <div id="font-review-status" className="sr-only" aria-live="polite">
        {reviewedFont
          ? `${t('Reviewing')} ${reviewedFont.name} ${reviewedFontIndex + 1} / ${visibleFonts.length}. ${t('Use arrow keys to review fonts')}`
          : t('No matching fonts')}
      </div>
      <div
        className="max-h-48 overflow-y-auto border border-border rounded bg-panel2"
        role="listbox"
        aria-label={t('Font previews')}
        aria-describedby="font-review-status"
        title={t('Use arrow keys to review fonts')}
        onKeyDown={handleFontListKeys}
      >
        {!filter && recent.length > 0 && (
          <div className="border-b border-border">
            <div className="px-2 pt-1.5 pb-0.5 type-caption text-muted">{t('Recently used')}</div>
            {recent.map((f, index) => {
              const active = currentFontFamily === f.family;
              return (
                <button
                  key={`recent-${f.name}`}
                  ref={index === 0 ? firstFontRef : undefined}
                  type="button"
                  data-font-option
                  data-font-family={f.family}
                  data-font-name={f.name}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => ensureFontLoaded(f.name)}
                  onFocus={() => ensureFontLoaded(f.name)}
                  onClick={() => apply(f.family, f.name)}
                  className={`block w-full text-left px-2 py-1 text-xs rounded-sm hover:bg-panel3 transition-colors ${active ? 'bg-accent2/15 text-ink ring-1 ring-accent2/50' : ''}`}
                  style={{ fontFamily: f.family }}
                >
                  {f.name}
                </button>
              );
            })}
          </div>
        )}
        {list.length === 0 ? (
          // Empty state matches the visual pattern of LayersPanel / AssetsPanel:
          // small line-art glyph + heading + caption. Previously this was a
          // single line of caption text inside the scroll box, which read as a
          // bug rather than a designed state when search returned zero hits.
          <div className="px-3 py-4 flex flex-col items-center text-center">
            {/* "Aa" letterform with a magnifier sweep — search-with-no-match idea. */}
            <svg width="40" height="32" viewBox="0 0 40 32" fill="none" className="mb-1.5 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
              <text x="6" y="22" fontFamily="ui-serif, Georgia, serif" fontSize="18" fontWeight="600" fill="currentColor" fillOpacity="0.75">Aa</text>
              <circle cx="29" cy="14" r="6" stroke="rgb(var(--color-accent2))" strokeOpacity="0.7" strokeWidth="1.2" />
              <path d="M33.5 18.5 L 37 22" stroke="rgb(var(--color-accent2))" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <div className="text-xs text-ink/90 mb-0.5">{filter ? t('No matching fonts') : t('No fonts available')}</div>
            <div className="type-caption leading-relaxed max-w-[200px]">
              {filter
                ? t('No fonts match “{q}”. Try a shorter or different keyword.').replace('{q}', filter)
                : t('Upload a TTF/OTF or check back later.')}
            </div>
            {filter && (
              <button
                type="button"
                className="btn !py-1 !px-2 text-[10px] mt-2"
                onClick={() => setFilter('')}
              >
                {t('Clear search')}
              </button>
            )}
          </div>
        ) : (
          list.map((f, index) => {
            const active = currentFontFamily === f.family;
            return (
              <button
                key={f.name}
                ref={!filter && recent.length > 0 ? undefined : index === 0 ? firstFontRef : undefined}
                type="button"
                data-font-option
                data-font-family={f.family}
                data-font-name={f.name}
                role="option"
                aria-selected={active}
                // Mirror mouse-hover with keyboard-focus so the lazy font-preload
                // fires the same way for Tab / arrow-key navigation. Without
                // the onFocus pair, keyboard users tabbed through the list and
                // saw every row stuck in the fallback font — no preview.
                onMouseEnter={() => ensureFontLoaded(f.name)}
                onFocus={() => ensureFontLoaded(f.name)}
                onClick={() => apply(f.family, f.name)}
                // `rounded-sm` matches the radius of the global focus-visible
                // halo (4px). Without it, keyboard-tab focus painted a 4px-
                // radius ring around a sharp-cornered button — visible mismatch.
                className={`block w-full text-left px-2 py-1 text-xs rounded-sm hover:bg-panel3 transition-colors ${active ? 'bg-accent2/15 text-ink ring-1 ring-accent2/50' : ''}`}
                style={{ fontFamily: f.family }}
              >
                {f.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
