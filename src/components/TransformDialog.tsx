import { useCallback, useState } from 'react';
import { X, Move3D } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { applyTransform } from '../lib/transformOps';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

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
  const [reviewedUnit, setReviewedUnit] = useState('');
  const [reviewedMoveMode, setReviewedMoveMode] = useState('');
  const [reviewedMovePreset, setReviewedMovePreset] = useState('');
  const [reviewedScalePreset, setReviewedScalePreset] = useState('');
  const [reviewedRotatePreset, setReviewedRotatePreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

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
    const ok = await applyTransform({ dx: mdx * k, dy: mdy * k, scale: scaleX / 100, scaleY: scaleY / 100, rotate, copy, each });
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
    setReviewedMoveMode(`${t('Move mode')} · ${t('XY')}`);
    setReviewedMovePreset(`${t('Move')} X 0 ${unit} · Y 0 ${unit}`);
    setReviewedScalePreset(`${t('Scale')} X 100% · Y 100%`);
    setReviewedRotatePreset(`${t('Rotate')} 0°`);
    setReviewedFooterAction(t('Reset transform settings'));
  };

  const handleMovePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-transform-move-preset-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    const value = Number(actions[nextIndex]?.dataset.value);
    if (Number.isFinite(value)) applyMovePreset(value);
    requestAnimationFrame(() => {
      setReviewedMovePreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleScalePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-transform-scale-preset-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    const value = Number(actions[nextIndex]?.dataset.value);
    if (Number.isFinite(value)) {
      setScaleX(value);
      if (linkScale) setScaleY(value);
    }
    requestAnimationFrame(() => {
      setReviewedScalePreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleRotatePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-transform-rotate-preset-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    const value = Number(actions[nextIndex]?.dataset.value);
    if (Number.isFinite(value)) setRotate(value);
    requestAnimationFrame(() => {
      setReviewedRotatePreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-transform-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.transformActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handleOptionKeys = (event: React.KeyboardEvent<HTMLDivElement>, selector: string, apply: (button: HTMLButtonElement) => void, review?: (button: HTMLButtonElement) => void) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(selector))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    event.preventDefault();
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    const button = actions[nextIndex];
    if (button) apply(button);
    requestAnimationFrame(() => {
      if (button) review?.(button);
      button?.focus();
    });
  };

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

        <div
          className="flex gap-1 mb-2"
          role="radiogroup"
          aria-label={t('Unit')}
          aria-describedby="transform-unit-review-status"
          title={t('Use arrow keys to switch transform units')}
          onKeyDown={(event) => handleOptionKeys(event, '[data-transform-unit-action]', (button) => {
            const nextUnit = button.dataset.unit as 'mm' | 'px' | undefined;
            if (nextUnit) setUnit(nextUnit);
          }, (button) => setReviewedUnit(button.dataset.review ?? ''))}
        >
          <div id="transform-unit-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedUnit || t('Unit')}`}
          </div>
          <button type="button" data-transform-unit-action data-unit="mm" data-review={`${t('Unit')} · mm`} role="radio" aria-checked={unit === 'mm'} className={unit === 'mm' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setUnit('mm')} onFocus={(event) => setReviewedUnit(event.currentTarget.dataset.review ?? '')}>mm</button>
          <button type="button" data-transform-unit-action data-unit="px" data-review={`${t('Unit')} · px`} role="radio" aria-checked={unit === 'px'} className={unit === 'px' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setUnit('px')} onFocus={(event) => setReviewedUnit(event.currentTarget.dataset.review ?? '')}>px</button>
        </div>

        <div
          className="flex gap-1 mb-2"
          role="radiogroup"
          aria-label={t('Move mode')}
          aria-describedby="transform-move-mode-review-status"
          title={t('Use arrow keys to switch move mode')}
          onKeyDown={(event) => handleOptionKeys(event, '[data-transform-move-mode-action]', (button) => {
            const nextMode = button.dataset.mode as 'xy' | 'polar' | undefined;
            if (nextMode) setMoveMode(nextMode);
          }, (button) => setReviewedMoveMode(button.dataset.review ?? ''))}
        >
          <div id="transform-move-mode-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedMoveMode || t('Move mode')}`}
          </div>
          <button type="button" data-transform-move-mode-action data-mode="xy" data-review={`${t('Move mode')} · ${t('XY')}`} role="radio" aria-checked={moveMode === 'xy'} className={moveMode === 'xy' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setMoveMode('xy')} onFocus={(event) => setReviewedMoveMode(event.currentTarget.dataset.review ?? '')}>{t('XY')}</button>
          <button type="button" data-transform-move-mode-action data-mode="polar" data-review={`${t('Move mode')} · ${t('Polar')}`} role="radio" aria-checked={moveMode === 'polar'} className={moveMode === 'polar' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setMoveMode('polar')} onFocus={(event) => setReviewedMoveMode(event.currentTarget.dataset.review ?? '')}>{t('Polar')}</button>
        </div>

        <div className="mb-2">
          <div className="field-label !mb-1">{t('Move presets')}</div>
          <div
            className="grid grid-cols-4 gap-1"
            role="toolbar"
            aria-label={t('Transform move preset actions')}
            aria-describedby="transform-move-preset-review-status"
            title={t('Use arrow keys to review transform move presets')}
            onKeyDown={handleMovePresetKeys}
          >
            <div id="transform-move-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedMovePreset || t('Move presets')}`}
            </div>
            {MOVE_PRESETS.map((preset) => {
              const active = moveMode === 'polar' ? dist === preset : dx === preset && dy === 0;
              const review = moveMode === 'polar'
                ? `${t('Distance')} ${preset} ${unit}`
                : `${t('Move')} X ${preset} ${unit} · Y 0 ${unit}`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-transform-move-preset-action
                  data-value={preset}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => applyMovePreset(preset)}
                  onFocus={(event) => setReviewedMovePreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  title={moveMode === 'polar' ? `${t('Set distance to')} ${preset} ${unit}` : `${t('Set move X to')} ${preset} ${unit}`}
                >
                  {preset}{unit}
                </button>
              );
            })}
          </div>
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
          <div
            className="grid grid-cols-4 gap-1"
            role="toolbar"
            aria-label={t('Transform scale preset actions')}
            aria-describedby="transform-scale-preset-review-status"
            title={t('Use arrow keys to review transform scale presets')}
            onKeyDown={handleScalePresetKeys}
          >
            <div id="transform-scale-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedScalePreset || t('Scale presets')}`}
            </div>
            {SCALE_PRESETS.map((preset) => {
              const active = scaleX === preset && (!linkScale || scaleY === preset);
              const review = linkScale
                ? `${t('Scale')} X ${preset}% · Y ${preset}%`
                : `${t('Scale')} X ${preset}%`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-transform-scale-preset-action
                  data-value={preset}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => { setScaleX(preset); if (linkScale) setScaleY(preset); }}
                  onFocus={(event) => setReviewedScalePreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  title={`${t('Set scale to')} ${preset}%`}
                >
                  {preset}%
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2">
          <div className="field-label !mb-1">{t('Rotate presets')}</div>
          <div
            className="grid grid-cols-6 gap-1"
            role="toolbar"
            aria-label={t('Transform rotate preset actions')}
            aria-describedby="transform-rotate-preset-review-status"
            title={t('Use arrow keys to review transform rotate presets')}
            onKeyDown={handleRotatePresetKeys}
          >
            <div id="transform-rotate-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedRotatePreset || t('Rotate presets')}`}
            </div>
            {ROTATE_PRESETS.map((preset) => {
              const active = rotate === preset;
              const review = `${t('Rotate')} ${preset > 0 ? '+' : ''}${preset}°`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-transform-rotate-preset-action
                  data-value={preset}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => setRotate(preset)}
                  onFocus={(event) => setReviewedRotatePreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  title={`${t('Set rotation to')} ${preset > 0 ? '+' : ''}${preset}°`}
                >
                  {preset > 0 ? '+' : ''}{preset}°
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          {t('Apply to a copy')}
        </label>
        <label className="flex items-center gap-2 mt-1 text-xs cursor-pointer" title={t('Pivot each object on its own centre instead of the selection centre.')}>
          <input type="checkbox" checked={each} onChange={(e) => setEach(e.target.checked)} />
          {t('Transform each')}
        </label>

        <div
          className="flex justify-end gap-2 mt-4"
          role="toolbar"
          aria-label={t('Transform actions')}
          aria-describedby="transform-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="transform-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Transform actions')}`}
          </span>
          <button type="button" data-transform-action data-transform-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-transform-action data-transform-action-review={t('Reset transform settings')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset transform settings'))} onClick={resetTransformSettings} title={t('Reset transform settings')}>{t('Reset')}</button>
          <button type="button" data-transform-action data-transform-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewedFooterAction(t('Apply'))} onClick={() => { void apply(); }}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
