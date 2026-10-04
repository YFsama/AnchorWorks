import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, Trash2, Wand2, Loader2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { StoredAsset } from '../lib/io3';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { actionReviewKey, makeGridKeys, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { ActionToolbar } from './ui/ActionToolbar';
import { SearchableListActions } from './ui/SearchableListActions';

// io3 hosts the asset localStorage registry, image import, and trace — all
// interaction-only paths. Cached dynamic import (same shape as App.tsx's
// withProjectFile) keeps the ~29 kB module out of the entry chunk; the mount
// effect below fetches it at boot, so every handler below is a synchronous
// cache hit in practice (a cold press just waits out the one chunk fetch).
type IO3Module = typeof import('../lib/io3');
let io3Cache: IO3Module | null = null;
const loadIO3 = (): Promise<IO3Module> =>
  import('../lib/io3').then((m) => { io3Cache = m; return m; });
/** Invoke an io3 API, preferring the warmed module cache. */
function withIO3<T>(invoke: (m: IO3Module) => Promise<T>): Promise<T> {
  const cached = io3Cache;
  return cached ? invoke(cached) : loadIO3().then(invoke);
}
// Kick the fetch at module evaluation — entry-parse time in the browser,
// earlier than any mount effect — so the first refresh below usually finds
// the cache populated and the asset list renders synchronously. In vitest,
// loading the module graph drains microtasks before any test mounts, which
// keeps the byte-exact frozen-DOM suites synchronous.
void loadIO3().catch((e) => console.warn('io3 chunk failed to load — asset panel degraded', e));

export function AssetsPanel() {
  const t = useT();
  const [assets, setAssets] = useState<StoredAsset[]>([]);
  const [open, setOpen] = useState(true);
  const [tracing, setTracing] = useState(false);
  const [query, setQuery] = useState('');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewedAssetAction, setReviewedAssetAction] = useReviewedAction();
  const inputRef = useRef<HTMLInputElement>(null);
  const firstAssetRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The initial refresh kicks off the io3 chunk fetch at mount; every
    // later refresh (insert / remove / other-tab storage writes) resolves
    // from the cache above, so the list repaints a microtask later —
    // indistinguishable from the previous synchronous read.
    const refresh = () => {
      void withIO3(async (m) => { setAssets(m.getStoredAssets()); })
        .catch((e) => console.warn('io3 chunk failed to load — asset list stale', e));
    };
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
    await withIO3((m) => m.importImageFile(f)).catch(console.warn);
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

  // Tile-grid roving (grid-cols-3): ±1 freely crossing row boundaries, ±3
  // vertical rows, every move clamped (never wraps), Home/End absolute —
  // makeGridKeys in ui/useRovingActions. The review index commits
  // synchronously (the external live region derives from it) and the focus
  // move lands on the next animation frame — the legacy focusAssetTile timing.
  const handleAssetGridKeys = makeGridKeys({
    selector: '[data-asset-index]',
    columns: 3,
    // Announcements derive from reviewIndex in the external region; tiles
    // carry no per-button review string, so there is nothing to publish.
    setReview: () => {},
    onNavigate: (_tile, index) => setReviewIndex(index),
    defer: true,
  });

  // Action toolbar: wrapping arrows that skip the Trace button while a trace
  // is running; announcements come from data-asset-action-review.
  const handleAssetActionKeys = makeRovingKeys({
    selector: '[data-asset-action]',
    reviewKey: actionReviewKey('data-asset-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    wrap: true,
    setReview: setReviewedAssetAction,
  });

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
          <ActionToolbar
            statusId="asset-action-review-status"
            className="flex items-center gap-1 mb-2"
            label={t('Asset actions')}
            title={t('Use arrow keys to review asset actions')}
            onKeyDown={handleAssetActionKeys}
            statusAs="span"
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedAssetAction}
            fallback={t('Asset actions')}
          >
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
                    // Chunk-load errors flow through this same toast channel.
                    if (await withIO3((m) => m.traceSelectedImage())) toast.success(t('Image traced'));
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
          </ActionToolbar>

          {assets.length > 0 && (
            <LibrarySearch
              query={query}
              setQuery={(value) => { setReviewIndex(0); setQuery(value); }}
              placeholder={t('Search assets…')}
              countLabel={normalizedQuery ? `${filteredAssets.length} / ${assets.length} ${t('matches')}` : `${assets.length} ${t('assets')}`}
              onInsertFirst={filteredAssets.length > 0 ? () => { void withIO3((m) => m.insertAsset(filteredAssets[0])); } : undefined}
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
          statusId="library-search-action-review-status"
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
  // io3 arrives via the cached dynamic loader (see top of file) — cache-warm
  // in practice, so removal still fires its change event a microtask later.
  const removeThisAsset = () => {
    void withIO3(async (m) => { m.removeAsset(asset.id); })
      .catch((e) => console.warn('io3 chunk failed to load — asset not removed', e));
    toast.success(t('Asset removed from library'));
  };
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
        onClick={() => { void withIO3((m) => m.insertAsset(asset)); }}
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
