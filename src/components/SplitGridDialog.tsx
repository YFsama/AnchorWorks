import { useCallback, useState } from 'react';
import { X, Grid3x3 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { splitIntoGrid } from '../lib/splitGrid';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Split Into Grid (Illustrator Object→Path→Split Into Grid) — divide the selected
 * object's bounds into a rows×cols grid of rectangles with an optional gutter.
 */
export function SplitGridDialog() {
  const t = useT();
  const open = useEditor(s => s.showSplitGrid);
  const close = useCallback(() => useEditor.getState().setModal('showSplitGrid', false), []);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [gutter, setGutter] = useState(0);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const n = splitIntoGrid(rows, cols, gutter);
    if (n > 0) toast.success(`${n} ${t('cells created')}`, { title: t('Split Into Grid') });
    else toast.warn(t('Select a single object first.'), { title: t('Split Into Grid') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="splitgrid-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="splitgrid-title" className="dialog-title flex items-center gap-2">
            <Grid3x3 size={14} aria-hidden="true" /> {t('Split Into Grid')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Rows')}</span><span className="text-ink tabular-nums">{rows}</span></div>
            <input type="range" min={1} max={20} step={1} value={rows} onChange={(e) => setRows(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Rows')} />
          </label>
          <label className="block">
            <div className="field-label flex items-center justify-between"><span>{t('Columns')}</span><span className="text-ink tabular-nums">{cols}</span></div>
            <input type="range" min={1} max={20} step={1} value={cols} onChange={(e) => setCols(parseInt(e.target.value, 10))} className="w-full" aria-label={t('Columns')} />
          </label>
        </div>
        <label className="block mt-2">
          <div className="field-label flex items-center justify-between"><span>{t('Gutter (mm)')}</span><span className="text-ink tabular-nums">{gutter.toFixed(1)}</span></div>
          <input type="range" min={0} max={20} step={0.5} value={gutter} onChange={(e) => setGutter(parseFloat(e.target.value))} className="w-full" aria-label={t('Gutter (mm)')} />
        </label>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
