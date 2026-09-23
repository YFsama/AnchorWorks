import { useCallback, useMemo, useRef, useState } from 'react';
import type * as fabric from 'fabric';
import { X, Printer, RotateCcw } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { tilePrint } from '../lib/io3';
import { PAGE_DIMS_MM, type PrintOptions } from '../lib/printer';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, makeSegmentKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';
import { SearchableListActions } from './ui/SearchableListActions';

const MM_TO_PX = 3.7795; // 96dpi
const PAGE_SIZES: PrintOptions['pageSize'][] = ['A4', 'A3', 'Letter', 'Legal'];
const OVERLAP_PRESETS_MM = [0, 5, 10, 15, 20];
const TILE_MARGIN_PRESETS_MM = [0, 3, 5, 10, 15];
const GRID_PRESETS = [
  { value: '1x1', cols: 1, rows: 1 },
  { value: '1x2', cols: 1, rows: 2 },
  { value: '2x1', cols: 2, rows: 1 },
  { value: '2x2', cols: 2, rows: 2 },
  { value: '3x2', cols: 3, rows: 2 },
  { value: '3x3', cols: 3, rows: 3 },
] as const;
const TILE_JOB_PRESETS = [
  { id: 'proof', label: 'Proof tile job', cols: 1, rows: 1, overlapMm: 0, marginMm: 5 },
  { id: 'poster', label: 'Poster tile job', cols: 2, rows: 2, overlapMm: 10, marginMm: 5 },
  { id: 'banner', label: 'Banner tile job', cols: 3, rows: 2, overlapMm: 15, marginMm: 10 },
] as const;
const SOURCE_MODES = ['auto', 'selected', 'visible', 'canvas'] as const;
type TileSourceMode = typeof SOURCE_MODES[number];

/**
 * Tile / panel print — split an oversized design across a grid of pages with
 * an optional glue overlap, the large-format workflow Illustrator (Print →
 * Tiling) and SignMaster (Paneling) both provide. Replaces the old
 * prompt()-driven flow with a real dialog + live grid preview.
 */
