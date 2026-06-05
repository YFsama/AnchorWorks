import { useCallback, useState } from 'react';
import { X, Italic } from 'lucide-react';
import { useEditor } from '../store/editor';
import { shearSelection } from '../lib/transformOps';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const SHEAR_ANGLE_PRESETS = [-30, -15, 0, 15, 30] as const;

/**
 * Shear (Illustrator Object→Transform→Shear) — skew the selection by an angle
 * along the horizontal or vertical axis, about its centre.
 */
export function ShearDialog() {
  const t = useT();
  const open = useEditor(s => s.showShear);
  const close = useCallback(() => useEditor.getState().setModal('showShear', false), []);
  const [angle, setAngle] = useState(15);
  const [axis, setAxis] = useState<'horizontal' | 'vertical'>('horizontal');
  const [reviewedAnglePreset, setReviewedAnglePreset] = useState('');
  const [reviewedAxis, setReviewedAxis] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    if (shearSelection(angle, axis)) toast.success(t('Sheared'), { title: t('Shear') });
    else toast.warn(t('Select an object first.'), { title: t('Shear') });
    close();
  };

  const resetShearSettings = () => {
    setAngle(0);
    setAxis('horizontal');
    setReviewedAnglePreset(`${t('Shear angle')} 0°`);
    setReviewedAxis(`${t('Axis')} · ${t('Horizontal')}`);
    setReviewedFooterAction(t('Reset shear settings'));
  };

  const handleAnglePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-shear-angle-preset-action]'))
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
    const nextAngle = Number(actions[nextIndex]?.dataset.angle);
    if (Number.isFinite(nextAngle)) setAngle(nextAngle);
    requestAnimationFrame(() => {
      setReviewedAnglePreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleAxisKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-shear-axis-action]'))
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
    const nextAxis = actions[nextIndex]?.dataset.axis as 'horizontal' | 'vertical' | undefined;
    if (nextAxis) setAxis(nextAxis);
    requestAnimationFrame(() => {
      setReviewedAxis(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-shear-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.shearActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shear-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="shear-title" className="dialog-title flex items-center gap-2">
            <Italic size={14} aria-hidden="true" /> {t('Shear')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Shear angle')}</span><span className="text-ink tabular-nums">{angle > 0 ? '+' : ''}{angle}°</span></div>
          <input type="range" min={-85} max={85} step={1} value={angle} onChange={(e) => setAngle(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Shear angle')} />
        </label>

        <div className="mt-3">
          <div className="field-label !mb-1">{t('Shear angle presets')}</div>
          <div
            className="grid grid-cols-5 gap-1"
            role="toolbar"
            aria-label={t('Shear angle preset actions')}
            aria-describedby="shear-angle-preset-review-status"
            title={t('Use arrow keys to review shear angle presets')}
            onKeyDown={handleAnglePresetKeys}
          >
            <div id="shear-angle-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedAnglePreset || t('Shear angle presets')}`}
            </div>
            {SHEAR_ANGLE_PRESETS.map((preset) => {
              const active = angle === preset;
              const review = `${t('Shear angle')} ${preset > 0 ? '+' : ''}${preset}°`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-shear-angle-preset-action
                  data-angle={preset}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => setAngle(preset)}
                  onFocus={(event) => setReviewedAnglePreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  title={`${t('Set shear angle to')} ${preset > 0 ? '+' : ''}${preset}°`}
                >
                  {preset > 0 ? '+' : ''}{preset}°
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex gap-1 mt-3"
          role="radiogroup"
          aria-label={t('Axis')}
          aria-describedby="shear-axis-review-status"
          title={t('Use arrow keys to switch shear axis')}
          onKeyDown={handleAxisKeys}
        >
          <div id="shear-axis-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedAxis || t('Axis')}`}
          </div>
          <button type="button" data-shear-axis-action data-axis="horizontal" data-review={`${t('Axis')} · ${t('Horizontal')}`} role="radio" aria-checked={axis === 'horizontal'} className={axis === 'horizontal' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setAxis('horizontal')} onFocus={(event) => setReviewedAxis(event.currentTarget.dataset.review ?? '')}>{t('Horizontal')}</button>
          <button type="button" data-shear-axis-action data-axis="vertical" data-review={`${t('Axis')} · ${t('Vertical')}`} role="radio" aria-checked={axis === 'vertical'} className={axis === 'vertical' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setAxis('vertical')} onFocus={(event) => setReviewedAxis(event.currentTarget.dataset.review ?? '')}>{t('Vertical')}</button>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Shear actions')}
          aria-describedby="shear-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="shear-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Shear actions')}`}
          </span>
          <button type="button" data-shear-action data-shear-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-shear-action data-shear-action-review={t('Reset shear settings')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset shear settings'))} onClick={resetShearSettings} title={t('Reset shear settings')}>{t('Reset')}</button>
          <button type="button" data-shear-action data-shear-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewedFooterAction(t('Apply'))} onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
