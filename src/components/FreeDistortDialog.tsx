import { useCallback, useEffect, useState } from 'react';
import { X, Move3D } from 'lucide-react';
import { useEditor } from '../store/editor';
import { clearFreeDistortPreview, freeDistortSelection, updateFreeDistortPreview, type FreeDistortCorner, type FreeDistortCorners } from '../lib/freeDistort';
import { envelopeSelection } from '../lib/envelope';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

const MM_TO_PX = 3.7795;
const ZERO: FreeDistortCorners = { tl: [0, 0], tr: [0, 0], br: [0, 0], bl: [0, 0] };
const CORNERS: { id: FreeDistortCorner; label: string }[] = [
  { id: 'tl', label: 'TL' },
  { id: 'tr', label: 'TR' },
  { id: 'br', label: 'BR' },
  { id: 'bl', label: 'BL' },
];

const DISTORT_PRESETS: Array<{ label: string; corners: FreeDistortCorners; title: string }> = [
  { label: 'Left perspective', corners: { tl: [18, -16], tr: [0, 0], br: [0, 0], bl: [18, 16] }, title: 'Pull the left edge into a signboard perspective.' },
  { label: 'Right perspective', corners: { tl: [0, 0], tr: [-18, -16], br: [-18, 16], bl: [0, 0] }, title: 'Pull the right edge into a signboard perspective.' },
  { label: 'Skew', corners: { tl: [12, 0], tr: [12, 0], br: [-12, 0], bl: [-12, 0] }, title: 'Slant the artwork for italic, speed, or panel mockups.' },
  { label: 'Top taper', corners: { tl: [14, 8], tr: [-14, 8], br: [0, 0], bl: [0, 0] }, title: 'Narrow the top edge for overhead perspective.' },
  { label: 'Bottom taper', corners: { tl: [0, 0], tr: [0, 0], br: [-14, -8], bl: [14, -8] }, title: 'Narrow the bottom edge for floor or banner mockups.' },
  { label: 'Flag wave', corners: { tl: [0, -10], tr: [10, 6], br: [0, 10], bl: [-10, -6] }, title: 'Offset alternating corners for a quick waving panel.' },
];

function cloneCorners(corners: FreeDistortCorners): FreeDistortCorners {
  return { tl: [...corners.tl], tr: [...corners.tr], br: [...corners.br], bl: [...corners.bl] };
}

