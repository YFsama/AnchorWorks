import { useCallback, useState } from 'react';
import { X, Droplet } from 'lucide-react';
import { useEditor } from '../store/editor';
import { saturateColorsSelection } from '../lib/colorAdjust';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Saturate (Illustrator Edit→Edit Colors→Saturate) — scale the saturation of
 * every solid fill/stroke in the selection. −100% greys it out, +100% doubles it.
 */
export function SaturateDialog() {
  const t = useT();
  const open = useEditor(s => s.showSaturate);
  const close = useCallback(() => useEditor.getState().setModal('showSaturate', false), []);
  const [amount, setAmount] = useState(0);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  const SATURATION_PRESETS = [-100, -50, 0, 50, 100];

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = saturateColorsSelection(amount);
    if (n > 0) toast.success(`${n} ${t('colours changed')}`, { title: t('Saturate') });
    else toast.warn(t('Select an object with a solid colour first.'), { title: t('Saturate') });
    close();
  };

  const resetSettings = () => {
    setAmount(0);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset'));
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-saturate-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.saturateActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-saturation-preset]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAmount = Number(actions[nextIndex]?.dataset.saturationPreset);
    if (Number.isFinite(nextAmount)) setAmount(nextAmount);
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
      aria-labelledby="saturate-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="saturate-title" className="dialog-title flex items-center gap-2">
            <Droplet size={14} aria-hidden="true" /> {t('Saturate')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Saturation')}</span><span className="text-ink tabular-nums">{amount > 0 ? '+' : ''}{amount}%</span></div>
          <input type="range" min={-100} max={100} step={1} value={amount} onChange={(e) => setAmount(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Saturation')} />
        </label>

        <div className="mt-3">
          <div className="field-label">{t('Saturation presets')}</div>
          <div
            className="grid grid-cols-5 gap-1"
            role="toolbar"
            aria-label={t('Saturation preset actions')}
            aria-describedby="saturation-preset-review-status"
            title={t('Use arrow keys to review saturation presets')}
            onKeyDown={handlePresetKeys}
          >
            <div id="saturation-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Saturation presets')}`}
            </div>
            {SATURATION_PRESETS.map((preset) => {
              const review = `${t('Set saturation to')} ${preset > 0 ? '+' : ''}${preset}%`;
              return (
              <button
                key={preset}
                type="button"
                data-saturation-preset={preset}
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

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Saturate actions')}
          aria-describedby="saturate-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <div id="saturate-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Saturate actions')}`}
          </div>
          <button
            type="button"
            data-saturate-action
            data-saturate-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-saturate-action
            data-saturate-action-review={t('Reset')}
            className="btn"
            onClick={resetSettings}
            onFocus={() => setReviewedFooterAction(t('Reset'))}
          >
            {t('Reset')}
          </button>
          <button
            type="button"
            data-saturate-action
            data-saturate-action-review={t('Apply')}
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
