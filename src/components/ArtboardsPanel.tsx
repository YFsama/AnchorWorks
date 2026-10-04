import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, FileImage, FileCode, Target, Copy, Frame, Search, RotateCw } from 'lucide-react';
import { zoomToArtboard } from '../lib/canvasEngine';
import { mmToPx } from '../lib/paperSizes';
import { fitArtboardToContent } from '../lib/fitArtboard';
import { toast } from '../lib/toast';
import { showConfirm } from '../lib/confirm';
import { useT } from '../lib/i18n';
import {
  createArtboard,
  createArtboardFromSelection,
  deleteArtboard,
  duplicateArtboard,
  duplicateArtboardFrame,
  promptRearrangeArtboards,
  renameArtboard,
  renumberArtboardsByPosition,
  reorderArtboard,
  sortArtboardsByPosition,
  moveArtboard,
  resizeArtboard,
  exportArtboardsByIdAsFiles,
  exportArtboardsByIdAsPNG,
  exportArtboardPNG,
  exportArtboardSVGAsync,
} from '../lib/artboards';
import { useEditor } from '../store/editor';
import { download, downloadDataURL } from '../lib/io';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { ActionToolbar } from './ui/ActionToolbar';
import { SearchableListActions } from './ui/SearchableListActions';
import type { Artboard } from '../types';

// The artboard list's review announcer follows focus (each row's onFocus),
// so the kit's setReview hook is a no-op for that region.
const noopSetReview = () => {};

