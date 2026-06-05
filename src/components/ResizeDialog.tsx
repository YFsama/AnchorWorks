import { useCallback, useMemo, useState } from 'react';
import { X, Scaling } from 'lucide-react';
import { useEditor } from '../store/editor';
import { scaleSelectionToSize, selectionSizeMm } from '../lib/scaleToSize';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const SCALE_PRESETS = [
  { label: 'Half size', factor: 0.5 },
  { label: 'Original size', factor: 1 },
  { label: 'Double size', factor: 2 },
] as const;

const SIZE_RECIPES = [
  { label: 'Sticker label', title: 'Set exact 76 × 51 mm decal label size.', w: 76, h: 51 },
  { label: 'Name badge', title: 'Set exact 89 × 38 mm name badge size.', w: 89, h: 38 },
  { label: 'Yard sign', title: 'Set exact 457 × 305 mm yard sign size.', w: 457, h: 305 },
  { label: 'Banner panel', title: 'Set exact 610 × 305 mm banner panel size.', w: 610, h: 305 },
] as const;

/**
 * Resize to exact size — scale the selection so its bounding box matches a
 * target width/height in mm, optionally locking the aspect ratio. Prefilled with
 * the current size when opened.
 */
export function ResizeDialog() {
  const t = useT();
  const open = useEditor(s => s.showResize);
  const close = useCallback(() => useEditor.getState().setModal('showResize', false), []);
  // The dialog is conditionally mounted ({showResize && …}), so a lazy initial
  // state prefills with the live selection size once per open — no effect.
  const initialSize = useMemo(() => selectionSizeMm(), []);
  const [w, setW] = useState(() => initialSize ? initialSize.w.toFixed(1) : '');
  const [h, setH] = useState(() => initialSize ? initialSize.h.toFixed(1) : '');
  const [lock, setLock] = useState(true);
  const [reviewedSizeRecipe, setReviewedSizeRecipe] = useState('');
  const [reviewedScalePreset, setReviewedScalePreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const wv = parseFloat(w), hv = parseFloat(h);
    const ok = scaleSelectionToSize(Number.isFinite(wv) ? wv : null, Number.isFinite(hv) ? hv : null, lock);
    if (ok) toast.success(t('Resized'), { title: t('Resize') });
    else toast.warn(t('Select an object first.'), { title: t('Resize') });
    close();
  };

  const applyScalePreset = (factor: number) => {
    if (!initialSize) return;
    setW((initialSize.w * factor).toFixed(1));
    setH((initialSize.h * factor).toFixed(1));
    setLock(true);
  };

  const applySizeRecipe = (recipe: typeof SIZE_RECIPES[number]) => {
    setW(recipe.w.toFixed(1));
    setH(recipe.h.toFixed(1));
    setLock(false);
  };

  const resetFields = () => {
    setW(initialSize ? initialSize.w.toFixed(1) : '');
    setH(initialSize ? initialSize.h.toFixed(1) : '');
    setLock(true);
    setReviewedSizeRecipe('');
    setReviewedScalePreset('');
    setReviewedFooterAction(t('Reset'));
  };

  const handleScalePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-resize-scale-preset-action]'))
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
    const factor = Number(actions[nextIndex]?.dataset.factor);
    if (Number.isFinite(factor)) applyScalePreset(factor);
    requestAnimationFrame(() => {
      setReviewedScalePreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleSizeRecipeKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-resize-size-recipe-action]'));
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
    const recipe = SIZE_RECIPES.find((entry) => entry.label === actions[nextIndex]?.dataset.recipe);
    if (recipe) applySizeRecipe(recipe);
    requestAnimationFrame(() => {
      setReviewedSizeRecipe(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-resize-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.resizeActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  // With lock on, editing one field previews the other from the current ratio.
  const ratio = initialSize && initialSize.h > 0 ? initialSize.w / initialSize.h : 1;
  const onW = (v: string) => { setW(v); if (lock) { const n = parseFloat(v); if (Number.isFinite(n)) setH((n / ratio).toFixed(1)); } };
  const onH = (v: string) => { setH(v); if (lock) { const n = parseFloat(v); if (Number.isFinite(n)) setW((n * ratio).toFixed(1)); } };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="resize-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[300px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="resize-title" className="dialog-title flex items-center gap-2">
            <Scaling size={14} aria-hidden="true" /> {t('Resize')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label">{t('Width (mm)')}</div>
            <input type="number" min={0} step={0.1} value={w} onChange={(e) => onW(e.target.value)} className="input-num w-full" aria-label={t('Width (mm)')} />
          </label>
          <label className="block">
            <div className="field-label">{t('Height (mm)')}</div>
            <input type="number" min={0} step={0.1} value={h} onChange={(e) => onH(e.target.value)} className="input-num w-full" aria-label={t('Height (mm)')} />
          </label>
        </div>
        <div className="mt-3">
          <div className="field-label !mb-1">{t('Size recipes')}</div>
          <div
            className="grid grid-cols-2 gap-1"
            role="toolbar"
            aria-label={t('Resize size recipe actions')}
            aria-describedby="resize-size-recipe-review-status"
            title={t('Use arrow keys to review resize size recipes')}
            onKeyDown={handleSizeRecipeKeys}
          >
            <div id="resize-size-recipe-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedSizeRecipe || t('Size recipes')}`}
            </div>
            {SIZE_RECIPES.map((recipe) => {
              const targetW = recipe.w.toFixed(1);
              const targetH = recipe.h.toFixed(1);
              const active = w === targetW && h === targetH;
              const review = `${t(recipe.label)} · ${t('Width (mm)')} ${targetW} · ${t('Height (mm)')} ${targetH}`;
              return (
                <button
                  key={recipe.label}
                  type="button"
                  data-resize-size-recipe-action
                  data-recipe={recipe.label}
                  data-review={review}
                  className={`btn !py-1 !px-1.5 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => applySizeRecipe(recipe)}
                  onFocus={(event) => setReviewedSizeRecipe(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  title={`${t(recipe.title)} · ${targetW} × ${targetH} mm`}
                >
                  {t(recipe.label)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3">
          <div className="field-label !mb-1">{t('Scale presets')}</div>
          <div
            className="grid grid-cols-3 gap-1"
            role="toolbar"
            aria-label={t('Resize scale preset actions')}
            aria-describedby="resize-scale-preset-review-status"
            title={t('Use arrow keys to review resize scale presets')}
            onKeyDown={handleScalePresetKeys}
          >
            <div id="resize-scale-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedScalePreset || t('Scale presets')}`}
            </div>
            {SCALE_PRESETS.map((preset) => {
              const targetW = initialSize ? (initialSize.w * preset.factor).toFixed(1) : '';
              const targetH = initialSize ? (initialSize.h * preset.factor).toFixed(1) : '';
              const active = !!initialSize && w === targetW && h === targetH;
              const review = initialSize
                ? `${t(preset.label)} · ${t('Width (mm)')} ${targetW} · ${t('Height (mm)')} ${targetH}`
                : `${t(preset.label)} · ${t('Select an object first.')}`;
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-resize-scale-preset-action
                  data-factor={preset.factor}
                  data-review={review}
                  className={`btn !py-1 !px-1.5 !text-[10px] ${active ? 'ring-1 ring-accent' : ''}`}
                  onClick={() => applyScalePreset(preset.factor)}
                  onFocus={(event) => setReviewedScalePreset(event.currentTarget.dataset.review ?? '')}
                  disabled={!initialSize}
                  aria-pressed={active}
                  title={initialSize ? `${t(preset.label)} · ${targetW} × ${targetH} mm` : t('Select an object first.')}
                >
                  {t(preset.label)}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 mt-3 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
          <span>{t('Lock aspect ratio')}</span>
        </label>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Resize actions')}
          aria-describedby="resize-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="resize-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Resize actions')}`}
          </span>
          <button type="button" data-resize-action data-resize-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-resize-action data-resize-action-review={t('Reset')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset'))} onClick={resetFields}>{t('Reset')}</button>
          <button type="button" data-resize-action data-resize-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewedFooterAction(t('Apply'))} onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
