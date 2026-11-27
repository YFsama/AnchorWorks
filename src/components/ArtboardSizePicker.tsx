import { useEffect, useMemo, useRef, useState } from 'react';
import { Frame, Search, X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import {
  ARTBOARD_SIZE_PRESETS, LANDSCAPE_FIRST_PRESET_IDS, presetGroupLabel, presetToPx, matchPreset, pxToMm,
  type PaperPreset,
} from '../lib/paperSizes';
import {
  createArtboardFromSelection, createArtboards, resolveArtboardAnchor, MAX_NEW_ARTBOARDS,
  type ArtboardPlacement,
} from '../lib/artboards';
import { actionReviewKey, makeGridKeys, makeRovingKeys, makeSegmentKeys, useReviewedAction } from './ui/useRovingActions';
import { ActionToolbar } from './ui/ActionToolbar';
import { ReviewedFooter } from './ui/ReviewedFooter';
import { SearchableListActions } from './ui/SearchableListActions';
import type { Artboard } from '../types';

const PRESET_COLUMNS = 2;
const PLACEMENTS: readonly ArtboardPlacement[] = ['right', 'below', 'left', 'above', 'grid'];

function clampCount(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(MAX_NEW_ARTBOARDS, Math.max(1, Math.floor(value))) : fallback;
}

/**
 * "Add Artboards" — the size picker behind the Artboards panel's Add
 * Artboard button. Pick a searchable preset (the sign-shop shortlist first,
 * then every paper / card / sticker / screen size), or type a custom size,
 * choose how many to add and where they go, and they are created in one
 * commit. It is mounted by ArtboardsPanel only while open, so every field is
 * seeded once per open from the live document through lazy `useState`
 * initialisers — no effect.
 */
export function ArtboardSizePicker({ onClose, onCreated }: {
  /** Close without creating anything. */
  onClose: () => void;
  /** The picker created these artboards; the caller frames and selects them. */
  onCreated: (created: Artboard[]) => void;
}) {
  const t = useT();
  const dpi = useEditor((s) => s.doc.dpi);
  // Seed from the artboard the new ones will sit next to (the document size
  // when there are none): its size, and the preset it already matches.
  const [anchor] = useState(() => resolveArtboardAnchor());
  const [seed] = useState(() => {
    const width = anchor?.width ?? useEditor.getState().doc.width;
    const height = anchor?.height ?? useEditor.getState().doc.height;
    const matched = matchPreset(width, height, dpi);
    return { presetId: matched?.id ?? 'custom', width, height };
  });
  const [presetId, setPresetId] = useState(seed.presetId);
  const [width, setWidth] = useState(String(seed.width));
  const [height, setHeight] = useState(String(seed.height));
  const [query, setQuery] = useState('');
  const [count, setCount] = useState('1');
  const [placement, setPlacement] = useState<ArtboardPlacement>('right');
  const [columns, setColumns] = useState('');
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedSearchAction, setReviewedSearchAction] = useReviewedAction();
  const [reviewedOrientation, setReviewedOrientation] = useReviewedAction();
  const [reviewedPlacement, setReviewedPlacement] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEscapeClose(true, onClose);
  useFocusRestore(true);
  // Focus lands in the dialog (its search box) on open. Declared AFTER
  // useFocusRestore so the restore target is captured first — React applies
  // `autoFocus` during the commit, which would make the restore capture the
  // search box itself and drop focus to <body> on close.
  useEffect(() => { searchRef.current?.focus(); }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPresets = useMemo(() => {
    if (!normalizedQuery) return ARTBOARD_SIZE_PRESETS;
    return ARTBOARD_SIZE_PRESETS.filter((preset) => [
      preset.label,
      t(preset.label),
      preset.id,
      `${preset.w}×${preset.h}`,
      `${preset.w}x${preset.h}`,
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [normalizedQuery, t]);
  // Consecutive presets sharing a group heading form one group; `index` is
  // the preset's position in the filtered list (roving tabindex, first focus).
  const presetGroups = useMemo(() => {
    const groups: Array<{ label: string; presets: Array<{ preset: PaperPreset; index: number }> }> = [];
    filteredPresets.forEach((preset, index) => {
      const label = t(presetGroupLabel(preset));
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.presets.push({ preset, index });
      else groups.push({ label, presets: [{ preset, index }] });
    });
    return groups;
  }, [filteredPresets, t]);
  const selectedPreset = presetId === 'custom' ? undefined : ARTBOARD_SIZE_PRESETS.find((p) => p.id === presetId);
  const selectedPresetHidden = !!selectedPreset && !filteredPresets.includes(selectedPreset);

  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  const sizeValid = width.trim() !== '' && height.trim() !== ''
    && Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight) && parsedWidth > 0 && parsedHeight > 0;
  const isLandscape = sizeValid && parsedWidth > parsedHeight;
  const countValue = clampCount(Number(count), 1);
  const autoColumns = Math.ceil(Math.sqrt(countValue));
  const columnsValue = Math.min(countValue, clampCount(Number(columns), autoColumns));

  const applyPreset = (preset: PaperPreset) => {
    // A preset opens in its usual orientation (banners wide, paper tall).
    const landscape = LANDSCAPE_FIRST_PRESET_IDS.has(preset.id);
    const { width: w, height: h } = presetToPx(preset, dpi, landscape);
    setPresetId(preset.id);
    setWidth(String(w));
    setHeight(String(h));
  };
  const applyOrientation = (next: 'portrait' | 'landscape') => {
    setReviewedOrientation(next === 'landscape' ? t('Landscape') : t('Portrait'));
    // Swapping W/H IS the orientation change — for presets and custom sizes alike.
    if (!sizeValid || (next === 'landscape') === isLandscape) return;
    setWidth(String(parsedHeight));
    setHeight(String(parsedWidth));
  };
  const create = () => {
    if (!sizeValid) return;
    onCreated(createArtboards({
      width: parsedWidth,
      height: parsedHeight,
      count: countValue,
      placement,
      columns: columnsValue,
      anchorId: anchor?.id ?? null,
    }));
  };
  const createFromSelection = () => {
    const artboard = createArtboardFromSelection();
    if (artboard) onCreated([artboard]);
    else toast.warn(t('Select something first.'));
  };
  const resetFields = () => {
    setPresetId(seed.presetId);
    setWidth(String(seed.width));
    setHeight(String(seed.height));
    setQuery('');
    setCount('1');
    setPlacement('right');
    setColumns('');
    setReviewedPreset('');
    setReviewedSearchAction('');
    setReviewedOrientation('');
    setReviewedPlacement('');
    setReviewedFooterAction(t('Reset'));
  };

  // Roving keyboard conventions live in ui/useRovingActions. The preset
  // grid steps by one option (±2 per row) and applies the landed preset.
  const handlePresetKeys = makeGridKeys({
    selector: '[data-artboard-preset-option]',
    columns: PRESET_COLUMNS,
    fallbackToText: true,
    guardEmpty: true,
    setReview: setReviewedPreset,
    onNavigate: (button) => {
      const preset = button && ARTBOARD_SIZE_PRESETS.find((p) => p.id === button.dataset.presetId);
      if (preset) applyPreset(preset);
    },
  });
  const handleSearchActionKeys = makeRovingKeys({
    selector: '[data-artboard-preset-search-action]',
    reviewKey: actionReviewKey('data-artboard-preset-search-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    wrap: true,
    setReview: setReviewedSearchAction,
  });
  // Orientation and placement are mutually exclusive segments, not roving
  // rows: arrows cycle the values, Home/End jump to the ends (DocSettings
  // orientation precedent, via makeSegmentKeys).
  const handleOrientationKeys = makeSegmentKeys({
    values: ['portrait', 'landscape'] as const,
    current: isLandscape ? 'landscape' : 'portrait',
    apply: applyOrientation,
  });
  const handlePlacementKeys = makeSegmentKeys({
    values: PLACEMENTS,
    current: placement,
    apply: (next) => { setPlacement(next); setReviewedPlacement(t(PLACEMENT_LABELS[next])); },
  });
  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-artboard-size-picker-action]',
    reviewKey: actionReviewKey('data-artboard-size-picker-action'),
    fallbackToText: true,
    skipDisabled: true,
    setReview: setReviewedFooterAction,
  });

  const addLabel = countValue > 1 ? `${t('Add')} ${countValue} ${t('Artboards')}` : t('Add Artboard');

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="artboard-size-picker-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[400px] max-w-[92vw] max-h-[calc(100vh-4rem)] overflow-y-auto p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="artboard-size-picker-title" className="dialog-title flex items-center gap-2">
            <Frame size={14} aria-hidden="true" /> {t('Add Artboards')}
          </h2>
          <button type="button" onClick={onClose} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="mb-2">
          <div className="field-label">{t('Preset size')}</div>
          <div className="input-num mb-1 flex items-center gap-1.5 px-2 py-1 focus-within:border-accent2">
            <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              className="flex-1 bg-transparent outline-hidden text-xs text-ink placeholder:text-muted/70 min-w-0"
              placeholder={t('Search preset sizes…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && filteredPresets[0]) {
                  e.preventDefault();
                  applyPreset(filteredPresets[0]);
                  return;
                }
                if (e.key === 'ArrowDown' && filteredPresets[0]) {
                  e.preventDefault();
                  firstOptionRef.current?.focus();
                  return;
                }
                if (e.key === 'Escape' && query) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQuery('');
                }
              }}
              aria-label={t('Search preset sizes…')}
              title={`${t('Press Enter to use first search result')} · ${t('Press Arrow Down to focus preset list')}`}
            />
            <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
              {normalizedQuery ? `${filteredPresets.length} / ${ARTBOARD_SIZE_PRESETS.length} ${t('matches')}` : `${ARTBOARD_SIZE_PRESETS.length} ${t('presets')}`}
            </span>
            {query && (
              <SearchableListActions
                statusId="artboard-preset-search-action-review-status"
                className="flex items-center gap-1.5 shrink-0"
                label={t('Document preset search actions')}
                title={t('Use arrow keys to review document preset search actions')}
                onKeyDown={handleSearchActionKeys}
                reviewingLabel={t('Reviewing')}
                reviewed={reviewedSearchAction}
                fallback={t('Document preset search actions')}
                actionAttr="data-artboard-preset-search-action"
                setReviewed={setReviewedSearchAction}
                first={{
                  label: t('Use First'),
                  review: t('Use first search result'),
                  title: t('Use first search result'),
                  className: 'text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline',
                  onActivate: () => { if (filteredPresets[0]) applyPreset(filteredPresets[0]); },
                  disabled: filteredPresets.length === 0,
                }}
                clear={{
                  label: t('Clear search'),
                  review: t('Clear search'),
                  title: t('Clear search'),
                  className: 'text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0',
                  onActivate: () => setQuery(''),
                }}
              />
            )}
          </div>
          <div
            className="grid grid-cols-2 gap-1 max-h-[216px] overflow-y-auto p-0.5 rounded border border-border bg-panel2"
            role="listbox"
            aria-label={t('Preset size')}
            aria-describedby="artboard-preset-review-status"
            title={t('Use arrow keys to review presets')}
            onKeyDown={handlePresetKeys}
          >
            {presetGroups.map((group) => (
              <div key={group.label} role="group" aria-label={group.label} className="contents">
                <div className="col-span-2 pt-1.5 pb-0.5 px-1 text-[10px] font-semibold tracking-wide text-muted">{group.label}</div>
                {group.presets.map(({ preset, index }) => {
                  const active = preset.id === presetId;
                  const review = `${t(preset.label)} · ${preset.w} × ${preset.h} ${preset.unit}`;
                  return (
                    <button
                      key={preset.id}
                      ref={index === 0 ? firstOptionRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-artboard-preset-option
                      data-preset-id={preset.id}
                      data-review={review}
                      tabIndex={active || (!selectedPreset && index === 0) ? 0 : -1}
                      onClick={() => applyPreset(preset)}
                      onFocus={() => setReviewedPreset(review)}
                      className={`rounded-md border px-2 py-1 text-left text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                    >
                      <span className="block font-medium">{t(preset.label)}</span>
                      <span className="block text-[10px] text-muted">{preset.w} × {preset.h} {preset.unit}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div id="artboard-preset-review-status" className="sr-only" aria-live="polite">
            {reviewedPreset ? `${t('Reviewing')} ${reviewedPreset}` : t('Artboard size presets')}
          </div>
          {selectedPresetHidden && (
            <div className="text-[10px] text-muted mt-1" aria-live="polite">
              {`${t('Selected')}: ${t(selectedPreset.label)}`}
            </div>
          )}
          {normalizedQuery && filteredPresets.length === 0 && (
            <div className="type-caption mt-1 flex flex-col items-start gap-2">
              <span>{t('No preset sizes found.')}</span>
              <button type="button" className="btn py-1! px-2! text-[10px]" onClick={() => setQuery('')}>
                {t('Clear search')}
              </button>
            </div>
          )}
        </div>

        <div className="mb-2">
          <div className="field-label mb-1!">{t('Orientation')}</div>
          <ActionToolbar
            statusId="artboard-size-orientation-review-status"
            className="flex gap-1"
            label={t('Orientation')}
            title={t('Use arrow keys to switch orientation')}
            onKeyDown={handleOrientationKeys}
            statusAs="span"
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedOrientation}
            fallback={t('Orientation')}
          >
            <SegmentButton value="portrait" active={!isLandscape} onClick={() => applyOrientation('portrait')} label={t('Portrait')} />
            <SegmentButton value="landscape" active={isLandscape} onClick={() => applyOrientation('landscape')} label={t('Landscape')} />
          </ActionToolbar>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label">{t('Width (px)')}</div>
            <input
              type="number" min={1} className="input-num" value={width} aria-label={t('Width (px)')}
              onChange={(e) => { setWidth(e.target.value); setPresetId('custom'); }}
            />
          </label>
          <label className="block">
            <div className="field-label">{t('Height (px)')}</div>
            <input
              type="number" min={1} className="input-num" value={height} aria-label={t('Height (px)')}
              onChange={(e) => { setHeight(e.target.value); setPresetId('custom'); }}
            />
          </label>
        </div>
        {sizeValid && (
          <div className="text-[10px] text-muted mt-1 mb-2 tabular-nums">
            ≈ {pxToMm(parsedWidth, dpi).toFixed(1)} × {pxToMm(parsedHeight, dpi).toFixed(1)} mm @ {dpi} DPI
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-2">
          <label className="block">
            <div className="field-label">{t('Count')}</div>
            <input
              type="number" min={1} max={MAX_NEW_ARTBOARDS} className="input-num" value={count} aria-label={t('Count')}
              onChange={(e) => setCount(e.target.value)}
            />
          </label>
          {placement === 'grid' && (
            <label className="block">
              <div className="field-label">{t('Columns')}</div>
              <input
                type="number" min={1} max={countValue} className="input-num" value={columns} aria-label={t('Columns')}
                placeholder={String(autoColumns)} title={`${t('Columns')} — ${autoColumns}`}
                onChange={(e) => setColumns(e.target.value)}
              />
            </label>
          )}
        </div>

        <div className="mb-2">
          <div className="field-label mb-1!">{t('Arrange')}</div>
          <ActionToolbar
            statusId="artboard-size-placement-review-status"
            className="grid grid-cols-3 gap-1"
            label={t('Artboard placement')}
            title={t('Use arrow keys to switch placement')}
            onKeyDown={handlePlacementKeys}
            statusAs="span"
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedPlacement}
            fallback={t('Artboard placement')}
          >
            {PLACEMENTS.map((value) => (
              <SegmentButton
                key={value}
                value={value}
                active={placement === value}
                onClick={() => { setPlacement(value); setReviewedPlacement(t(PLACEMENT_LABELS[value])); }}
                label={t(PLACEMENT_LABELS[value])}
                className={value === 'grid' ? 'col-span-2' : undefined}
              />
            ))}
          </ActionToolbar>
          <div className="text-[10px] text-muted mt-1" aria-live="polite">
            {placement === 'grid' || !anchor
              ? t('Laid out from the document origin, below existing artboards if that space is taken.')
              : `${t('Active artboard')}: ${anchor.name}`}
          </div>
        </div>

        <ReviewedFooter
          statusId="artboard-size-picker-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Add Artboards')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Add Artboards')}
          actionAttr="data-artboard-size-picker-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('From Selection'), review: t('From Selection'), className: 'btn mr-auto', onClick: createFromSelection },
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: onClose },
            { children: t('Reset'), review: t('Reset'), className: 'btn', onClick: resetFields },
            { children: addLabel, review: addLabel, className: 'btn-primary', onClick: create, disabled: !sizeValid },
          ]}
        />
      </div>
    </div>
  );
}

const PLACEMENT_LABELS: Record<ArtboardPlacement, string> = {
  right: 'Right',
  below: 'Below',
  left: 'Left',
  above: 'Above',
  grid: 'Grid from origin',
};

function SegmentButton({ value, active, onClick, label, className }: {
  value: string;
  active: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-value={value}
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 px-2 py-1 rounded-sm border text-xs transition-colors ${
        active ? 'border-[#ff2e9a] text-ink bg-panel2' : 'border-border text-muted hover:text-ink'
      }${className ? ` ${className}` : ''}`}
    >
      {label}
    </button>
  );
}
