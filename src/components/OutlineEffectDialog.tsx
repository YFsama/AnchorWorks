import { useCallback, useState } from 'react';
import { X, Layers } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { addOutlineEffect } from '../lib/outlineEffect';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

// Sensible starting palette: inner → outer.
const DEFAULT_COLORS = ['#000000', '#ffffff', '#e11d48', '#ffd400'];

/**
 * Multi-outline / contour effect — stack 1–4 coloured borders behind the
 * selection (SignMaster Outline / the classic layered sign-text look). Inner
 * ring is colours[0]; outer rings grow by `widthMm` each.
 */
export function OutlineEffectDialog() {
  const t = useT();
  const open = useEditor(s => s.showOutline);
  const close = useCallback(() => useEditor.getState().setModal('showOutline', false), []);
  const [count, setCount] = useState(1);
  const [widthMm, setWidthMm] = useState(2);
  const [colors, setColors] = useState<string[]>(DEFAULT_COLORS);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  const OUTLINE_PRESETS = [
    { id: 'shadow', label: t('Shadow'), count: 1, widthMm: 2, colors: ['#000000', '#ffffff', '#e11d48', '#ffd400'] },
    { id: 'sticker', label: t('Sticker'), count: 2, widthMm: 1.5, colors: ['#ffffff', '#000000', '#e11d48', '#ffd400'] },
    { id: 'team', label: t('Team'), count: 3, widthMm: 2, colors: ['#ffffff', '#000000', '#e11d48', '#ffd400'] },
    { id: 'badge', label: t('Badge'), count: 4, widthMm: 1, colors: ['#ffffff', '#111827', '#ffd400', '#e11d48'] },
  ];

  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;

  const setColor = (i: number, v: string) => setColors(cs => cs.map((c, idx) => (idx === i ? v : c)));

  const apply = async () => {
    const objs = getCanvas()?.getActiveObjects() ?? [];
    if (!objs.length) { toast.warn(t('Select one or more shapes first.'), { title: t('Multi-outline') }); return; }
    const n = await addOutlineEffect(objs, colors.slice(0, count), widthMm);
    if (n > 0) toast.success(`${n} ${t('outline(s) added')}`, { title: t('Multi-outline') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-outline-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.outlineActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-outline-preset]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const preset = OUTLINE_PRESETS[Number(actions[nextIndex]?.dataset.outlinePresetIndex ?? -1)];
    if (preset) applyPreset(preset);
    requestAnimationFrame(() => {
      setReviewedPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const applyPreset = (preset: typeof OUTLINE_PRESETS[number]) => {
    setCount(preset.count);
    setWidthMm(preset.widthMm);
    setColors(preset.colors);
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="outline-effect-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[340px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="outline-effect-title" className="dialog-title flex items-center gap-2">
            <Layers size={14} aria-hidden="true" /> {t('Multi-outline')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Outlines')}>
            <input type="number" min={1} max={4} className="input-num" value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1)))} />
          </Field>
          <Field label={t('Width per ring (mm)')}>
            <input type="number" min={0.1} max={50} step={0.5} className="input-num" value={widthMm}
              onChange={(e) => setWidthMm(Math.max(0.1, parseFloat(e.target.value) || 0.1))} />
          </Field>
        </div>

        <div className="mt-3">
          <div className="field-label">{t('Outline presets')}</div>
          <div
            className="grid grid-cols-4 gap-1"
            role="toolbar"
            aria-label={t('Outline preset actions')}
            aria-describedby="outline-preset-review-status"
            title={t('Use arrow keys to review outline presets')}
            onKeyDown={handlePresetKeys}
          >
            <div id="outline-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Outline presets')}`}
            </div>
            {OUTLINE_PRESETS.map((preset) => {
              const active = count === preset.count && widthMm === preset.widthMm
                && colors.slice(0, preset.colors.length).every((color, index) => color === preset.colors[index]);
              const review = `${t('Apply outline preset')} ${preset.label}: ${preset.count} ${t('Outlines')}, ${t('Width per ring (mm)')} ${preset.widthMm}`;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-outline-preset
                  data-outline-preset-index={OUTLINE_PRESETS.indexOf(preset)}
                  data-review={review}
                  className={active ? 'btn-primary' : 'btn'}
                  aria-pressed={active}
                  onClick={() => applyPreset(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-label={review}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {Array.from({ length: count }, (_, i) => (
            <label key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted">{i === 0 ? t('Inner ring') : i === count - 1 ? t('Outer ring') : `${t('Ring')} ${i + 1}`}</span>
              <input
                type="color"
                value={colors[i] ?? '#000000'}
                onChange={(e) => setColor(i, e.target.value)}
                className="input-num p-0.5 h-7 w-12 cursor-pointer"
                aria-label={`${t('Ring')} ${i + 1} ${t('color')}`}
              />
            </label>
          ))}
        </div>

        <div
          className="flex justify-end gap-2 mt-4"
          role="toolbar"
          aria-label={t('Multi-outline actions')}
          aria-describedby="outline-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <div id="outline-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Multi-outline actions')}`}
          </div>
          <button
            type="button"
            data-outline-action
            data-outline-action-review={t('Cancel')}
            className="btn"
            onClick={close}
            onFocus={() => setReviewedFooterAction(t('Cancel'))}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            data-outline-action
            data-outline-action-review={t('Apply')}
            className="btn-primary"
            onClick={() => { void apply(); }}
            onFocus={() => setReviewedFooterAction(t('Apply'))}
          >
            {t('Apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
