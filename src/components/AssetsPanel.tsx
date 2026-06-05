import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, Trash2, Wand2, Loader2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import {
  getStoredAssets,
  insertAsset,
  removeAsset,
  importImageFile,
  traceSelectedImage,
  type StoredAsset,
} from '../lib/io3';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';

export function AssetsPanel() {
  const t = useT();
  const [assets, setAssets] = useState<StoredAsset[]>([]);
  const [open, setOpen] = useState(true);
  const [tracing, setTracing] = useState(false);
  const [query, setQuery] = useState('');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewedAssetAction, setReviewedAssetAction] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const firstAssetRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const refresh = () => setAssets(getStoredAssets());
    refresh();
    const onChange = () => refresh();
    window.addEventListener('vector:assets-changed', onChange as EventListener);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('vector:assets-changed', onChange as EventListener);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await importImageFile(f);
    e.target.value = '';
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAssets = useMemo(() => {
    if (!normalizedQuery) return assets;
    return assets.filter((asset) => [
      asset.name,
      asset.kind,
      asset.id,
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [assets, normalizedQuery]);

  const currentReviewIndex = Math.min(reviewIndex, Math.max(0, filteredAssets.length - 1));

  const focusAssetTile = (index: number) => {
    setReviewIndex(index);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-asset-index="${index}"]`)?.focus();
    });
  };

  const handleAssetGridKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const activeIndex = Number((document.activeElement as HTMLElement | null)?.dataset.assetIndex ?? 0);
    const lastIndex = filteredAssets.length - 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : Math.max(0, Math.min(lastIndex, activeIndex + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 3 : -3)));
    focusAssetTile(nextIndex);
  };

  const handleAssetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-asset-action]')).filter((button) => !button.disabled);
    if (buttons.length === 0) return;
    event.preventDefault();
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const currentIndex = activeIndex >= 0 ? activeIndex : event.key === 'ArrowLeft' ? 0 : -1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    const nextButton = buttons[nextIndex];
    setReviewedAssetAction(nextButton?.dataset.assetActionReview ?? nextButton?.textContent?.trim() ?? '');
    nextButton?.focus();
  };

  return (
    <div className="panel-section">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="panel-header w-full text-left hover:bg-panel3 transition-colors"
          aria-expanded={open}
          aria-controls="assets-panel-body"
        >
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            {t('Assets')}
          </span>
          <span className="panel-count">{assets.length}</span>
        </button>
      </h3>
      {open && (
        <div id="assets-panel-body" className="px-2 pb-3">
          <div
            className="flex items-center gap-1 mb-2"
            role="toolbar"
            aria-label={t('Asset actions')}
            aria-describedby="asset-action-review-status"
            title={t('Use arrow keys to review asset actions')}
            onKeyDown={handleAssetActionKeys}
          >
            <span id="asset-action-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedAssetAction || t('Asset actions')}`}
            </span>
            <button
              data-asset-action
              data-asset-action-review={t('Import an image into the library')}
              className="btn flex items-center gap-1 flex-1 justify-center"
              onClick={() => inputRef.current?.click()}
              onFocus={() => setReviewedAssetAction(t('Import an image into the library'))}
              title={t('Import an image into the library')}
            >
              <Plus size={12} aria-hidden="true" /> {t('Import')}
            </button>
            <button
              data-asset-action
              data-asset-action-review={t('Trace the selected raster image into a polygon')}
              className="btn flex items-center gap-1 flex-1 justify-center"
              disabled={tracing}
              aria-busy={tracing}
              onFocus={() => setReviewedAssetAction(t('Trace the selected raster image into a polygon'))}
              onClick={() => {
                void (async () => {
                  setTracing(true);
                  try {
                    if (await traceSelectedImage()) toast.success(t('Image traced'));
                    else toast.warn(t('Select a raster image first.'));
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err), { title: t('Trace') });
                  } finally {
                    setTracing(false);
                  }
                })();
              }}
              title={t('Trace the selected raster image into a polygon')}
            >
              {tracing
                ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                : <Wand2 size={12} aria-hidden="true" />}
              {/* Verb-tense change reinforces the activity beyond the spinner —
               *  important when prefers-reduced-motion freezes the animation
               *  and the icon is the only visible state cue. */}
              {' '}{tracing ? t('Tracing…') : t('Trace')}
            </button>
          </div>

          {assets.length > 0 && (
            <LibrarySearch
              query={query}
              setQuery={(value) => { setReviewIndex(0); setQuery(value); }}
              placeholder={t('Search assets…')}
              countLabel={normalizedQuery ? `${filteredAssets.length} / ${assets.length} ${t('matches')}` : `${assets.length} ${t('assets')}`}
              onInsertFirst={filteredAssets.length > 0 ? () => { void insertAsset(filteredAssets[0]); } : undefined}
              onFocusFirst={filteredAssets.length > 0 ? () => { setReviewIndex(0); firstAssetRef.current?.focus(); } : undefined}
            />
          )}

          {assets.length === 0 ? (
            <div className="flex flex-col items-center text-center px-2 py-3">
              {/* Picture frame + corner star — "drop images here" idea, kept line-art. */}
              <svg width="56" height="44" viewBox="0 0 56 44" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
                <rect x="6.5" y="6.5" width="43" height="31" rx="2" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="3 3" />
                <path d="M14 30 L 22 22 L 28 27 L 36 18 L 42 24" stroke="rgb(var(--color-accent2))" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="20" cy="16" r="2" fill="rgb(var(--color-accent))" />
              </svg>
              <div className="text-xs text-ink/90 mb-1">{t('No assets yet')}</div>
              <div className="type-caption leading-relaxed">
                {t("Drop images on the canvas or use Import — they'll show up here for quick re-use.")}
              </div>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center text-center px-2 py-3">
              <div className="text-xs text-ink/90 mb-1">{t('No assets found.')}</div>
              <div className="type-caption leading-relaxed">
                {t('Try an asset name, type, or id.')}
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
              <div id="asset-grid-review-status" className="sr-only" aria-live="polite">
                {filteredAssets[currentReviewIndex]
                  ? `${t('Reviewing')} ${filteredAssets[currentReviewIndex].name} ${currentReviewIndex + 1} / ${filteredAssets.length}. ${t('Press Enter to insert')}`
                  : t('No assets found.')}
              </div>
              <div
                className="grid grid-cols-3 gap-1.5"
                role="grid"
                aria-label={t('Asset library results')}
                title={t('Use arrow keys to review library items')}
                onKeyDown={handleAssetGridKeys}
                aria-describedby="asset-grid-review-status"
              >
                {filteredAssets.map((a, index) => (
                <AssetTile
                  key={a.id}
                  asset={a}
                  index={index}
                  selected={index === currentReviewIndex}
                  onReview={() => setReviewIndex(index)}
                  buttonRef={index === 0 ? firstAssetRef : undefined}
                />
                ))}
              </div>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.gif"
            hidden
            onChange={onPickFile}
          />
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
  const [reviewedSearchAction, setReviewedSearchAction] = useState('');
  const handleActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-library-search-action]')).filter((button) => !button.disabled);
    if (buttons.length === 0) return;
    event.preventDefault();
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const currentIndex = activeIndex >= 0 ? activeIndex : event.key === 'ArrowLeft' ? 0 : -1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    const nextButton = buttons[nextIndex];
    setReviewedSearchAction(nextButton?.dataset.librarySearchActionReview ?? nextButton?.textContent?.trim() ?? '');
    nextButton?.focus();
  };
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
        <div
          className="contents"
          role="toolbar"
          aria-label={t('Library search actions')}
          aria-describedby="library-search-action-review-status"
          title={t('Use arrow keys to review library actions')}
          onKeyDown={handleActionKeys}
        >
          <span id="library-search-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedSearchAction || t('Library search actions')}`}
          </span>
          <button
            type="button"
            data-library-search-action
            data-library-search-action-review={t('Insert first search result')}
            className="btn !py-1 !px-1.5 !text-[10px] shrink-0"
            onClick={onInsertFirst}
            onFocus={() => setReviewedSearchAction(t('Insert first search result'))}
            disabled={!onInsertFirst}
            title={t('Insert first search result')}
          >
            {t('Insert First')}
          </button>
          <button type="button" data-library-search-action data-library-search-action-review={t('Clear search')} className="btn !py-1 !px-1.5 !text-[10px] shrink-0" onFocus={() => setReviewedSearchAction(t('Clear search'))} onClick={() => setQuery('')} title={t('Clear search')}>
            {t('Clear search')}
          </button>
        </div>
      )}
    </div>
  );
}

