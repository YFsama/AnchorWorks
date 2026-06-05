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
  const [reviewedPageSearchAction, setReviewedPageSearchAction] = useState('');
  const [reviewedPrintJobPreset, setReviewedPrintJobPreset] = useState('');
  const [reviewedPrepPreset, setReviewedPrepPreset] = useState('');
  const [reviewedMarginPreset, setReviewedMarginPreset] = useState('');
  const [reviewedBleedPreset, setReviewedBleedPreset] = useState('');
  const [reviewedOutputAction, setReviewedOutputAction] = useState('');
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
  const handleSegmentKeys = <T extends string>(event: React.KeyboardEvent<HTMLDivElement>, values: readonly T[], current: T, apply: (next: T) => void, onReview?: (button?: HTMLButtonElement | null) => void) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = values.indexOf(current);
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    const next = event.key === 'Home'
      ? values[0]
      : event.key === 'End'
        ? values[values.length - 1]
      : values[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length];
    apply(next);
    requestAnimationFrame(() => {
      const button = event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`);
      onReview?.(button);
      button?.focus();
    });
  };
  const handlePrintJobPresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-print-job-preset]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const preset = PRINT_JOB_PRESETS[Number(actions[nextIndex]?.dataset.printJobPresetIndex ?? -1)];
    if (preset) setOpts(preset.opts);
    setReviewedPrintJobPreset(actions[nextIndex]?.dataset.review ?? '');
    actions[nextIndex]?.focus();
  };
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

  const handlePageSearchActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-page-search-action]'))
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
    setReviewedPageSearchAction(nextAction?.dataset.pageSearchActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handleOutputActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-print-output-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedOutputAction(nextAction?.dataset.printOutputActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

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
          <div
            className="grid grid-cols-2 gap-1"
            role="toolbar"
            aria-label={t('Print job preset actions')}
            aria-describedby="print-job-preset-review-status"
            title={t('Use arrow keys to review print job presets')}
            onKeyDown={handlePrintJobPresetKeys}
          >
            <div id="print-job-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPrintJobPreset || printSummaryLabel}`}
            </div>
            {PRINT_JOB_PRESETS.map((preset) => {
              const active = opts.pageSize === preset.opts.pageSize
                && opts.orientation === preset.opts.orientation
                && opts.fit === preset.opts.fit
                && Math.abs(opts.marginMm - preset.opts.marginMm) < 0.001;
              const review = formatJobPresetReview(preset);
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-print-job-preset
                  data-print-job-preset-index={PRINT_JOB_PRESETS.indexOf(preset)}
                  data-review={review}
                  className={`rounded-md border px-2 py-1 text-[10px] transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                  onFocus={(event) => setReviewedPrintJobPreset(event.currentTarget.dataset.review ?? '')}
                  onClick={() => setOpts(preset.opts)}
                  aria-pressed={active}
                  title={t(`${preset.label} settings`)}
                >
                  {t(preset.label)}
                </button>
              );
            })}
          </div>
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
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  role="toolbar"
                  aria-label={t('Page size search actions')}
                  aria-describedby="print-page-search-action-review-status"
                  title={t('Use arrow keys to review page size search actions')}
                  onKeyDown={handlePageSearchActionKeys}
                >
                  <span id="print-page-search-action-review-status" className="sr-only" aria-live="polite">
                    {`${t('Reviewing')} ${reviewedPageSearchAction || t('Page size search actions')}`}
                  </span>
                  <button
                    type="button"
                    className="text-[10px] text-accent2 hover:text-accent disabled:opacity-40"
                    data-page-search-action
                    data-page-search-action-review={t('Use first search result')}
                    onFocus={() => setReviewedPageSearchAction(t('Use first search result'))}
                    onClick={() => { if (filteredPageSizes[0]) setOpts({ ...opts, pageSize: filteredPageSizes[0] }); }}
                    disabled={filteredPageSizes.length === 0}
                    title={t('Use first search result')}
                  >
                    {t('Use First')}
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-accent2 hover:text-accent"
                    data-page-search-action
                    data-page-search-action-review={t('Clear search')}
                    onFocus={() => setReviewedPageSearchAction(t('Clear search'))}
                    onClick={() => setPageQuery('')}
                    title={t('Clear search')}
                  >
                    {t('Clear search')}
                  </button>
                </div>
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
            onKeyDown={(event) => handleSegmentKeys(event, ['portrait', 'landscape'] as const, opts.orientation, (next) => setOpts({ ...opts, orientation: next }))}
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
            onKeyDown={(event) => handleSegmentKeys(event, ['actual', 'fit', 'fill'] as const, opts.fit, (next) => setOpts({ ...opts, fit: next }))}
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
            <div
              className="grid grid-cols-6 gap-1"
              role="group"
              aria-label={t('Margin presets')}
              aria-describedby="print-margin-preset-review-status"
              title={t('Use Left/Right arrows to switch options')}
              onKeyDown={(event) => handleSegmentKeys(event, MARGIN_PRESETS_MM.map(String), `${opts.marginMm}`, (next) => setOpts({ ...opts, marginMm: Number(next) }), (button) => setReviewedMarginPreset(button?.dataset.review ?? ''))}
            >
              <div id="print-margin-preset-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedMarginPreset || `${t('Margin')} ${opts.marginMm} mm`}`}
              </div>
              {MARGIN_PRESETS_MM.map((margin) => {
                const active = Math.abs(opts.marginMm - margin) < 0.001;
                const review = `${t('Margin')} ${margin} mm`;
                return (
                  <button
                    key={margin}
                    type="button"
                    data-value={`${margin}`}
                    data-review={review}
                    aria-pressed={active}
                    className={`h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
                    onFocus={(event) => setReviewedMarginPreset(event.currentTarget.dataset.review ?? '')}
                    onClick={() => setOpts({ ...opts, marginMm: margin })}
                    title={`${t('Set margin to')} ${margin} mm`}
                  >
                    {margin}
                  </button>
                );
              })}
            </div>
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
                <div
                  className="grid grid-cols-4 gap-1"
                  role="group"
                  aria-label={t('Print Prep presets')}
                  aria-describedby="print-prep-preset-review-status"
                  title={t('Use Left/Right arrows to switch options')}
                  onKeyDown={(event) => handleSegmentKeys(event, PRINT_PREP_PRESETS.map(preset => preset.label), PRINT_PREP_PRESETS.find((preset) => prep.bleedMm === preset.prep.bleedMm && prep.cropMarks === preset.prep.cropMarks && prep.registrationMarks === preset.prep.registrationMarks && prep.pageInfo === preset.prep.pageInfo)?.label ?? '', (next) => {
                    const preset = PRINT_PREP_PRESETS.find((item) => item.label === next);
                    if (preset) setPrep(preset.prep);
                  }, (button) => setReviewedPrepPreset(button?.dataset.review ?? ''))}
                >
                  <div id="print-prep-preset-review-status" className="sr-only" aria-live="polite">
                    {`${t('Reviewing')} ${reviewedPrepPreset || prepSummaryLabel}`}
                  </div>
                  {PRINT_PREP_PRESETS.map((preset) => {
                    const active = prep.bleedMm === preset.prep.bleedMm && prep.cropMarks === preset.prep.cropMarks && prep.registrationMarks === preset.prep.registrationMarks && prep.pageInfo === preset.prep.pageInfo;
                    const review = formatPrepPresetReview(preset);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        data-value={preset.label}
                        data-review={review}
                        className={`rounded-md border px-2 py-1 text-[10px] transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                        onFocus={(event) => setReviewedPrepPreset(event.currentTarget.dataset.review ?? '')}
                        onClick={() => setPrep(preset.prep)}
                        aria-pressed={active}
                        title={t(`${preset.label} settings`)}
                      >
                        {t(preset.label)}
                      </button>
                    );
                  })}
                </div>
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
                  <div
                    className="grid grid-cols-6 gap-1"
                    role="group"
                    aria-label={t('Bleed presets')}
                    aria-describedby="print-bleed-preset-review-status"
                    title={t('Use Left/Right arrows to switch options')}
                    onKeyDown={(event) => handleSegmentKeys(event, BLEED_PRESETS_MM.map(String), `${prep.bleedMm}`, (next) => setPrep({ ...prep, bleedMm: Number(next) }), (button) => setReviewedBleedPreset(button?.dataset.review ?? ''))}
                  >
                    <div id="print-bleed-preset-review-status" className="sr-only" aria-live="polite">
                      {`${t('Reviewing')} ${reviewedBleedPreset || `${t('Bleed')} ${prep.bleedMm} mm`}`}
                    </div>
                    {BLEED_PRESETS_MM.map((bleed) => {
                      const active = Math.abs(prep.bleedMm - bleed) < 0.001;
                      const review = `${t('Bleed')} ${bleed} mm`;
                      return (
                        <button
                          key={bleed}
                          type="button"
                          data-value={`${bleed}`}
                          data-review={review}
                          aria-pressed={active}
                          className={`h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
                          onFocus={(event) => setReviewedBleedPreset(event.currentTarget.dataset.review ?? '')}
                          onClick={() => setPrep({ ...prep, bleedMm: bleed })}
                          title={`${t('Set bleed to')} ${bleed} mm`}
                        >
                          {bleed}
                        </button>
                      );
                    })}
                  </div>
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

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Print output actions')}
          aria-describedby="print-output-action-review-status"
          title={t('Use Left/Right arrows to switch options')}
          onKeyDown={handleOutputActionKeys}
        >
          <span id="print-output-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedOutputAction || t('Print output actions')}`}
          </span>
          <button
            type="button"
            data-print-output-action
            data-print-output-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedOutputAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-print-output-action
            data-print-output-action-review={t('Reset print settings')}
            className="btn"
            onClick={resetPrintSettings}
            onFocus={() => setReviewedOutputAction(t('Reset print settings'))}
            title={t('Reset print settings')}
          >
            {t('Reset')}
          </button>
          <button
            type="button"
            data-print-output-action
            data-print-output-action-review="PDF"
            className="btn flex items-center gap-1"
            onClick={handlePDF}
            onFocus={() => setReviewedOutputAction('PDF')}
            title={t('Save as vector PDF (skips the system print dialog)')}
          ><FileText size={12} aria-hidden="true" /> PDF</button>
          <button
            type="button"
            data-print-output-action
            data-print-output-action-review={t('Print')}
            className="btn-primary flex items-center gap-1"
            onClick={handlePrint}
            onFocus={() => setReviewedOutputAction(t('Print'))}
          ><Printer size={12} aria-hidden="true" /> {t('Print')}</button>
        </div>
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
