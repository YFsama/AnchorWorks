import { useCallback, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { simplifySelection } from '../lib/pathSimplify';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Simplify Path — reduce a path's anchor count with a Douglas–Peucker tolerance
 * (Illustrator Object→Path→Simplify). Higher tolerance = fewer points. Apply is
 * undoable, so the user can dial the slider and re-apply to taste.
 */
const SIMPLIFY_PRESETS_PX = [0.5, 1, 1.5, 3, 5, 8];

export function SimplifyDialog() {
  const t = useT();
  const open = useEditor(s => s.showSimplify);
  const close = useCallback(() => useEditor.getState().setModal('showSimplify', false), []);
  const [tolerance, setTolerance] = useState(1.5);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = simplifySelection(tolerance);
    if (n > 0) toast.success(`${n} ${t('paths simplified')}`, { title: t('Simplify Path') });
    else toast.warn(t('Select one or more paths first.'), { title: t('Simplify Path') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-simplify-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.simplifyActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-simplify-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextTolerance = Number(actions[nextIndex]?.dataset.tolerance);
    if (Number.isFinite(nextTolerance)) setTolerance(nextTolerance);
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
      aria-labelledby="simplify-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="simplify-title" className="dialog-title flex items-center gap-2">
            <Spline size={14} aria-hidden="true" /> {t('Simplify Path')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block mb-2">
          <div className="field-label flex items-center justify-between">
            <span>{t('Tolerance (px)')}</span>
            <span className="text-ink tabular-nums">{tolerance.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0.5} max={10} step={0.1}
            value={tolerance}
            onChange={(e) => setTolerance(parseFloat(e.target.value))}
            className="w-full"
            aria-label={t('Tolerance (px)')}
          />
        </label>
        <div className="mb-2">
          <div className="field-label !mb-1">{t('Tolerance presets')}</div>
          <div
            className="grid grid-cols-6 gap-1"
            role="toolbar"
            aria-label={t('Tolerance preset actions')}
            aria-describedby="simplify-preset-review-status"
            title={t('Use arrow keys to review tolerance presets')}
            onKeyDown={handlePresetActionKeys}
          >
            <div id="simplify-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Tolerance presets')}`}
            </div>
            {SIMPLIFY_PRESETS_PX.map((value) => {
              const review = `${t('Tolerance (px)')} ${value}`;
              return (
                <button
                  key={value}
                  type="button"
                  data-simplify-preset-action
                  data-tolerance={value}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${tolerance === value ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onClick={() => setTolerance(value)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={tolerance === value}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[10px] text-muted leading-relaxed">
          {t('Higher tolerance removes more anchor points. Curves become straight segments.')}
        </p>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Simplify Path actions')}
          aria-describedby="simplify-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <div id="simplify-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Simplify Path actions')}`}
          </div>
          <button
            type="button"
            data-simplify-action
            data-simplify-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-simplify-action
            data-simplify-action-review={t('Apply')}
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