function AssetTile({
  asset,
  index,
  selected,
  onReview,
  buttonRef,
}: {
  asset: StoredAsset;
  index: number;
  selected: boolean;
  onReview: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const t = useT();
  const removeThisAsset = () => { removeAsset(asset.id); toast.success(t('Asset removed from library')); };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeThisAsset();
    }
  };
  return (
    <div
      className={`relative group rounded border bg-panel2 hover:border-accent2 focus-within:border-accent2 transition-colors overflow-hidden ${selected ? 'border-accent2 ring-1 ring-accent2/40' : 'border-border'}`}
      onKeyDown={handleKeyDown}
      aria-keyshortcuts="Delete Backspace"
    >
      <button
        ref={buttonRef}
        type="button"
        role="gridcell"
        data-asset-index={index}
        aria-selected={selected}
        className="block w-full aspect-square p-1"
        title={`${asset.name} — ${t('click to insert')} · ${t('Press Delete to remove')}`}
        aria-label={asset.name}
        onFocus={onReview}
        onClick={() => { void insertAsset(asset); }}
      >
        {asset.thumb ? (
          <img
            src={asset.thumb}
            alt={asset.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted text-[10px]">
            {t(asset.kind)}
          </div>
        )}
      </button>
      <button
        // Visible on hover OR when keyboard-focused — without
        // `focus-visible:opacity-100` Tab-cycling lands on an invisible
        // button (opacity-0 hides it for mouse users; focus then has no UI
        // anchor beyond the global focus halo).
        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-panel/80 text-muted hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); removeThisAsset(); }}
        title={t('Remove from library')}
        aria-label={t('Remove from library')}
      >
        <Trash2 size={10} aria-hidden="true" />
      </button>
    </div>
  );
}
