import { useCallback, useMemo, useState } from 'react';
import { X, Printer } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas } from '../lib/canvasEngine';
import { tilePrint } from '../lib/io3';
import { PAGE_DIMS_MM, type PrintOptions } from '../lib/printer';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const MM_TO_PX = 3.7795; // 96dpi

/**
 * Tile / panel print — split an oversized design across a grid of pages with
 * an optional glue overlap, the large-format workflow Illustrator (Print →
 * Tiling) and SignMaster (Paneling) both provide. Replaces the old
 * prompt()-driven flow with a real dialog + live grid preview.
 */
export function TilePrintDialog() {
  const t = useT();
  const open = useEditor(s => s.showTilePrint);
  const close = useCallback(() => useEditor.getState().setModal('showTilePrint', false), []);
  const [pageSize, setPageSize] = useState<PrintOptions['pageSize']>('A4');
  const [orientation, setOrientation] = useState<PrintOptions['orientation']>('portrait');
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(2);
  const [overlapMm, setOverlapMm] = useState(0);

  useEscapeClose(open, close);
  useFocusRestore(open);

  // Raster the canvas once per open for the preview backdrop.
  const art = useMemo(() => {
    if (!open) return null;
    const c = getCanvas();
    if (!c) return null;
    try {
      return { url: c.toDataURL({ format: 'png', multiplier: 1 }), w: c.getWidth(), h: c.getHeight() };
    } catch {
      return null;
    }
  }, [open]);

  if (!open) return null;

  const doPrint = () => {
    const [pwMm, phMm] = orientation === 'portrait'
      ? PAGE_DIMS_MM[pageSize]
      : ([...PAGE_DIMS_MM[pageSize]].reverse() as [number, number]);
    tilePrint({
      pageW: Math.round(pwMm * MM_TO_PX),
      pageH: Math.round(phMm * MM_TO_PX),
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      overlapPx: Math.max(0, overlapMm) * MM_TO_PX,
    });
    close();
  };

  const cw = art?.w ?? 800;
  const ch = art?.h ?? 600;
  const overlapPx = Math.max(0, overlapMm) * MM_TO_PX;

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tile-print-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[640px] max-w-[95%] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="tile-print-title" className="dialog-title">{t('Tile Print…')}</h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="flex gap-4">
          <div className="w-[280px] shrink-0">
            <Field label={t('Page size')}>
              <select className="input-num" value={pageSize} onChange={(e) => setPageSize(e.target.value as PrintOptions['pageSize'])}>
                <option>A4</option><option>A3</option><option>Letter</option><option>Legal</option>
              </select>
            </Field>
            <Field label={t('Orientation')}>
              <select className="input-num" value={orientation} onChange={(e) => setOrientation(e.target.value as PrintOptions['orientation'])}>
                <option value="portrait">{t('Portrait')}</option><option value="landscape">{t('Landscape')}</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('Columns')}>
                <input type="number" min={1} max={20} className="input-num" value={cols}
                  onChange={(e) => setCols(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} />
              </Field>
              <Field label={t('Rows')}>
                <input type="number" min={1} max={20} className="input-num" value={rows}
                  onChange={(e) => setRows(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} />
              </Field>
            </div>
            <Field label={t('Overlap (mm)')}>
              <input type="number" min={0} max={50} step={1} className="input-num" value={overlapMm}
                onChange={(e) => setOverlapMm(Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)))}
                title={t('Shared margin between pages so they can be taped together.')} />
            </Field>
            <div className="text-[10px] text-muted mt-1 tabular-nums">
              {cols * rows} {t('pages')} · {cols}×{rows}
            </div>
          </div>

          {/* Live grid preview over the artwork. */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="field-label">{t('Preview')}</div>
            <svg
              viewBox={`0 0 ${cw} ${ch}`}
              className="w-full flex-1 min-h-[240px] bg-panel2 border border-border rounded-sm"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={t('Tile preview')}
            >
              <rect x={0} y={0} width={cw} height={ch} fill="#ffffff" />
              {art && <image href={art.url} x={0} y={0} width={cw} height={ch} preserveAspectRatio="none" />}
              {/* Overlap bands. */}
              {overlapPx > 0 && Array.from({ length: cols - 1 }, (_, i) => (
                <rect key={`ov${i}`} x={(i + 1) * cw / cols - overlapPx / 2} y={0} width={overlapPx} height={ch} fill="#ff2e9a" opacity={0.12} />
              ))}
              {overlapPx > 0 && Array.from({ length: rows - 1 }, (_, j) => (
                <rect key={`oh${j}`} x={0} y={(j + 1) * ch / rows - overlapPx / 2} width={cw} height={overlapPx} fill="#ff2e9a" opacity={0.12} />
              ))}
              {/* Grid lines. */}
              {Array.from({ length: cols - 1 }, (_, i) => (
                <line key={`v${i}`} x1={(i + 1) * cw / cols} y1={0} x2={(i + 1) * cw / cols} y2={ch} stroke="#ff2e9a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {Array.from({ length: rows - 1 }, (_, j) => (
                <line key={`h${j}`} x1={0} y1={(j + 1) * ch / rows} x2={cw} y2={(j + 1) * ch / rows} stroke="#ff2e9a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              <rect x={0} y={0} width={cw} height={ch} fill="none" stroke="#c8c8c8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
          <button type="button" className="btn-primary flex items-center gap-1" onClick={doPrint}>
            <Printer size={12} aria-hidden="true" /> {t('Print')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-2"><div className="field-label">{label}</div>{children}</label>;
}
