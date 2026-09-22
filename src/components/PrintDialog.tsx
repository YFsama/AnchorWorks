import { useCallback, useMemo, useRef, useState } from 'react';
import { X, Printer, ChevronRight, ChevronDown, FileText } from 'lucide-react';
import { useEditor } from '../store/editor';
import { PAGE_DIMS_MM, printCanvas, type PrintOptions } from '../lib/printer';
import { exportPDFReal } from '../lib/io2';
import { defaultPrintPrep, type PrintPrep } from '../lib/printPrep';
import { PrintPreview } from './PrintPreview';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, makeSegmentKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';
import { SearchableListActions } from './ui/SearchableListActions';

const PAGE_SIZES: PrintOptions['pageSize'][] = ['A4', 'A3', 'Letter', 'Legal'];
const MARGIN_PRESETS_MM = [0, 3, 5, 10, 15, 25];
const BLEED_PRESETS_MM = [0, 1, 2, 3, 5, 10];
const PRINT_JOB_PRESETS: Array<{ label: string; opts: PrintOptions }> = [
  { label: 'Proof print', opts: { pageSize: 'A4', orientation: 'portrait', fit: 'fit', marginMm: 10 } },
  { label: 'Office full page', opts: { pageSize: 'Letter', orientation: 'portrait', fit: 'fit', marginMm: 5 } },
  { label: 'Photo fill', opts: { pageSize: 'A4', orientation: 'landscape', fit: 'fill', marginMm: 0 } },
  { label: 'True size check', opts: { pageSize: 'A4', orientation: 'portrait', fit: 'actual', marginMm: 10 } },
];
const PRINT_PREP_PRESETS: Array<{ label: string; prep: PrintPrep }> = [
  { label: 'Proof prep', prep: { bleedMm: 0, cropMarks: false, registrationMarks: false, pageInfo: true } },
  { label: 'Press prep', prep: { bleedMm: 3, cropMarks: true, registrationMarks: true, pageInfo: true } },
  { label: 'Sticker prep', prep: { bleedMm: 2, cropMarks: true, registrationMarks: false, pageInfo: false } },
  { label: 'No prep', prep: { bleedMm: 0, cropMarks: false, registrationMarks: false, pageInfo: false } },
];

