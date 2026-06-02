import { useCallback, useState } from 'react';
import { X, Activity } from 'lucide-react';
import { useEditor } from '../store/editor';
import { zigzagSelection } from '../lib/zigzag';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Zig Zag (Illustrator Effect→Distort & Transform→Zig Zag) — displace the
 * selected path/shape into a regular zig-zag (corner) or wave (smooth). Size =
 * amplitude, Ridges = wave count. Undoable, so the user can dial it in.
 */
export function ZigzagDialog() {
  const t = useT();
  const open = useEditor(s => s.showZigzag);
  const close = useCallback(() => useEditor.getState().setModal('showZigzag', false), []);
  const [size, setSize] = useState(2);
  const [ridges, setRidges] = useState(12);
  const [smooth, setSmooth] = useState(false);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = zigzagSelection(size, ridges, smooth);
    if (n > 0) toast.success(`${n} ${t('shapes zig-zagged')}`, { title: t('Zig Zag') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Zig Zag') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="zigzag-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="zigzag-title" className="dialog-title flex items-center gap-2">
            <Activity size={14} aria-hidden="true" /> {t('Zig Zag')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Size (mm)')}</span><span className="text-ink tabular-nums">{size.toFixed(1)}</span></div>
            <input type="range" min={0.1} max={10} step={0.1} value={size} onChange={(e) => setSize(parseFloat(e.target.value))} className="w-full" aria-label={t('Size (mm)')} />
          </label>
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Ridges')}</span><span className="text-ink tabular-nums">{ridges}</span></div>
            <input type="range" min={1} max={60} step={1} value={ridges} onChange={(e) => setRidges(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Ridges')} />
          </label>
        </div>

        <label className="flex items-center gap-2 mt-3 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
          <span>{t('Smooth (wave)')}</span>
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
