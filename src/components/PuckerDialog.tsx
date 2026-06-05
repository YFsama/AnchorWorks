import { useCallback, useEffect, useState } from 'react';
import { X, Star } from 'lucide-react';
import { useEditor } from '../store/editor';
import { puckerSelection } from '../lib/pucker';
import { clearDistortPreview, updateDistortPreview } from '../lib/distortPreview';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Pucker & Bloat (Illustrator Effect→Distort & Transform→Pucker & Bloat) — bow
 * the segments between anchors toward the centroid (pucker, negative) or away
 * from it (bloat, positive). A single signed amount drives both; undoable.
 */
export function PuckerDialog() {
  const t = useT();
  const open = useEditor(s => s.showPucker);
  const close = useCallback(() => { clearDistortPreview(); useEditor.getState().setModal('showPucker', false); }, []);
  const [amount, setAmount] = useState(0);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  const AMOUNT_PRESETS = [-75, -50, -25, 0, 25, 50, 75];

  useEscapeClose(open, close);
  useFocusRestore(open);

  useEffect(() => {
    if (!open) { clearDistortPreview(); return; }
    updateDistortPreview({ kind: 'pucker' as const, amount: amount / 100 });
    return () => clearDistortPreview();
  }, [open, amount]);
  if (!open) return null;

  const apply = () => {
    clearDistortPreview();
    const n = puckerSelection(amount / 100);
    if (n > 0) toast.success(`${n} ${t('shapes distorted')}`, { title: t('Pucker & Bloat') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Pucker & Bloat') });
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
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-pucker-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.puckerActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-pucker-amount-preset]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAmount = Number(actions[nextIndex]?.dataset.puckerAmountPreset);
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
      aria-labelledby="pucker-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="pucker-title" className="dialog-title flex items-center gap-2">
            <Star size={14} aria-hidden="true" /> {t('Pucker & Bloat')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between">
            <span>{amount < 0 ? t('Pucker') : t('Bloat')}</span>
            <span className="text-ink tabular-nums">{amount}%</span>
          </div>
          <input type="range" min={-100} max={100} step={1} value={amount} onChange={(e) => setAmount(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Pucker & Bloat')} />
          <div className="flex justify-between type-caption mt-0.5"><span>{t('Pucker')}</span><span>{t('Bloat')}</span></div>
        </label>

        <div className="mt-3">
          <div className="field-label">{t('Pucker / Bloat presets')}</div>
          <div
            className="grid grid-cols-4 gap-1"
            role="toolbar"
            aria-label={t('Pucker / Bloat preset actions')}
            aria-describedby="pucker-preset-review-status"
            title={t('Use arrow keys to review pucker and bloat presets')}
            onKeyDown={handlePresetKeys}
          >
            <div id="pucker-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Pucker / Bloat presets')}`}
            </div>
            {AMOUNT_PRESETS.map((preset) => {
              const review = `${preset < 0 ? t('Pucker') : t('Bloat')} ${preset > 0 ? '+' : ''}${preset}%`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-pucker-amount-preset={preset}
                  data-review={review}
                  className={amount === preset ? 'btn-primary' : 'btn'}
                  onClick={() => setAmount(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={amount === preset}
                  aria-label={`${t('Set pucker and bloat to')} ${preset > 0 ? '+' : ''}${preset}%`}
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
          aria-label={t('Pucker & Bloat actions')}
          aria-describedby="pucker-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <div id="pucker-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Pucker & Bloat actions')}`}
          </div>
          <button
            type="button"
            data-pucker-action
            data-pucker-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-pucker-action
            data-pucker-action-review={t('Reset')}
            className="btn"
            onClick={resetSettings}
            onFocus={() => setReviewedFooterAction(t('Reset'))}
          >
            {t('Reset')}
          </button>
          <button
            type="button"
            data-pucker-action
            data-pucker-action-review={t('Apply')}
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
