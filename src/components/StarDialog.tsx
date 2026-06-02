import { useCallback, useState } from 'react';
import { X, Star } from 'lucide-react';
import { useEditor } from '../store/editor';
import { insertStar, insertRegularPolygon } from '../lib/shapes';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Star / Polygon insert (Illustrator Star & Polygon tools) — drop a parametric
 * star (points + inner-radius ratio) or regular polygon centred on the document.
 */
export function StarDialog() {
  const t = useT();
  const open = useEditor(s => s.showStar);
  const close = useCallback(() => useEditor.getState().setModal('showStar', false), []);
  const [mode, setMode] = useState<'star' | 'polygon'>('star');
  const [points, setPoints] = useState(5);
  const [ratio, setRatio] = useState(0.45);

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const apply = () => {
    const ok = mode === 'star' ? insertStar(points, ratio) : insertRegularPolygon(points);
    if (ok) toast.success(t(mode === 'star' ? 'Star added' : 'Polygon added'), { title: t('Star / Polygon') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="star-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[320px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="star-title" className="dialog-title flex items-center gap-2">
            <Star size={14} aria-hidden="true" /> {t('Star / Polygon')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="flex gap-1 mb-3" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'star'} className={mode === 'star' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setMode('star')}>{t('Star')}</button>
          <button type="button" role="tab" aria-selected={mode === 'polygon'} className={mode === 'polygon' ? 'btn-primary flex-1' : 'btn flex-1'} onClick={() => setMode('polygon')}>{t('Polygon')}</button>
        </div>

        <label className="block">
          <div className="field-label flex items-center justify-between"><span>{mode === 'star' ? t('Points') : t('Sides')}</span><span className="text-ink tabular-nums">{points}</span></div>
          <input type="range" min={3} max={20} step={1} value={points} onChange={(e) => setPoints(parseInt(e.target.value, 10))} className="w-full" aria-label={mode === 'star' ? t('Points') : t('Sides')} />
        </label>

        {mode === 'star' && (
          <label className="block mt-2">
            <div className="field-label flex items-center justify-between"><span>{t('Inner radius')}</span><span className="text-ink tabular-nums">{Math.round(ratio * 100)}%</span></div>
            <input type="range" min={0.05} max={0.95} step={0.01} value={ratio} onChange={(e) => setRatio(parseFloat(e.target.value))} className="w-full" aria-label={t('Inner radius')} />
          </label>
        )}

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply}>{t('Insert')}</button>
        </div>
      </div>
    </div>
  );
}
