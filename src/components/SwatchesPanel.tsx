import { useEffect, useState } from 'react';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { getSwatches, addSwatch, removeSwatch, SWATCHES_EVENT } from '../lib/swatches';
import { useEditor } from '../store/editor';
import { applyStyleToSelection } from '../lib/canvasEngine';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';

/**
 * Swatches panel — a persistent palette of reusable colours. Click a swatch to
 * apply it as the fill (and set the current fill style); Alt-click applies it as
 * the stroke. "+" saves the current fill; the × removes a swatch.
 */
export function SwatchesPanel() {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [swatches, setSwatches] = useState<string[]>([]);
  const fill = useEditor(s => s.style.fill);

  useEffect(() => {
    const refresh = () => setSwatches(getSwatches());
    refresh();
    window.addEventListener(SWATCHES_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SWATCHES_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const apply = (hex: string, asStroke: boolean) => {
    const patch = asStroke ? { stroke: hex } : { fill: hex };
    useEditor.getState().setStyle(patch);
    applyStyleToSelection(patch);
  };

  return (
    <div className="panel-section">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="panel-header w-full text-left hover:bg-panel3 transition-colors"
          aria-expanded={open}
          aria-controls="swatches-panel-body"
        >
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
            {t('Swatches')}
          </span>
          <span className="panel-count">{swatches.length}</span>
        </button>
      </h3>
      {open && (
        <div id="swatches-panel-body" className="px-3 pb-3">
          <div className="grid grid-cols-8 gap-1.5">
            {swatches.map((c) => (
              <div key={c} className="relative group/sw">
                <button
                  type="button"
                  onClick={(e) => apply(c, e.altKey)}
                  className="w-full aspect-square rounded border border-border"
                  style={{ backgroundColor: c }}
                  title={`${c} — ${t('click to fill, Alt-click for stroke')}`}
                  aria-label={`${t('Apply swatch')} ${c}`}
                />
                <button
                  type="button"
                  onClick={() => removeSwatch(c)}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-panel border border-border text-[8px] leading-none text-muted opacity-0 group-hover/sw:opacity-100 hover:text-ink transition-opacity"
                  title={t('Remove swatch')}
                  aria-label={`${t('Remove swatch')} ${c}`}
                >×</button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => { if (addSwatch(fill)) toast.success(t('Swatch added')); else toast.warn(t('Already in swatches.')); }}
              className="w-full aspect-square rounded border border-dashed border-border flex items-center justify-center text-muted hover:text-ink hover:border-accent2 transition-colors"
              title={t('Add current fill as swatch')}
              aria-label={t('Add current fill as swatch')}
            >
              <Plus size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