export function PrintDialog() {
  const t = useT();
  const open = useEditor(s => s.showPrint);
  const openPrep = useEditor(s => s.openPrintPrep);
  const close = useCallback(() => useEditor.getState().setModal('showPrint', false), []);
  const [opts, setOpts] = useState<PrintOptions>({ pageSize: 'A4', orientation: 'portrait', fit: 'fit', marginMm: 10 });
  const [prep, setPrep] = useState<PrintPrep>(defaultPrintPrep);
  const [prepOpen, setPrepOpen] = useState(false);
  const [pageQuery, setPageQuery] = useState('');
  const [reviewedPageSearchAction, setReviewedPageSearchAction] = useReviewedAction();
  const [reviewedPrintJobPreset, setReviewedPrintJobPreset] = useReviewedAction();
  const [reviewedPrepPreset, setReviewedPrepPreset] = useReviewedAction();
  const [reviewedMarginPreset, setReviewedMarginPreset] = useReviewedAction();
  const [reviewedBleedPreset, setReviewedBleedPreset] = useReviewedAction();
  const [reviewedOutputAction, setReviewedOutputAction] = useReviewedAction();
  const firstPageSizeRef = useRef<HTMLButtonElement>(null);
  if (open && openPrep && !prepOpen) {
    setPrepOpen(true);
    useEditor.getState().setModal('openPrintPrep', false);
  }

  // Escape close — capture phase, consistent with the rest of the dialog system.
  useEscapeClose(open, close);
  useFocusRestore(open);

  const normalizedPageQuery = pageQuery.trim().toLowerCase();
  const filteredPageSizes = useMemo(() => {
    if (!normalizedPageQuery) return PAGE_SIZES;
    return PAGE_SIZES.filter((size) => {
      const [width, height] = PAGE_DIMS_MM[size];
      const haystack = `${size} ${width} ${height} mm`.toLowerCase();
      return haystack.includes(normalizedPageQuery);
    });
  }, [normalizedPageQuery]);
  const reviewedPageSize = filteredPageSizes.includes(opts.pageSize) ? opts.pageSize : filteredPageSizes[0];
  const reviewedPageSizeIndex = reviewedPageSize ? filteredPageSizes.indexOf(reviewedPageSize) : -1;

  if (!open) return null;

  const prepActive = prep.cropMarks || prep.registrationMarks || prep.pageInfo || prep.bleedMm > 0;
  const handlePrint = () => {
    printCanvas(opts, prepActive ? prep : undefined);
    close();
  };
  const handlePDF = () => {
    void exportPDFReal({ pageSize: opts.pageSize, orientation: opts.orientation, prep: prepActive ? prep : undefined });
    close();
  };
  const resetPrintSettings = () => {
    setOpts({ pageSize: 'A4', orientation: 'portrait', fit: 'fit', marginMm: 10 });
    setPrep(defaultPrintPrep);
    setPageQuery('');
    setPrepOpen(false);
    setReviewedOutputAction(t('Reset print settings'));
  };
  const handlePrintJobPresetKeys = makeRovingKeys({
    selector: '[data-print-job-preset]',
    setReview: setReviewedPrintJobPreset,
    onNavigate: (button) => {
      const preset = PRINT_JOB_PRESETS[Number(button?.dataset.printJobPresetIndex ?? -1)];
      if (preset) setOpts(preset.opts);
    },
  });
  const orientationKeys = makeSegmentKeys({
    values: ['portrait', 'landscape'] as const,
    current: opts.orientation,
    apply: (next) => setOpts({ ...opts, orientation: next }),
  });
  const scalingKeys = makeSegmentKeys({
    values: ['actual', 'fit', 'fill'] as const,
    current: opts.fit,
    apply: (next) => setOpts({ ...opts, fit: next }),
  });
  const marginPresetKeys = makeSegmentKeys({
    values: MARGIN_PRESETS_MM.map(String),
    current: `${opts.marginMm}`,
    apply: (next) => setOpts({ ...opts, marginMm: Number(next) }),
    onReview: (button) => setReviewedMarginPreset(button?.dataset.review ?? ''),
  });
  const prepPresetKeys = makeSegmentKeys({
    values: PRINT_PREP_PRESETS.map(preset => preset.label),
    current: PRINT_PREP_PRESETS.find((preset) => prep.bleedMm === preset.prep.bleedMm && prep.cropMarks === preset.prep.cropMarks && prep.registrationMarks === preset.prep.registrationMarks && prep.pageInfo === preset.prep.pageInfo)?.label ?? '',
    apply: (next) => {
      const preset = PRINT_PREP_PRESETS.find((item) => item.label === next);
      if (preset) setPrep(preset.prep);
    },
    onReview: (button) => setReviewedPrepPreset(button?.dataset.review ?? ''),
  });
  const bleedPresetKeys = makeSegmentKeys({
    values: BLEED_PRESETS_MM.map(String),
    current: `${prep.bleedMm}`,
    apply: (next) => setPrep({ ...prep, bleedMm: Number(next) }),
    onReview: (button) => setReviewedBleedPreset(button?.dataset.review ?? ''),
  });
  const handlePageSizeKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-page-size-option]'));
    if (buttons.length === 0) return;
    event.preventDefault();
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const selectedIndex = filteredPageSizes.indexOf(opts.pageSize);
    const currentIndex = activeIndex >= 0 ? activeIndex : Math.max(0, selectedIndex);
    const columns = 2;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : Math.min(buttons.length - 1, Math.max(0, currentIndex + (event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowRight' ? 1 : -1)));
    const nextSize = filteredPageSizes[nextIndex];
    if (!nextSize) return;
    setOpts({ ...opts, pageSize: nextSize });
    requestAnimationFrame(() => buttons[nextIndex]?.focus());
  };
  const [pageWidth, pageHeight] = PAGE_DIMS_MM[opts.pageSize];
  const pageSummaryLabel = `${opts.pageSize} ${opts.orientation === 'landscape' ? pageHeight : pageWidth}×${opts.orientation === 'landscape' ? pageWidth : pageHeight}mm`;
  const fitSummaryLabel = opts.fit === 'actual' ? t('Actual size') : opts.fit === 'fit' ? t('Fit to page') : t('Fill page');
  const prepSummaryLabel = prepActive
    ? [
      prep.bleedMm > 0 ? `${t('Bleed')} ${prep.bleedMm}mm` : null,
      prep.cropMarks ? t('Crop marks') : null,
      prep.registrationMarks ? t('Registration marks') : null,
      prep.pageInfo ? t('Page info') : null,
    ].filter(Boolean).join(' · ')
    : t('No prep');
  const printSummaryLabel = `${pageSummaryLabel} · ${t(opts.orientation === 'landscape' ? 'Landscape' : 'Portrait')} · ${fitSummaryLabel} · ${t('Margin')} ${opts.marginMm}mm · ${prepSummaryLabel}`;
  const formatJobPresetReview = (preset: { label: string; opts: PrintOptions }) => {
    const [presetWidth, presetHeight] = PAGE_DIMS_MM[preset.opts.pageSize];
    const presetPage = preset.opts.orientation === 'landscape'
      ? `${preset.opts.pageSize} ${presetHeight}×${presetWidth}mm`
      : `${preset.opts.pageSize} ${presetWidth}×${presetHeight}mm`;
    const presetFit = preset.opts.fit === 'actual' ? t('Actual size') : preset.opts.fit === 'fit' ? t('Fit to page') : t('Fill page');
    return `${t(preset.label)} · ${presetPage} · ${t(preset.opts.orientation === 'landscape' ? 'Landscape' : 'Portrait')} · ${presetFit} · ${t('Margin')} ${preset.opts.marginMm} mm`;
  };
  const formatPrepPresetReview = (preset: { label: string; prep: PrintPrep }) => {
    const marks = [
      `${t('Bleed')} ${preset.prep.bleedMm} mm`,
      preset.prep.cropMarks ? t('Crop marks') : null,
      preset.prep.registrationMarks ? t('Registration marks') : null,
      preset.prep.pageInfo ? t('Page info') : null,
    ].filter(Boolean).join(' · ');
    return `${t(preset.label)} · ${marks || t('No prep')}`;
  };

  const handlePageSearchActionKeys = makeRovingKeys({
    selector: '[data-page-search-action]',
    reviewKey: actionReviewKey('data-page-search-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    wrap: true,
    setReview: setReviewedPageSearchAction,
  });

  const handleOutputActionKeys = makeRovingKeys({
    selector: '[data-print-output-action]',
    reviewKey: actionReviewKey('data-print-output-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    setReview: setReviewedOutputAction,
  });

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-dialog-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[680px] max-w-[95%] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="print-dialog-title" className="dialog-title">{t('Print')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>
        <div className="flex gap-4">
        <div className="w-[320px] shrink-0">
        <div className="mb-2">
          <div className="field-label">{t('Print job presets')}</div>
          <PresetRow
            statusId="print-job-preset-review-status"
            className="grid grid-cols-2 gap-1"
            label={t('Print job preset actions')}
            title={t('Use arrow keys to review print job presets')}
            onKeyDown={handlePrintJobPresetKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedPrintJobPreset}
            fallback={printSummaryLabel}
            actionAttr="data-print-job-preset"
            setReviewed={setReviewedPrintJobPreset}
            items={PRINT_JOB_PRESETS.map((preset) => {
              const active = opts.pageSize === preset.opts.pageSize
                && opts.orientation === preset.opts.orientation
                && opts.fit === preset.opts.fit
                && Math.abs(opts.marginMm - preset.opts.marginMm) < 0.001;
              return {
                key: preset.label,
                className: `rounded-md border px-2 py-1 text-[10px] transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`,
                pressed: active,
                onClick: () => setOpts(preset.opts),
                title: t(`${preset.label} settings`),
                data: { 'print-job-preset-index': PRINT_JOB_PRESETS.indexOf(preset), review: formatJobPresetReview(preset) },
                children: t(preset.label),
              };
            })}
          />
        </div>
        <Field label={t('Page size')}>
          <div className="space-y-1">
            <div className="input-num flex items-center gap-1.5 px-2 py-1 focus-within:border-accent2">
              <input
                value={pageQuery}
                onChange={(e) => setPageQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && filteredPageSizes[0]) {
                    e.preventDefault();
                    setOpts({ ...opts, pageSize: filteredPageSizes[0] });
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
                  statusId="print-page-search-action-review-status"
                  className="flex items-center gap-1.5 shrink-0"
                  label={t('Page size search actions')}
                  title={t('Use arrow keys to review page size search actions')}
                  onKeyDown={handlePageSearchActionKeys}
                  reviewingLabel={t('Reviewing')}
                  reviewed={reviewedPageSearchAction}
                  fallback={t('Page size search actions')}
                  actionAttr="data-page-search-action"
                  setReviewed={setReviewedPageSearchAction}
                  first={{
                    label: t('Use First'),
                    review: t('Use first search result'),
                    title: t('Use first search result'),
                    className: 'text-[10px] text-accent2 hover:text-accent disabled:opacity-40',
                    onActivate: () => { if (filteredPageSizes[0]) setOpts({ ...opts, pageSize: filteredPageSizes[0] }); },
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
            <div id="print-page-size-review-status" className="sr-only" aria-live="polite">
              {reviewedPageSize
                ? `${t('Reviewing')} ${reviewedPageSize} ${reviewedPageSizeIndex + 1} / ${filteredPageSizes.length}. ${t('Use arrow keys to review page sizes')}`
                : t('No page sizes found.')}
            </div>
            <div
              className="grid grid-cols-2 gap-1"
              role="listbox"
              aria-label={t('Page size')}
              aria-describedby="print-page-size-review-status"
              title={t('Use arrow keys to review page sizes')}
              onKeyDown={handlePageSizeKeys}
            >
              {filteredPageSizes.map((size) => {
                const [width, height] = PAGE_DIMS_MM[size];
                const active = opts.pageSize === size;
                return (
		                  <button
	                    key={size}
	                    ref={size === filteredPageSizes[0] ? firstPageSizeRef : undefined}
	                    type="button"
	                    data-page-size-option
	                    role="option"
                    aria-selected={active}
                    onClick={() => setOpts({ ...opts, pageSize: size })}
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
        <Field label={t('Orientation')}>
          <div
            className="grid grid-cols-2 gap-1"
            role="group"
            aria-label={t('Orientation')}
            onKeyDown={orientationKeys}
            title={t('Use Left/Right arrows to switch options')}
          >
            {(['portrait', 'landscape'] as const).map((mode) => {
              const active = opts.orientation === mode;
              const label = mode === 'portrait' ? t('Portrait') : t('Landscape');
              return (
                <button
                  key={mode}
                  type="button"
                  data-value={mode}
                  aria-pressed={active}
                  className={`rounded-md border px-2 py-1 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                  onClick={() => setOpts({ ...opts, orientation: mode })}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label={t('Scaling')}>
          <div
            className="grid grid-cols-3 gap-1"
            role="group"
            aria-label={t('Scaling')}
            onKeyDown={scalingKeys}
            title={t('Use Left/Right arrows to switch options')}
          >
            {(['actual', 'fit', 'fill'] as const).map((mode) => {
              const active = opts.fit === mode;
              const label = mode === 'actual' ? t('Actual size') : mode === 'fit' ? t('Fit to page') : t('Fill page');
              return (
                <button
                  key={mode}
                  type="button"
                  data-value={mode}
                  aria-pressed={active}
                  className={`rounded-md border px-1.5 py-1 text-[11px] transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                  onClick={() => setOpts({ ...opts, fit: mode })}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label={t('Margin (mm)')}>
          <div className="space-y-1">
            <input type="number" className="input-num" value={opts.marginMm} onChange={(e) => setOpts({ ...opts, marginMm: +e.target.value })} />
            <PresetRow
              statusId="print-margin-preset-review-status"
              className="grid grid-cols-6 gap-1"
              role="group"
              label={t('Margin presets')}
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={marginPresetKeys}
              reviewingLabel={t('Reviewing')}
              reviewed={reviewedMarginPreset}
              fallback={`${t('Margin')} ${opts.marginMm} mm`}
              setReviewed={setReviewedMarginPreset}
              items={MARGIN_PRESETS_MM.map((margin) => {
                const active = Math.abs(opts.marginMm - margin) < 0.001;
                return {
                  key: margin,
                  className: `h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`,
                  pressed: active,
                  onClick: () => setOpts({ ...opts, marginMm: margin }),
                  title: `${t('Set margin to')} ${margin} mm`,
                  data: { value: `${margin}`, review: `${t('Margin')} ${margin} mm` },
                  children: margin,
                };
              })}
            />
          </div>
        </Field>

        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setPrepOpen(o => !o)}
            className="w-full flex items-center justify-between field-label !mb-0 text-[11px] hover:text-ink transition-colors"
            aria-expanded={prepOpen}
            aria-controls="print-prep-body"
          >
            <span className="flex items-center gap-1">
              {prepOpen ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
              {t('Print Prep')}
            </span>
            {prepActive && !prepOpen && <span className="text-[10px] text-success normal-case tracking-normal">{t('on')}</span>}
          </button>
          {prepOpen && (
            <div id="print-prep-body" className="mt-2 space-y-2">
              <div>
                <div className="field-label">{t('Print Prep presets')}</div>
                <PresetRow
                  statusId="print-prep-preset-review-status"
                  className="grid grid-cols-4 gap-1"
                  role="group"
                  label={t('Print Prep presets')}
                  title={t('Use Left/Right arrows to switch options')}
                  onKeyDown={prepPresetKeys}
                  reviewingLabel={t('Reviewing')}
                  reviewed={reviewedPrepPreset}
                  fallback={prepSummaryLabel}
                  setReviewed={setReviewedPrepPreset}
                  items={PRINT_PREP_PRESETS.map((preset) => {
                    const active = prep.bleedMm === preset.prep.bleedMm && prep.cropMarks === preset.prep.cropMarks && prep.registrationMarks === preset.prep.registrationMarks && prep.pageInfo === preset.prep.pageInfo;
                    return {
                      key: preset.label,
                      className: `rounded-md border px-2 py-1 text-[10px] transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`,
                      pressed: active,
                      onClick: () => setPrep(preset.prep),
                      title: t(`${preset.label} settings`),
                      data: { value: preset.label, review: formatPrepPresetReview(preset) },
                      children: t(preset.label),
                    };
                  })}
                />
              </div>
              <Field label={t('Bleed (mm)')}>
                <div className="space-y-1">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    className="input-num"
                    value={prep.bleedMm}
                    onChange={(e) => {
                      const v = Math.min(10, Math.max(0, Number(e.target.value) || 0));
                      setPrep({ ...prep, bleedMm: v });
                    }}
                  />
                  <PresetRow
                    statusId="print-bleed-preset-review-status"
                    className="grid grid-cols-6 gap-1"
                    role="group"
                    label={t('Bleed presets')}
                    title={t('Use Left/Right arrows to switch options')}
                    onKeyDown={bleedPresetKeys}
                    reviewingLabel={t('Reviewing')}
                    reviewed={reviewedBleedPreset}
                    fallback={`${t('Bleed')} ${prep.bleedMm} mm`}
                    setReviewed={setReviewedBleedPreset}
                    items={BLEED_PRESETS_MM.map((bleed) => {
                      const active = Math.abs(prep.bleedMm - bleed) < 0.001;
                      return {
                        key: bleed,
                        className: `h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`,
                        pressed: active,
                        onClick: () => setPrep({ ...prep, bleedMm: bleed }),
                        title: `${t('Set bleed to')} ${bleed} mm`,
                        data: { value: `${bleed}`, review: `${t('Bleed')} ${bleed} mm` },
                        children: bleed,
                      };
                    })}
                  />
                </div>
              </Field>
              <ToggleRow
                label={t('Crop marks')}
                checked={prep.cropMarks}
                onChange={(v) => setPrep({ ...prep, cropMarks: v })}
              />
              <ToggleRow
                label={t('Registration marks')}
                checked={prep.registrationMarks}
                onChange={(v) => setPrep({ ...prep, registrationMarks: v })}
              />
              <ToggleRow
                label={t('Page info')}
                checked={prep.pageInfo}
                onChange={(v) => setPrep({ ...prep, pageInfo: v })}
              />
            </div>
          )}
        </div>

        <div className="mt-3 rounded border border-accent2/40 bg-accent2/10 px-2 py-1.5 text-[10px] text-accent2 flex items-center gap-1.5 tabular-nums" title={t('Final print summary before PDF or Print')}>
          <Printer size={12} aria-hidden="true" className="shrink-0" />
          <span className="font-medium">{t('Ready to print')}:</span>
          <span>{printSummaryLabel}</span>
        </div>

        <ReviewedFooter
          statusId="print-output-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Print output actions')}
          title={t('Use Left/Right arrows to switch options')}
          onKeyDown={handleOutputActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedOutputAction}
          fallback={t('Print output actions')}
          actionAttr="data-print-output-action"
          setReviewed={setReviewedOutputAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset print settings'), className: 'btn', onClick: resetPrintSettings, title: t('Reset print settings') },
            { children: <><FileText size={12} aria-hidden="true" /> PDF</>, review: 'PDF', className: 'btn flex items-center gap-1', onClick: handlePDF, title: t('Save as vector PDF (skips the system print dialog)') },
            { children: <><Printer size={12} aria-hidden="true" /> {t('Print')}</>, review: t('Print'), className: 'btn-primary flex items-center gap-1', onClick: handlePrint },
          ]}
        />
        </div>

        {/* Live WYSIWYG preview of the page, margins, fit + any prep marks. */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="field-label">{t('Preview')}</div>
          <PrintPreview
            opts={opts}
            prep={prepActive ? prep : undefined}
            refreshKey={open}
            className="w-full flex-1 min-h-[280px] bg-panel2 border border-border rounded-sm"
          />
        </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-xs cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
