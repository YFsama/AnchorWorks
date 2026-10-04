import { useCallback, useState } from 'react';
import { X, Move3D } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { applyTransform } from '../lib/transformOps';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

const MOVE_PRESETS = [1, 5, 10, 25] as const;
const SCALE_PRESETS = [50, 100, 150, 200] as const;
const ROTATE_PRESETS = [-90, -45, 0, 45, 90, 180] as const;

/**
 * Numeric Transform (Illustrator Object→Transform) — move / scale / rotate the
 * selection by exact values, optionally to a copy. Scale + rotate pivot on the
 * selection centre; move is applied after.
 */
export function TransformDialog() {
  const t = useT();
  const open = useEditor(s => s.showTransform);
  const close = useCallback(() => useEditor.getState().setModal('showTransform', false), []);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [scaleX, setScaleX] = useState(100);
  const [scaleY, setScaleY] = useState(100);
  // Linked = uniform scale (the previous behaviour); unlink for non-uniform.
  const [linkScale, setLinkScale] = useState(true);
  const [rotate, setRotate] = useState(0);
  const setSX = (v: number) => { const n = Math.max(1, v || 100); setScaleX(n); if (linkScale) setScaleY(n); };
  const setSY = (v: number) => { const n = Math.max(1, v || 100); setScaleY(n); if (linkScale) setScaleX(n); };
  const [copy, setCopy] = useState(false);
  const [each, setEach] = useState(false);
  const [scaleStrokesEffects, setScaleStrokesEffects] = useState(false);
  // Move can be entered as X/Y or polar distance+angle (Illustrator's Move
  // dialog). Angle is Illustrator-style: 0° = right, 90° = up.
  const [moveMode, setMoveMode] = useState<'xy' | 'polar'>('xy');
  const [dist, setDist] = useState(0);
  const [angle, setAngle] = useState(0);
  // Unit is the shared document unit (store) so the Transform dialog, inspector,
  // rulers and status bar always agree; toggling here flips them all.
  const unit = useEditor(s => s.dimUnit);
  const setUnit = useEditor(s => s.setDimUnit);
  const k = unit === 'mm' ? 3.7795 : 1;
  const [reviewedUnit, setReviewedUnit] = useReviewedAction();
  const [reviewedMoveMode, setReviewedMoveMode] = useReviewedAction();
  const [reviewedMovePreset, setReviewedMovePreset] = useReviewedAction();
  const [reviewedScalePreset, setReviewedScalePreset] = useReviewedAction();
  const [reviewedRotatePreset, setReviewedRotatePreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = async () => {
    if (!getCanvas()?.getActiveObject()) { toast.warn(t('Select something to transform.'), { title: t('Transform') }); return; }
    // Resolve the move into X/Y (in the active unit). Screen Y grows downward,
    // so a positive (up) angle negates the Y component.
    const rad = (angle * Math.PI) / 180;
    const mdx = moveMode === 'polar' ? dist * Math.cos(rad) : dx;
    const mdy = moveMode === 'polar' ? -dist * Math.sin(rad) : dy;
    const ok = await applyTransform({ dx: mdx * k, dy: mdy * k, scale: scaleX / 100, scaleY: scaleY / 100, rotate, copy, each, scaleStrokesEffects });
    if (ok) toast.success(copy ? t('Transformed copy') : t('Transformed'), { title: t('Transform') });
    close();
  };

  const applyMovePreset = (value: number) => {
    if (moveMode === 'polar') setDist(value);
    else {
      setDx(value);
      setDy(0);
    }
  };

  const resetTransformSettings = () => {
    setDx(0);
    setDy(0);
    setDist(0);
    setAngle(0);
    setMoveMode('xy');
    setScaleX(100);
    setScaleY(100);
    setLinkScale(true);
    setRotate(0);
    setCopy(false);
    setEach(false);
    setScaleStrokesEffects(false);
    setReviewedMoveMode(`${t('Move mode')} · ${t('XY')}`);
    setReviewedMovePreset(`${t('Move')} X 0 ${unit} · Y 0 ${unit}`);
    setReviewedScalePreset(`${t('Scale')} X 100% · Y 100%`);
    setReviewedRotatePreset(`${t('Rotate')} 0°`);
    setReviewedFooterAction(t('Reset transform settings'));
  };

  const handleMovePresetKeys = makeRovingKeys({
    selector: '[data-transform-move-preset-action]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedMovePreset,
    onNavigate: (button) => {
      const value = Number(button?.dataset.value);
      if (Number.isFinite(value)) applyMovePreset(value);
    },
  });

  const handleScalePresetKeys = makeRovingKeys({
    selector: '[data-transform-scale-preset-action]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedScalePreset,
    onNavigate: (button) => {
      const value = Number(button?.dataset.value);
      if (Number.isFinite(value)) {
        setScaleX(value);
        if (linkScale) setScaleY(value);
      }
    },
  });

  const handleRotatePresetKeys = makeRovingKeys({
    selector: '[data-transform-rotate-preset-action]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedRotatePreset,
    onNavigate: (button) => {
      const value = Number(button?.dataset.value);
      if (Number.isFinite(value)) setRotate(value);
    },
  });

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-transform-action]',
    reviewKey: actionReviewKey('data-transform-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handleUnitKeys = makeRovingKeys({
    selector: '[data-transform-unit-action]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedUnit,
    onNavigate: (button) => {
      const nextUnit = button?.dataset.unit as 'mm' | 'px' | undefined;
      if (nextUnit) setUnit(nextUnit);
    },
  });

  const handleMoveModeKeys = makeRovingKeys({
    selector: '[data-transform-move-mode-action]',
    skipDisabled: true,
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedMoveMode,
    onNavigate: (button) => {
      const nextMode = button?.dataset.mode as 'xy' | 'polar' | undefined;
      if (nextMode) setMoveMode(nextMode);
    },
  });

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transform-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="transform-title" className="dialog-title flex items-center gap-2">
            <Move3D size={14} aria-hidden="true" /> {t('Transform')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        {/* Radiogroups are kit rows: PresetItem(radio) members inside a
            role="radiogroup" ActionToolbar. The keydown handler stays the
            focus-roving makeRovingKeys shape (not makeSegmentKeys): these
            groups index from the focused button, so arrows still wrap,
            apply the value, and review it exactly like the hand-rolled
            version. */}
        <PresetRow
          statusId="transform-unit-review-status"
          className="flex gap-1 mb-2"
          role="radiogroup"
          label={t('Unit')}
          title={t('Use arrow keys to switch transform units')}
          onKeyDown={handleUnitKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedUnit}
          fallback={t('Unit')}
          actionAttr="data-transform-unit-action"
          setReviewed={setReviewedUnit}
          items={[
            { key: 'mm', radio: true, pressed: unit === 'mm', className: unit === 'mm' ? 'btn-primary flex-1' : 'btn flex-1', onClick: () => setUnit('mm'), data: { unit: 'mm', review: `${t('Unit')} · mm` }, children: 'mm' },
            { key: 'px', radio: true, pressed: unit === 'px', className: unit === 'px' ? 'btn-primary flex-1' : 'btn flex-1', onClick: () => setUnit('px'), data: { unit: 'px', review: `${t('Unit')} · px` }, children: 'px' },
          ]}
        />

        <PresetRow
          statusId="transform-move-mode-review-status"
          className="flex gap-1 mb-2"
          role="radiogroup"
          label={t('Move mode')}
          title={t('Use arrow keys to switch move mode')}
          onKeyDown={handleMoveModeKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedMoveMode}
          fallback={t('Move mode')}
          actionAttr="data-transform-move-mode-action"
          setReviewed={setReviewedMoveMode}
          items={[
            { key: 'xy', radio: true, pressed: moveMode === 'xy', className: moveMode === 'xy' ? 'btn-primary flex-1' : 'btn flex-1', onClick: () => setMoveMode('xy'), data: { mode: 'xy', review: `${t('Move mode')} · ${t('XY')}` }, children: t('XY') },
            { key: 'polar', radio: true, pressed: moveMode === 'polar', className: moveMode === 'polar' ? 'btn-primary flex-1' : 'btn flex-1', onClick: () => setMoveMode('polar'), data: { mode: 'polar', review: `${t('Move mode')} · ${t('Polar')}` }, children: t('Polar') },
          ]}
        />

        <div className="mb-2">
          <div className="field-label !mb-1">{t('Move presets')}</div>
          <PresetRow
            statusId="transform-move-preset-review-status"
            className="grid grid-cols-4 gap-1"
            label={t('Transform move preset actions')}
            title={t('Use arrow keys to review transform move presets')}
            onKeyDown={handleMovePresetKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedMovePreset}
            fallback={t('Move presets')}
            actionAttr="data-transform-move-preset-action"
            setReviewed={setReviewedMovePreset}
            items={MOVE_PRESETS.map((preset) => {
              const active = moveMode === 'polar' ? dist === preset : dx === preset && dy === 0;
              return {
                key: preset,
                className: `btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`,
                pressed: active,
                onClick: () => applyMovePreset(preset),
                title: moveMode === 'polar' ? `${t('Set distance to')} ${preset} ${unit}` : `${t('Set move X to')} ${preset} ${unit}`,
                data: { value: preset, review: moveMode === 'polar'
                  ? `${t('Distance')} ${preset} ${unit}`
                  : `${t('Move')} X ${preset} ${unit} · Y 0 ${unit}` },
                children: <>{preset}{unit}</>,
              };
            })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {moveMode === 'xy' ? (
            <>
              <Field label={`${t('Move')} X (${unit})`}>
                <input type="number" className="input-num" value={dx} onChange={(e) => setDx(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label={`${t('Move')} Y (${unit})`}>
                <input type="number" className="input-num" value={dy} onChange={(e) => setDy(parseFloat(e.target.value) || 0)} />
              </Field>
            </>
          ) : (
            <>
              <Field label={`${t('Distance')} (${unit})`}>
                <input type="number" className="input-num" value={dist} onChange={(e) => setDist(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label={`${t('Angle')} (°)`}>
                <input type="number" step={1} className="input-num" value={angle} onChange={(e) => setAngle(parseFloat(e.target.value) || 0)} />
              </Field>
            </>
          )}
          <Field label={`${t('Scale')} X (%)`}>
            <input type="number" min={1} step={1} className="input-num" value={scaleX} onChange={(e) => setSX(parseFloat(e.target.value))} />
          </Field>
          <Field label={`${t('Scale')} Y (%)`}>
            <input type="number" min={1} step={1} className="input-num" value={scaleY} onChange={(e) => setSY(parseFloat(e.target.value))} />
          </Field>
          <Field label={`${t('Rotate')} (°)`}>
            <input type="number" step={1} className="input-num" value={rotate} onChange={(e) => setRotate(parseFloat(e.target.value) || 0)} />
          </Field>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer self-end pb-2" title={t('Scale X and Y together')}>
            <input type="checkbox" checked={linkScale} onChange={(e) => { setLinkScale(e.target.checked); if (e.target.checked) setScaleY(scaleX); }} />
            {t('Link scale')}
          </label>
        </div>

        <div className="mt-2">
          <div className="field-label !mb-1">{t('Scale presets')}</div>
          <PresetRow
            statusId="transform-scale-preset-review-status"
            className="grid grid-cols-4 gap-1"
            label={t('Transform scale preset actions')}
            title={t('Use arrow keys to review transform scale presets')}
            onKeyDown={handleScalePresetKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedScalePreset}
            fallback={t('Scale presets')}
            actionAttr="data-transform-scale-preset-action"
            setReviewed={setReviewedScalePreset}
            items={SCALE_PRESETS.map((preset) => {
              const active = scaleX === preset && (!linkScale || scaleY === preset);
              return {
                key: preset,
                className: `btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`,
                pressed: active,
                onClick: () => { setScaleX(preset); if (linkScale) setScaleY(preset); },
                title: `${t('Set scale to')} ${preset}%`,
                data: { value: preset, review: linkScale
                  ? `${t('Scale')} X ${preset}% · Y ${preset}%`
                  : `${t('Scale')} X ${preset}%` },
                children: <>{preset}%</>,
              };
            })}
          />
        </div>

        <div className="mt-2">
          <div className="field-label !mb-1">{t('Rotate presets')}</div>
          <PresetRow
            statusId="transform-rotate-preset-review-status"
            className="grid grid-cols-6 gap-1"
            label={t('Transform rotate preset actions')}
            title={t('Use arrow keys to review transform rotate presets')}
            onKeyDown={handleRotatePresetKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedRotatePreset}
            fallback={t('Rotate presets')}
            actionAttr="data-transform-rotate-preset-action"
            setReviewed={setReviewedRotatePreset}
            items={ROTATE_PRESETS.map((preset) => {
              const active = rotate === preset;
              return {
                key: preset,
                className: `btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`,
                pressed: active,
                onClick: () => setRotate(preset),
                title: `${t('Set rotation to')} ${preset > 0 ? '+' : ''}${preset}°`,
                data: { value: preset, review: `${t('Rotate')} ${preset > 0 ? '+' : ''}${preset}°` },
                children: <>{preset > 0 ? '+' : ''}{preset}°</>,
              };
            })}
          />
        </div>

        <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          {t('Apply to a copy')}
        </label>
        <label className="flex items-center gap-2 mt-1 text-xs cursor-pointer" title={t('Pivot each object on its own centre instead of the selection centre.')}>
          <input type="checkbox" checked={each} onChange={(e) => setEach(e.target.checked)} />
          {t('Transform each')}
        </label>
        <label className="flex items-center gap-2 mt-1 text-xs cursor-pointer" title={t('Scale stroke widths and drop shadows with the object.')}>
          <input type="checkbox" checked={scaleStrokesEffects} onChange={(e) => setScaleStrokesEffects(e.target.checked)} />
          {t('Scale Strokes & Effects')}
        </label>

        <ReviewedFooter
          statusId="transform-action-review-status"
          className="flex justify-end gap-2 mt-4"
          label={t('Transform actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Transform actions')}
          actionAttr="data-transform-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset transform settings'), className: 'btn', onClick: resetTransformSettings, title: t('Reset transform settings') },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: () => { void apply(); } },
          ]}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
