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
  const [scaleX, setScaleX] = useState(100);
  const [scaleY, setScaleY] = useState(100);
  // Linked = uniform scale (the previous behaviour); unlink for non-uniform.
  const [linkScale, setLinkScale] = useState(true);
  const [rotate, setRotate] = useState(0);
  const setSX = (v: number) => { const n = Math.max(1, v || 100); setScaleX(n); if (linkScale) setScaleY(n); };
  const setSY = (v: number) => { const n = Math.max(1, v || 100); setScaleY(n); if (linkScale) setScaleX(n); };
  const [copy, setCopy] = useState(false);
  const [each, setEach] = useState(false);
  // Move can be entered as X/Y or polar distance+angle (Illustrator's Move
  // dialog). Angle is Illustrator-style: 0° = right, 90° = up.
  const [moveMode, setMoveMode] = useState<'xy' | 'polar'>('xy');
  const [dist, setDist] = useState(0);
  const [angle, setAngle] = useState(0);
  // Unit is the shared document unit (store) so the Transform dialog, inspector,
  // rulers and status bar always agree; toggling here flips them all.
  const unit = useEditor(s => s.dimUnit);
  const setUnit = useEditor(s => s.setDimUnit);
  const k = unit === 'mm' ? 3.7795 : 1;

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = async () => {
    if (!getCanvas()?.getActiveObject()) { toast.warn(t('Select something to transform.'), { title: t('Transform') }); return; }
    // Resolve the move into X/Y (in the active unit). Screen Y grows downward,
    // so a positive (up) angle negates the Y component.
    const rad = (angle * Math.PI) / 180;
    const mdx = moveMode === 'polar' ? dist * Math.cos(rad) : dx;
    const mdy = moveMode === 'polar' ? -dist * Math.sin(rad) : dy;
    const ok = await applyTransform({ dx: mdx * k, dy: mdy * k, scale: scaleX / 100, scaleY: scaleY / 100, rotate, copy, each });
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

        <div className="flex gap-1 mb-2" role="radiogroup" aria-label={t('Unit')}>
          <button type="button" role="radio" aria-checked={unit === 'mm'} className={unit === 'mm' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setUnit('mm')}>mm</button>
          <button type="button" role="radio" aria-checked={unit === 'px'} className={unit === 'px' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setUnit('px')}>px</button>
        </div>

        <div className="flex gap-1 mb-2" role="radiogroup" aria-label={t('Move mode')}>
          <button type="button" role="radio" aria-checked={moveMode === 'xy'} className={moveMode === 'xy' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setMoveMode('xy')}>{t('XY')}</button>
          <button type="button" role="radio" aria-checked={moveMode === 'polar'} className={moveMode === 'polar' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setMoveMode('polar')}>{t('Polar')}</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {moveMode === 'xy' ? (
            <>
              <Field label={`${t('Move')} X (${unit})`}>
                <input type="number" className="input-num" value={dx} onChange={(e) => setDx(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label={`${t('Move')} Y (${unit})`}>
                <input type="number" className="input-num" value={dy} onChange={(e) => setDy(parseFloat(e.target.value) || 0)} />
              </Field>
            </>
          ) : (
            <>
              <Field label={`${t('Distance')} (${unit})`}>
                <input type="number" className="input-num" value={dist} onChange={(e) => setDist(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label={`${t('Angle')} (°)`}>
                <input type="number" step={1} className="input-num" value={angle} onChange={(e) => setAngle(parseFloat(e.target.value) || 0)} />
              </Field>
            </>
          )}
          <Field label={`${t('Scale')} X (%)`}>
            <input type="number" min={1} step={1} className="input-num" value={scaleX} onChange={(e) => setSX(parseFloat(e.target.value))} />
          </Field>
          <Field label={`${t('Scale')} Y (%)`}>
            <input type="number" min={1} step={1} className="input-num" value={scaleY} onChange={(e) => setSY(parseFloat(e.target.value))} />
          </Field>
          <Field label={`${t('Rotate')} (°)`}>
            <input type="number" step={1} className="input-num" value={rotate} onChange={(e) => setRotate(parseFloat(e.target.value) || 0)} />
          </Field>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer self-end pb-2" title={t('Scale X and Y together')}>
            <input type="checkbox" checked={linkScale} onChange={(e) => { setLinkScale(e.target.checked); if (e.target.checked) setScaleY(scaleX); }} />
            {t('Link scale')}
          </label>
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
