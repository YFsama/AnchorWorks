import { useCallback, useState } from 'react';
import { X, Spline } from 'lucide-react';
import { useEditor } from '../store/editor';
import { offsetPathSelection } from '../lib/offsetPath';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Offset Path (Illustrator Object→Path→Offset Path) — add a parallel copy of the
 * selection offset by a distance (positive = outward, negative = inward). The
 * original is kept.
 */
export function OffsetPathDialog() {
  const t = useT();
  const open = useEditor(s => s.showOffsetPath);
  const close = useCallback(() => useEditor.getState().setModal('showOffsetPath', false), []);
  const [offset, setOffset] = useState(2);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = offsetPathSelection(offset);
    if (n > 0) toast.success(`${n} ${t('offset paths added')}`, { title: t('Offset Path') });
    else toast.warn(t('Select one or more paths/shapes first.'), { title: t('Offset Path') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="offset-path-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="offset-path-title" className="dialog-title flex items-center gap-2">
            <Spline size={14} aria-hidden="true" /> {t('Offset Path')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block mb-1">
          <div className="field-label">{t('Offset (mm)')}</div>
          <input
            type="number" step={0.5} className="input-num"
            value={offset}
            onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
          />
        </label>
        <p className="text-[10px] text-muted leading-relaxed">
          {t('Positive offsets outward, negative inward. The original is kept.')}
        </p>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
