import { useCallback, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { roughenSelection } from '../lib/roughen';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Roughen (Illustrator Effect→Distort→Roughen) — jitter the selected path/shape
 * for a hand-drawn / distressed edge. Size = max displacement, Detail = point
 * spacing. Undoable, so the user can dial and re-roll.
 */
export function RoughenDialog() {
  const t = useT();
  const open = useEditor(s => s.showRoughen);
  const close = useCallback(() => useEditor.getState().setModal('showRoughen', false), []);
  const [size, setSize] = useState(1);
  const [detail, setDetail] = useState(3);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = roughenSelection(size, detail);
    if (n > 0) toast.success(`${n} ${t('shapes roughened')}`, { title: t('Roughen') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Roughen') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="roughen-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="roughen-title" className="dialog-title flex items-center gap-2">
            <Spline size={14} aria-hidden="true" /> {t('Roughen')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Size (mm)')}</span><span className="text-ink tabular-nums">{size.toFixed(1)}</span></div>
            <input type="range" min={0.1} max={10} step={0.1} value={size} onChange={(e) => setSize(parseFloat(e.target.value))} className="w-full" aria-label={t('Size (mm)')} />
          </label>
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Detail (mm)')}</span><span className="text-ink tabular-nums">{detail.toFixed(1)}</span></div>
            <input type="range" min={0.5} max={20} step={0.5} value={detail} onChange={(e) => setDetail(parseFloat(e.target.value))} className="w-full" aria-label={t('Detail (mm)')} />
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