export function TilePrintDialog() {
  const t = useT();
  const open = useEditor(s => s.showTilePrint);
  const selectionKey = useEditor(s => s.selectionIds.join('|'));
  const close = useCallback(() => useEditor.getState().setModal('showTilePrint', false), []);
  const [pageSize, setPageSize] = useState<PrintOptions['pageSize']>('A4');
  const [orientation, setOrientation] = useState<PrintOptions['orientation']>('portrait');
  const [manualCols, setManualColsState] = useState(2);
  const [manualRows, setManualRowsState] = useState(2);
  const [autoGrid, setAutoGrid] = useState(false);
  const [overlapMm, setOverlapMm] = useState(0);
  const [marginMm, setMarginMm] = useState(5);
  const [sourceMode, setSourceMode] = useState<TileSourceMode>('auto');
  const [pageQuery, setPageQuery] = useState('');
  const [reviewedPageSearchAction, setReviewedPageSearchAction] = useReviewedAction();
  const [reviewedTileJobPreset, setReviewedTileJobPreset] = useReviewedAction();
  const [reviewedGridPreset, setReviewedGridPreset] = useReviewedAction();
  const [reviewedOverlapPreset, setReviewedOverlapPreset] = useReviewedAction();
  const [reviewedMarginPreset, setReviewedMarginPreset] = useReviewedAction();
  const [reviewedOutputAction, setReviewedOutputAction] = useReviewedAction();
  const firstPageSizeRef = useRef<HTMLButtonElement>(null);

  useEscapeClose(open, close);
  useFocusRestore(open);

  // Raster the canvas once per open/selection for the preview backdrop.
  const art = useMemo(() => {
    if (!open) return null;
    const canvas = getCanvas();
    if (!canvas) return null;
    const selected = canvas.getActiveObjects().filter(isPrintableTileObject);
    const visible = canvas.getObjects().filter(isPrintableTileObject);
    const requestedMode: TileSourceMode = sourceMode === 'auto'
      ? selected.length > 0 ? 'selected' : visible.length > 0 ? 'visible' : 'canvas'
      : sourceMode;
    const resolvedMode: TileSourceMode = requestedMode === 'selected' && selected.length === 0
      ? visible.length > 0 ? 'visible' : 'canvas'
      : requestedMode === 'visible' && visible.length === 0
        ? 'canvas'
        : requestedMode;
    const sourceObjects = resolvedMode === 'selected'
      ? selected
      : resolvedMode === 'visible'
        ? visible
        : [];
    const canvasBounds = { left: 0, top: 0, width: canvas.getWidth(), height: canvas.getHeight() };
    const bounds = resolvedMode === 'canvas' ? canvasBounds : boundsOfObjects(sourceObjects) ?? canvasBounds;
    const sourceLabel = resolvedMode === 'selected'
      ? t('Selected artwork')
      : resolvedMode === 'visible'
        ? t('Visible artwork')
        : t('Canvas artwork');
    try {
      return {
        url: canvas.toDataURL({
          format: 'png',
          multiplier: 1,
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
        }),
        w: bounds.width,
        h: bounds.height,
        bounds,
        selectionKey,
        sourceMode,
        resolvedMode,
        selectedCount: selected.length,
        visibleCount: visible.length,
        sourceLabel,
      };
    } catch {
      return null;
    }
  }, [open, selectionKey, sourceMode, t]);

  const normalizedPageQuery = pageQuery.trim().toLowerCase();
  const filteredPageSizes = useMemo(() => {
    if (!normalizedPageQuery) return PAGE_SIZES;
    return PAGE_SIZES.filter((size) => {
      const [width, height] = PAGE_DIMS_MM[size];
      const haystack = `${size} ${width} ${height} mm`.toLowerCase();
      return haystack.includes(normalizedPageQuery);
    });
  }, [normalizedPageQuery]);
  const reviewedPageSize = filteredPageSizes.includes(pageSize) ? pageSize : filteredPageSizes[0];
  const reviewedPageSizeIndex = reviewedPageSize ? filteredPageSizes.indexOf(reviewedPageSize) : -1;

  const cw = art?.w ?? 800;
  const ch = art?.h ?? 600;
  const overlapPx = Math.max(0, overlapMm) * MM_TO_PX;
  const [pageWidthMm, pageHeightMm] = orientation === 'portrait'
    ? PAGE_DIMS_MM[pageSize]
    : ([...PAGE_DIMS_MM[pageSize]].reverse() as [number, number]);
  const safeMarginMm = Math.min(Math.max(0, marginMm), Math.max(0, Math.min(pageWidthMm, pageHeightMm) / 2 - 1));
  const printablePageWidthMm = Math.max(1, pageWidthMm - (safeMarginMm * 2));
  const printablePageHeightMm = Math.max(1, pageHeightMm - (safeMarginMm * 2));
  const estimateAutoGrid = useCallback(() => {
    const printableW = Math.max(1, (printablePageWidthMm * MM_TO_PX) - overlapPx);
    const printableH = Math.max(1, (printablePageHeightMm * MM_TO_PX) - overlapPx);
    return {
      cols: Math.max(1, Math.min(20, Math.ceil(cw / printableW))),
      rows: Math.max(1, Math.min(20, Math.ceil(ch / printableH))),
    };
  }, [ch, cw, overlapPx, printablePageHeightMm, printablePageWidthMm]);
  const estimatedGrid = estimateAutoGrid();
  const cols = autoGrid ? estimatedGrid.cols : manualCols;
  const rows = autoGrid ? estimatedGrid.rows : manualRows;

  if (!open) return null;

  const doPrint = () => {
    const [pwMm, phMm] = orientation === 'portrait'
      ? PAGE_DIMS_MM[pageSize]
      : ([...PAGE_DIMS_MM[pageSize]].reverse() as [number, number]);
    tilePrint({
      pageW: Math.round(pwMm * MM_TO_PX),
      pageH: Math.round(phMm * MM_TO_PX),
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      overlapPx: Math.max(0, overlapMm) * MM_TO_PX,
      bounds: art?.bounds,
      marginPx: safeMarginMm * MM_TO_PX,
    });
    close();
  };

  const assembledWidthMm = Math.max(printablePageWidthMm, (printablePageWidthMm * cols) - (Math.max(0, cols - 1) * overlapMm));
  const assembledHeightMm = Math.max(printablePageHeightMm, (printablePageHeightMm * rows) - (Math.max(0, rows - 1) * overlapMm));
  const previewTileWidth = cw / cols;
  const previewTileHeight = ch / rows;
  const previewMarginX = Math.min(previewTileWidth / 2 - 1, previewTileWidth * (safeMarginMm / Math.max(1, pageWidthMm)));
  const previewMarginY = Math.min(previewTileHeight / 2 - 1, previewTileHeight * (safeMarginMm / Math.max(1, pageHeightMm)));
  const tileSummaryLabel = [
    art?.sourceLabel ?? t('Canvas artwork'),
    `${pageSize} · ${orientation === 'portrait' ? t('Portrait') : t('Landscape')}`,
    `${cols}×${rows} · ${cols * rows} ${t('pages')}`,
    `${t('Overlap')} ${overlapMm} mm`,
    `${t('Margin')} ${safeMarginMm} mm`,
    `${t('Printable')} ${Math.round(printablePageWidthMm)}×${Math.round(printablePageHeightMm)} mm`,
    `${t('Page')} ${pageWidthMm}×${pageHeightMm} mm`,
    `${t('Assembled')} ${Math.round(assembledWidthMm)}×${Math.round(assembledHeightMm)} mm`,
  ].join(' · ');
  const formatTileJobPresetReview = (preset: (typeof TILE_JOB_PRESETS)[number]) => `${t(preset.label)} · ${preset.cols}×${preset.rows} · ${preset.cols * preset.rows} ${t('pages')} · ${t('Overlap')} ${preset.overlapMm} mm · ${t('Margin')} ${preset.marginMm} mm`;
  const formatGridPresetReview = (preset: (typeof GRID_PRESETS)[number]) => `${preset.cols}×${preset.rows} · ${preset.cols * preset.rows} ${t('pages')}`;
  const applyAutoGrid = () => {
    setAutoGrid(true);
  };

  const setManualCols = (next: number) => {
    setAutoGrid(false);
    setManualColsState(next);
  };
  const setManualRows = (next: number) => {
    setAutoGrid(false);
    setManualRowsState(next);
  };
  const handleOrientationKeys = makeSegmentKeys({
    values: ['portrait', 'landscape'] as const,
    current: orientation,
    apply: setOrientation,
  });

  const handleOverlapKeys = makeSegmentKeys({
    values: OVERLAP_PRESETS_MM.map(String),
    current: `${overlapMm}`,
    apply: (next) => setOverlapMm(Number(next)),
    onReview: (button) => setReviewedOverlapPreset(button?.dataset.review ?? ''),
  });

  const handleMarginKeys = makeSegmentKeys({
    values: TILE_MARGIN_PRESETS_MM.map(String),
    current: `${marginMm}`,
    apply: (next) => setMarginMm(Number(next)),
    onReview: (button) => setReviewedMarginPreset(button?.dataset.review ?? ''),
  });

  const handlePageSizeKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-page-size-option]'));
    if (buttons.length === 0) return;
    event.preventDefault();
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const selectedIndex = filteredPageSizes.indexOf(pageSize);
    const currentIndex = activeIndex >= 0 ? activeIndex : Math.max(0, selectedIndex);
    const columns = 2;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : Math.min(buttons.length - 1, Math.max(0, currentIndex + (event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowRight' ? 1 : -1)));
    const nextSize = filteredPageSizes[nextIndex];
    if (!nextSize) return;
    setPageSize(nextSize);
    requestAnimationFrame(() => buttons[nextIndex]?.focus());
  };
  const handleSourceKeys = makeRovingKeys({
    selector: '[data-tile-source-option]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: () => undefined,
    onNavigate: (button) => {
      const next = button?.dataset.value as TileSourceMode | undefined;
      if (next) setSourceMode(next);
    },
  });

  const handleTileJobPresetKeys = makeRovingKeys({
    selector: '[data-tile-job-preset-action]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedTileJobPreset,
    onNavigate: (button) => {
      const preset = TILE_JOB_PRESETS.find((item) => item.id === button?.dataset.value);
      if (preset) applyTileJobPreset(preset);
    },
  });

  const handlePageSearchActionKeys = makeRovingKeys({
    selector: '[data-tile-page-search-action]',
    reviewKey: actionReviewKey('data-tile-page-search-action'),
    fallbackToText: true,
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    setReview: setReviewedPageSearchAction,
  });

  const handleGridPresetKeys = makeRovingKeys({
    selector: '[data-tile-grid-preset-action]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedGridPreset,
    onNavigate: (button) => {
      const next = button?.dataset.value;
      if (next === 'auto') applyAutoGrid();
      else if (next) applyGridPreset(next);
    },
  });

  const handleOutputActionKeys = makeRovingKeys({
    selector: '[data-tile-output-action]',
    reviewKey: actionReviewKey('data-tile-output-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    setReview: setReviewedOutputAction,
  });

  const applyTileJobPreset = (preset: (typeof TILE_JOB_PRESETS)[number]) => {
    setAutoGrid(false);
    setManualColsState(preset.cols);
    setManualRowsState(preset.rows);
    setOverlapMm(preset.overlapMm);
    setMarginMm(preset.marginMm);
  };

  const resetTilePrintSettings = () => {
    setPageSize('A4');
    setOrientation('portrait');
    setAutoGrid(false);
    setManualColsState(1);
    setManualRowsState(1);
    setOverlapMm(0);
    setMarginMm(5);
    setSourceMode('auto');
    setPageQuery('');
    setReviewedOutputAction(t('Reset tile print settings'));
  };

  const applyGridPreset = (value: string) => {
    const preset = GRID_PRESETS.find((item) => item.value === value);
    if (!preset) return;
    setAutoGrid(false);
    setManualColsState(preset.cols);
    setManualRowsState(preset.rows);
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tile-print-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[640px] max-w-[95%] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="tile-print-title" className="dialog-title">{t('Tile Print…')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="flex gap-4">
          <div className="w-[280px] shrink-0">
            <Field label={t('Page size')}>
              <div className="space-y-1">
                <div className="input-num flex items-center gap-1.5 px-2 py-1 focus-within:border-accent2">
                  <input
                    value={pageQuery}
                    onChange={(e) => setPageQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && filteredPageSizes[0]) {
                        e.preventDefault();
                        setPageSize(filteredPageSizes[0]);
                        return;
                      }
                      if (e.key === 'ArrowDown' && filteredPageSizes[0]) {
                        e.preventDefault();
                        firstPageSizeRef.current?.focus();
                        return;
                      }
                      if (e.key === 'Escape' && pageQuery) {
                        e.preventDefault();
                        e.stopPropagation();
                        setPageQuery('');
                      }
                    }}
                    placeholder={t('Search page sizes…')}
                    aria-label={t('Search page sizes…')}
                    title={`${t('Press Enter to use first search result')} · ${t('Press Arrow Down to focus first page size')}`}
                    className="min-w-0 flex-1 bg-transparent outline-none text-xs text-ink placeholder:text-muted/70"
                  />
                  <span className="text-[10px] text-muted tabular-nums whitespace-nowrap" aria-live="polite">
                    {normalizedPageQuery ? `${filteredPageSizes.length} / ${PAGE_SIZES.length} ${t('matches')}` : `${PAGE_SIZES.length} ${t('sizes')}`}
                  </span>
                  {pageQuery && (
                    <SearchableListActions
                      statusId="tile-page-search-action-review-status"
                      className="flex items-center gap-1.5 shrink-0"
                      label={t('Page size search actions')}
                      title={t('Use arrow keys to review page size search actions')}
                      onKeyDown={handlePageSearchActionKeys}
                      reviewingLabel={t('Reviewing')}
                      reviewed={reviewedPageSearchAction}
                      fallback={t('Page size search actions')}
                      actionAttr="data-tile-page-search-action"
                      setReviewed={setReviewedPageSearchAction}
                      first={{
                        label: t('Use First'),
                        review: t('Use first search result'),
                        title: t('Use first search result'),
                        className: 'text-[10px] text-accent2 hover:text-accent disabled:opacity-40',
                        onActivate: () => { if (filteredPageSizes[0]) setPageSize(filteredPageSizes[0]); },
                        disabled: filteredPageSizes.length === 0,
                      }}
                      clear={{
                        label: t('Clear search'),
                        review: t('Clear search'),
                        title: t('Clear search'),
                        className: 'text-[10px] text-accent2 hover:text-accent',
                        onActivate: () => setPageQuery(''),
                      }}
                    />
                  )}
                </div>
                <div id="tile-page-size-review-status" className="sr-only" aria-live="polite">
                  {reviewedPageSize
                    ? `${t('Reviewing')} ${reviewedPageSize} ${reviewedPageSizeIndex + 1} / ${filteredPageSizes.length}. ${t('Use arrow keys to review page sizes')}`
                    : t('No page sizes found.')}
                </div>
                <div
                  className="grid grid-cols-2 gap-1"
                  role="listbox"
                  aria-label={t('Page size')}
                  aria-describedby="tile-page-size-review-status"
                  title={t('Use arrow keys to review page sizes')}
                  onKeyDown={handlePageSizeKeys}
                >
                  {filteredPageSizes.map((size) => {
                    const [width, height] = PAGE_DIMS_MM[size];
                    const active = pageSize === size;
                    return (
                      <button
                        key={size}
                        ref={size === filteredPageSizes[0] ? firstPageSizeRef : undefined}
                        type="button"
                        data-page-size-option
                        role="option"
                        aria-selected={active}
                        onClick={() => setPageSize(size)}
                        className={`rounded-md border px-2 py-1 text-left text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      >
                        <span className="block font-medium">{size}</span>
                        <span className="block text-[10px] opacity-80">{width} × {height} mm</span>
                      </button>
                    );
                  })}
                </div>
                {filteredPageSizes.length === 0 && (
                  <div className="flex flex-col items-start gap-2 text-[11px] text-muted">
                    <span>{t('No page sizes found.')}</span>
                    {pageQuery && (
                      <button
                        type="button"
                        className="btn !py-1 !px-2 text-[10px]"
                        onClick={() => setPageQuery('')}
                      >
                        {t('Clear search')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Field>
            <Field label={t('Source')}>
              <div
                className="grid grid-cols-4 gap-1"
                role="group"
                aria-label={t('Tile print source')}
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={handleSourceKeys}
              >
                {SOURCE_MODES.map((mode) => {
                  const disabled = mode === 'selected' && (art?.selectedCount ?? 0) === 0;
                  const displayedSourceMode: TileSourceMode = sourceMode === 'auto'
                    ? 'auto'
                    : sourceMode === 'selected' && (art?.selectedCount ?? 0) === 0
                      ? art?.resolvedMode ?? 'canvas'
                      : sourceMode === 'visible' && (art?.visibleCount ?? 0) === 0
                        ? 'canvas'
                        : sourceMode;
                  const active = displayedSourceMode === mode;
                  const label = mode === 'auto'
                    ? t('Auto')
                    : mode === 'selected'
                      ? t('Selected')
                      : mode === 'visible'
                        ? t('Visible')
                        : t('Canvas');
                  return (
                    <button
                      key={mode}
                      type="button"
                      data-value={mode}
                      data-tile-source-option
                      aria-pressed={active}
                      disabled={disabled}
                      className={`rounded-md border px-1.5 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onClick={() => setSourceMode(mode)}
                      title={mode === 'auto' ? t('Use automatic source') : `${t('Use')} ${label}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label={t('Orientation')}>
              <div
                className="grid grid-cols-2 gap-1"
                role="group"
                aria-label={t('Orientation')}
                onKeyDown={handleOrientationKeys}
                title={t('Use Left/Right arrows to switch options')}
              >
                {(['portrait', 'landscape'] as const).map((mode) => {
                  const active = orientation === mode;
                  const label = mode === 'portrait' ? t('Portrait') : t('Landscape');
                  return (
                    <button
                      key={mode}
                      type="button"
                      data-value={mode}
                      aria-pressed={active}
                      className={`rounded-md border px-2 py-1 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onClick={() => setOrientation(mode)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('Columns')}>
                <input type="number" min={1} max={20} className="input-num" value={cols}
                  onChange={(e) => setManualCols(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} />
              </Field>
              <Field label={t('Rows')}>
                <input type="number" min={1} max={20} className="input-num" value={rows}
                  onChange={(e) => setManualRows(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} />
              </Field>
            </div>
            <div className="field-label !mt-1 !mb-1">{t('Tile job presets')}</div>
            <PresetRow
              statusId="tile-job-preset-review-status"
              className="grid grid-cols-3 gap-1 mb-2"
              label={t('Tile job preset actions')}
              title={t('Use arrow keys to review tile job presets')}
              onKeyDown={handleTileJobPresetKeys}
              reviewingLabel={t('Reviewing')}
              reviewed={reviewedTileJobPreset}
              fallback={tileSummaryLabel}
              actionAttr="data-tile-job-preset-action"
              setReviewed={setReviewedTileJobPreset}
              items={TILE_JOB_PRESETS.map((preset) => {
                const active = !autoGrid
                  && cols === preset.cols
                  && rows === preset.rows
                  && Math.abs(overlapMm - preset.overlapMm) < 0.001
                  && Math.abs(marginMm - preset.marginMm) < 0.001;
                return {
                  key: preset.id,
                  className: `rounded-md border px-2 py-1 text-[10px] transition-colors ${active ? 'bg-accent2/20 border-accent2 text-accent2' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`,
                  pressed: active,
                  onClick: () => applyTileJobPreset(preset),
                  title: `${t(preset.label)} · ${preset.cols}×${preset.rows} · ${t('Overlap')} ${preset.overlapMm} mm · ${t('Margin')} ${preset.marginMm} mm`,
                  data: { value: preset.id, review: formatTileJobPresetReview(preset) },
                  children: t(preset.label),
                };
              })}
            />
            <div
              className="mb-2"
              role="toolbar"
              aria-label={t('Tile grid preset actions')}
              aria-describedby="tile-grid-preset-review-status"
              title={t('Use arrow keys to review tile grid presets')}
              onKeyDown={handleGridPresetKeys}
            >
              <div className="field-label !mt-1 !mb-1">{t('Grid presets')}</div>
              <div id="tile-grid-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedGridPreset || `${cols}×${rows} · ${cols * rows} ${t('pages')}`}`}
              </div>
              <div className="grid grid-cols-7 gap-1">
                <button
                  type="button"
                  data-value="auto"
                  data-tile-grid-preset-action
                  data-review={`${t('Auto')} · ${cols}×${rows} · ${cols * rows} ${t('pages')}`}
                  className={`h-6 rounded border text-[10px] transition-colors ${autoGrid ? 'bg-accent2/20 border-accent2 text-accent2' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
                  onFocus={(event) => setReviewedGridPreset(event.currentTarget.dataset.review ?? '')}
                  onClick={applyAutoGrid}
                  aria-pressed={autoGrid}
                  title={t('Estimate tile grid from artwork and page size')}
                >
                  {t('Auto')}
                </button>
                {GRID_PRESETS.map((preset) => {
                  const active = !autoGrid && cols === preset.cols && rows === preset.rows;
                  const review = formatGridPresetReview(preset);
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      data-value={preset.value}
                      data-tile-grid-preset-action
                      data-review={review}
                      className={`h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
                      onFocus={(event) => setReviewedGridPreset(event.currentTarget.dataset.review ?? '')}
                      onClick={() => applyGridPreset(preset.value)}
                      title={`${t('Set tile grid to')} ${preset.cols}×${preset.rows}`}
                      aria-pressed={active}
                    >
                      {preset.cols}×{preset.rows}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('Overlap (mm)')}>
                <input type="number" min={0} max={50} step={1} className="input-num" value={overlapMm}
                  onChange={(e) => setOverlapMm(Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)))}
                  title={t('Shared margin between pages so they can be taped together.')} />
              </Field>
              <Field label={t('Margin (mm)')}>
                <input type="number" min={0} max={25} step={1} className="input-num" value={marginMm}
                  onChange={(e) => setMarginMm(Math.max(0, Math.min(25, parseFloat(e.target.value) || 0)))}
                  title={t('White margin kept inside each tile page.')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="field-label !mt-1 !mb-1">{t('Overlap presets')}</div>
                <PresetRow
                  statusId="tile-overlap-preset-review-status"
                  className="grid grid-cols-5 gap-1"
                  role="group"
                  label={t('Overlap presets')}
                  title={t('Use Left/Right arrows to switch options')}
                  onKeyDown={handleOverlapKeys}
                  reviewingLabel={t('Reviewing')}
                  reviewed={reviewedOverlapPreset}
                  fallback={`${t('Overlap')} ${overlapMm} mm`}
                  setReviewed={setReviewedOverlapPreset}
                  items={OVERLAP_PRESETS_MM.map((preset) => ({
                    key: preset,
                    className: `h-6 rounded border text-[10px] transition-colors ${Math.abs(overlapMm - preset) < 0.001 ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`,
                    pressed: Math.abs(overlapMm - preset) < 0.001,
                    onClick: () => setOverlapMm(preset),
                    title: `${t('Set overlap to')} ${preset} mm`,
                    data: { value: `${preset}`, review: `${t('Overlap')} ${preset} mm` },
                    children: preset,
                  }))}
                />
              </div>
              <div>
                <div className="field-label !mt-1 !mb-1">{t('Margin presets')}</div>
                <PresetRow
                  statusId="tile-margin-preset-review-status"
                  className="grid grid-cols-5 gap-1"
                  role="group"
                  label={t('Margin presets')}
                  title={t('Use Left/Right arrows to switch options')}
                  onKeyDown={handleMarginKeys}
                  reviewingLabel={t('Reviewing')}
                  reviewed={reviewedMarginPreset}
                  fallback={`${t('Margin')} ${marginMm} mm`}
                  setReviewed={setReviewedMarginPreset}
                  items={TILE_MARGIN_PRESETS_MM.map((preset) => ({
                    key: preset,
                    className: `h-6 rounded border text-[10px] transition-colors ${Math.abs(marginMm - preset) < 0.001 ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`,
                    pressed: Math.abs(marginMm - preset) < 0.001,
                    onClick: () => setMarginMm(preset),
                    title: `${t('Set margin to')} ${preset} mm`,
                    data: { value: `${preset}`, review: `${t('Margin')} ${preset} mm` },
                    children: preset,
                  }))}
                />
              </div>
            </div>
            <div className="rounded border border-border bg-panel2/70 px-2 py-1.5 text-[10px] text-muted mt-1 tabular-nums leading-relaxed">
              <div>{t('Source')}: {art?.sourceLabel ?? t('Canvas artwork')}</div>
              <div>{cols * rows} {t('pages')} · {cols}×{rows}</div>
              <div>{t('Page')} {pageWidthMm}×{pageHeightMm} mm · {t('Margin')} {safeMarginMm} mm</div>
              <div>{t('Printable')} {Math.round(printablePageWidthMm)}×{Math.round(printablePageHeightMm)} mm</div>
              <div>{t('Assembled')} {Math.round(assembledWidthMm)}×{Math.round(assembledHeightMm)} mm</div>
            </div>
          </div>

          {/* Live grid preview over the artwork. */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="field-label flex items-center justify-between gap-2">
              <span>{t('Preview')}</span>
              <span className="flex items-center gap-2 text-[10px] font-normal text-muted normal-case">
                {overlapPx > 0 && (
                  <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-[#ff2e9a]/30 border border-[#ff2e9a]/70" />{t('Overlap')}</span>
                )}
                {safeMarginMm > 0 && (
                  <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-[#22c55e]" />{t('Printable')}</span>
                )}
              </span>
            </div>
            <svg
              viewBox={`0 0 ${cw} ${ch}`}
              className="w-full flex-1 min-h-[240px] bg-panel2 border border-border rounded-sm"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={t('Tile preview')}
            >
              <rect x={0} y={0} width={cw} height={ch} fill="#ffffff" />
              {art && <image href={art.url} x={0} y={0} width={cw} height={ch} preserveAspectRatio="none" />}
              {/* Overlap bands. */}
              {overlapPx > 0 && Array.from({ length: cols - 1 }, (_, i) => (
                <rect key={`ov${i}`} x={(i + 1) * cw / cols - overlapPx / 2} y={0} width={overlapPx} height={ch} fill="#ff2e9a" opacity={0.12} />
              ))}
              {overlapPx > 0 && Array.from({ length: rows - 1 }, (_, j) => (
                <rect key={`oh${j}`} x={0} y={(j + 1) * ch / rows - overlapPx / 2} width={cw} height={overlapPx} fill="#ff2e9a" opacity={0.12} />
              ))}
              {/* Printable area guides. */}
              {safeMarginMm > 0 && Array.from({ length: rows }, (_, row) => (
                Array.from({ length: cols }, (_, col) => (
                  <rect
                    key={`pm${row}-${col}`}
                    x={(col * previewTileWidth) + previewMarginX}
                    y={(row * previewTileHeight) + previewMarginY}
                    width={Math.max(1, previewTileWidth - (previewMarginX * 2))}
                    height={Math.max(1, previewTileHeight - (previewMarginY * 2))}
                    fill="none"
                    stroke="#22c55e"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    opacity={0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              ))}
              {/* Grid lines. */}
              {Array.from({ length: cols - 1 }, (_, i) => (
                <line key={`v${i}`} x1={(i + 1) * cw / cols} y1={0} x2={(i + 1) * cw / cols} y2={ch} stroke="#ff2e9a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {Array.from({ length: rows - 1 }, (_, j) => (
                <line key={`h${j}`} x1={0} y1={(j + 1) * ch / rows} x2={cw} y2={(j + 1) * ch / rows} stroke="#ff2e9a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              <rect x={0} y={0} width={cw} height={ch} fill="none" stroke="#c8c8c8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <div
            className="rounded border border-accent2/40 bg-accent2/10 px-3 py-2 text-[11px] text-ink"
            role="status"
            aria-label={t('Final tile print summary before Print')}
          >
            <div className="font-medium text-accent2">{t('Ready to tile print')}</div>
            <div className="mt-0.5 text-muted tabular-nums">{tileSummaryLabel}</div>
          </div>
          <ReviewedFooter
            statusId="tile-print-output-action-review-status"
            className="flex justify-end gap-2"
            label={t('Tile Print output actions')}
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={handleOutputActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedOutputAction}
            fallback={t('Tile Print output actions')}
            actionAttr="data-tile-output-action"
            setReviewed={setReviewedOutputAction}
            actions={[
              { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
              { children: <><RotateCcw size={12} aria-hidden="true" /> {t('Reset')}</>, review: t('Reset tile print settings'), className: 'btn flex items-center gap-1', onClick: resetTilePrintSettings, title: t('Reset tile print settings') },
              { children: <><Printer size={12} aria-hidden="true" /> {t('Print')}</>, review: t('Print'), className: 'btn-primary flex items-center gap-1', onClick: doPrint },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}

function isPrintableTileObject(obj: fabric.FabricObject): boolean {
  if (obj.visible === false) return false;
  if ((obj as { excludeFromExport?: boolean }).excludeFromExport) return false;
  return true;
}

function boundsOfObjects(objects: fabric.FabricObject[]): { left: number; top: number; width: number; height: number } | null {
  if (objects.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const obj of objects) {
    const box = obj.getBoundingRect();
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.left + box.width);
    bottom = Math.max(bottom, box.top + box.height);
  }
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) return null;
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}