export function FreeDistortDialog() {
  const t = useT();
  const open = useEditor(s => s.showFreeDistort);
  const close = useCallback(() => { clearFreeDistortPreview(); useEditor.getState().setModal('showFreeDistort', false); }, []);
  const [corners, setCorners] = useState<FreeDistortCorners>(ZERO);
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();
  const activePreset = DISTORT_PRESETS.find((preset) => cornersEqual(corners, preset.corners))?.label ?? '';

  useEscapeClose(open, close);
  useFocusRestore(open);

  useEffect(() => {
    if (!open) { clearFreeDistortPreview(); return; }
    updateFreeDistortPreview(corners);
    return () => clearFreeDistortPreview();
  }, [open, corners]);

  if (!open) return null;

  const setCornerValue = (corner: FreeDistortCorner, axis: 0 | 1, valueMm: number) => {
    const next = cloneCorners(corners);
    next[corner][axis] = valueMm * MM_TO_PX;
    setCorners(next);
  };

  const apply = () => {
    clearFreeDistortPreview();
    const n = freeDistortSelection(corners);
    if (n > 0) toast.success(`${n} ${t('shapes distorted')}`, { title: t('Free Distort') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Free Distort') });
    close();
  };

  const applyTopObjectEnvelope = () => {
    void envelopeSelection().then((r) => {
      close();
      if (r && r.reshaped > 0) toast.success(`${r.reshaped} ${t('objects reshaped into the envelope')}${r.skipped > 0 ? ` · ${r.skipped} ${t('raster images skipped')}` : ''}`, { title: t('Envelope Distort') });
      else toast.warn(t('Select the artwork plus one vector shape on top (2+ objects) — the top-most object becomes the envelope.'), { title: t('Envelope Distort') });
    });
  };

  const applyPreset = (preset: { corners: FreeDistortCorners }) => setCorners(cloneCorners(preset.corners));

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-free-distort-preset-action]',
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (button) => {
      const preset = DISTORT_PRESETS[Number(button?.dataset.freeDistortPresetIndex ?? -1)];
      if (preset) applyPreset(preset);
    },
  });

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-free-distort-action]',
    reviewKey: actionReviewKey('data-free-distort-action'),
    fallbackToText: true,
    skipDisabled: true,
    guardEmpty: true,
    setReview: setReviewedFooterAction,
  });

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-distort-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[420px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="free-distort-title" className="dialog-title flex items-center gap-2">
            <Move3D size={14} aria-hidden="true" /> {t('Free Distort')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <p className="text-xs text-muted leading-relaxed mb-3">
          {t('Move each bounding-box corner to preview a four-corner envelope distortion, then apply it to path points.')}
        </p>

        <div className="mb-3">
          <div className="field-label !mb-1">{t('Distort presets')}</div>
          <PresetRow
            statusId="free-distort-preset-review-status"
            className="grid grid-cols-3 gap-1"
            label={t('Free Distort preset actions')}
            title={t('Use arrow keys to review free distort presets')}
            onKeyDown={handlePresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedPreset}
            fallback={t('Distort presets')}
            actionAttr="data-free-distort-preset-action"
            setReviewed={setReviewedPreset}
            items={DISTORT_PRESETS.map((preset) => {
              const active = activePreset === preset.label;
              const review = `${t(preset.label)}: ${t(preset.title)}`;
              return {
                key: preset.label,
                className: `btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
                pressed: active,
                onClick: () => applyPreset(preset),
                title: review,
                data: { 'free-distort-preset-index': DISTORT_PRESETS.indexOf(preset), review },
                children: t(preset.label),
              };
            })}
          />
        </div>

        <div className="grid grid-cols-[48px_1fr_1fr] gap-2 items-center text-xs">
          <div />
          <div className="field-label !mb-0">ΔX {t('(mm)')}</div>
          <div className="field-label !mb-0">ΔY {t('(mm)')}</div>
          {CORNERS.map(corner => (
            <div key={corner.id} className="contents">
              <div className="text-muted font-mono">{corner.label}</div>
              <input
                type="number"
                step={0.5}
                className="input-num"
                value={Math.round((corners[corner.id][0] / MM_TO_PX) * 10) / 10}
                onChange={(e) => setCornerValue(corner.id, 0, parseFloat(e.target.value) || 0)}
                aria-label={`${corner.label} X`}
              />
              <input
                type="number"
                step={0.5}
                className="input-num"
                value={Math.round((corners[corner.id][1] / MM_TO_PX) * 10) / 10}
                onChange={(e) => setCornerValue(corner.id, 1, parseFloat(e.target.value) || 0)}
                aria-label={`${corner.label} Y`}
              />
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <div className="field-label !mb-1">{t('Envelope (top object)')}</div>
          <p className="text-xs text-muted leading-relaxed mb-2">
            {t('Reshape the other selected objects to fill the top-most shape. The top object is consumed, as in Illustrator.')}
          </p>
          <button
            type="button"
            className="btn w-full"
            onClick={applyTopObjectEnvelope}
            title={t('Reshape the other selected objects to fill the top-most shape. The top object is consumed, as in Illustrator.')}
          >
            {t('Make with Top Object')}
          </button>
        </div>

        <ReviewedFooter
          statusId="free-distort-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Free Distort actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Free Distort actions')}
          actionAttr="data-free-distort-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Reset'), review: t('Reset'), className: 'btn', onClick: () => setCorners(ZERO) },
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: apply },
          ]}
        />
      </div>
    </div>
  );
}

function cornersEqual(a: FreeDistortCorners, b: FreeDistortCorners) {
  return CORNERS.every(({ id }) => Math.abs(a[id][0] - b[id][0]) < 0.001 && Math.abs(a[id][1] - b[id][1]) < 0.001);
}
