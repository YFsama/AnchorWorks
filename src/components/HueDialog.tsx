import { useCallback, useState } from 'react';
import { X, Palette } from 'lucide-react';
import { useEditor } from '../store/editor';
import { shiftHueColorsSelection } from '../lib/colorAdjust';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Adjust Hue (Illustrator Edit→Edit Colors / Recolor hue wheel) — rotate the hue
 * of every solid fill/stroke in the selection by a signed number of degrees.
 */
export function HueDialog() {
  const t = useT();
  const open = useEditor(s => s.showHue);
  const close = useCallback(() => useEditor.getState().setModal('showHue', false), []);
  const [deg, setDeg] = useState(0);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  const HUE_PRESETS = [-180, -120, -60, 0, 60, 120, 180];

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = shiftHueColorsSelection(deg);
    if (n > 0) toast.success(`${n} ${t('colours changed')}`, { title: t('Adjust Hue') });
    else toast.warn(t('Select an object with a solid colour first.'), { title: t('Adjust Hue') });
    close();
  };

  const resetSettings = () => {
    setDeg(0);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset'));
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-hue-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.hueActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-hue-preset]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextDeg = Number(actions[nextIndex]?.dataset.huePreset);
    if (Number.isFinite(nextDeg)) setDeg(nextDeg);
    requestAnimationFrame(() => {
      setReviewedPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hue-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="hue-title" className="dialog-title flex items-center gap-2">
            <Palette size={14} aria-hidden="true" /> {t('Adjust Hue')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Hue shift')}</span><span className="text-ink tabular-nums">{deg > 0 ? '+' : ''}{deg}°</span></div>
          <input type="range" min={-180} max={180} step={1} value={deg} onChange={(e) => setDeg(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Hue shift')} />
        </label>

        <div className="mt-3">
          <div className="field-label">{t('Hue shift presets')}</div>
          <div
            className="grid grid-cols-4 gap-1"
            role="toolbar"
            aria-label={t('Hue shift preset actions')}
            aria-describedby="hue-preset-review-status"
            title={t('Use arrow keys to review hue shift presets')}
            onKeyDown={handlePresetKeys}
          >
            <div id="hue-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Hue shift presets')}`}
            </div>
            {HUE_PRESETS.map((preset) => {
              const review = `${t('Set hue shift to')} ${preset > 0 ? '+' : ''}${preset}°`;
              return (
              <button
                key={preset}
                type="button"
                data-hue-preset={preset}
                data-review={review}
                className={deg === preset ? 'btn-primary' : 'btn'}
                onClick={() => setDeg(preset)}
                onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                aria-pressed={deg === preset}
                aria-label={review}
              >
                {preset > 0 ? '+' : ''}{preset}°
              </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Adjust Hue actions')}
          aria-describedby="hue-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <div id="hue-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Adjust Hue actions')}`}
          </div>
          <button
            type="button"
            data-hue-action
            data-hue-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-hue-action
            data-hue-action-review={t('Reset')}
            className="btn"
            onClick={resetSettings}
            onFocus={() => setReviewedFooterAction(t('Reset'))}
          >
            {t('Reset')}
          </button>
          <button
            type="button"
            data-hue-action
            data-hue-action-review={t('Apply')}
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
