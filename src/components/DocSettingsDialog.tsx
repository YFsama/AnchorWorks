import { useCallback, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { resizeCanvas, setBackground, zoomFit } from '../lib/canvasEngine';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import {
  PAPER_PRESETS, CATEGORY_LABELS, type PaperCategory,
  presetToPx, matchPreset, pxToMm,
} from '../lib/paperSizes';

const CATEGORY_ORDER: PaperCategory[] = ['print', 'card', 'sticker', 'screen'];

export function DocSettingsDialog() {
  const t = useT();
  const open = useEditor(s => s.showDocSettings);
  const close = useCallback(() => useEditor.getState().setModal('showDocSettings', false), []);
  const doc = useEditor(s => s.doc);
  const setDoc = useEditor(s => s.setDoc);

  // Preset selection is local UI state — the source of truth stays the px
  // width/height on `doc`. We seed the dropdown by reverse-matching the
  // current size so re-opening the dialog reflects reality instead of
  // snapping back to "Custom".
  const [presetId, setPresetId] = useState<string>('custom');
  const [landscape, setLandscape] = useState(false);
  const [presetSearch, setPresetSearch] = useState('');
  const [reviewedPresetSearchAction, setReviewedPresetSearchAction] = useState('');
  const [reviewedOrientation, setReviewedOrientation] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');
  const presetSelectRef = useRef<HTMLSelectElement>(null);
  const [initialDoc, setInitialDoc] = useState(() => ({ ...doc }));

  // Re-seed the dropdown from the current size exactly once per open
  // transition. React's documented "adjust state when a prop changes"
  // pattern: store the previous `open` in state and reconcile during
  // render — no effect (which would fight the user on every width tweak)
  // and no ref access.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setInitialDoc({ ...doc });
      const m = matchPreset(doc.width, doc.height, doc.dpi);
      setPresetId(m?.id ?? 'custom');
      setLandscape(m?.landscape ?? doc.width > doc.height);
    }
  }

  const normalizedPresetSearch = presetSearch.trim().toLowerCase();
  const filteredPresets = useMemo(() => {
    if (!normalizedPresetSearch) return PAPER_PRESETS;
    return PAPER_PRESETS.filter((preset) => [
      preset.label,
      t(preset.label),
      preset.id,
      preset.unit,
      `${preset.w}×${preset.h}`,
      `${preset.w}x${preset.h}`,
      CATEGORY_LABELS[preset.category],
      t(CATEGORY_LABELS[preset.category]),
    ].some((value) => value.toLowerCase().includes(normalizedPresetSearch)));
  }, [normalizedPresetSearch, t]);
  const selectedPresetHidden = presetId !== 'custom' && !filteredPresets.some((preset) => preset.id === presetId);
  const selectedPreset = selectedPresetHidden ? PAPER_PRESETS.find((preset) => preset.id === presetId) : null;

  // Escape closes — capture phase mirrors HelpCenter/AIPanel/Shortcuts pattern.
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;

  const applyPreset = (id: string, land: boolean) => {
    setPresetId(id);
    setLandscape(land);
    if (id === 'custom') return;
    const preset = PAPER_PRESETS.find(p => p.id === id);
    if (!preset) return;
    const { width, height } = presetToPx(preset, doc.dpi, land);
    setDoc({ width, height });
  };

  // Live mm readout so the user understands the physical print size of
  // whatever px dimensions are in the fields. Screen presets render a large
  // mm figure (1080px ≈ huge at 96dpi) — that's expected and harmless.
  const wMm = pxToMm(doc.width, doc.dpi);
  const hMm = pxToMm(doc.height, doc.dpi);

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-doc-settings-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.docSettingsActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };
  const handlePresetSearchActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-doc-preset-search-action]'))
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
    setReviewedPresetSearchAction(nextAction?.dataset.docPresetSearchActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const focusOrientation = (nextLandscape: boolean) => {
    applyPreset(presetId, nextLandscape);
    setReviewedOrientation(nextLandscape ? t('Landscape') : t('Portrait'));
    requestAnimationFrame(() => document.getElementById(nextLandscape ? 'doc-orientation-landscape' : 'doc-orientation-portrait')?.focus());
  };

  const handleOrientationKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextLandscape = event.key === 'Home'
      ? false
      : event.key === 'End'
        ? true
        : !landscape;
    focusOrientation(nextLandscape);
  };

  const apply = () => {
    resizeCanvas(doc.width, doc.height);
    setBackground(doc.background);
    zoomFit();
    close();
  };

  const resetSettings = () => {
    setDoc(initialDoc);
    const m = matchPreset(initialDoc.width, initialDoc.height, initialDoc.dpi);
    setPresetId(m?.id ?? 'custom');
    setLandscape(m?.landscape ?? initialDoc.width > initialDoc.height);
    setPresetSearch('');
    setReviewedPresetSearchAction('');
    setReviewedOrientation('');
    setReviewedFooterAction(t('Reset'));
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-settings-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[380px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="doc-settings-title" className="dialog-title">{t('Document Settings')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <Field label={t('Preset size')}>
          <div className="input-num mb-1 flex items-center gap-1.5 px-2 py-1 focus-within:border-accent2">
            <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
            <input
              type="search"
              className="flex-1 bg-transparent outline-none text-xs text-ink placeholder:text-muted/70 min-w-0"
              placeholder={t('Search preset sizes…')}
              value={presetSearch}
              onChange={(e) => setPresetSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && filteredPresets[0]) {
                  e.preventDefault();
                  applyPreset(filteredPresets[0].id, landscape);
                  return;
                }
                if (e.key === 'ArrowDown' && filteredPresets[0]) {
                  e.preventDefault();
                  presetSelectRef.current?.focus();
                  return;
                }
                if (e.key === 'Escape' && presetSearch) {
                  e.preventDefault();
                  e.stopPropagation();
                  setPresetSearch('');
                }
              }}
              aria-label={t('Search preset sizes…')}
              title={`${t('Press Enter to use first search result')} · ${t('Press Arrow Down to focus preset list')}`}
            />
            <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
              {normalizedPresetSearch ? `${filteredPresets.length} / ${PAPER_PRESETS.length} ${t('matches')}` : `${PAPER_PRESETS.length} ${t('presets')}`}
            </span>
            {presetSearch && (
              <div
                className="flex items-center gap-1.5 shrink-0"
                role="toolbar"
                aria-label={t('Document preset search actions')}
                aria-describedby="doc-preset-search-action-review-status"
                title={t('Use arrow keys to review document preset search actions')}
                onKeyDown={handlePresetSearchActionKeys}
              >
                <span id="doc-preset-search-action-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedPresetSearchAction || t('Document preset search actions')}`}
                </span>
                <button
                  type="button"
                  className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline"
                  data-doc-preset-search-action
                  data-doc-preset-search-action-review={t('Use first search result')}
                  onClick={() => { if (filteredPresets[0]) applyPreset(filteredPresets[0].id, landscape); }}
                  onFocus={() => setReviewedPresetSearchAction(t('Use first search result'))}
                  disabled={filteredPresets.length === 0}
                  title={t('Use first search result')}
                >
                  {t('Use First')}
                </button>
                <button
                  type="button"
                  className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0"
                  data-doc-preset-search-action
                  data-doc-preset-search-action-review={t('Clear search')}
                  onClick={() => setPresetSearch('')}
                  onFocus={() => setReviewedPresetSearchAction(t('Clear search'))}
                  title={t('Clear search')}
                >
                  {t('Clear search')}
                </button>
              </div>
            )}
          </div>
          <select
            ref={presetSelectRef}
            className="input-num"
            value={presetId}
            onChange={(e) => applyPreset(e.target.value, landscape)}
            title={t('Preset size')}
          >
            <option value="custom">{t('Custom')}</option>
            {selectedPreset && <option value={selectedPreset.id}>{t(selectedPreset.label)}</option>}
            {CATEGORY_ORDER.map(cat => {
              const presets = filteredPresets.filter(p => p.category === cat);
              if (presets.length === 0) return null;
              return (
                <optgroup key={cat} label={t(CATEGORY_LABELS[cat])}>
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{t(p.label)}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {normalizedPresetSearch && filteredPresets.length === 0 && (
            <div className="type-caption mt-1 flex flex-col items-start gap-2">
              <span>{t('No preset sizes found.')}</span>
              <button
                type="button"
                className="btn !py-1 !px-2 text-[10px]"
                onClick={() => setPresetSearch('')}
              >
                {t('Clear search')}
              </button>
            </div>
          )}
        </Field>

        {/* Orientation — disabled for square / custom where it's a no-op. */}
        <Field label={t('Orientation')}>
          <div
            className="flex gap-1"
            role="toolbar"
            aria-label={t('Document orientation')}
            aria-describedby="doc-orientation-review-status"
            title={t('Use arrow keys to switch orientation')}
            onKeyDown={handleOrientationKeys}
          >
            <span id="doc-orientation-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedOrientation || t('Document orientation')}`}
            </span>
            <OrientBtn id="doc-orientation-portrait" active={!landscape} onClick={() => { applyPreset(presetId, false); setReviewedOrientation(t('Portrait')); }} onFocus={() => setReviewedOrientation(t('Portrait'))} label={t('Portrait')} />
            <OrientBtn id="doc-orientation-landscape" active={landscape} onClick={() => { applyPreset(presetId, true); setReviewedOrientation(t('Landscape')); }} onFocus={() => setReviewedOrientation(t('Landscape'))} label={t('Landscape')} />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Width (px)')}>
            <input
              type="number" className="input-num" value={doc.width}
              onChange={(e) => { setDoc({ width: +e.target.value }); setPresetId('custom'); }}
            />
          </Field>
          <Field label={t('Height (px)')}>
            <input
              type="number" className="input-num" value={doc.height}
              onChange={(e) => { setDoc({ height: +e.target.value }); setPresetId('custom'); }}
            />
          </Field>
        </div>

        {/* Physical-size readout — the bridge between px authoring and the
            print/cut workflow that thinks in millimetres. */}
        <div className="text-[10px] text-muted -mt-1 mb-2 tabular-nums">
          ≈ {wMm.toFixed(1)} × {hMm.toFixed(1)} mm @ {doc.dpi} DPI
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('DPI')}>
            <input
              type="number" className="input-num" value={doc.dpi}
              onChange={(e) => setDoc({ dpi: +e.target.value })}
            />
          </Field>
          <Field label={t('Background')}>
            <input
              type="color"
              value={doc.background}
              onChange={(e) => setDoc({ background: e.target.value })}
              className="input-num p-0.5 h-7 w-full cursor-pointer"
              aria-label={t('Background')}
            />
          </Field>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Document Settings actions')}
          aria-describedby="doc-settings-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="doc-settings-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Document Settings actions')}`}
          </span>
          <button type="button" data-doc-settings-action data-doc-settings-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-doc-settings-action data-doc-settings-action-review={t('Reset')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset'))} onClick={resetSettings}>{t('Reset')}</button>
          <button type="button" data-doc-settings-action data-doc-settings-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewedFooterAction(t('Apply'))} onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}

function OrientBtn({ id, active, onClick, onFocus, label }: { id: string; active: boolean; onClick: () => void; onFocus: () => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      onFocus={onFocus}
      aria-pressed={active}
      className={`flex-1 px-2 py-1 rounded-sm border text-xs transition-colors ${
        active ? 'border-[#ff2e9a] text-ink bg-panel2' : 'border-border text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
