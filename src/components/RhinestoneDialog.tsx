import { useCallback, useState } from 'react';
import { X, Gem } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { rhinestoneFromSelection } from '../lib/rhinestone';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

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
  const [reviewedJobPreset, setReviewedJobPreset] = useReviewedAction();
  const [reviewedSizePreset, setReviewedSizePreset] = useReviewedAction();
  const [reviewedSpacingPreset, setReviewedSpacingPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();

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

  const applyJobPreset = (preset: { diameter: number; spacing: number }) => {
    setDiameter(preset.diameter);
    setSpacing(preset.spacing);
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-rhinestone-action]',
    reviewKey: actionReviewKey('data-rhinestone-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handleJobPresetActionKeys = makeRovingKeys({
    selector: '[data-rhinestone-job-action]',
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedJobPreset,
    onNavigate: (_button, index) => {
      const preset = JOB_PRESETS[index];
      if (preset) applyJobPreset(preset);
    },
  });

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-rhinestone-preset-action]',
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedSizePreset,
    onNavigate: (_button, index) => {
      const preset = SS_PRESETS[index];
      if (preset) setDiameter(preset.mm);
    },
  });

  const handleSpacingActionKeys = makeRovingKeys({
    selector: '[data-rhinestone-spacing-action]',
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedSpacingPreset,
    onNavigate: (_button, index) => {
      const preset = SPACING_PRESETS[index];
      if (preset) setSpacing(preset.mm);
    },
  });

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
          <PresetRow
            statusId="rhinestone-job-preset-review-status"
            className="grid grid-cols-3 gap-1"
            label={t('Rhinestone job preset actions')}
            title={t('Use arrow keys to review rhinestone job presets')}
            onKeyDown={handleJobPresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedJobPreset}
            fallback={`${t('Stone Ø (mm)')} ${diameter} · ${t('Spacing (mm)')} ${spacing}`}
            actionAttr="data-rhinestone-job-action"
            setReviewed={setReviewedJobPreset}
            items={JOB_PRESETS.map((p) => {
              const active = Math.abs(diameter - p.diameter) < 0.01 && Math.abs(spacing - p.spacing) < 0.01;
              return {
                key: p.label,
                className: `px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`,
                pressed: active,
                onClick: () => applyJobPreset(p),
                title: `${t(p.label)}: Ø${p.diameter} / ${p.spacing} mm`,
                data: { review: `${t(p.label)} · ${t('Stone Ø (mm)')} ${p.diameter} · ${t('Spacing (mm)')} ${p.spacing}` },
                children: (
                  <>
                    <span className="block font-medium">{t(p.label)}</span>
                    <span className="block tabular-nums">Ø{p.diameter} · {p.spacing} mm</span>
                  </>
                ),
              };
            })}
          />
        </div>

        <div className="mt-2">
          <div className="field-label">{t('Stone size presets')}</div>
          <PresetRow
            statusId="rhinestone-size-preset-review-status"
            className="flex flex-wrap gap-1"
            label={t('Stone size preset actions')}
            title={t('Use arrow keys to review stone size presets')}
            onKeyDown={handlePresetActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedSizePreset}
            fallback={`${t('Stone Ø (mm)')} ${diameter}`}
            actionAttr="data-rhinestone-preset-action"
            setReviewed={setReviewedSizePreset}
            items={SS_PRESETS.map((p) => {
              const active = Math.abs(diameter - p.mm) < 0.01;
              return {
                key: p.label,
                className: `px-2 py-0.5 rounded-sm border text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink' : 'border-border text-muted hover:text-ink'}`,
                pressed: active,
                onClick: () => setDiameter(p.mm),
                title: `${p.label}: ${p.mm} mm`,
                data: { review: `${p.label} · ${t('Stone Ø (mm)')} ${p.mm}` },
                children: (
                  <>
                    <span className="font-medium">{p.label}</span> <span className="tabular-nums">Ø{p.mm}</span>
                  </>
                ),
              };
            })}
          />
        </div>

        <div className="mt-2">
          <div className="field-label">{t('Stone spacing presets')}</div>
          <PresetRow
            statusId="rhinestone-spacing-preset-review-status"
            className="grid grid-cols-3 gap-1"
            label={t('Stone spacing preset actions')}
            title={t('Use arrow keys to review stone spacing presets')}
            onKeyDown={handleSpacingActionKeys}
            reviewingLabel={t('Reviewing')}
            reviewed={reviewedSpacingPreset}
            fallback={`${t('Spacing (mm)')} ${spacing}`}
            actionAttr="data-rhinestone-spacing-action"
            setReviewed={setReviewedSpacingPreset}
            items={SPACING_PRESETS.map((p) => {
              const active = Math.abs(spacing - p.mm) < 0.01;
              return {
                key: p.label,
                className: `px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`,
                pressed: active,
                onClick: () => setSpacing(p.mm),
                title: `${t(p.label)}: ${p.mm} mm`,
                data: { review: `${t(p.label)} · ${t('Spacing (mm)')} ${p.mm}` },
                children: (
                  <>
                    <span className="block font-medium">{t(p.label)}</span>
                    <span className="block tabular-nums">{p.mm} mm</span>
                  </>
                ),
              };
            })}
          />
        </div>

        <ReviewedFooter
          statusId="rhinestone-action-review-status"
          className="flex justify-end gap-2 mt-4"
          label={t('Rhinestone Template actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Rhinestone Template actions')}
          actionAttr="data-rhinestone-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset rhinestone settings'), className: 'btn', onClick: resetRhinestoneSettings, title: t('Reset rhinestone settings') },
            { children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: apply },
          ]}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
