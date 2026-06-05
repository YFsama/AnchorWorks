import { useCallback, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { roundCornersOnSelection } from '../lib/roundCorners';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Round Corners (Illustrator Effect→Stylize→Round Corners) — fillet the selected
 * path/shape corners by a radius (mm). Undoable, so the user can dial and retry.
 */
const RADIUS_PRESETS_MM = [1, 2, 3, 5, 10, 20];

export function RoundCornersDialog() {
  const t = useT();
  const open = useEditor(s => s.showRoundCorners);
  const close = useCallback(() => useEditor.getState().setModal('showRoundCorners', false), []);
  const [radius, setRadius] = useState(3);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = roundCornersOnSelection(radius);
    if (n > 0) toast.success(`${n} ${t('shapes rounded')}`, { title: t('Round Corners') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Round Corners') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-round-corners-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.roundCornersActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-round-corners-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextRadius = Number(actions[nextIndex]?.dataset.radius);
    if (Number.isFinite(nextRadius)) setRadius(nextRadius);
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
      aria-labelledby="round-corners-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="round-corners-title" className="dialog-title flex items-center gap-2">
            <Spline size={14} aria-hidden="true" /> {t('Round Corners')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block mb-2">
          <div className="field-label flex items-center justify-between">
            <span>{t('Radius (mm)')}</span>
            <span className="text-ink tabular-nums">{radius.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0.5} max={40} step={0.5}
            value={radius}
            onChange={(e) => setRadius(parseFloat(e.target.value))}
            className="w-full"
            aria-label={t('Radius (mm)')}
          />
        </label>
        <div className="mb-2">
          <div className="field-label !mb-1">{t('Radius presets')}</div>
          <div
            className="grid grid-cols-6 gap-1"
            role="toolbar"
            aria-label={t('Radius preset actions')}
            aria-describedby="round-corners-preset-review-status"
            title={t('Use arrow keys to review radius presets')}
            onKeyDown={handlePresetActionKeys}
          >
            <div id="round-corners-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Radius presets')}`}
            </div>
            {RADIUS_PRESETS_MM.map((value) => {
              const review = `${t('Radius (mm)')} ${value}`;
              return (
                <button
                  key={value}
                  type="button"
                  data-round-corners-preset-action
                  data-radius={value}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${radius === value ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onClick={() => setRadius(value)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={radius === value}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Round Corners actions')}
          aria-describedby="round-corners-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <div id="round-corners-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Round Corners actions')}`}
          </div>
          <button
            type="button"
            data-round-corners-action
            data-round-corners-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-round-corners-action
            data-round-corners-action-review={t('Apply')}
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
