import { useCallback, useState } from 'react';
import { X, Tornado } from 'lucide-react';
import { useEditor } from '../store/editor';
import { twistSelection } from '../lib/twist';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Twist (Illustrator Effect→Distort & Transform→Twist) — swirl the selected
 * path/shape around its centre. Angle = the rotation at the outer edge (negative
 * twists the other way). Undoable, so the user can dial it in.
 */
export function TwistDialog() {
  const t = useT();
  const open = useEditor(s => s.showTwist);
  const close = useCallback(() => useEditor.getState().setModal('showTwist', false), []);
  const [angle, setAngle] = useState(45);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = twistSelection(angle);
    if (n > 0) toast.success(`${n} ${t('shapes twisted')}`, { title: t('Twist') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Twist') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="twist-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="twist-title" className="dialog-title flex items-center gap-2">
            <Tornado size={14} aria-hidden="true" /> {t('Twist')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Angle')}</span><span className="text-ink tabular-nums">{angle}°</span></div>
          <input type="range" min={-360} max={360} step={1} value={angle} onChange={(e) => setAngle(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Angle')} />
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
