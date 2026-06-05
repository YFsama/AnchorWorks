import { useCallback, useState } from 'react';
import { X, Gem } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { rhinestoneFromSelection } from '../lib/rhinestone';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

// Common SS (stone size) → mm diameters, as quick presets.
const SS_PRESETS: Array<{ label: string; mm: number }> = [
  { label: 'SS6', mm: 2.0 },
  { label: 'SS10', mm: 2.8 },
  { label: 'SS16', mm: 3.9 },
  { label: 'SS20', mm: 4.7 },
];

const SPACING_PRESETS: Array<{ label: string; mm: number }> = [
  { label: 'Dense', mm: 3 },
  { label: 'Standard', mm: 4 },
  { label: 'Loose', mm: 6 },
];

const JOB_PRESETS: Array<{ label: string; diameter: number; spacing: number }> = [
  { label: 'Fine stones', diameter: 2, spacing: 3 },
  { label: 'Standard stones', diameter: 2.8, spacing: 4 },
  { label: 'Bold stones', diameter: 4.7, spacing: 6 },
];

/**
 * Rhinestone / hotfix template — drop evenly-spaced stones along the outline of
 * the selection (SignMaster Rhinestone). Produces one cut-path circle per stone
 * so the template can be cut or printed.
 */
export function RhinestoneDialog() {
  const t = useT();
  const open = useEditor(s => s.showRhinestone);
  const close = useCallback(() => useEditor.getState().setModal('showRhinestone', false), []);
  const [diameter, setDiameter] = useState(2.8);
  const [spacing, setSpacing] = useState(4);
  const [reviewedJobPreset, setReviewedJobPreset] = useState('');
  const [reviewedSizePreset, setReviewedSizePreset] = useState('');
  const [reviewedSpacingPreset, setReviewedSpacingPreset] = useState('');
  const [reviewedFooterAction, setReviewedFooterAction] = useState('');

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const objs = getCanvas()?.getActiveObjects() ?? [];
    if (!objs.length) { toast.warn(t('Select one or more shapes first.'), { title: t('Rhinestone Template') }); return; }
    const paths = rhinestoneFromSelection(objs, spacing, diameter);
    if (!paths.length) { toast.warn(t('No outline to place stones on.'), { title: t('Rhinestone Template') }); return; }
    const ed = useEditor.getState();
    ed.addCutPaths(paths);
    ed.setCutPathsVisible(true);
    toast.success(`${paths.length} ${t('stones placed')}`, { title: t('Rhinestone Template') });
    close();
  };

  const handleFooterActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-rhinestone-action]'));
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedFooterAction(nextAction?.dataset.rhinestoneActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handleToolbarActionKeys = (event: React.KeyboardEvent<HTMLDivElement>, selector: string, onSelect: (index: number) => void, onReview?: (button?: HTMLButtonElement | null) => void) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(selector));
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    onSelect(nextIndex);
    requestAnimationFrame(() => {
      onReview?.(actions[nextIndex]);
      actions[nextIndex]?.focus();
    });
  };

  const handlePresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    handleToolbarActionKeys(event, '[data-rhinestone-preset-action]', (index) => {
      const preset = SS_PRESETS[index];
      if (preset) setDiameter(preset.mm);
    }, (button) => setReviewedSizePreset(button?.dataset.review ?? ''));
  };

  const handleSpacingActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    handleToolbarActionKeys(event, '[data-rhinestone-spacing-action]', (index) => {
      const preset = SPACING_PRESETS[index];
      if (preset) setSpacing(preset.mm);
    }, (button) => setReviewedSpacingPreset(button?.dataset.review ?? ''));
  };

  const handleJobPresetActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    handleToolbarActionKeys(event, '[data-rhinestone-job-action]', (index) => {
      const preset = JOB_PRESETS[index];
      if (preset) applyJobPreset(preset);
    }, (button) => setReviewedJobPreset(button?.dataset.review ?? ''));
  };

  const applyJobPreset = (preset: { label: string; diameter: number; spacing: number }) => {
    setDiameter(preset.diameter);
    setSpacing(preset.spacing);
  };

  const resetRhinestoneSettings = () => {
    const standard = JOB_PRESETS[1];
    applyJobPreset(standard);
    setReviewedJobPreset(`${t(standard.label)} · ${t('Stone Ø (mm)')} ${standard.diameter} · ${t('Spacing (mm)')} ${standard.spacing}`);
    setReviewedSizePreset(`SS10 · ${t('Stone Ø (mm)')} ${standard.diameter}`);
    setReviewedSpacingPreset(`${t('Standard')} · ${t('Spacing (mm)')} ${standard.spacing}`);
    setReviewedFooterAction(t('Reset rhinestone settings'));
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rhinestone-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="rhinestone-title" className="dialog-title flex items-center gap-2">
            <Gem size={14} aria-hidden="true" /> {t('Rhinestone Template')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Stone Ø (mm)')}>
            <input type="number" min={0.5} max={20} step={0.1} className="input-num" value={diameter}
              onChange={(e) => setDiameter(Math.max(0.5, parseFloat(e.target.value) || 0.5))} />
          </Field>
          <Field label={t('Spacing (mm)')}>
            <input type="number" min={0.5} max={50} step={0.5} className="input-num" value={spacing}
              onChange={(e) => setSpacing(Math.max(0.5, parseFloat(e.target.value) || 0.5))} />
          </Field>
        </div>
        <div className="mt-2">
          <div className="field-label">{t('Rhinestone job presets')}</div>
          <div
            className="grid grid-cols-3 gap-1"
            role="toolbar"
            aria-label={t('Rhinestone job preset actions')}
            aria-describedby="rhinestone-job-preset-review-status"
            title={t('Use arrow keys to review rhinestone job presets')}
            onKeyDown={handleJobPresetActionKeys}
          >
            <div id="rhinestone-job-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedJobPreset || `${t('Stone Ø (mm)')} ${diameter} · ${t('Spacing (mm)')} ${spacing}`}`}
            </div>
            {JOB_PRESETS.map(p => {
              const active = Math.abs(diameter - p.diameter) < 0.01 && Math.abs(spacing - p.spacing) < 0.01;
              const review = `${t(p.label)} · ${t('Stone Ø (mm)')} ${p.diameter} · ${t('Spacing (mm)')} ${p.spacing}`;
              return (
                <button key={p.label} type="button"
                  data-rhinestone-job-action
                  data-review={review}
                  onFocus={(event) => setReviewedJobPreset(event.currentTarget.dataset.review ?? '')}
                  onClick={() => applyJobPreset(p)}
                  aria-pressed={active}
                  className={`px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`}
                  title={`${t(p.label)}: Ø${p.diameter} / ${p.spacing} mm`}>
                  <span className="block font-medium">{t(p.label)}</span>
                  <span className="block tabular-nums">Ø{p.diameter} · {p.spacing} mm</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2">
          <div className="field-label">{t('Stone size presets')}</div>
          <div
            className="flex flex-wrap gap-1"
            role="toolbar"
            aria-label={t('Stone size preset actions')}
            aria-describedby="rhinestone-size-preset-review-status"
            title={t('Use arrow keys to review stone size presets')}
            onKeyDown={handlePresetActionKeys}
          >
            <div id="rhinestone-size-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedSizePreset || `${t('Stone Ø (mm)')} ${diameter}`}`}
            </div>
            {SS_PRESETS.map(p => {
              const active = Math.abs(diameter - p.mm) < 0.01;
              const review = `${p.label} · ${t('Stone Ø (mm)')} ${p.mm}`;
              return (
                <button key={p.label} type="button"
                data-rhinestone-preset-action
                data-review={review}
                onFocus={(event) => setReviewedSizePreset(event.currentTarget.dataset.review ?? '')}
                onClick={() => setDiameter(p.mm)}
                aria-pressed={active}
                className={`px-2 py-0.5 rounded-sm border text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink' : 'border-border text-muted hover:text-ink'}`}
                title={`${p.label}: ${p.mm} mm`}>
                <span className="font-medium">{p.label}</span> <span className="tabular-nums">Ø{p.mm}</span>
              </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2">
          <div className="field-label">{t('Stone spacing presets')}</div>
          <div
            className="grid grid-cols-3 gap-1"
            role="toolbar"
            aria-label={t('Stone spacing preset actions')}
            aria-describedby="rhinestone-spacing-preset-review-status"
            title={t('Use arrow keys to review stone spacing presets')}
            onKeyDown={handleSpacingActionKeys}
          >
            <div id="rhinestone-spacing-preset-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedSpacingPreset || `${t('Spacing (mm)')} ${spacing}`}`}
            </div>
            {SPACING_PRESETS.map(p => {
              const active = Math.abs(spacing - p.mm) < 0.01;
              const review = `${t(p.label)} · ${t('Spacing (mm)')} ${p.mm}`;
              return (
                <button key={p.label} type="button"
                data-rhinestone-spacing-action
                data-review={review}
                onFocus={(event) => setReviewedSpacingPreset(event.currentTarget.dataset.review ?? '')}
                onClick={() => setSpacing(p.mm)}
                aria-pressed={active}
                className={`px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`}
                title={`${t(p.label)}: ${p.mm} mm`}>
                <span className="block font-medium">{t(p.label)}</span>
                <span className="block tabular-nums">{p.mm} mm</span>
              </button>
              );
            })}
          </div>
        </div>

        <div
          className="flex justify-end gap-2 mt-4"
          role="toolbar"
          aria-label={t('Rhinestone Template actions')}
          aria-describedby="rhinestone-action-review-status"
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
        >
          <span id="rhinestone-action-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${reviewedFooterAction || t('Rhinestone Template actions')}`}
          </span>
          <button type="button" data-rhinestone-action data-rhinestone-action-review={t('Cancel')} className="btn" onFocus={() => setReviewedFooterAction(t('Cancel'))} onClick={close}>{t('Cancel')}</button>
          <button type="button" data-rhinestone-action data-rhinestone-action-review={t('Reset rhinestone settings')} className="btn" onFocus={() => setReviewedFooterAction(t('Reset rhinestone settings'))} onClick={resetRhinestoneSettings} title={t('Reset rhinestone settings')}>{t('Reset')}</button>
          <button type="button" data-rhinestone-action data-rhinestone-action-review={t('Apply')} className="btn-primary" onFocus={() => setReviewedFooterAction(t('Apply'))} onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
