import { useCallback, useEffect, useState } from 'react';
import { X, Tornado } from 'lucide-react';
import { useEditor } from '../store/editor';
import { twistSelection } from '../lib/twist';
import { clearDistortPreview, updateDistortPreview } from '../lib/distortPreview';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { ReviewedFooter } from './ui/ReviewedFooter';

/**
 * Twist (Illustrator Effect→Distort & Transform→Twist) — swirl the selected
 * path/shape around its centre. Angle = the rotation at the outer edge (negative
 * twists the other way). Undoable, so the user can dial it in.
 */
export function TwistDialog() {
  const t = useT();
  const open = useEditor(s => s.showTwist);
  const close = useCallback(() => { clearDistortPreview(); useEditor.getState().setModal('showTwist', false); }, []);
  const [angle, setAngle] = useState(45);
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  const ANGLE_PRESETS = [-180, -90, -45, 0, 45, 90, 180];

  useEscapeClose(open, close);
  useFocusRestore(open);

  useEffect(() => {
    if (!open) { clearDistortPreview(); return; }
    updateDistortPreview({ kind: 'twist' as const, angleDeg: angle });
    return () => clearDistortPreview();
  }, [open, angle]);
  if (!open) return null;

  const apply = () => {
    clearDistortPreview();
    const n = twistSelection(angle);
    if (n > 0) toast.success(`${n} ${t('shapes twisted')}`, { title: t('Twist') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Twist') });
    close();
  };

  const resetSettings = () => {
    setAngle(0);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset'));
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-twist-action]',
    reviewKey: actionReviewKey('data-twist-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetKeys = makeRovingKeys({
    selector: '[data-twist-angle-preset]',
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (button) => {
      const nextAngle = Number(button?.dataset.twistAnglePreset);
      if (Number.isFinite(nextAngle)) setAngle(nextAngle);
    },
  });

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="twist-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="twist-title" className="dialog-title flex items-center gap-2">
            <Tornado size={14} aria-hidden="true" /> {t('Twist')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Angle')}</span><span className="text-ink tabular-nums">{angle}°</span></div>
          <input type="range" min={-360} max={360} step={1} value={angle} onChange={(e) => setAngle(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Angle')} />
        </label>

        <div className="mt-3">
          <div className="field-label">{t('Twist angle presets')}</div>
          <div
            className="grid grid-cols-4 gap-1"
            role="toolbar"
            aria-label={t('Twist angle preset actions')}
            aria-describedby="twist-preset-review-status"
            title={t('Use arrow keys to review twist angle presets')}
            onKeyDown={handlePresetKeys}
          >
            <div id="twist-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Twist angle presets')}`}
            </div>
            {ANGLE_PRESETS.map((preset) => {
              const review = `${t('Angle')} ${preset}°`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-twist-angle-preset={preset}
                  data-review={review}
                  className={angle === preset ? 'btn-primary' : 'btn'}
                  onClick={() => setAngle(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={angle === preset}
                  aria-label={`${t('Set twist angle to')} ${preset}°`}
                >
                  {preset}°
                </button>
              );
            })}
          </div>
        </div>

        <ReviewedFooter
          statusId="twist-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Twist actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Twist actions')}
          statusAs="div"
          actionAttr="data-twist-action"
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
