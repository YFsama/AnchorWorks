import { useCallback, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { offsetPathSelection } from '../lib/offsetPath';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Offset Path (Illustrator Object→Path→Offset Path) — add a parallel copy of the
 * selection offset by a distance (positive = outward, negative = inward). The
 * original is kept.
 */
const OFFSET_PRESETS_MM = [-2, -1, 1, 2, 3, 5];

export function OffsetPathDialog() {
  const t = useT();
  const open = useEditor(s => s.showOffsetPath);
  const close = useCallback(() => useEditor.getState().setModal('showOffsetPath', false), []);
  const [offset, setOffset] = useState(2);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = offsetPathSelection(offset);
    if (n > 0) toast.success(`${n} ${t('offset paths added')}`, { title: t('Offset Path') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Offset Path') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-offset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.offsetActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-offset-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextOffset = Number(actions[nextIndex]?.dataset.offset);
    if (Number.isFinite(nextOffset)) setOffset(nextOffset);
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
      aria-labelledby="offset-path-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="offset-path-title" className="dialog-title flex items-center gap-2">
            <Spline size={14} aria-hidden="true" /> {t('Offset Path')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block mb-1">
          <div className="field-label">{t('Offset (mm)')}</div>
          <input
            type="number" step={0.5} className="input-num"
            value={offset}
            onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
          />
        </label>
        <div className="mb-2">
          <div className="field-label !mb-1">{t('Offset presets')}</div>
          <div
            className="grid grid-cols-6 gap-1"
            role="toolbar"
            aria-label={t('Offset preset actions')}
            aria-describedby="offset-preset-review-status"
            title={t('Use arrow keys to review offset presets')}
            onKeyDown={handlePresetActionKeys}
          >
            <div id="offset-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Offset presets')}`}
            </div>
            {OFFSET_PRESETS_MM.map((value) => {
              const review = `${t('Offset (mm)')} ${value > 0 ? '+' : ''}${value}`;
              return (
                <button
                  key={value}
                  type="button"
                  data-offset-preset-action
                  data-offset={value}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${offset === value ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onClick={() => setOffset(value)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={offset === value}
                >
                  {value > 0 ? `+${value}` : value}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[10px] text-muted leading-relaxed">
          {t('Positive offsets outward, negative inward. The original is kept.')}
        </p>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Offset Path actions')}
          aria-describedby="offset-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <div id="offset-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Offset Path actions')}`}
          </div>
          <button
            type="button"
            data-offset-action
            data-offset-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-offset-action
            data-offset-action-review={t('Apply')}
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
