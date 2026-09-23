import { useCallback, useState } from 'react';
import { X, Italic } from 'lucide-react';
import { useEditor } from '../store/editor';
import { shearSelection } from '../lib/transformOps';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

const SHEAR_ANGLE_PRESETS = [-30, -15, 0, 15, 30] as const;

/**
 * Shear (Illustrator Object→Transform→Shear) — skew the selection by an angle
 * along the horizontal or vertical axis, about its centre.
 */
export function ShearDialog() {
  const t = useT();
  const open = useEditor(s => s.showShear);
  const close = useCallback(() => useEditor.getState().setModal('showShear', false), []);
  const [angle, setAngle] = useState(15);
  const [axis, setAxis] = useState<'horizontal' | 'vertical'>('horizontal');
  const [reviewedAnglePreset, setReviewedAnglePreset] = useReviewedAction();
  const [reviewedAxis, setReviewedAxis] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    if (shearSelection(angle, axis)) toast.success(t('Sheared'), { title: t('Shear') });
    else toast.warn(t('Select an object first.'), { title: t('Shear') });
    close();
  };

  const resetShearSettings = () => {
    setAngle(0);
    setAxis('horizontal');
    setReviewedAnglePreset(`${t('Shear angle')} 0°`);
    setReviewedAxis(`${t('Axis')} · ${t('Horizontal')}`);
    setReviewedFooterAction(t('Reset shear settings'));
  };

  const handleAnglePresetKeys = makeRovingKeys({
    selector: '[data-shear-angle-preset-action]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedAnglePreset,
    onNavigate: (button) => {
      const nextAngle = Number(button?.dataset.angle);
      if (Number.isFinite(nextAngle)) setAngle(nextAngle);
    },
  });

  const handleAxisKeys = makeRovingKeys({
    selector: '[data-shear-axis-action]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedAxis,
    onNavigate: (button) => {
      const nextAxis = button?.dataset.axis as 'horizontal' | 'vertical' | undefined;
      if (nextAxis) setAxis(nextAxis);
    },
  });

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-shear-action]',
    reviewKey: actionReviewKey('data-shear-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shear-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="shear-title" className="dialog-title flex items-center gap-2">
            <Italic size={14} aria-hidden="true" /> {t('Shear')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Shear angle')}</span><span className="text-ink tabular-nums">{angle > 0 ? '+' : ''}{angle}°</span></div>
          <input type="range" min={-85} max={85} step={1} value={angle} onChange={(e) => setAngle(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Shear angle')} />
        </label>

        <div className="mt-3">
          <div className="field-label !mb-1">{t('Shear angle presets')}</div>
          <PresetRow
            statusId="shear-angle-preset-review-status"
            className="grid grid-cols-5 gap-1"
            label={t('Shear angle preset actions')}
            title={t('Use arrow keys to review shear angle presets')}
            onKeyDown={handleAnglePresetKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedAnglePreset}
            fallback={t('Shear angle presets')}
            actionAttr="data-shear-angle-preset-action"
            setReviewed={setReviewedAnglePreset}
            items={SHEAR_ANGLE_PRESETS.map((preset) => ({
              key: preset,
              className: `btn !py-1 !px-1 !text-[10px] ${angle === preset ? 'ring-1 ring-accent' : ''}`,
              pressed: angle === preset,
              onClick: () => setAngle(preset),
              title: `${t('Set shear angle to')} ${preset > 0 ? '+' : ''}${preset}°`,
              data: { angle: preset, review: `${t('Shear angle')} ${preset > 0 ? '+' : ''}${preset}°` },
              children: <>{preset > 0 ? '+' : ''}{preset}°</>,
            }))}
          />
        </div>

        <div
          className="flex gap-1 mt-3"
          role="radiogroup"
          aria-label={t('Axis')}
          aria-describedby="shear-axis-review-status"
          title={t('Use arrow keys to switch shear axis')}
          onKeyDown={handleAxisKeys}
        >
          <div id="shear-axis-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedAxis || t('Axis')}`}
          </div>
          <button type="button" data-shear-axis-action data-axis="horizontal" data-review={`${t('Axis')} · ${t('Horizontal')}`} role="radio" aria-checked={axis === 'horizontal'} className={axis === 'horizontal' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setAxis('horizontal')} onFocus={(event) => setReviewedAxis(event.currentTarget.dataset.review ?? '')}>{t('Horizontal')}</button>
          <button type="button" data-shear-axis-action data-axis="vertical" data-review={`${t('Axis')} · ${t('Vertical')}`} role="radio" aria-checked={axis === 'vertical'} className={axis === 'vertical' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setAxis('vertical')} onFocus={(event) => setReviewedAxis(event.currentTarget.dataset.review ?? '')}>{t('Vertical')}</button>
        </div>

        <ReviewedFooter
          statusId="shear-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Shear actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Shear actions')}
          actionAttr="data-shear-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset shear settings'), className: 'btn', onClick: resetShearSettings, title: t('Reset shear settings') },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: apply },
          ]}
        />
      </div>
    </div>
  );
}
