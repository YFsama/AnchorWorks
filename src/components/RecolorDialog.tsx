import { useCallback, useState } from 'react';
import { X, Palette, RotateCcw } from 'lucide-react';
import { useEditor } from '../store/editor';
import { collectSelectionColors, recolorSelection } from '../lib/selectionApply';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Recolor Artwork — remap every solid fill/stroke colour in the selection
 * through a source → target swatch table (Illustrator's Recolor Artwork). The
 * source list is harvested from the selection (groups included) when the dialog
 * opens; each row's target defaults to its source until the user changes it.
 */
export function RecolorDialog() {
  const t = useT();
  const open = useEditor(s => s.showRecolor);
  const close = useCallback(() => useEditor.getState().setModal('showRecolor', false), []);

  // Re-harvest source colours once per open transition (React's "adjust state
  // on prop change" pattern — no effect).
  const [prevOpen, setPrevOpen] = useState(open);
  const [sources, setSources] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const cols = collectSelectionColors();
      setSources(cols);
      setTargets(Object.fromEntries(cols.map(c => [c, c])));
    }
  }

  useEscapeClose(open, close);
  useFocusRestore(open);
  if (!open) return null;

  const setTarget = (src: string, v: string) => setTargets(m => ({ ...m, [src]: v }));
  const resetAll = () => setTargets(Object.fromEntries(sources.map(c => [c, c])));

  const apply = () => {
    const n = recolorSelection(targets);
    if (n > 0) toast.success(`${n} ${t('paints recolored')}`, { title: t('Recolor Artwork') });
    else toast.warn(t('Nothing changed — pick different target colors.'), { title: t('Recolor Artwork') });
    close();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recolor-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[360px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="recolor-title" className="dialog-title flex items-center gap-2">
            <Palette size={14} aria-hidden="true" /> {t('Recolor Artwork')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        {sources.length === 0 ? (
          <p className="text-xs text-muted py-4 text-center">{t('No solid colors in the selection to recolor.')}</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
            {sources.map((src) => (
              <div key={src} className="flex items-center gap-2 text-xs">
                <span className="w-5 h-5 rounded-sm border border-border shrink-0" style={{ background: src }} aria-hidden="true" />
                <span className="flex-1 font-mono text-[10px] text-muted truncate">{src}</span>
                <span aria-hidden="true" className="text-muted">→</span>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(targets[src] ?? '') ? targets[src] : '#000000'}
                  onChange={(e) => setTarget(src, e.target.value)}
                  className="input-num p-0.5 h-6 w-10 cursor-pointer"
                  aria-label={`${t('Recolor')} ${src}`}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button type="button" className="btn flex items-center gap-1 !text-[11px]" onClick={resetAll} disabled={!sources.length}>
            <RotateCcw size={11} aria-hidden="true" /> {t('Reset')}
          </button>
          <div className="flex-1" />
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary" onClick={apply} disabled={!sources.length}>{t('Apply')}</button>
        </div>
      </div>
    </div>
  );
}
