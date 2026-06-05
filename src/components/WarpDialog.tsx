import { useCallback, useState } from 'react';
import { X, Rainbow } from 'lucide-react';
import { useEditor } from '../store/editor';
import { warpSelection, type WarpStyle } from '../lib/warp';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Arc Warp (Illustrator Effect→Warp→Arc) — bend the selection into an arc/banner.
 * Positive bend curves it up, negative down.
 */
export function WarpDialog() {
  const t = useT();
  const open = useEditor(s => s.showWarp);
  const close = useCallback(() => useEditor.getState().setModal('showWarp', false), []);
  const [bend, setBend] = useState(40);
  const [style, setStyle] = useState<WarpStyle>('arc');
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  const BEND_PRESETS = [-75, -50, -25, 0, 25, 50, 75];

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const STYLES: { id: WarpStyle; label: string }[] = [
    { id: 'arc', label: t('Arc') },
    { id: 'rise', label: t('Rise') },
    { id: 'flag', label: t('Flag') },
    { id: 'wave', label: t('Wave') },
  ];

  const apply = () => {
    const n = warpSelection(bend, style);
    if (n > 0) toast.success(`${n} ${t('shapes warped')}`, { title: t('Arc Warp') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Arc Warp') });
    close();
  };

  const resetSettings = () => {
    setStyle('arc');
    setBend(40);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset'));
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-warp-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.warpActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-warp-bend-preset]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextBend = Number(actions[nextIndex]?.dataset.warpBendPreset);
    if (Number.isFinite(nextBend)) setBend(nextBend);
    requestAnimationFrame(() => {
      setReviewedPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="warp-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="warp-title" className="dialog-title flex items-center gap-2">
            <Rainbow size={14} aria-hidden="true" /> {t('Arc Warp')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-4 gap-1 mb-3" role="radiogroup" aria-label={t('Style')}>
          {STYLES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={style === s.id ? 'btn-primary' : 'btn'} onClick={() => setStyle(s.id)}>{s.label}</button>
          ))}
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Bend')}</span><span className="text-ink tabular-nums">{bend > 0 ? '+' : ''}{bend}%</span></div>
          <input type="range" min={-100} max={100} step={1} value={bend} onChange={(e) => setBend(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Bend')} />
        </label>

        <div className="mt-3">
          <div className="field-label">{t('Bend presets')}</div>
          <div
            className="grid grid-cols-4 gap-1"
            role="toolbar"
            aria-label={t('Bend preset actions')}
            aria-describedby="warp-bend-preset-review-status"
            title={t('Use arrow keys to review bend presets')}
            onKeyDown={handlePresetKeys}
          >
            <div id="warp-bend-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || t('Bend presets')}`}
            </div>
            {BEND_PRESETS.map((preset) => {
              const review = `${t('Bend')} ${preset > 0 ? '+' : ''}${preset}%`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-warp-bend-preset={preset}
                  data-review={review}
                  className={bend === preset ? 'btn-primary' : 'btn'}
                  onClick={() => setBend(preset)}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={bend === preset}
                  aria-label={`${t('Set bend to')} ${preset > 0 ? '+' : ''}${preset}%`}
                >
                  {preset > 0 ? '+' : ''}{preset}%
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Arc Warp actions')}
          aria-describedby="warp-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="warp-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Arc Warp actions')}`}
          </span>
          <button type="button" data-warp-action data-warp-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-warp-action data-warp-action-review={t('Reset')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset'))} onClick={resetSettings}>{t('Reset')}</button>
          <button type="button" data-warp-action data-warp-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewedFooterAction(t('Apply'))} onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
