import { useCallback, useState } from 'react';
import { X, CircleDot } from 'lucide-react';
import { useEditor } from '../store/editor';
import { grommetsFromSelection } from '../lib/grommets';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const GROMMET_PRESETS: Array<{ label: string; inset: number; spacing: number; diameter: number }> = [
  { label: 'Small banner', inset: 15, spacing: 300, diameter: 8 },
  { label: 'Standard banner', inset: 20, spacing: 500, diameter: 10 },
  { label: 'Large banner', inset: 25, spacing: 750, diameter: 12 },
];

/**
 * Banner grommets — place evenly-spaced grommet-hole cut circles around the
 * inset perimeter of the selection (SignMaster banner finishing). Inset, max
 * spacing, and hole diameter are configurable since banner sizes vary.
 */
export function GrommetsDialog() {
  const t = useT();
  const open = useEditor(s => s.showGrommets);
  const close = useCallback(() => useEditor.getState().setModal('showGrommets', false), []);
  const [inset, setInset] = useState(20);
  const [spacing, setSpacing] = useState(500);
  const [diameter, setDiameter] = useState(10);
  const [reviewedPreset, setReviewedPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const applyPreset = (preset: { inset: number; spacing: number; diameter: number }) => {
    setInset(preset.inset);
    setSpacing(preset.spacing);
    setDiameter(preset.diameter);
  };

  const resetGrommetSettings = () => {
    const standard = GROMMET_PRESETS[1];
    applyPreset(standard);
    setReviewedPreset(`${t(standard.label)} · ${t('Inset (mm)')} ${standard.inset} · ${t('Max spacing (mm)')} ${standard.spacing} · ${t('Diameter (mm)')} ${standard.diameter}`);
    setReviewedFooterAction(t('Reset grommet settings'));
  };

  const apply = () => {
    const paths = grommetsFromSelection(inset, spacing, diameter);
    if (paths.length) {
      const ed = useEditor.getState();
      ed.addCutPaths(paths);
      ed.setCutPathsVisible(true);
      toast.success(`${paths.length} ${t('grommets added')}`, { title: t('Banner Grommets') });
    } else {
      toast.warn(t('Select something first.'), { title: t('Banner Grommets') });
    }
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-grommets-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.grommetsActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-grommet-preset-action]'));
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    const preset = GROMMET_PRESETS[nextIndex];
    if (preset) applyPreset(preset);
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
      aria-labelledby="grommets-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[360px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="grommets-title" className="dialog-title flex items-center gap-2">
            <CircleDot size={14} aria-hidden="true" /> {t('Banner Grommets')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <div className="field-label">{t('Inset (mm)')}</div>
            <input type="number" min={0} step={1} value={inset} onChange={(e) => setInset(Math.max(0, +e.target.value || 0))} className="input-num w-full" aria-label={t('Inset (mm)')} />
          </label>
          <label className="block">
            <div className="field-label">{t('Max spacing (mm)')}</div>
            <input type="number" min={10} step={10} value={spacing} onChange={(e) => setSpacing(Math.max(10, +e.target.value || 10))} className="input-num w-full" aria-label={t('Max spacing (mm)')} />
          </label>
          <label className="block">
            <div className="field-label">{t('Diameter (mm)')}</div>
            <input type="number" min={1} step={0.5} value={diameter} onChange={(e) => setDiameter(Math.max(1, +e.target.value || 1))} className="input-num w-full" aria-label={t('Diameter (mm)')} />
          </label>
        </div>

        <div className="mt-3">
          <div className="field-label">{t('Banner presets')}</div>
          <div
            className="grid grid-cols-3 gap-1"
            role="toolbar"
            aria-label={t('Banner preset actions')}
            aria-describedby="grommet-preset-review-status"
            title={t('Use arrow keys to review banner presets')}
            onKeyDown={handlePresetActionKeys}
          >
            <div id="grommet-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedPreset || `${t('Inset (mm)')} ${inset} · ${t('Max spacing (mm)')} ${spacing} · ${t('Diameter (mm)')} ${diameter}`}`}
            </div>
            {GROMMET_PRESETS.map((preset) => {
              const active = inset === preset.inset && spacing === preset.spacing && diameter === preset.diameter;
              const review = `${t(preset.label)} · ${t('Inset (mm)')} ${preset.inset} · ${t('Max spacing (mm)')} ${preset.spacing} · ${t('Diameter (mm)')} ${preset.diameter}`;
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-grommet-preset-action
                  data-review={review}
                  onFocus={(event) => setReviewedPreset(event.currentTarget.dataset.review ?? '')}
                  onClick={() => applyPreset(preset)}
                  aria-pressed={active}
                  className={`px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`}
                  title={`${t(preset.label)}: ${preset.inset} / ${preset.spacing} / ${preset.diameter} mm`}
                >
                  <span className="block font-medium">{t(preset.label)}</span>
                  <span className="block tabular-nums">{preset.inset} · {preset.spacing} · Ø{preset.diameter}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 mt-4"
          role="toolbar"
          aria-label={t('Banner Grommets actions')}
          aria-describedby="grommets-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="grommets-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Banner Grommets actions')}`}
          </span>
          <button type="button" data-grommets-action data-grommets-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-grommets-action data-grommets-action-review={t('Reset grommet settings')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset grommet settings'))} onClick={resetGrommetSettings} title={t('Reset grommet settings')}>{t('Reset')}</button>
          <button type="button" data-grommets-action data-grommets-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewedFooterAction(t('Apply'))} onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
