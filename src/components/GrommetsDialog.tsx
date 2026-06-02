import { useCallback, useState } from 'react';
import { X, CircleDot } from 'lucide-react';
import { useEditor } from '../store/editor';
import { grommetsFromSelection } from '../lib/grommets';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

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

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

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

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="grommets-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
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

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
