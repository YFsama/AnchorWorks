import { useCallback, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { offsetPathSelection } from '../lib/offsetPath';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

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
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = offsetPathSelection(offset);
    if (n > 0) toast.success(`${n} ${t('offset paths added')}`, { title: t('Offset Path') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Offset Path') });
    close();
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-offset-action]',
    reviewKey: actionReviewKey('data-offset-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-offset-preset-action]',
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (button) => {
      const nextOffset = Number(button?.dataset.offset);
      if (Number.isFinite(nextOffset)) setOffset(nextOffset);
    },
  });

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
          <PresetRow
            statusId="offset-preset-review-status"
            className="grid grid-cols-6 gap-1"
            label={t('Offset preset actions')}
            title={t('Use arrow keys to review offset presets')}
            onKeyDown={handlePresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedPreset}
            fallback={t('Offset presets')}
            actionAttr="data-offset-preset-action"
            setReviewed={setReviewedPreset}
            items={OFFSET_PRESETS_MM.map((value) => ({
              key: value,
              className: `btn !py-1 !px-1 !text-[10px] ${offset === value ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
              pressed: offset === value,
              onClick: () => setOffset(value),
              data: { offset: value, review: `${t('Offset (mm)')} ${value > 0 ? '+' : ''}${value}` },
              children: value > 0 ? `+${value}` : value,
            }))}
          />
        </div>
        <p className="text-[10px] text-muted leading-relaxed">
          {t('Positive offsets outward, negative inward. The original is kept.')}
        </p>

        <ReviewedFooter
          statusId="offset-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Offset Path actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Offset Path actions')}
          statusAs="div"
          actionAttr="data-offset-action"
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
