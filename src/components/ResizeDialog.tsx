import { useCallback, useState } from 'react';
import { X, Scaling } from 'lucide-react';
import { useEditor } from '../store/editor';
import { scaleSelectionToSize, selectionSizeMm } from '../lib/scaleToSize';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Resize to exact size — scale the selection so its bounding box matches a
 * target width/height in mm, optionally locking the aspect ratio. Prefilled with
 * the current size when opened.
 */
export function ResizeDialog() {
  const t = useT();
  const open = useEditor(s => s.showResize);
  const close = useCallback(() => useEditor.getState().setModal('showResize', false), []);
  // The dialog is conditionally mounted ({showResize && …}), so a lazy initial
  // state prefills with the live selection size once per open — no effect.
  const [w, setW] = useState(() => { const s = selectionSizeMm(); return s ? s.w.toFixed(1) : ''; });
  const [h, setH] = useState(() => { const s = selectionSizeMm(); return s ? s.h.toFixed(1) : ''; });
  const [lock, setLock] = useState(true);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const wv = parseFloat(w), hv = parseFloat(h);
    const ok = scaleSelectionToSize(Number.isFinite(wv) ? wv : null, Number.isFinite(hv) ? hv : null, lock);
    if (ok) toast.success(t('Resized'), { title: t('Resize') });
    else toast.warn(t('Select an object first.'), { title: t('Resize') });
    close();
  };

  // With lock on, editing one field previews the other from the current ratio.
  const ratio = (() => { const s = selectionSizeMm(); return s && s.h > 0 ? s.w / s.h : 1; })();
  const onW = (v: string) => { setW(v); if (lock) { const n = parseFloat(v); if (Number.isFinite(n)) setH((n / ratio).toFixed(1)); } };
  const onH = (v: string) => { setH(v); if (lock) { const n = parseFloat(v); if (Number.isFinite(n)) setW((n * ratio).toFixed(1)); } };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="resize-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[300px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="resize-title" className="dialog-title flex items-center gap-2">
            <Scaling size={14} aria-hidden="true" /> {t('Resize')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label">{t('Width (mm)')}</div>
            <input type="number" min={0} step={0.1} value={w} onChange={(e) => onW(e.target.value)} className="input-num w-full" aria-label={t('Width (mm)')} />
          </label>
          <label className="block">
            <div className="field-label">{t('Height (mm)')}</div>
            <input type="number" min={0} step={0.1} value={h} onChange={(e) => onH(e.target.value)} className="input-num w-full" aria-label={t('Height (mm)')} />
          </label>
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
          <span>{t('Lock aspect ratio')}</span>
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
