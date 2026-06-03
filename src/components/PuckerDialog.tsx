import { useCallback, useState } from 'react';
import { X, Star } from 'lucide-react';
import { useEditor } from '../store/editor';
import { puckerSelection } from '../lib/pucker';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Pucker & Bloat (Illustrator Effect→Distort & Transform→Pucker & Bloat) — bow
 * the segments between anchors toward the centroid (pucker, negative) or away
 * from it (bloat, positive). A single signed amount drives both; undoable.
 */
export function PuckerDialog() {
  const t = useT();
  const open = useEditor(s => s.showPucker);
  const close = useCallback(() => useEditor.getState().setModal('showPucker', false), []);
  const [amount, setAmount] = useState(0);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = puckerSelection(amount / 100);
    if (n > 0) toast.success(`${n} ${t('shapes distorted')}`, { title: t('Pucker & Bloat') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Pucker & Bloat') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pucker-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="pucker-title" className="dialog-title flex items-center gap-2">
            <Star size={14} aria-hidden="true" /> {t('Pucker & Bloat')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between">
            <span>{amount < 0 ? t('Pucker') : t('Bloat')}</span>
            <span className="text-ink tabular-nums">{amount}%</span>
          </div>
          <input type="range" min={-100} max={100} step={1} value={amount} onChange={(e) => setAmount(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Pucker & Bloat')} />
          <div className="flex justify-between type-caption mt-0.5"><span>{t('Pucker')}</span><span>{t('Bloat')}</span></div>
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
