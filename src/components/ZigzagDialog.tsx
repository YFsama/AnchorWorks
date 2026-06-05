import { useCallback, useEffect, useState } from 'react';
import { X, Activity } from 'lucide-react';
import { useEditor } from '../store/editor';
import { zigzagSelection } from '../lib/zigzag';
import { clearDistortPreview, updateDistortPreview } from '../lib/distortPreview';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Zig Zag (Illustrator Effect→Distort & Transform→Zig Zag) — displace the
 * selected path/shape into a regular zig-zag (corner) or wave (smooth). Size =
 * amplitude, Ridges = wave count. Undoable, so the user can dial it in.
 */
export function ZigzagDialog() {
  const t = useT();
  const open = useEditor(s => s.showZigzag);
  const close = useCallback(() => { clearDistortPreview(); useEditor.getState().setModal('showZigzag', false); }, []);
  const [size, setSize] = useState(2);
  const [ridges, setRidges] = useState(12);
  const [smooth, setSmooth] = useState(false);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  const ZIGZAG_PRESETS = [
    { id: 'saw', label: t('Sawtooth'), size: 1.5, ridges: 12, smooth: false },
    { id: 'burst', label: t('Burst'), size: 3, ridges: 24, smooth: false },
    { id: 'wave', label: t('Wave'), size: 2, ridges: 10, smooth: true },
    { id: 'scallop', label: t('Scallop'), size: 1, ridges: 18, smooth: true },
  ];

  useEscapeClose(open, close);
  useFocusRestore(open);

  useEffect(() => {
    if (!open) { clearDistortPreview(); return; }
    updateDistortPreview({ kind: 'zigzag' as const, sizeMm: size, ridges, smooth });
    return () => clearDistortPreview();
  }, [open, size, ridges, smooth]);
  if (!open) return null;

  const apply = () => {
    clearDistortPreview();
    const n = zigzagSelection(size, ridges, smooth);
    if (n > 0) toast.success(`${n} ${t('shapes zig-zagged')}`, { title: t('Zig Zag') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Zig Zag') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-zigzag-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.zigzagActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-zigzag-preset]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextPresetId = actions[nextIndex]?.dataset.zigzagPreset;
    const nextPreset = ZIGZAG_PRESETS.find((preset) => preset.id === nextPresetId);
    if (nextPreset) applyPreset(nextPreset);
    requestAnimationFrame(() => {
      setReviewedPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const applyPreset = (preset: typeof ZIGZAG_PRESETS[number]) => {
    setSize(preset.size);
    setRidges(preset.ridges);
    setSmooth(preset.smooth);
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="zigzag-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="zigzag-title" className="dialog-title flex items-center gap-2">
            <Activity size={14} aria-hidden="true" /> {t('Zig Zag')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Size (mm)')}</span><span className="text-ink tabular-nums">{size.toFixed(1)}</span></div>
            <input type="range" min={0.1} max={10} step={0.1} value={size} onChange={(e) => setSize(parseFloat(e.target.value))} className="w-full" aria-label={t('Size (mm)')} />
          </label>
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Ridges')}</span><span className="text-ink tabular-nums">{ridges}</span></div>
            <input type="range" min={1} max={60} step={1} value={ridges} onChange={(e) => setRidges(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Ridges')} />
          </label>
        </div>

        <label className="flex items-center gap-2 mt-3 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
          <span>{t('Smooth (wave)')}</span>
        </label>

        <div className="mt-3">
          <div className="field-label">{t('Zig Zag presets')}</div>
          <div
            className="grid grid-cols-2 gap-1"
            role="toolbar"
            aria-label={t('Zig Zag preset actions')}
            aria-describedby="zigzag-preset-review-status"
            title={t('Use arrow keys to review zig zag presets')}
            onKeyDown={handlePresetKeys}
          >
            <div id="zigzag-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Zig Zag presets')}`}
            </div>
            {ZIGZAG_PRESETS.map((preset) => {
              const active = size === preset.size && ridges === preset.ridges && smooth === preset.smooth;
              const review = `${preset.label} · ${t('Size (mm)')} ${preset.size} · ${t('Ridges')} ${preset.ridges} · ${preset.smooth ? t('Smooth (wave)') : t('Corner')}`;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-zigzag-preset={preset.id}
                  data-review={review}
                  className={active ? 'btn-primary' : 'btn'}
                  onClick={() => applyPreset(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  aria-label={`${t('Apply zig zag preset')} ${preset.label}: ${t('Size (mm)')} ${preset.size}, ${t('Ridges')} ${preset.ridges}, ${preset.smooth ? t('Smooth (wave)') : t('Corner')}`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Zig Zag actions')}
          aria-describedby="zigzag-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <div id="zigzag-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Zig Zag actions')}`}
          </div>
          <button
            type="button"
            data-zigzag-action
            data-zigzag-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-zigzag-action
            data-zigzag-action-review={t('Apply')}
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
