import { useCallback, useState } from 'react';
import { X, Sun } from 'lucide-react';
import { useEditor } from '../store/editor';
import { brightnessColorsSelection } from '../lib/colorAdjust';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { ReviewedFooter } from './ui/ReviewedFooter';

/**
 * Adjust Brightness (Edit Colors) — lighten or darken the lightness of every
 * solid fill/stroke in the selection. −100% black, +100% doubles lightness.
 */
export function BrightnessDialog() {
  const t = useT();
  const open = useEditor(s => s.showBrightness);
  const close = useCallback(() => useEditor.getState().setModal('showBrightness', false), []);
  const [amount, setAmount] = useState(0);
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  const BRIGHTNESS_PRESETS = [-50, -25, 0, 25, 50];

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = brightnessColorsSelection(amount);
    if (n > 0) toast.success(`${n} ${t('colours changed')}`, { title: t('Adjust Brightness') });
    else toast.warn(t('Select an object with a solid colour first.'), { title: t('Adjust Brightness') });
    close();
  };

  const resetSettings = () => {
    setAmount(0);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset'));
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-brightness-action]',
    reviewKey: actionReviewKey('data-brightness-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetKeys = makeRovingKeys({
    selector: '[data-brightness-preset]',
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (button) => {
      const nextAmount = Number(button?.dataset.brightnessPreset);
      if (Number.isFinite(nextAmount)) setAmount(nextAmount);
    },
  });

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="brightness-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="brightness-title" className="dialog-title flex items-center gap-2">
            <Sun size={14} aria-hidden="true" /> {t('Adjust Brightness')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Brightness')}</span><span className="text-ink tabular-nums">{amount > 0 ? '+' : ''}{amount}%</span></div>
          <input type="range" min={-100} max={100} step={1} value={amount} onChange={(e) => setAmount(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Brightness')} />
        </label>

        <div className="mt-3">
          <div className="field-label">{t('Brightness presets')}</div>
          <div
            className="grid grid-cols-5 gap-1"
            role="toolbar"
            aria-label={t('Brightness preset actions')}
            aria-describedby="brightness-preset-review-status"
            title={t('Use arrow keys to review brightness presets')}
            onKeyDown={handlePresetKeys}
          >
            <div id="brightness-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Brightness presets')}`}
            </div>
            {BRIGHTNESS_PRESETS.map((preset) => {
              const review = `${t('Set brightness to')} ${preset > 0 ? '+' : ''}${preset}%`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-brightness-preset={preset}
                  data-review={review}
                  className={amount === preset ? 'btn-primary' : 'btn'}
                  onClick={() => setAmount(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={amount === preset}
                  aria-label={review}
                >
                  {preset > 0 ? '+' : ''}{preset}%
                </button>
              );
            })}
          </div>
        </div>

        <ReviewedFooter
          statusId="brightness-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Adjust Brightness actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Adjust Brightness actions')}
          statusAs="div"
          actionAttr="data-brightness-action"
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
