import { useCallback, useEffect, useState } from 'react';
import { X, Move3D } from 'lucide-react';
import { useEditor } from '../store/editor';
import { clearFreeDistortPreview, freeDistortSelection, updateFreeDistortPreview, type FreeDistortCorner, type FreeDistortCorners } from '../lib/freeDistort';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const MM_TO_PX = 3.7795;
const ZERO: FreeDistortCorners = { tl: [0, 0], tr: [0, 0], br: [0, 0], bl: [0, 0] };
const CORNERS: { id: FreeDistortCorner; label: string }[] = [
  { id: 'tl', label: 'TL' },
  { id: 'tr', label: 'TR' },
  { id: 'br', label: 'BR' },
  { id: 'bl', label: 'BL' },
];

const DISTORT_PRESETS: Array<{ label: string; corners: FreeDistortCorners; title: string }> = [
  { label: 'Left perspective', corners: { tl: [18, -16], tr: [0, 0], br: [0, 0], bl: [18, 16] }, title: 'Pull the left edge into a signboard perspective.' },
  { label: 'Right perspective', corners: { tl: [0, 0], tr: [-18, -16], br: [-18, 16], bl: [0, 0] }, title: 'Pull the right edge into a signboard perspective.' },
  { label: 'Skew', corners: { tl: [12, 0], tr: [12, 0], br: [-12, 0], bl: [-12, 0] }, title: 'Slant the artwork for italic, speed, or panel mockups.' },
  { label: 'Top taper', corners: { tl: [14, 8], tr: [-14, 8], br: [0, 0], bl: [0, 0] }, title: 'Narrow the top edge for overhead perspective.' },
  { label: 'Bottom taper', corners: { tl: [0, 0], tr: [0, 0], br: [-14, -8], bl: [14, -8] }, title: 'Narrow the bottom edge for floor or banner mockups.' },
  { label: 'Flag wave', corners: { tl: [0, -10], tr: [10, 6], br: [0, 10], bl: [-10, -6] }, title: 'Offset alternating corners for a quick waving panel.' },
];

function cloneCorners(corners: FreeDistortCorners): FreeDistortCorners {
  return { tl: [...corners.tl], tr: [...corners.tr], br: [...corners.br], bl: [...corners.bl] };
}

export function FreeDistortDialog() {
  const t = useT();
  const open = useEditor(s => s.showFreeDistort);
  const close = useCallback(() => { clearFreeDistortPreview(); useEditor.getState().setModal('showFreeDistort', false); }, []);
  const [corners, setCorners] = useState<FreeDistortCorners>(ZERO);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');
  const activePreset = DISTORT_PRESETS.find((preset) => cornersEqual(corners, preset.corners))?.label ?? '';

  useEscapeClose(open, close);
  useFocusRestore(open);

  useEffect(() => {
    if (!open) { clearFreeDistortPreview(); return; }
    updateFreeDistortPreview(corners);
    return () => clearFreeDistortPreview();
  }, [open, corners]);

  if (!open) return null;

  const setCornerValue = (corner: FreeDistortCorner, axis: 0 | 1, valueMm: number) => {
    const next = cloneCorners(corners);
    next[corner][axis] = valueMm * MM_TO_PX;
    setCorners(next);
  };

  const apply = () => {
    clearFreeDistortPreview();
    const n = freeDistortSelection(corners);
    if (n > 0) toast.success(`${n} ${t('shapes distorted')}`, { title: t('Free Distort') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Free Distort') });
    close();
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-free-distort-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const preset = DISTORT_PRESETS[Number(actions[nextIndex]?.dataset.freeDistortPresetIndex ?? -1)];
    if (preset) applyPreset(preset);
    requestAnimationFrame(() => {
      setReviewedPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-free-distort-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.freeDistortActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const applyPreset = (preset: { corners: FreeDistortCorners }) => setCorners(cloneCorners(preset.corners));

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-distort-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[420px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="free-distort-title" className="dialog-title flex items-center gap-2">
            <Move3D size={14} aria-hidden="true" /> {t('Free Distort')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <p className="text-xs text-muted leading-relaxed mb-3">
          {t('Move each bounding-box corner to preview a four-corner envelope distortion, then apply it to path points.')}
        </p>

        <div className="mb-3">
          <div className="field-label !mb-1">{t('Distort presets')}</div>
          <div
            className="grid grid-cols-3 gap-1"
            role="toolbar"
            aria-label={t('Free Distort preset actions')}
            aria-describedby="free-distort-preset-review-status"
            title={t('Use arrow keys to review free distort presets')}
            onKeyDown={handlePresetActionKeys}
          >
            <div id="free-distort-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Distort presets')}`}
            </div>
            {DISTORT_PRESETS.map((preset) => {
              const active = activePreset === preset.label;
              const review = `${t(preset.label)}: ${t(preset.title)}`;
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-free-distort-preset-action
                  data-free-distort-preset-index={DISTORT_PRESETS.indexOf(preset)}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onClick={() => applyPreset(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  title={review}
                >
                  {t(preset.label)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-[48px_1fr_1fr] gap-2 items-center text-xs">
          <div />
          <div className="field-label !mb-0">ΔX {t('(mm)')}</div>
          <div className="field-label !mb-0">ΔY {t('(mm)')}</div>
          {CORNERS.map(corner => (
            <div key={corner.id} className="contents">
              <div className="text-muted font-mono">{corner.label}</div>
              <input
                type="number"
                step={0.5}
                className="input-num"
                value={Math.round((corners[corner.id][0] / MM_TO_PX) * 10) / 10}
                onChange={(e) => setCornerValue(corner.id, 0, parseFloat(e.target.value) || 0)}
                aria-label={`${corner.label} X`}
              />
              <input
                type="number"
                step={0.5}
                className="input-num"
                value={Math.round((corners[corner.id][1] / MM_TO_PX) * 10) / 10}
                onChange={(e) => setCornerValue(corner.id, 1, parseFloat(e.target.value) || 0)}
                aria-label={`${corner.label} Y`}
              />
            </div>
          ))}
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Free Distort actions')}
          aria-describedby="free-distort-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="free-distort-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Free Distort actions')}`}
          </span>
          <button
            type="button"
            data-free-distort-action
            data-free-distort-action-review={t('Reset')}
            className="btn"
            onClick={() => setCorners(ZERO)}
            onFocus={() => setReviewedFooterAction(t('Reset'))}
          >
            {t('Reset')}
          </button>
          <button
            type="button"
            data-free-distort-action
            data-free-distort-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-free-distort-action
            data-free-distort-action-review={t('Apply')}
            className="btn-primary"
            onClick={apply}
            onFocus={() => setReviewedFooterAction(t('Apply'))}
          >
            {t('Apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

function cornersEqual(a: FreeDistortCorners, b: FreeDistortCorners) {
  return CORNERS.every(({ id }) => Math.abs(a[id][0] - b[id][0]) < 0.001 && Math.abs(a[id][1] - b[id][1]) < 0.001);
}
