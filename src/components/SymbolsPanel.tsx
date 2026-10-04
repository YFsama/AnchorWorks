import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Check, X, Search, MousePointerClick } from 'lucide-react';
import { useT } from '../lib/i18n';
import {
  getSymbols,
  saveSelectionAsSymbol,
  insertSymbol,
  deleteSymbol,
  renameSymbol,
  redefineSymbolFromSelection,
  detachSymbolInstancesFromSelection,
  selectSymbolInstances,
} from '../lib/symbols';
import type { SymbolEntry } from '../types';
import { toast } from '../lib/toast';
import { actionReviewKey, makeGridKeys, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { ActionToolbar } from './ui/ActionToolbar';
import { SearchableListActions } from './ui/SearchableListActions';

export function SymbolsPanel() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [symbols, setSymbols] = useState<SymbolEntry[]>([]);
  const [query, setQuery] = useState('');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewedSymbolAction, setReviewedSymbolAction] = useReviewedAction();
  // When non-null we're showing the inline "name this symbol" input in place
  // of the Save Selection button.
  const [namingNew, setNamingNew] = useState<string | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  const firstSymbolRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const refresh = () => setSymbols(getSymbols());
    refresh();
    const onChange = () => refresh();
    window.addEventListener('vector:symbols-changed', onChange as EventListener);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('vector:symbols-changed', onChange as EventListener);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  useEffect(() => {
    if (namingNew != null) newNameRef.current?.focus();
  }, [namingNew]);

  const beginSave = () => setNamingNew('');
  const redefineActiveSymbol = async () => {
    const entry = await redefineSymbolFromSelection();
    if (entry) toast.success(t('Symbol redefined'));
    else toast.warn(t('Select a symbol instance first.'));
  };
  const detachActiveSymbol = () => {
    const count = detachSymbolInstancesFromSelection();
    if (count) toast.success(`${count} ${t('symbol instances detached')}`);
    else toast.warn(t('Select a symbol instance first.'));
  };
  const cancelSave = () => setNamingNew(null);

  const commitSave = async () => {
    if (namingNew == null) return;
    const trimmed = namingNew.trim() || 'Symbol';
    setNamingNew(null);
    const entry = await saveSelectionAsSymbol(trimmed);
    if (!entry) {
      toast.warn(t('Select one or more objects on the canvas first.'));
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSymbols = useMemo(() => {
    if (!normalizedQuery) return symbols;
    return symbols.filter((symbol) => [
      symbol.name,
      symbol.id,
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [normalizedQuery, symbols]);

  const currentReviewIndex = Math.min(reviewIndex, Math.max(0, filteredSymbols.length - 1));

  // Tile-grid roving (grid-cols-3): ±1 freely crossing row boundaries, ±3
  // vertical rows, every move clamped (never wraps), Home/End absolute —
  // makeGridKeys in ui/useRovingActions. The review index commits
  // synchronously (the external live region derives from it) and the focus
  // move lands on the next animation frame — the legacy focusSymbolTile timing.
  const handleSymbolGridKeys = makeGridKeys({
    selector: '[data-symbol-index]',
    columns: 3,
    // Announcements derive from reviewIndex in the external region; tiles
    // carry no per-button review string, so there is nothing to publish.
    setReview: () => {},
    onNavigate: (_tile, index) => setReviewIndex(index),
    defer: true,
  });

  // Naming toolbar: the name <input> lives INSIDE this roving container and
  // is auto-focused when naming begins, so arrow keydowns bubble from the
  // input — the one roving container in the codebase whose no-focus fallback
  // is reachable. fallbackIndex: -1 reproduces the legacy asymmetric entry:
  // ArrowRight from the input starts "before the first" button and lands on
  // Save; ArrowLeft starts at the first and wraps onto Cancel. Arrows wrap,
  // the review reads data-symbol-naming-action-review (both buttons carry
  // it), and review + focus commit synchronously (makeRovingKeys in
  // ui/useRovingActions).
  const handleNamingActionKeys = makeRovingKeys({
    selector: '[data-symbol-naming-action]',
    reviewKey: actionReviewKey('data-symbol-naming-action'),
    fallbackToText: true,
    fallbackIndex: -1,
    wrap: true,
    guardEmpty: true,
    setReview: setReviewedSymbolAction,
  });

  return (
    <div className="panel-section">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="panel-header w-full text-left hover:bg-panel3 transition-colors"
          aria-expanded={open}
          aria-controls="symbols-panel-body"
        >
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            {t('Symbols')}
          </span>
          <span className="panel-count">{symbols.length}</span>
        </button>
      </h3>
      {open && (
        <div id="symbols-panel-body" className="px-2 pb-3 space-y-2">
          {namingNew == null ? (
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                className="btn flex items-center gap-1 justify-center"
                onClick={beginSave}
                title={t('Save the current selection as a reusable symbol')}
              >
                <Plus size={12} aria-hidden="true" /> {t('Save Symbol')}
              </button>
              <button
                type="button"
                className="btn flex items-center gap-1 justify-center"
                onClick={() => { void redefineActiveSymbol(); }}
                title={t('Redefine symbol from selected instance')}
              >
                <Check size={12} aria-hidden="true" /> {t('Redefine')}
              </button>
              <button
                type="button"
                className="btn flex items-center gap-1 justify-center"
                onClick={detachActiveSymbol}
                title={t('Break link to selected symbol instance')}
              >
                <X size={12} aria-hidden="true" /> {t('Break Link')}
              </button>
            </div>
          ) : (
            <ActionToolbar
              statusId="symbol-action-review-status"
              className="flex items-center gap-1"
              label={t('Symbol naming actions')}
              title={t('Use arrow keys to review symbol actions')}
              onKeyDown={handleNamingActionKeys}
              statusAs="span"
              reviewingLabel={t('Reviewing')}
              reviewed={reviewedSymbolAction}
              fallback={t('Symbol naming actions')}
            >
              <input
                ref={newNameRef}
                type="text"
                className="input-num flex-1"
                value={namingNew}
                placeholder={t('Symbol name')}
                aria-label={t('Symbol name')}
                onChange={(e) => setNamingNew(e.target.value)}
                onKeyDown={(e) => {
                  // IME guard — symbol names take Chinese / Japanese / Korean input.
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void commitSave(); }
                  else if (e.key === 'Escape') { e.preventDefault(); cancelSave(); }
                }}
              />
              <button
                type="button"
                data-symbol-naming-action
                data-symbol-naming-action-review={t('Save symbol')}
                className="btn p-1"
                onClick={() => { void commitSave(); }}
                onFocus={() => setReviewedSymbolAction(t('Save symbol'))}
                aria-label={t('Save symbol')}
                title={t('Save (Enter)')}
              >
                <Check size={12} aria-hidden="true" />
              </button>
              <button
                type="button"
                data-symbol-naming-action
                data-symbol-naming-action-review={t('Cancel')}
                className="btn p-1"
                onClick={cancelSave}
                onFocus={() => setReviewedSymbolAction(t('Cancel'))}
                aria-label={t('Cancel')}
                title={t('Cancel (Esc)')}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </ActionToolbar>
          )}

          {symbols.length > 0 && (
            <LibrarySearch
              query={query}
              setQuery={(value) => { setReviewIndex(0); setQuery(value); }}
              placeholder={t('Search symbols…')}
              countLabel={normalizedQuery ? `${filteredSymbols.length} / ${symbols.length} ${t('matches')}` : `${symbols.length} ${t('symbols')}`}
              onInsertFirst={filteredSymbols.length > 0 ? () => { void insertSymbol(filteredSymbols[0].id); } : undefined}
              onFocusFirst={filteredSymbols.length > 0 ? () => { setReviewIndex(0); firstSymbolRef.current?.focus(); } : undefined}
            />
          )}

          {symbols.length === 0 ? (
            <div className="flex flex-col items-center text-center px-2 py-3">
              {/* Three-tile mini-grid suggests "reusable instances". One filled tile is the
                  master, the other two are the dim/dashed instances. */}
              <svg width="56" height="44" viewBox="0 0 56 44" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
                <rect x="6.5" y="7.5" width="13" height="13" rx="1.5" fill="rgb(var(--color-accent2))" fillOpacity="0.18" stroke="rgb(var(--color-accent2))" strokeWidth="1.2" />
                <rect x="22.5" y="7.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="2 2" />
                <rect x="38.5" y="7.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="2 2" />
                <path d="M19 28 L 13 33 M27 28 L 29 33 M43 28 L 45 33" stroke="rgb(var(--color-accent2))" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
                <circle cx="13" cy="33" r="1.5" fill="rgb(var(--color-accent))" />
              </svg>
              <div className="text-xs text-ink/90 mb-1">{t('No symbols yet')}</div>
              <div className="type-caption leading-relaxed max-w-[200px]">
                {t('Select shape(s) and use "Save Selection" above to make them reusable.')}
              </div>
            </div>
          ) : filteredSymbols.length === 0 ? (
            <div className="flex flex-col items-center text-center px-2 py-3">
              <div className="text-xs text-ink/90 mb-1">{t('No symbols found.')}</div>
              <div className="type-caption leading-relaxed max-w-[200px]">
                {t('Try a symbol name or id.')}
              </div>
              {query && (
                <button
                  type="button"
                  className="btn !py-1 !px-2 text-[10px] mt-2"
                  onClick={() => { setQuery(''); setReviewIndex(0); }}
                >
                  {t('Clear search')}
                </button>
              )}
            </div>
          ) : (
            <>
              <div id="symbol-grid-review-status" className="sr-only" aria-live="polite">
                {filteredSymbols[currentReviewIndex]
                  ? `${t('Reviewing')} ${filteredSymbols[currentReviewIndex].name} ${currentReviewIndex + 1} / ${filteredSymbols.length}. ${t('Press Enter to insert')}`
                  : t('No symbols found.')}
              </div>
              <div
                className="grid grid-cols-3 gap-1.5"
                role="grid"
                aria-label={t('Symbol library results')}
                title={t('Use arrow keys to review library items')}
                onKeyDown={handleSymbolGridKeys}
                aria-describedby="symbol-grid-review-status"
              >
                {filteredSymbols.map((s, index) => (
                  <SymbolTile
                    key={s.id}
                    symbol={s}
                    index={index}
                    selected={index === currentReviewIndex}
                    onReview={() => setReviewIndex(index)}
                    buttonRef={index === 0 ? firstSymbolRef : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}


function LibrarySearch({
  query,
  setQuery,
  placeholder,
  countLabel,
  onInsertFirst,
  onFocusFirst,
}: {
  query: string;
  setQuery: (value: string) => void;
  placeholder: string;
  countLabel: string;
  onInsertFirst?: () => void;
  onFocusFirst?: () => void;
}) {
  const t = useT();
  const [reviewedSearchAction, setReviewedSearchAction] = useReviewedAction();
  // Wrapping arrows over the enabled search actions (Insert First is disabled
  // at zero matches and skipped entirely).
  const handleActionKeys = makeRovingKeys({
    selector: '[data-library-search-action]',
    reviewKey: actionReviewKey('data-library-search-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    wrap: true,
    setReview: setReviewedSearchAction,
  });
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
      <input
        type="search"
        className="input !py-1 !px-2 text-xs min-w-0 flex-1"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && onFocusFirst) {
            event.preventDefault();
            onFocusFirst();
          } else if (event.key === 'Escape' && query) {
            event.preventDefault();
            event.stopPropagation();
            setQuery('');
          } else if (event.key === 'Enter' && !event.nativeEvent.isComposing && query && onInsertFirst) {
            event.preventDefault();
            onInsertFirst();
          }
        }}
        aria-label={placeholder}
        title={`${t('Press Enter to insert first search result')} · ${t('Press Arrow Down to focus first library item')}`}
      />
      <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
        {countLabel}
      </span>
      {query && (
        <SearchableListActions
          statusId="symbol-library-search-action-review-status"
          className="contents"
          label={t('Library search actions')}
          title={t('Use arrow keys to review library actions')}
          onKeyDown={handleActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedSearchAction}
          fallback={t('Library search actions')}
          actionAttr="data-library-search-action"
          setReviewed={setReviewedSearchAction}
          first={{
            label: t('Insert First'),
            review: t('Insert first search result'),
            title: t('Insert first search result'),
            className: 'btn !py-1 !px-1.5 !text-[10px] shrink-0',
            onActivate: () => { onInsertFirst?.(); },
            disabled: !onInsertFirst,
          }}
          clear={{
            label: t('Clear search'),
            review: t('Clear search'),
            title: t('Clear search'),
            className: 'btn !py-1 !px-1.5 !text-[10px] shrink-0',
            onActivate: () => setQuery(''),
          }}
        />
      )}
    </div>
  );
}

function SymbolTile({
  symbol,
  index,
  selected,
  onReview,
  buttonRef,
}: {
  symbol: SymbolEntry;
  index: number;
  selected: boolean;
  onReview: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(symbol.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Seed the draft when rename mode begins — track during render to avoid the
  // setState-in-effect cascade.
  const [prevRenaming, setPrevRenaming] = useState(renaming);
  if (renaming !== prevRenaming) {
    setPrevRenaming(renaming);
    if (renaming) setDraft(symbol.name);
  }

  // Defer focus + select to next tick so the input is mounted. DOM side-effects
  // belong in an effect.
  useEffect(() => {
    if (renaming) {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.select(); }
      });
    }
  }, [renaming]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== symbol.name) renameSymbol(symbol.id, trimmed);
    setRenaming(false);
  };
  const cancel = () => { setDraft(symbol.name); setRenaming(false); };

  const beginRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenaming(true);
  };
  const removeThisSymbol = () => {
    deleteSymbol(symbol.id);
    toast.success(t('Symbol removed from library'));
  };
  const selectInstances = () => {
    const count = selectSymbolInstances(symbol.id);
    if (count) toast.success(`${count} ${t('selected')}`);
    else toast.warn(t('No symbol instances found.'));
  };
  const handleTileKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;
    if (event.key === 'F2') {
      event.preventDefault();
      beginRename();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeThisSymbol();
    }
  };

  return (
    <div
      className={`relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden ${selected ? 'border-accent2 ring-1 ring-accent2/40' : 'border-border'}`}
      onKeyDown={handleTileKeyDown}
      aria-keyshortcuts="F2 Delete Backspace"
    >
      <button
        ref={buttonRef}
        type="button"
        role="gridcell"
        data-symbol-index={index}
        aria-selected={selected}
        className="block w-full aspect-square p-1"
        title={`${symbol.name} — ${t('click to insert, double-click to rename')} · ${t('F2 rename · Delete remove')}`}
        aria-label={symbol.name}
        onFocus={onReview}
        onClick={() => {
          if (renaming) return;
          void insertSymbol(symbol.id);
        }}
        onDoubleClick={beginRename}
        disabled={renaming}
      >
        {symbol.thumbnail ? (
          <img
            src={symbol.thumbnail}
            alt={symbol.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted text-[10px]">
            {symbol.name}
          </div>
        )}
      </button>
      {renaming ? (
        <div
          className="absolute bottom-0 inset-x-0 px-0.5 py-0.5 bg-panel/95"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-panel2 border border-accent2 rounded-sm px-1 py-0.5 text-[9px] text-ink outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            aria-label={t('Symbol name')}
            onKeyDown={(e) => {
              // IME guard — same as the new-symbol name input above.
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
          />
        </div>
      ) : (
        <div className="absolute bottom-0 inset-x-0 px-1 py-0.5 text-[9px] text-ink bg-panel/80 truncate text-center pointer-events-none">
          {symbol.name}
        </div>
      )}
      {!renaming && (
        <>
          <button
            type="button"
            className="absolute top-0.5 left-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-accent2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); selectInstances(); }}
            title={t('Select symbol instances')}
            aria-label={t('Select symbol instances')}
          >
            <MousePointerClick size={10} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); removeThisSymbol(); }}
            title={t('Delete symbol')}
            aria-label={t('Delete symbol')}
          >
            <Trash2 size={10} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
