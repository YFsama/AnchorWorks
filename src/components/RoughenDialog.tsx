import { useCallback, useEffect, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { roughenSelection } from '../lib/roughen';
import { clearDistortPreview, updateDistortPreview } from '../lib/distortPreview';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { ReviewedFooter } from './ui/ReviewedFooter';

/**
 * Roughen (Illustrator Effect→Distort→Roughen) — jitter the selected path/shape
 * for a hand-drawn / distressed edge. Size = max displacement, Detail = point
 * spacing. Undoable, so the user can dial and re-roll.
 */
export function RoughenDialog() {
  const t = useT();
  const open = useEditor(s => s.showRoughen);
  const close = useCallback(() => { clearDistortPreview(); useEditor.getState().setModal('showRoughen', false); }, []);
  const [size, setSize] = useState(1);
  const [detail, setDetail] = useState(3);
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  const ROUGHEN_PRESETS = [
    { id: 'smooth', label: t('Smooth'), size: 0.5, detail: 6 },
    { id: 'hand', label: t('Hand-drawn'), size: 1.5, detail: 4 },
    { id: 'distress', label: t('Distressed'), size: 3, detail: 2 },
    { id: 'rugged', label: t('Rugged'), size: 5, detail: 1 },
  ];

  useEscapeClose(open, close);
  useFocusRestore(open);

  useEffect(() => {
    if (!open) { clearDistortPreview(); return; }
    updateDistortPreview({ kind: 'roughen' as const, sizeMm: size, detailMm: detail });
    return () => clearDistortPreview();
  }, [open, size, detail]);
  if (!open) return null;

  const apply = () => {
    clearDistortPreview();
    const n = roughenSelection(size, detail);
    if (n > 0) toast.success(`${n} ${t('shapes roughened')}`, { title: t('Roughen') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Roughen') });
    close();
  };

  const resetSettings = () => {
    setSize(1);
    setDetail(3);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset'));
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-roughen-action]',
    reviewKey: actionReviewKey('data-roughen-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetKeys = makeRovingKeys({
    selector: '[data-roughen-preset]',
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (button) => {
      const nextPreset = ROUGHEN_PRESETS.find((preset) => preset.id === button?.dataset.roughenPreset);
      if (nextPreset) applyPreset(nextPreset);
    },
  });

  const applyPreset = (preset: typeof ROUGHEN_PRESETS[number]) => {
    setSize(preset.size);
    setDetail(preset.detail);
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="roughen-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="roughen-title" className="dialog-title flex items-center gap-2">
            <Spline size={14} aria-hidden="true" /> {t('Roughen')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Size (mm)')}</span><span className="text-ink tabular-nums">{size.toFixed(1)}</span></div>
            <input type="range" min={0.1} max={10} step={0.1} value={size} onChange={(e) => setSize(parseFloat(e.target.value))} className="w-full" aria-label={t('Size (mm)')} />
          </label>
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Detail (mm)')}</span><span className="text-ink tabular-nums">{detail.toFixed(1)}</span></div>
            <input type="range" min={0.5} max={20} step={0.5} value={detail} onChange={(e) => setDetail(parseFloat(e.target.value))} className="w-full" aria-label={t('Detail (mm)')} />
          </label>
        </div>

        <div className="mt-3">
          <div className="field-label">{t('Roughen presets')}</div>
          <div
            className="grid grid-cols-2 gap-1"
            role="toolbar"
            aria-label={t('Roughen preset actions')}
            aria-describedby="roughen-preset-review-status"
            title={t('Use arrow keys to review roughen presets')}
            onKeyDown={handlePresetKeys}
          >
            <div id="roughen-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Roughen presets')}`}
            </div>
            {ROUGHEN_PRESETS.map((preset) => {
              const active = size === preset.size && detail === preset.detail;
              const review = `${preset.label} · ${t('Size (mm)')} ${preset.size} · ${t('Detail (mm)')} ${preset.detail}`;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-roughen-preset={preset.id}
                  data-review={review}
                  className={active ? 'btn-primary' : 'btn'}
                  onClick={() => applyPreset(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  aria-label={`${t('Apply roughen preset')} ${preset.label}: ${t('Size (mm)')} ${preset.size}, ${t('Detail (mm)')} ${preset.detail}`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <ReviewedFooter
          statusId="roughen-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Roughen actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Roughen actions')}
          statusAs="div"
          actionAttr="data-roughen-action"
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
