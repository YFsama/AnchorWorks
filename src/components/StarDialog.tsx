import { useCallback, useState } from 'react';
import { X, Star } from 'lucide-react';
import { useEditor } from '../store/editor';
import { insertStar, insertRegularPolygon, insertSpiral } from '../lib/shapes';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

const SHAPE_PRESETS: Array<{ label: string; mode: 'star' | 'polygon'; points: number; ratio?: number }> = [
  { label: '5-point star', mode: 'star', points: 5, ratio: 0.45 },
  { label: '6-point star', mode: 'star', points: 6, ratio: 0.5 },
  { label: 'Triangle', mode: 'polygon', points: 3 },
  { label: 'Hexagon', mode: 'polygon', points: 6 },
];

const SPIRAL_PRESETS: Array<{ label: string; turns: number; decay: number }> = [
  { label: 'Gentle spiral', turns: 2, decay: 0.9 },
  { label: 'Standard spiral', turns: 3, decay: 0.8 },
  { label: 'Tight spiral', turns: 5, decay: 0.65 },
];

/**
 * Star / Polygon insert (Illustrator Star & Polygon tools) — drop a parametric
 * star (points + inner-radius ratio) or regular polygon centred on the document.
 */
export function StarDialog() {
  const t = useT();
  const open = useEditor(s => s.showStar);
  const close = useCallback(() => useEditor.getState().setModal('showStar', false), []);
  const [mode, setMode] = useState<'star' | 'polygon' | 'spiral'>('star');
  const [points, setPoints] = useState(5);
  const [ratio, setRatio] = useState(0.45);
  const [turns, setTurns] = useState(3);
  const [decay, setDecay] = useState(0.8);
  const [reviewedShapePreset, setReviewedShapePreset] = useReviewedAction();
  const [reviewedSpiralPreset, setReviewedSpiralPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const ok = mode === 'star' ? insertStar(points, ratio)
      : mode === 'polygon' ? insertRegularPolygon(points)
      : insertSpiral(turns, decay);
    if (ok) toast.success(t(mode === 'star' ? 'Star added' : mode === 'polygon' ? 'Polygon added' : 'Spiral added'), { title: t('Star / Polygon') });
    close();
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-star-action]',
    reviewKey: actionReviewKey('data-star-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const focusMode = (nextMode: typeof mode) => {
    setMode(nextMode);
    requestAnimationFrame(() => document.getElementById(`star-mode-${nextMode}`)?.focus());
  };

  const handleModeTabKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const modes: Array<typeof mode> = ['star', 'polygon', 'spiral'];
    const index = modes.indexOf(mode);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? modes.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + modes.length) % modes.length;
    focusMode(modes[nextIndex]);
  };

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-star-preset-action]',
    defer: true,
    setReview: setReviewedShapePreset,
    onNavigate: (button) => {
      const preset = SHAPE_PRESETS[Number(button?.dataset.starPresetIndex ?? -1)];
      if (preset) applyPreset(preset);
    },
  });

  const applyPreset = (preset: (typeof SHAPE_PRESETS)[number]) => {
    setMode(preset.mode);
    setPoints(preset.points);
    if (typeof preset.ratio === 'number') setRatio(preset.ratio);
  };

  const handleSpiralPresetActionKeys = makeRovingKeys({
    selector: '[data-spiral-preset-action]',
    defer: true,
    setReview: setReviewedSpiralPreset,
    onNavigate: (button) => {
      const preset = SPIRAL_PRESETS[Number(button?.dataset.spiralPresetIndex ?? -1)];
      if (preset) applySpiralPreset(preset);
    },
  });

  const applySpiralPreset = (preset: (typeof SPIRAL_PRESETS)[number]) => {
    setMode('spiral');
    setTurns(preset.turns);
    setDecay(preset.decay);
  };

  const resetShapeSettings = () => {
    const defaultPreset = SHAPE_PRESETS[0];
    applyPreset(defaultPreset);
    setReviewedShapePreset(`${t(defaultPreset.label)} · ${defaultPreset.points} ${t('Points')} · ${Math.round((defaultPreset.ratio ?? 0) * 100)}%`);
    setReviewedSpiralPreset('');
    setReviewedFooterAction(t('Reset shape settings'));
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="star-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="star-title" className="dialog-title flex items-center gap-2">
            <Star size={14} aria-hidden="true" /> {t('Star / Polygon')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div
          className="flex gap-1 mb-3"
          role="tablist"
          aria-label={t('Star / Polygon modes')}
          title={t('Use arrow keys to switch modes')}
          onKeyDown={handleModeTabKeys}
        >
          <button id="star-mode-star" type="button" role="tab" aria-selected={mode === 'star'} className={mode === 'star' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setMode('star')}>{t('Star')}</button>
          <button id="star-mode-polygon" type="button" role="tab" aria-selected={mode === 'polygon'} className={mode === 'polygon' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setMode('polygon')}>{t('Polygon')}</button>
          <button id="star-mode-spiral" type="button" role="tab" aria-selected={mode === 'spiral'} className={mode === 'spiral' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setMode('spiral')}>{t('Spiral')}</button>
        </div>

        <div className="mb-3">
          <div className="field-label !mb-1">{t('Shape presets')}</div>
          <PresetRow
            statusId="star-shape-preset-review-status"
            className="grid grid-cols-4 gap-1"
            label={t('Shape preset actions')}
            title={t('Use arrow keys to review shape presets')}
            onKeyDown={handlePresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedShapePreset}
            fallback={`${t(mode === 'star' ? 'Star' : mode === 'polygon' ? 'Polygon' : 'Spiral')} · ${mode === 'star' ? `${points} ${t('Points')} · ${Math.round(ratio * 100)}%` : mode === 'polygon' ? `${points} ${t('Sides')}` : `${turns} ${t('Winds')} · ${Math.round(decay * 100)}%`}`}
            actionAttr="data-star-preset-action"
            setReviewed={setReviewedShapePreset}
            items={SHAPE_PRESETS.map((preset) => {
              const active = mode === preset.mode && points === preset.points && (preset.mode === 'polygon' || Math.abs(ratio - (preset.ratio ?? ratio)) < 0.001);
              return {
                key: preset.label,
                className: `btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
                pressed: active,
                onClick: () => applyPreset(preset),
                title: preset.mode === 'star' ? `${t(preset.label)}: ${preset.points} ${t('Points')} / ${Math.round((preset.ratio ?? 0) * 100)}%` : `${t(preset.label)}: ${preset.points} ${t('Sides')}`,
                data: { 'star-preset-index': SHAPE_PRESETS.indexOf(preset), review: preset.mode === 'star'
                  ? `${t(preset.label)} · ${preset.points} ${t('Points')} · ${Math.round((preset.ratio ?? 0) * 100)}%`
                  : `${t(preset.label)} · ${preset.points} ${t('Sides')}` },
                children: t(preset.label),
              };
            })}
          />
        </div>

        {mode !== 'spiral' && (
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{mode === 'star' ? t('Points') : t('Sides')}</span><span className="text-ink tabular-nums">{points}</span></div>
            <input type="range" min={3} max={20} step={1} value={points} onChange={(e) => setPoints(parseInt(e.target.value, 10))} className="w-full" aria-label={mode === 'star' ? t('Points') : t('Sides')} />
          </label>
        )}

        {mode === 'star' && (
          <label className="block mt-2">
            <div className="field-label flex items-center justify-between"><span>{t('Inner radius')}</span><span className="text-ink tabular-nums">{Math.round(ratio * 100)}%</span></div>
            <input type="range" min={0.05} max={0.95} step={0.01} value={ratio} onChange={(e) => setRatio(parseFloat(e.target.value))} className="w-full" aria-label={t('Inner radius')} />
          </label>
        )}

        {mode === 'spiral' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <div className="field-label flex items-center justify-between"><span>{t('Winds')}</span><span className="text-ink tabular-nums">{turns}</span></div>
                <input type="range" min={1} max={10} step={1} value={turns} onChange={(e) => setTurns(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Winds')} />
              </label>
              <label className="block">
                <div className="field-label flex items-center justify-between"><span>{t('Decay')}</span><span className="text-ink tabular-nums">{Math.round(decay * 100)}%</span></div>
                <input type="range" min={0.1} max={0.99} step={0.01} value={decay} onChange={(e) => setDecay(parseFloat(e.target.value))} className="w-full" aria-label={t('Decay')} />
              </label>
            </div>
            <div className="mt-2">
              <div className="field-label !mb-1">{t('Spiral presets')}</div>
              <PresetRow
                statusId="star-spiral-preset-review-status"
                className="grid grid-cols-3 gap-1"
                label={t('Spiral preset actions')}
                title={t('Use arrow keys to review spiral presets')}
                onKeyDown={handleSpiralPresetActionKeys}
                reviewingLabel={t('Reviewing')}
                reviewed={reviewedSpiralPreset}
                fallback={`${turns} ${t('Winds')} · ${Math.round(decay * 100)}%`}
                actionAttr="data-spiral-preset-action"
                setReviewed={setReviewedSpiralPreset}
                items={SPIRAL_PRESETS.map((preset) => {
                  const active = turns === preset.turns && Math.abs(decay - preset.decay) < 0.001;
                  return {
                    key: preset.label,
                    className: `btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`,
                    pressed: active,
                    onClick: () => applySpiralPreset(preset),
                    title: `${t(preset.label)}: ${preset.turns} ${t('Winds')} / ${Math.round(preset.decay * 100)}%`,
                    data: { 'spiral-preset-index': SPIRAL_PRESETS.indexOf(preset), review: `${t(preset.label)} · ${preset.turns} ${t('Winds')} · ${Math.round(preset.decay * 100)}%` },
                    children: t(preset.label),
                  };
                })}
              />
            </div>
          </>
        )}

        <ReviewedFooter
          statusId="star-action-review-status"
          className="flex justify-end gap-2 mt-3"
          label={t('Star / Polygon actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Star / Polygon actions')}
          actionAttr="data-star-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset shape settings'), className: 'btn', onClick: resetShapeSettings, title: t('Reset shape settings') },
            { children: t('Insert'), review: t('Insert'), className: 'btn-primary', onClick: apply },
          ]}
        />
      </div>
    </div>
  );
}
