import { useCallback, useState } from 'react';
import { X, Move3D } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { applyTransform } from '../lib/transformOps';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Numeric Transform (Illustrator Object→Transform) — move / scale / rotate the
 * selection by exact values, optionally to a copy. Scale + rotate pivot on the
 * selection centre; move is applied after.
 */
export function TransformDialog() {
  const t = useT();
  const open = useEditor(s => s.showTransform);
  const close = useCallback(() => useEditor.getState().setModal('showTransform', false), []);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [scale, setScale] = useState(100);
  const [rotate, setRotate] = useState(0);
  const [copy, setCopy] = useState(false);
  const [each, setEach] = useState(false);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = async () => {
    if (!getCanvas()?.getActiveObject()) { toast.warn(t('Select something to transform.'), { title: t('Transform') }); return; }
    const ok = await applyTransform({ dx, dy, scale: scale / 100, rotate, copy, each });
    if (ok) toast.success(copy ? t('Transformed copy') : t('Transformed'), { title: t('Transform') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transform-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="transform-title" className="dialog-title flex items-center gap-2">
            <Move3D size={14} aria-hidden="true" /> {t('Transform')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={`${t('Move')} X (px)`}>
            <input type="number" className="input-num" value={dx} onChange={(e) => setDx(parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label={`${t('Move')} Y (px)`}>
            <input type="number" className="input-num" value={dy} onChange={(e) => setDy(parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label={`${t('Scale')} (%)`}>
            <input type="number" min={1} step={1} className="input-num" value={scale} onChange={(e) => setScale(Math.max(1, parseFloat(e.target.value) || 100))} />
          </Field>
          <Field label={`${t('Rotate')} (°)`}>
            <input type="number" step={1} className="input-num" value={rotate} onChange={(e) => setRotate(parseFloat(e.target.value) || 0)} />
          </Field>
        </div>

        <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
          {t('Apply to a copy')}
        </label>
        <label className="flex items-center gap-2 mt-1 text-xs cursor-pointer" title={t('Pivot each object on its own centre instead of the selection centre.')}>
          <input type="checkbox" checked={each} onChange={(e) => setEach(e.target.checked)} />
          {t('Transform each')}
        </label>

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={() => { void apply(); }}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
