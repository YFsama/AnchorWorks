import { useCallback, useState } from 'react';
import { X, Blend as BlendIcon } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { blendSelection } from '../lib/blend';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Blend (Illustrator Object→Blend) — insert N interpolated copies between the
 * two selected objects (position / scale / rotation / opacity / colour).
 */
export function BlendDialog() {
  const t = useT();
  const open = useEditor(s => s.showBlend);
  const close = useCallback(() => useEditor.getState().setModal('showBlend', false), []);
  const [steps, setSteps] = useState(5);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = async () => {
    if ((getCanvas()?.getActiveObjects().length ?? 0) < 2) { toast.warn(t('Select two objects to blend.'), { title: t('Blend') }); return; }
    const n = await blendSelection(steps);
    if (n > 0) toast.success(`${n} ${t('blend steps added')}`, { title: t('Blend') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="blend-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[300px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="blend-title" className="dialog-title flex items-center gap-2">
            <BlendIcon size={14} aria-hidden="true" /> {t('Blend')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block mb-2">
          <div className="field-label flex items-center justify-between">
            <span>{t('Steps')}</span>
            <span className="text-ink tabular-nums">{steps}</span>
          </div>
          <input
            type="range" min={1} max={50} step={1}
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value, 10))}
            className="w-full"
            aria-label={t('Steps')}
          />
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={() => { void apply(); }}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
