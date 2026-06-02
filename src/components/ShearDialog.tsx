import { useCallback, useState } from 'react';
import { X, Italic } from 'lucide-react';
import { useEditor } from '../store/editor';
import { shearSelection } from '../lib/transformOps';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Shear (Illustrator Object→Transform→Shear) — skew the selection by an angle
 * along the horizontal or vertical axis, about its centre.
 */
export function ShearDialog() {
  const t = useT();
  const open = useEditor(s => s.showShear);
  const close = useCallback(() => useEditor.getState().setModal('showShear', false), []);
  const [angle, setAngle] = useState(15);
  const [axis, setAxis] = useState<'horizontal' | 'vertical'>('horizontal');

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    if (shearSelection(angle, axis)) toast.success(t('Sheared'), { title: t('Shear') });
    else toast.warn(t('Select an object first.'), { title: t('Shear') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shear-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="shear-title" className="dialog-title flex items-center gap-2">
            <Italic size={14} aria-hidden="true" /> {t('Shear')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Shear angle')}</span><span className="text-ink tabular-nums">{angle > 0 ? '+' : ''}{angle}°</span></div>
          <input type="range" min={-85} max={85} step={1} value={angle} onChange={(e) => setAngle(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Shear angle')} />
        </label>

        <div className="flex gap-1 mt-3" role="radiogroup" aria-label={t('Axis')}>
          <button type="button" role="radio" aria-checked={axis === 'horizontal'} className={axis === 'horizontal' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setAxis('horizontal')}>{t('Horizontal')}</button>
          <button type="button" role="radio" aria-checked={axis === 'vertical'} className={axis === 'vertical' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setAxis('vertical')}>{t('Vertical')}</button>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