export function ArtboardsPanel() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedArtboardIds, setSelectedArtboardIds] = useState<string[]>([]);
  const firstArtboardRef = useRef<HTMLDivElement>(null);
  const artboards = useEditor(s => s.artboards);
  const dpi = useEditor(s => s.doc.dpi);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredArtboards = useMemo(() => {
    if (!normalizedQuery) return artboards;
    return artboards.filter((artboard) => [
      artboard.name,
      artboard.id,
      `${artboard.width}×${artboard.height}`,
      `${artboard.width}x${artboard.height}`,
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [artboards, normalizedQuery]);
  const [focusedArtboardId, setFocusedArtboardId] = useState(filteredArtboards[0]?.id ?? '');
  const focusedFilteredIndex = filteredArtboards.findIndex((artboard) => artboard.id === focusedArtboardId);
  const reviewedArtboardIndex = focusedFilteredIndex >= 0 ? focusedFilteredIndex : 0;
  const reviewedArtboard = filteredArtboards[reviewedArtboardIndex];
  const reviewedArtboardSize = reviewedArtboard ? `${Math.round(reviewedArtboard.width)}×${Math.round(reviewedArtboard.height)} px` : '';
  const validSelectedArtboardIds = selectedArtboardIds.filter((id) => artboards.some((artboard) => artboard.id === id));
  if (validSelectedArtboardIds.length !== selectedArtboardIds.length) setSelectedArtboardIds(validSelectedArtboardIds);
  const allFilteredSelected = filteredArtboards.length > 0 && filteredArtboards.every((artboard) => validSelectedArtboardIds.includes(artboard.id));
  const toggleArtboardSelection = (id: string) => {
    setSelectedArtboardIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  };
  const toggleFilteredArtboards = () => {
    const filteredIds = filteredArtboards.map((artboard) => artboard.id);
    setSelectedArtboardIds((ids) => {
      if (filteredIds.every((id) => ids.includes(id))) return ids.filter((id) => !filteredIds.includes(id));
      return [...ids, ...filteredIds.filter((id) => !ids.includes(id))];
    });
  };
  const exportSelectedArtboardsAsPNG = () => {
    const n = exportArtboardsByIdAsPNG(validSelectedArtboardIds);
    if (n) toast.success(`${n} ${t('artboards exported')}`);
    else toast.warn(t('Select artboards first.'));
  };
  const exportSelectedArtboardsAsSVG = () => {
    void exportArtboardsByIdAsFiles(validSelectedArtboardIds).then((n) => {
      if (n) toast.success(`${n} ${t('artboards exported')}`);
      else toast.warn(t('Select artboards first.'));
    });
  };
  const rearrangeWithOptions = () => {
    const n = promptRearrangeArtboards({ columns: t('Columns'), spacing: t('Spacing'), moveArtwork: t('Move artwork? yes/no') });
    if (n == null) return;
    if (n === -1) toast.warn(t('Invalid artboard rearrange options.'));
    else if (n) toast.success(t('Artboards rearranged'));
    else toast.warn(t('Need at least two artboards.'));
  };
  // Roving keyboard conventions live in ui/useRovingActions. The artboard
  // list is vertical (ArrowUp/Down step, Home/End absolute, clamped —
  // Left/Right ignored) over the rich editor-card rows below, which stay
  // verbatim (role="list"/listitem cards with embedded inputs; ActionToolbar
  // cannot express role="list"). The wrapper keeps the interactive-descendant
  // guard: arrows typed inside a row's inputs/buttons keep their native
  // meaning instead of being preventDefaulted by the kit handler.
  const handleArtboardRowsKeys = makeRovingKeys({
    selector: '[data-artboard-row]',
    axis: 'vertical',
    guardEmpty: true,
    setReview: noopSetReview,
  });
  const handleArtboardListKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    handleArtboardRowsKeys(event);
  };

  return (
    <div className="panel-section">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="panel-header w-full text-left hover:bg-panel3 transition-colors"
          aria-expanded={open}
          aria-controls="artboards-panel-body"
        >
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            {t('Artboards')}
          </span>
          <span className="panel-count">{artboards.length}</span>
        </button>
      </h3>
      {open && (
        <div id="artboards-panel-body" className="px-2 pb-3 space-y-2">
          <div className="type-caption leading-relaxed">
        {t('Artboard row keyboard hint')}
      </div>

      <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => createArtboard()}
              className="btn flex items-center gap-1 justify-center"
              title={t('Append a new artboard')}
            >
              <Plus size={12} aria-hidden="true" /> {t('Add Artboard')}
            </button>
            <button
              type="button"
              onClick={() => { const ab = createArtboardFromSelection(); if (ab) { zoomToArtboard({ x: ab.x, y: ab.y, width: ab.width, height: ab.height }); toast.success(t('Artboard created')); } else toast.warn(t('Select something first.')); }}
              className="btn flex items-center gap-1 justify-center"
              title={t('Create an artboard around the selection')}
            >
              <Frame size={12} aria-hidden="true" /> {t('From Selection')}
            </button>
            <button
              type="button"
              onClick={rearrangeWithOptions}
              className="btn flex items-center gap-1 justify-center col-span-2"
              title={t('Rearrange artboards into a grid with options')}
            >
              <RotateCw size={12} aria-hidden="true" /> {t('Rearrange Artboards')}
            </button>
            <button
              type="button"
              onClick={() => { if (sortArtboardsByPosition()) toast.success(t('Artboard order updated')); else toast.warn(t('Artboard order already matches position.')); }}
              className="btn flex items-center gap-1 justify-center"
              title={t('Sort artboards by visual position')}
            >
              {t('Sort by Position')}
            </button>
            <button
              type="button"
              onClick={() => { if (renumberArtboardsByPosition(t('Artboard'))) toast.success(t('Artboards renumbered')); else toast.warn(t('Artboards already numbered by position.')); }}
              className="btn flex items-center gap-1 justify-center"
              title={t('Renumber artboards by visual position')}
            >
              {t('Renumber')}
            </button>
          </div>

          {artboards.length > 0 && (
            <PanelSearch
              query={query}
              setQuery={setQuery}
              placeholder={t('Search artboards…')}
              countLabel={normalizedQuery ? `${filteredArtboards.length} / ${artboards.length} ${t('matches')}` : `${artboards.length} ${t('artboards')}`}
              onTargetFirst={filteredArtboards.length > 0 ? () => zoomToArtboard(filteredArtboards[0]) : undefined}
              onFocusFirst={filteredArtboards.length > 0 ? () => firstArtboardRef.current?.focus() : undefined}
            />
          )}

          {artboards.length > 0 && (
            <div className="rounded border border-border bg-panel2 p-2 space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleFilteredArtboards}
                    aria-label={t('Select filtered artboards')}
                  />
                  {t('Select filtered')}
                </label>
                <span className="ml-auto tabular-nums">{validSelectedArtboardIds.length} {t('selected')}</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  className="btn !py-1 !px-1.5 !text-[10px] flex items-center justify-center gap-1"
                  onClick={exportSelectedArtboardsAsPNG}
                  disabled={validSelectedArtboardIds.length === 0}
                  title={t('Export selected artboards as PNG')}
                >
                  <FileImage size={11} aria-hidden="true" /> {t('Export Selected PNG')}
                </button>
                <button
                  type="button"
                  className="btn !py-1 !px-1.5 !text-[10px] flex items-center justify-center gap-1"
                  onClick={exportSelectedArtboardsAsSVG}
                  disabled={validSelectedArtboardIds.length === 0}
                  title={t('Export selected artboards as SVG')}
                >
                  <FileCode size={11} aria-hidden="true" /> {t('Export Selected SVG')}
                </button>
              </div>
            </div>
          )}

          {artboards.length === 0 ? (
            <div className="flex flex-col items-center text-center px-2 py-3">
              {/* Two overlapping artboard rectangles — the canonical "multi-page" idea. */}
              <svg width="56" height="44" viewBox="0 0 56 44" fill="none" className="mb-2 opacity-70" aria-hidden="true" style={{ color: 'rgb(var(--color-muted))' }}>
                <rect x="6.5" y="10.5" width="30" height="22" rx="1.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" />
                <rect x="20.5" y="6.5" width="30" height="22" rx="1.5" stroke="rgb(var(--color-accent2))" strokeWidth="1.2" />
                <line x1="20.5" y1="13" x2="50.5" y2="13" stroke="rgb(var(--color-accent2))" strokeWidth="1" strokeOpacity="0.5" />
                <circle cx="24" cy="9.5" r="0.8" fill="rgb(var(--color-accent))" />
              </svg>
              <div className="text-xs text-ink/90 mb-1">{t('No artboards yet')}</div>
              <div className="type-caption leading-relaxed max-w-[200px]">
                {t('Click "Add Artboard" above to lay out multiple pages side-by-side.')}
              </div>
            </div>
          ) : filteredArtboards.length === 0 ? (
            <div className="flex flex-col items-center text-center px-2 py-3">
              <div className="text-xs text-ink/90 mb-1">{t('No artboards found.')}</div>
              <div className="type-caption leading-relaxed max-w-[200px]">
                {t('Try an artboard name, size, or id.')}
              </div>
              {query && (
                <button
                  type="button"
                  className="btn !py-1 !px-2 text-[10px] mt-2"
                  onClick={() => setQuery('')}
                >
                  {t('Clear search')}
                </button>
              )}
            </div>
          ) : (
            <Fragment>
            <div
              className="space-y-2"
              role="list"
              aria-label={t('Artboards')}
              aria-describedby="artboards-review-status"
              title={t('Use arrow keys to review artboards')}
              onKeyDown={handleArtboardListKeys}
            >
              {/* sr-only review announcer. Lives OUTSIDE the list semantics —
                  an aria-live region (implicit role "status") inside a
                  role="list" is an invalid child (axe aria-required-children);
                  aria-describedby still resolves by id from either position. */}
              {filteredArtboards.map((a, index) => (
                <ArtboardRow
                  key={a.id}
                  artboard={a}
                  dpi={dpi}
                  rowRef={index === 0 ? firstArtboardRef : undefined}
                  selected={a.id === reviewedArtboard?.id}
                  checked={validSelectedArtboardIds.includes(a.id)}
                  onToggleChecked={() => toggleArtboardSelection(a.id)}
                  onReview={() => setFocusedArtboardId(a.id)}
                />
              ))}
            </div>
            <div id="artboards-review-status" className="sr-only" aria-live="polite">
              {reviewedArtboard
                ? `${t('Reviewing')} ${reviewedArtboard.name} ${reviewedArtboardIndex + 1} / ${filteredArtboards.length}. ${reviewedArtboardSize}`
                : t('No artboards found.')}
            </div>
            </Fragment>
          )}
        </div>
      )}
    </div>
  );
}


