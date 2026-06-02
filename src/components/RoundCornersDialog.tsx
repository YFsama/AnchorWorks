import { useCallback, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { roundCornersOnSelection } from '../lib/roundCorners';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Round Corners (Illustrator Effect→Stylize→Round Corners) — fillet the selected
 * path/shape corners by a radius (mm). Undoable, so the user can dial and retry.
 */
export function RoundCornersDialog() {
  const t = useT();
  const open = useEditor(s => s.showRoundCorners);
  const close = useCallback(() => useEditor.getState().setModal('showRoundCorners', false), []);
  const [radius, setRadius] = useState(3);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = roundCornersOnSelection(radius);
    if (n > 0) toast.success(`${n} ${t('shapes rounded')}`, { title: t('Round Corners') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Round Corners') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="round-corners-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="round-corners-title" className="dialog-title flex items-center gap-2">
            <Spline size={14} aria-hidden="true" /> {t('Round Corners')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block mb-2">
          <div className="field-label flex items-center justify-between">
            <span>{t('Radius (mm)')}</span>
            <span className="text-ink tabular-nums">{radius.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0.5} max={40} step={0.5}
            value={radius}
            onChange={(e) => setRadius(parseFloat(e.target.value))}
            className="w-full"
            aria-label={t('Radius (mm)')}
          />
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
