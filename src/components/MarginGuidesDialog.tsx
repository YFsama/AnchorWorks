import { useCallback, useState } from 'react';
import { X, SquareDashed } from 'lucide-react';
import { useEditor } from '../store/editor';
import { makeMarginGuides } from '../lib/canvasEngine';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

const MARGIN_PRESETS_MM = [0, 3, 5, 10, 15, 25];
const MARGIN_JOB_PRESETS: Array<{ label: string; margin: number; title: string }> = [
  { label: 'Trim edge', margin: 3, title: 'Small trim clearance for precise print cutting.' },
  { label: 'Sticker safe', margin: 5, title: 'Common decal safe area inside the cut edge.' },
  { label: 'Office print', margin: 10, title: 'Desktop printer safe area for non-printable margins.' },
  { label: 'Banner hem', margin: 25, title: 'Wide safe area for hems, grommets, and finishing.' },
];

/**
 * Margin Guides — drop a safe-area frame of ruler guides inset by a margin from
 * the first artboard's edges, for keeping artwork clear of the trim.
 */
export function MarginGuidesDialog() {
  const t = useT();
  const open = useEditor(s => s.showMarginGuides);
  const close = useCallback(() => useEditor.getState().setModal('showMarginGuides', false), []);
  const [margin, setMargin] = useState(10);
  const [reviewedJobPreset, setReviewedJobPreset] = useReviewedAction();
  const [reviewedMarginPreset, setReviewedMarginPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();
  const activeJobPreset = MARGIN_JOB_PRESETS.find((preset) => Math.abs(margin - preset.margin) < 0.001)?.label ?? '';

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = makeMarginGuides(margin);
    if (n > 0) toast.success(`${n} ${t('guides added')}`, { title: t('Margin Guides') });
    else toast.warn(t('Margin too large or no artboard.'), { title: t('Margin Guides') });
    close();
  };

  const resetMarginGuideSettings = () => {
    const stickerSafe = MARGIN_JOB_PRESETS[1];
    setMargin(stickerSafe.margin);
    setReviewedJobPreset(`${t(stickerSafe.label)}: ${t(stickerSafe.title)} ${stickerSafe.margin} mm`);
    setReviewedMarginPreset(`${t('Set margin to')} ${stickerSafe.margin} mm`);
    setReviewedFooterAction(t('Reset margin guide settings'));
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-margin-guides-action]',
    reviewKey: actionReviewKey('data-margin-guides-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-margin-guides-preset-action]',
    defer: true,
    setReview: setReviewedMarginPreset,
    onNavigate: (button) => {
      const nextMargin = Number(button?.dataset.margin);
      if (Number.isFinite(nextMargin)) setMargin(nextMargin);
    },
  });

  const handleJobPresetActionKeys = makeRovingKeys({
    selector: '[data-margin-guides-job-preset-action]',
    defer: true,
    setReview: setReviewedJobPreset,
    onNavigate: (button) => {
      const nextMargin = Number(button?.dataset.margin);
      if (Number.isFinite(nextMargin)) setMargin(nextMargin);
    },
  });

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="margin-guides-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[300px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="margin-guides-title" className="dialog-title flex items-center gap-2">
            <SquareDashed size={14} aria-hidden="true" /> {t('Margin Guides')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label">{t('Margin (mm)')}</div>
          <input type="number" min={0} step={0.5} autoFocus value={margin} onChange={(e) => setMargin(Math.max(0, +e.target.value || 0))} className="input-num w-full" aria-label={t('Margin (mm)')} />
        </label>
        <div className="mt-2">
          <div className="field-label !mb-1">{t('Margin guide recipes')}</div>
          <PresetRow
            statusId="margin-guides-job-preset-review-status"
            className="grid grid-cols-2 gap-1"
            label={t('Margin guide recipe actions')}
            title={t('Use arrow keys to review margin guide recipes')}
            onKeyDown={handleJobPresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedJobPreset}
            fallback={t('Margin guide recipes')}
            actionAttr="data-margin-guides-job-preset-action"
            setReviewed={setReviewedJobPreset}
            items={MARGIN_JOB_PRESETS.map((preset) => {
              const active = activeJobPreset === preset.label;
              const review = `${t(preset.label)}: ${t(preset.title)} ${preset.margin} mm`;
              return {
                key: preset.label,
                className: `btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
                pressed: active,
                onClick: () => setMargin(preset.margin),
                title: review,
                data: { margin: preset.margin, review },
                children: t(preset.label),
              };
            })}
          />
        </div>
        <div className="mt-2">
          <div className="field-label !mb-1">{t('Margin presets')}</div>
          <PresetRow
            statusId="margin-guides-preset-review-status"
            className="grid grid-cols-6 gap-1"
            label={t('Margin preset actions')}
            title={t('Use arrow keys to review margin presets')}
            onKeyDown={handlePresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedMarginPreset}
            fallback={t('Margin presets')}
            actionAttr="data-margin-guides-preset-action"
            setReviewed={setReviewedMarginPreset}
            items={MARGIN_PRESETS_MM.map((preset) => {
              const active = Math.abs(margin - preset) < 0.001;
              const review = `${t('Set margin to')} ${preset} mm`;
              return {
                key: preset,
                className: `h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`,
                pressed: active,
                onClick: () => setMargin(preset),
                title: review,
                data: { margin: preset, review },
                children: preset,
              };
            })}
          />
        </div>

        <ReviewedFooter
          statusId="margin-guides-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Margin Guides actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Margin Guides actions')}
          actionAttr="data-margin-guides-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset margin guide settings'), className: 'btn', onClick: resetMarginGuideSettings, title: t('Reset margin guide settings') },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: apply },
          ]}
        />
      </div>
    </div>
  );
}
