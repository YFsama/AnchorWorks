import { useCallback, useState } from 'react';
import { X, SquareDashed } from 'lucide-react';
import { useEditor } from '../store/editor';
import { makeMarginGuides } from '../lib/canvasEngine';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

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
  const [reviewedJobPreset, setReviewedJobPreset] = useState('');
  const [reviewedMarginPreset, setReviewedMarginPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');
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

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-margin-guides-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.marginGuidesActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-margin-guides-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextMargin = Number(actions[nextIndex]?.dataset.margin);
    if (Number.isFinite(nextMargin)) setMargin(nextMargin);
    requestAnimationFrame(() => {
      setReviewedMarginPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

  const handleJobPresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-margin-guides-job-preset-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextMargin = Number(actions[nextIndex]?.dataset.margin);
    if (Number.isFinite(nextMargin)) setMargin(nextMargin);
    requestAnimationFrame(() => {
      setReviewedJobPreset(actions[nextIndex]?.dataset.review ?? '');
      actions[nextIndex]?.focus();
    });
  };

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
          <div
            className="grid grid-cols-2 gap-1"
            role="toolbar"
            aria-label={t('Margin guide recipe actions')}
            aria-describedby="margin-guides-job-preset-review-status"
            title={t('Use arrow keys to review margin guide recipes')}
            onKeyDown={handleJobPresetActionKeys}
          >
            <div id="margin-guides-job-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedJobPreset || t('Margin guide recipes')}`}
            </div>
            {MARGIN_JOB_PRESETS.map((preset) => {
              const active = activeJobPreset === preset.label;
              const review = `${t(preset.label)}: ${t(preset.title)} ${preset.margin} mm`;
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-margin-guides-job-preset-action
                  data-margin={preset.margin}
                  data-review={review}
                  className={`btn !py-1 !px-1 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                  onClick={() => setMargin(preset.margin)}
                  onFocus={(event) => setReviewedJobPreset(event.currentTarget.dataset.review ?? '')}
                  aria-pressed={active}
                  title={review}
                >
                  {t(preset.label)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2">
          <div className="field-label !mb-1">{t('Margin presets')}</div>
          <div
            className="grid grid-cols-6 gap-1"
            role="toolbar"
            aria-label={t('Margin preset actions')}
            aria-describedby="margin-guides-preset-review-status"
            title={t('Use arrow keys to review margin presets')}
            onKeyDown={handlePresetActionKeys}
          >
            <div id="margin-guides-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedMarginPreset || t('Margin presets')}`}
            </div>
            {MARGIN_PRESETS_MM.map((preset) => {
              const active = Math.abs(margin - preset) < 0.001;
              const review = `${t('Set margin to')} ${preset} mm`;
              return (
                <button
                  key={preset}
                  type="button"
                  data-margin-guides-preset-action
                  data-margin={preset}
                  data-review={review}
                  className={`h-6 rounded border text-[10px] transition-colors ${active ? 'bg-accent/20 border-accent text-accent' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
                  onClick={() => setMargin(preset)}
                  onFocus={(event) => setReviewedMarginPreset(event.currentTarget.dataset.review ?? '')}
                  title={review}
                  aria-pressed={active}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 mt-3"
          role="toolbar"
          aria-label={t('Margin Guides actions')}
          aria-describedby="margin-guides-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="margin-guides-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Margin Guides actions')}`}
          </span>
          <button type="button" data-margin-guides-action data-margin-guides-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-margin-guides-action data-margin-guides-action-review={t('Reset margin guide settings')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset margin guide settings'))} onClick={resetMarginGuideSettings} title={t('Reset margin guide settings')}>{t('Reset')}</button>
          <button type="button" data-margin-guides-action data-margin-guides-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewedFooterAction(t('Apply'))} onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
