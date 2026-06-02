import { useCallback, useState } from 'react';
import { X, SquareDashed } from 'lucide-react';
import { useEditor } from '../store/editor';
import { makeMarginGuides } from '../lib/canvasEngine';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Margin Guides — drop a safe-area frame of ruler guides inset by a margin from
 * the first artboard's edges, for keeping artwork clear of the trim.
 */
export function MarginGuidesDialog() {
  const t = useT();
  const open = useEditor(s => s.showMarginGuides);
  const close = useCallback(() => useEditor.getState().setModal('showMarginGuides', false), []);
  const [margin, setMargin] = useState(10);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = makeMarginGuides(margin);
    if (n > 0) toast.success(`${n} ${t('guides added')}`, { title: t('Margin Guides') });
    else toast.warn(t('Margin too large or no artboard.'), { title: t('Margin Guides') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="margin-guides-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[300px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="margin-guides-title" className="dialog-title flex items-center gap-2">
            <SquareDashed size={14} aria-hidden="true" /> {t('Margin Guides')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <label className="block">
          <div className="field-label">{t('Margin (mm)')}</div>
          <input type="number" min={0} step={0.5} autoFocus value={margin} onChange={(e) => setMargin(Math.max(0, +e.target.value || 0))} className="input-num w-full" aria-label={t('Margin (mm)')} />
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
