import { useCallback, useState } from 'react';
import { X, Blend as BlendIcon } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { blendSelection } from '../lib/blend';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const BLEND_STEP_PRESETS = [3, 5, 10, 20] as const;

/**
 * Blend (Illustrator Object→Blend) — insert N interpolated copies between the
 * two selected objects (position / scale / rotation / opacity / colour).
 */
export function BlendDialog() {
  const t = useT();
  const open = useEditor(s => s.showBlend);
  const close = useCallback(() => useEditor.getState().setModal('showBlend', false), []);
  const [steps, setSteps] = useState(5);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = async () => {
    if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) { toast.warn(t('Select two objects to blend.'), { title: t('Blend') }); return; }
    const n = await blendSelection(steps);
    if (n > 0) toast.success(`${n} ${t('blend steps added')}`, { title: t('Blend') });
    close();
  };

  const resetSettings = () => {
    setSteps(5);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset'));
  };

  const handleStepPresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-blend-step-preset-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    const value = Number(actions[nextIndex]?.dataset.value);
    if (Number.isFinite(value)) setSteps(value);
    requestAnimationFrame(() => {
      setReviewedPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-blend-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.blendActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="blend-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[300px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="blend-title" className="dialog-title flex items-center gap-2">
            <BlendIcon size={14} aria-hidden="true" /> {t('Blend')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block mb-2">
          <div className="field-label flex items-center justify-between">
            <span>{t('Steps')}</span>
            <span className="text-ink tabular-nums">{steps}</span>
          </div>
          <input
            type="range" min={1} max={50} step={1}
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value, 10))}
            className="w-full"
            aria-label={t('Steps')}
          />
        </label>

        <div className="mt-3">
          <div className="field-label !mb-1">{t('Blend step presets')}</div>
          <div
            className="grid grid-cols-4 gap-1"
            role="toolbar"
            aria-label={t('Blend step preset actions')}
            aria-describedby="blend-step-preset-review-status"
            title={t('Use arrow keys to review blend step presets')}
            onKeyDown={handleStepPresetKeys}
          >
            <div id="blend-step-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Blend step presets')}`}
            </div>
            {BLEND_STEP_PRESETS.map((preset) => {
              const active = steps === preset;
              const review = `${t('Set blend steps to')} ${preset}`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-blend-step-preset-action
                  data-review={review}
                  data-value={preset}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => setSteps(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  title={review}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Blend actions')}
          aria-describedby="blend-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <div id="blend-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Blend actions')}`}
          </div>
          <button
            type="button"
            data-blend-action
            data-blend-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-blend-action
            data-blend-action-review={t('Reset')}
            className="btn"
            onClick={resetSettings}
            onFocus={() => setReviewedFooterAction(t('Reset'))}
          >
            {t('Reset')}
          </button>
          <button
            type="button"
            data-blend-action
            data-blend-action-review={t('Apply')}
            className="btn-primary"
            onClick={() => { void apply(); }}
            onFocus={() => setReviewedFooterAction(t('Apply'))}
          >
            {t('Apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
