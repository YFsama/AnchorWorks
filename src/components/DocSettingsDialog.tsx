import { useCallback, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useEditor } from '../store/editor';
import { resizeCanvas, setBackground, zoomFit } from '../lib/canvasEngine';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { ActionToolbar } from './ui/ActionToolbar';
import { ReviewedFooter } from './ui/ReviewedFooter';
import { SearchableListActions } from './ui/SearchableListActions';
import { actionReviewKey, makeRovingKeys, makeSegmentKeys, useReviewedAction } from './ui/useRovingActions';
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
  const [reviewedPresetSearchAction, setReviewedPresetSearchAction] = useReviewedAction();
  const [reviewedOrientation, setReviewedOrientation] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();
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

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-doc-settings-action]',
    reviewKey: actionReviewKey('data-doc-settings-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });
  const handlePresetSearchActionKeys = makeRovingKeys({
    selector: '[data-doc-preset-search-action]',
    reviewKey: actionReviewKey('data-doc-preset-search-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    wrap: true,
    setReview: setReviewedPresetSearchAction,
  });

  // Orientation is a mutual pair, not a roving row: arrows toggle the value,
  // Home/End map to portrait/landscape, review publishes synchronously, and
  // focus follows the new value on the next frame. makeSegmentKeys keeps that
  // exact contract (PrintDialog's orientation pair) with data-value buttons;
  // dialogMigrateDocSettings.test.tsx pins the frozen key traces.
  const handleOrientationKeys = makeSegmentKeys({
    values: ['portrait', 'landscape'] as const,
    current: landscape ? 'landscape' : 'portrait',
    apply: (next) => {
      const nextLandscape = next === 'landscape';
      applyPreset(presetId, nextLandscape);
      setReviewedOrientation(nextLandscape ? t('Landscape') : t('Portrait'));
    },
  });

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
              <SearchableListActions
                statusId="doc-preset-search-action-review-status"
                className="flex items-center gap-1.5 shrink-0"
                label={t('Document preset search actions')}
                title={t('Use arrow keys to review document preset search actions')}
                onKeyDown={handlePresetSearchActionKeys}
                reviewingLabel={t('Reviewing')}
                reviewed={reviewedPresetSearchAction}
                fallback={t('Document preset search actions')}
                actionAttr="data-doc-preset-search-action"
                setReviewed={setReviewedPresetSearchAction}
                first={{
                  label: t('Use First'),
                  review: t('Use first search result'),
                  title: t('Use first search result'),
                  className: 'text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline',
                  onActivate: () => { if (filteredPresets[0]) applyPreset(filteredPresets[0].id, landscape); },
                  disabled: filteredPresets.length === 0,
                }}
                clear={{
                  label: t('Clear search'),
                  review: t('Clear search'),
                  title: t('Clear search'),
                  className: 'text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0',
                  onActivate: () => setPresetSearch(''),
                }}
              />
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
          <ActionToolbar
            statusId="doc-orientation-review-status"
            className="flex gap-1"
            label={t('Document orientation')}
            title={t('Use arrow keys to switch orientation')}
            onKeyDown={handleOrientationKeys}
            statusAs="span"
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedOrientation}
            fallback={t('Document orientation')}
          >
            <OrientBtn id="doc-orientation-portrait" value="portrait" active={!landscape} onClick={() => { applyPreset(presetId, false); setReviewedOrientation(t('Portrait')); }} onFocus={() => setReviewedOrientation(t('Portrait'))} label={t('Portrait')} />
            <OrientBtn id="doc-orientation-landscape" value="landscape" active={landscape} onClick={() => { applyPreset(presetId, true); setReviewedOrientation(t('Landscape')); }} onFocus={() => setReviewedOrientation(t('Landscape'))} label={t('Landscape')} />
          </ActionToolbar>
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

        <ReviewedFooter
          statusId="doc-settings-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Document Settings actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Document Settings actions')}
          actionAttr="data-doc-settings-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset'), className: 'btn', onClick: resetSettings },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: apply },
          ]}
        />
      </div>
    </div>
  );
}

function OrientBtn({ id, value, active, onClick, onFocus, label }: { id: string; value: 'portrait' | 'landscape'; active: boolean; onClick: () => void; onFocus: () => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      data-value={value}
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
