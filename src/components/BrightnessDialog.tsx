import { useCallback, useState } from 'react';
import { X, Sun } from 'lucide-react';
import { useEditor } from '../store/editor';
import { brightnessColorsSelection } from '../lib/colorAdjust';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Adjust Brightness (Edit Colors) — lighten or darken the lightness of every
 * solid fill/stroke in the selection. −100% black, +100% doubles lightness.
 */
export function BrightnessDialog() {
  const t = useT();
  const open = useEditor(s => s.showBrightness);
  const close = useCallback(() => useEditor.getState().setModal('showBrightness', false), []);
  const [amount, setAmount] = useState(0);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = brightnessColorsSelection(amount);
    if (n > 0) toast.success(`${n} ${t('colours changed')}`, { title: t('Adjust Brightness') });
    else toast.warn(t('Select an object with a solid colour first.'), { title: t('Adjust Brightness') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="brightness-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="brightness-title" className="dialog-title flex items-center gap-2">
            <Sun size={14} aria-hidden="true" /> {t('Adjust Brightness')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{t('Brightness')}</span><span className="text-ink tabular-nums">{amount > 0 ? '+' : ''}{amount}%</span></div>
          <input type="range" min={-100} max={100} step={1} value={amount} onChange={(e) => setAmount(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Brightness')} />
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
