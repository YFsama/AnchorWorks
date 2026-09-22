import { useCallback, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { simplifySelection } from '../lib/pathSimplify';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

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
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = simplifySelection(tolerance);
    if (n > 0) toast.success(`${n} ${t('paths simplified')}`, { title: t('Simplify Path') });
    else toast.warn(t('Select one or more paths first.'), { title: t('Simplify Path') });
    close();
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-simplify-action]',
    reviewKey: actionReviewKey('data-simplify-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-simplify-preset-action]',
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (button) => {
      const nextTolerance = Number(button?.dataset.tolerance);
      if (Number.isFinite(nextTolerance)) setTolerance(nextTolerance);
    },
  });

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
          <PresetRow
            statusId="simplify-preset-review-status"
            className="grid grid-cols-6 gap-1"
            label={t('Tolerance preset actions')}
            title={t('Use arrow keys to review tolerance presets')}
            onKeyDown={handlePresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedPreset}
            fallback={t('Tolerance presets')}
            actionAttr="data-simplify-preset-action"
            setReviewed={setReviewedPreset}
            items={SIMPLIFY_PRESETS_PX.map((value) => ({
              key: value,
              className: `btn !py-1 !px-1 !text-[10px] ${tolerance === value ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
              pressed: tolerance === value,
              onClick: () => setTolerance(value),
              data: { tolerance: value, review: `${t('Tolerance (px)')} ${value}` },
              children: value,
            }))}
          />
        </div>
        <p className="text-[10px] text-muted leading-relaxed">
          {t('Higher tolerance removes more anchor points. Curves become straight segments.')}
        </p>

        <ReviewedFooter
          statusId="simplify-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Simplify Path actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Simplify Path actions')}
          statusAs="div"
          actionAttr="data-simplify-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: apply },
          ]}
        />
      </div>
    </div>
  );
}
