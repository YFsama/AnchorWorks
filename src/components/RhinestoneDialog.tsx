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
        <div className="flex flex-wrap gap-1 mt-1">
          {SS_PRESETS.map(p => (
            <button key={p.label} type="button"
              onClick={() => setDiameter(p.mm)}
              className={`px-2 py-0.5 rounded-sm border text-[10px] transition-colors ${Math.abs(diameter - p.mm) < 0.01 ? 'border-[#ff2e9a] text-ink' : 'border-border text-muted hover:text-ink'}`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
