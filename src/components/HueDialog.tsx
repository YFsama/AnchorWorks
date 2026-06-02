import { useCallback, useState } from 'react';
import { X, Palette } from 'lucide-react';
import { useEditor } from '../store/editor';
import { shiftHueColorsSelection } from '../lib/colorAdjust';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Adjust Hue (Illustrator Edit→Edit Colors / Recolor hue wheel) — rotate the hue
 * of every solid fill/stroke in the selection by a signed number of degrees.
 */
export function HueDialog() {
  const t = useT();
  const open = useEditor(s => s.showHue);
  const close = useCallback(() => useEditor.getState().setModal('showHue', false), []);
  const [deg, setDeg] = useState(0);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = shiftHueColorsSelection(deg);
    if (n > 0) toast.success(`${n} ${t('colours changed')}`, { title: t('Adjust Hue') });
    else toast.warn(t('Select an object with a solid colour first.'), { title: t('Adjust Hue') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hue-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="hue-title" className="dialog-title flex items-center gap-2">
            <Palette size={14} aria-hidden="true" /> {t('Adjust Hue')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Hue shift')}</span><span className="text-ink tabular-nums">{deg > 0 ? '+' : ''}{deg}°</span></div>
          <input type="range" min={-180} max={180} step={1} value={deg} onChange={(e) => setDeg(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Hue shift')} />
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
