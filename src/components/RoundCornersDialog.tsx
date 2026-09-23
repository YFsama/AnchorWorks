import { useCallback, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { roundCornersOnSelection } from '../lib/roundCorners';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

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
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = roundCornersOnSelection(radius);
    if (n > 0) toast.success(`${n} ${t('shapes rounded')}`, { title: t('Round Corners') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Round Corners') });
    close();
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-round-corners-action]',
    reviewKey: actionReviewKey('data-round-corners-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-round-corners-preset-action]',
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (button) => {
      const nextRadius = Number(button?.dataset.radius);
      if (Number.isFinite(nextRadius)) setRadius(nextRadius);
    },
  });

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
          <PresetRow
            statusId="round-corners-preset-review-status"
            className="grid grid-cols-6 gap-1"
            label={t('Radius preset actions')}
            title={t('Use arrow keys to review radius presets')}
            onKeyDown={handlePresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedPreset}
            fallback={t('Radius presets')}
            actionAttr="data-round-corners-preset-action"
            setReviewed={setReviewedPreset}
            items={RADIUS_PRESETS_MM.map((value) => ({
              key: value,
              className: `btn !py-1 !px-1 !text-[10px] ${radius === value ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
              pressed: radius === value,
              onClick: () => setRadius(value),
              data: { radius: value, review: `${t('Radius (mm)')} ${value}` },
              children: value,
            }))}
          />
        </div>

        <ReviewedFooter
          statusId="round-corners-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Round Corners actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Round Corners actions')}
          statusAs="div"
          actionAttr="data-round-corners-action"
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