function PanelSearch({
  query,
  setQuery,
  placeholder,
  countLabel,
  onTargetFirst,
  onFocusFirst,
}: {
  query: string;
  setQuery: (value: string) => void;
  placeholder: string;
  countLabel: string;
  onTargetFirst?: () => void;
  onFocusFirst?: () => void;
}) {
  const t = useT();
  const [reviewedSearchAction, setReviewedSearchAction] = useReviewedAction();
  // Roving keyboard conventions live in ui/useRovingActions: wrapping arrows
  // with Home/End that skip the disabled Target First action.
  const handleSearchActionKeys = makeRovingKeys({
    selector: '[data-artboard-search-action]',
    reviewKey: actionReviewKey('data-artboard-search-action'),
    fallbackToText: true,
    wrap: true,
    skipDisabled: true,
    guardEmpty: true,
    setReview: setReviewedSearchAction,
  });
  return (
    <div className="flex items-center gap-1.5">
      <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
      <input
        type="search"
        className="input !py-1 !px-2 text-xs min-w-0 flex-1"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && onTargetFirst) {
            event.preventDefault();
            onTargetFirst();
            return;
          }
          if (event.key === 'ArrowDown' && onFocusFirst) {
            event.preventDefault();
            onFocusFirst();
            return;
          }
          if (event.key === 'Escape' && query) {
            event.preventDefault();
            event.stopPropagation();
            setQuery('');
          }
        }}
        aria-label={placeholder}
        title={`${t('Press Enter to target first search result')} · ${t('Press Arrow Down to focus first artboard')}`}
      />
      <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
        {countLabel}
      </span>
      {query && (
        <SearchableListActions
          statusId="artboard-search-action-review-status"
          className="flex items-center gap-1.5 shrink-0"
          label={t('Artboard search actions')}
          title={t('Use arrow keys to review artboard search actions')}
          onKeyDown={handleSearchActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedSearchAction}
          fallback={t('Artboard search actions')}
          actionAttr="data-artboard-search-action"
          setReviewed={setReviewedSearchAction}
          first={{
            label: t('Target First'),
            review: t('Zoom to first search result'),
            title: t('Zoom to first search result'),
            className: 'btn !py-1 !px-1.5 !text-[10px] shrink-0',
            onActivate: onTargetFirst ?? (() => {}),
            disabled: !onTargetFirst,
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

const ARTBOARD_SIZE_PRESETS = [
  { label: 'A4', wMm: 210, hMm: 297 },
  { label: 'Letter', wMm: 216, hMm: 279 },
  { label: '24×12 in', wMm: 609.6, hMm: 304.8 },
] as const;

function ArtboardRow({ artboard, dpi, rowRef, selected, checked, onToggleChecked, onReview }: { artboard: Artboard; dpi: number; rowRef?: React.Ref<HTMLDivElement>; selected: boolean; checked: boolean; onToggleChecked: () => void; onReview: () => void }) {
  const t = useT();
  const [name, setName] = useState(artboard.name);
  const [x, setX] = useState(String(artboard.x));
  const [y, setY] = useState(String(artboard.y));
  const [w, setW] = useState(String(artboard.width));
  const [h, setH] = useState(String(artboard.height));
  const [reviewedRowAction, setReviewedRowAction] = useReviewedAction();

  // Reflect external changes (e.g. another panel renamed the artboard).
  // Render-time sync against the previous prop reference avoids the
  // cascading-effect anti-pattern of 5 separate setState-in-useEffect calls.
  const [prev, setPrev] = useState(artboard);
  if (prev !== artboard) {
    setPrev(artboard);
    setName(artboard.name);
    setX(String(artboard.x));
    setY(String(artboard.y));
    setW(String(artboard.width));
    setH(String(artboard.height));
  }

  const commitName = () => {
    const v = name.trim() || artboard.name;
    if (v !== artboard.name) renameArtboard(artboard.id, v);
  };
  const commitPos = () => {
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      moveArtboard(artboard.id, nx, ny);
    }
  };
  const commitSize = () => {
    const nw = Number(w);
    const nh = Number(h);
    if (Number.isFinite(nw) && Number.isFinite(nh) && nw > 0 && nh > 0) {
      resizeArtboard(artboard.id, nw, nh);
    }
  };

  const applySizePreset = (wMm: number, hMm: number) => {
    const nextWidth = mmToPx(wMm, dpi);
    const nextHeight = mmToPx(hMm, dpi);
    setW(String(nextWidth));
    setH(String(nextHeight));
    resizeArtboard(artboard.id, nextWidth, nextHeight);
    toast.success(t('Artboard resized'));
  };
  const swapOrientation = () => {
    const nextWidth = artboard.height;
    const nextHeight = artboard.width;
    setW(String(nextWidth));
    setH(String(nextHeight));
    resizeArtboard(artboard.id, nextWidth, nextHeight);
    toast.success(t('Artboard orientation swapped'));
  };
  const fitThisArtboard = (scope: 'selection' | 'all') => {
    const ok = fitArtboardToContent(scope, 5, artboard.id);
    if (ok) toast.success(t('Artboard fitted'));
    else toast.warn(scope === 'selection' ? t('Select something first.') : t('Nothing to fit.'));
  };
  const moveThisArtboardOrder = (direction: 'previous' | 'next' | 'first' | 'last') => {
    if (reorderArtboard(artboard.id, direction)) toast.success(t('Artboard order updated'));
    else toast.warn(t('This artboard cannot move further.'));
  };
  // Roving keyboard conventions live in ui/useRovingActions. The row's three
  // action toolbars wrap ArrowLeft/ArrowRight (Home/End absolute, no
  // disabled filtering — none of these buttons is ever disabled) and announce
  // the landed action into the row's shared review region; the preset
  // variant additionally applies the landed size preset via onNavigate.
  const handleActionGroupKeys = makeRovingKeys({
    selector: '[data-artboard-action]',
    reviewKey: actionReviewKey('data-artboard-action'),
    fallbackToText: true,
    wrap: true,
    setReview: setReviewedRowAction,
  });

  const handleSizePresetKeys = makeRovingKeys({
    selector: '[data-artboard-action]',
    reviewKey: actionReviewKey('data-artboard-action'),
    fallbackToText: true,
    wrap: true,
    setReview: setReviewedRowAction,
    onNavigate: (button) => {
      const preset = ARTBOARD_SIZE_PRESETS.find((item) => item.label === button?.dataset.sizePreset);
      if (preset) applySizePreset(preset.wMm, preset.hMm);
    },
  });
  const focusArtboard = () => zoomToArtboard({ x: artboard.x, y: artboard.y, width: artboard.width, height: artboard.height });
  const duplicateThisArtboard = () => {
    void duplicateArtboard(artboard.id).then((ab) => {
      if (ab) {
        zoomToArtboard({ x: ab.x, y: ab.y, width: ab.width, height: ab.height });
        toast.success(t('Artboard duplicated'));
      }
    });
  };
  const duplicateThisArtboardFrame = () => {
    const ab = duplicateArtboardFrame(artboard.id);
    if (ab) {
      zoomToArtboard({ x: ab.x, y: ab.y, width: ab.width, height: ab.height });
      toast.success(t('Artboard duplicated'));
    }
  };
  const deleteThisArtboard = async () => {
    if (await showConfirm({ message: `${t('Delete artboard')} "${artboard.name}"?`, confirmLabel: t('Delete'), danger: true })) deleteArtboard(artboard.id);
  };
  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      focusArtboard();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateThisArtboard();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      void deleteThisArtboard();
      return;
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      swapOrientation();
    }
  };

  const slug = artboard.name.replace(/[^a-z0-9-_]+/gi, '_') || artboard.id;

  return (
    <div
      ref={rowRef}
      className={`rounded border p-2 space-y-1.5 focus-within:border-accent2 focus:outline-none focus:ring-1 focus:ring-accent2/60 transition-colors ${selected ? 'border-accent2 bg-accent/10 shadow-[0_0_0_1px_rgba(var(--color-accent2),0.25)]' : 'border-border bg-panel2'}`}
      tabIndex={0}
      data-artboard-row
      // Rows are editor cards (name/X/Y/W/H inputs + per-row actions), not
      // listbox options — an option must not own interactive descendants
      // (axe nested-interactive). `listitem` keeps list semantics for screen
      // readers while allowing the embedded controls; aria-current marks the
      // reviewed row the way aria-selected would have.
      role="listitem"
      aria-current={selected ? 'true' : undefined}
      aria-label={`${t('Artboard row')}: ${artboard.name}`}
      aria-keyshortcuts="Enter Control+D Meta+D Delete Backspace R"
      onFocus={onReview}
      onKeyDown={handleRowKeyDown}
    >
      <div className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleChecked}
          onClick={(event) => event.stopPropagation()}
          className="shrink-0"
          aria-label={`${t('Select artboard')} ${artboard.name}`}
          title={t('Select artboard')}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          // IME guard: a CJK pinyin/wubi user pressing Enter to confirm an
          // IME candidate would otherwise blur the input mid-composition,
          // committing the partial transliteration as the artboard name.
          // `isComposing` is true on the Enter that closes the IME popup.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="flex-1 bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent2 transition-colors"
          aria-label={t('Artboard name')}
        />
        <button
          onClick={focusArtboard}
          className="p-1 text-muted hover:text-ink transition-colors"
          title={t('Focus this artboard')}
          aria-label={t('Focus this artboard')}
        >
          <Target size={12} aria-hidden="true" />
        </button>
        <button
          onClick={duplicateThisArtboard}
          className="p-1 text-muted hover:text-ink transition-colors"
          title={t('Duplicate this artboard')}
          aria-label={t('Duplicate this artboard')}
        >
          <Copy size={12} aria-hidden="true" />
        </button>
        <button
          onClick={duplicateThisArtboardFrame}
          className="p-1 text-muted hover:text-ink transition-colors"
          title={t('Duplicate this artboard frame only')}
          aria-label={t('Duplicate this artboard frame only')}
        >
          <Frame size={12} aria-hidden="true" />
        </button>
        <button
          onClick={() => { void deleteThisArtboard(); }}
          className="p-1 text-muted hover:text-danger transition-colors"
          title={t('Delete artboard')}
          aria-label={t('Delete artboard')}
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1 items-center">
        <Field label="X" value={x} onChange={setX} onCommit={commitPos} />
        <Field label="Y" value={y} onChange={setY} onCommit={commitPos} />
        <Field label="W" value={w} onChange={setW} onCommit={commitSize} />
        <Field label="H" value={h} onChange={setH} onCommit={commitSize} />
      </div>

      <div>
        <div className="field-label !mb-1">{t('Artboard order')}</div>
        {/* The row's three toolbars share ONE review live region, rendered by
            the presets toolbar below — order/fit opt out of the built-in
            region via externalStatus and keep pointing aria-describedby at
            its id. */}
        <ActionToolbar
          statusId={`artboard-row-action-review-${artboard.id}`}
          externalStatus
          className="grid grid-cols-4 gap-1"
          label={t('Artboard order')}
          title={t('Use arrow keys to review artboard row actions')}
          onKeyDown={handleActionGroupKeys}
          reviewingLabel={t('Reviewing')}
          fallback={t('Artboard size presets')}
        >
          <button
            type="button"
            data-artboard-action
            data-artboard-action-review={t('Move this artboard to first')}
            className="btn !py-1 !px-1.5 !text-[10px]"
            onClick={() => moveThisArtboardOrder('first')}
            onFocus={() => setReviewedRowAction(t('Move this artboard to first'))}
            title={t('Move this artboard to first')}
          >
            {t('First')}
          </button>
          <button
            type="button"
            data-artboard-action
            data-artboard-action-review={t('Move this artboard earlier')}
            className="btn !py-1 !px-1.5 !text-[10px]"
            onClick={() => moveThisArtboardOrder('previous')}
            onFocus={() => setReviewedRowAction(t('Move this artboard earlier'))}
            title={t('Move this artboard earlier')}
          >
            {t('Earlier')}
          </button>
          <button
            type="button"
            data-artboard-action
            data-artboard-action-review={t('Move this artboard later')}
            className="btn !py-1 !px-1.5 !text-[10px]"
            onClick={() => moveThisArtboardOrder('next')}
            onFocus={() => setReviewedRowAction(t('Move this artboard later'))}
            title={t('Move this artboard later')}
          >
            {t('Later')}
          </button>
          <button
            type="button"
            data-artboard-action
            data-artboard-action-review={t('Move this artboard to last')}
            className="btn !py-1 !px-1.5 !text-[10px]"
            onClick={() => moveThisArtboardOrder('last')}
            onFocus={() => setReviewedRowAction(t('Move this artboard to last'))}
            title={t('Move this artboard to last')}
          >
            {t('Last')}
          </button>
        </ActionToolbar>
      </div>

      <div>
        <div className="field-label !mb-1">{t('Artboard size presets')}</div>
        <ActionToolbar
          statusId={`artboard-row-action-review-${artboard.id}`}
          className="flex flex-wrap gap-1"
          label={t('Artboard size presets')}
          title={t('Use arrow keys to review artboard row actions')}
          onKeyDown={handleSizePresetKeys}
          statusAs="span"
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedRowAction}
          fallback={t('Artboard size presets')}
        >
          {ARTBOARD_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              data-artboard-action
              data-artboard-size-preset-action
              data-size-preset={preset.label}
              data-artboard-action-review={`${t('Apply artboard size preset')} ${preset.label}`}
              className="btn !py-1 !px-1.5 !text-[10px]"
              onClick={() => applySizePreset(preset.wMm, preset.hMm)}
              onFocus={() => setReviewedRowAction(`${t('Apply artboard size preset')} ${preset.label}`)}
              title={t('Apply artboard size preset')}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            data-artboard-action
            data-artboard-action-review={t('Swap artboard width and height')}
            className="btn !py-1 !px-1.5 !text-[10px] flex items-center gap-1"
            onClick={swapOrientation}
            onFocus={() => setReviewedRowAction(t('Swap artboard width and height'))}
            title={t('Swap artboard width and height')}
          >
            <RotateCw size={10} aria-hidden="true" /> {t('Swap W/H')}
          </button>
        </ActionToolbar>
      </div>

      <div>
        <div className="field-label !mb-1">{t('Fit artboard')}</div>
        <ActionToolbar
          statusId={`artboard-row-action-review-${artboard.id}`}
          externalStatus
          className="grid grid-cols-2 gap-1"
          label={t('Fit artboard')}
          title={t('Use arrow keys to review artboard row actions')}
          onKeyDown={handleActionGroupKeys}
          reviewingLabel={t('Reviewing')}
          fallback={t('Artboard size presets')}
        >
          <button
            type="button"
            data-artboard-action
            data-artboard-action-review={t('Fit this artboard to selection')}
            className="btn !py-1 !px-1.5 !text-[10px]"
            onClick={() => fitThisArtboard('selection')}
            onFocus={() => setReviewedRowAction(t('Fit this artboard to selection'))}
            title={t('Fit this artboard to selection')}
          >
            {t('Fit Selection')}
          </button>
          <button
            type="button"
            data-artboard-action
            data-artboard-action-review={t('Fit this artboard to artwork')}
            className="btn !py-1 !px-1.5 !text-[10px]"
            onClick={() => fitThisArtboard('all')}
            onFocus={() => setReviewedRowAction(t('Fit this artboard to artwork'))}
            title={t('Fit this artboard to artwork')}
          >
            {t('Fit Artwork')}
          </button>
        </ActionToolbar>
      </div>

      <div className="flex gap-1">
        <button
          className="btn flex items-center gap-1 flex-1 justify-center"
          title={t('Export this artboard as PNG')}
          onClick={() => {
            const url = exportArtboardPNG(artboard.id, 2);
            if (url) downloadDataURL(`${slug}.png`, url);
          }}
        >
          <FileImage size={11} aria-hidden="true" /> PNG
        </button>
        <button
          className="btn flex items-center gap-1 flex-1 justify-center"
          title={t('Export this artboard as SVG')}
          onClick={() => {
            void exportArtboardSVGAsync(artboard.id).then((svg) => {
              if (svg) download(`${slug}.svg`, svg, 'image/svg+xml');
            });
          }}
        >
          <FileCode size={11} aria-hidden="true" /> SVG
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      {/* Use the standard 10px field-label rather than the previous one-off
       *  9px so the X/Y/W/H mini-labels match every other field label in
       *  the chrome (10px is the scale's small floor; 9px was a one-off
       *  for "save 1px of vertical space" that the row layout doesn't
       *  actually need). */}
      <span className="field-label !mb-0">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="bg-panel border border-border rounded px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent2 transition-colors w-full"
      />
    </label>
  );
}
