import { useCallback, useState } from 'react';
import { X, Rainbow } from 'lucide-react';
import { useEditor } from '../store/editor';
import { warpArcSelection } from '../lib/warp';
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

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = warpArcSelection(bend);
    if (n > 0) toast.success(`${n} ${t('shapes warped')}`, { title: t('Arc Warp') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Arc Warp') });
    close();
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

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Bend')}</span><span className="text-ink tabular-nums">{bend > 0 ? '+' : ''}{bend}%</span></div>
          <input type="range" min={-100} max={100} step={1} value={bend} onChange={(e) => setBend(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Bend')} />
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
