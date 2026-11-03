import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Layers, Upload, Download, Plus, Minus, Trash2 } from 'lucide-react';
import { useEditor } from '../store/editor';
import {
  buildGangSheet,
  composeGangSheetPng,
  loadGangSheetSource,
  type GangSheetResult,
  type GangSheetSource,
  type GangSheetUnfitReason,
} from '../lib/gangSheet';
import { RASTER_NEST_MAX_PARTS } from '../lib/rasterNest';
import { download } from '../lib/io';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/** Fixed-width roll presets — the widths DTF/UV-DTF media actually ships in
 *  (13/22/24 in) plus A4/A3 for sheet-fed proofs. */
const ROLL_PRESETS: Array<{ id: string; label: string; widthMm: number }> = [
  { id: '13in', label: '13 in', widthMm: 330.2 },
  { id: '22in', label: '22 in', widthMm: 558.8 },
  { id: '24in', label: '24 in', widthMm: 609.6 },
  { id: 'a4', label: 'A4', widthMm: 210 },
  { id: 'a3', label: 'A3', widthMm: 297 },
];

const ACCEPTED_TYPES = /^image\/(png|jpeg|webp)$/;

/** Dialog-local unfit reason → user-facing text (machine keys from the lib). */
const UNFIT_TEXT: Record<GangSheetUnfitReason, string> = {
  'too-wide': 'Wider than the roll',
  'too-tall': 'Exceeds the max sheet height',
  'engine-cap': 'Engine part cap reached (60 per sheet)',
  'invalid-size': 'Invalid image size',
};

/** Preview canvas raster width (px) — height follows the sheet aspect. */
const PREVIEW_W = 640;

/**
 * Gang Sheet Builder (拼版工作台) — the DTF/UV-DTF order-fulfilment flow:
 * drop dozens of customer PNGs, set the roll width / gap / DPI, nest them
 * (true-shape when alpha masks are available, rectangles otherwise), preview
 * the layout, and export ONE production PNG ready to print or send to the
 * fulfilment house. The geometry lives in lib/gangSheet; this dialog is the
 * file-intake + parameters + preview + export shell around it.
 */
export function GangSheetDialog() {
  const t = useT();
  const open = useEditor(s => s.showGangSheet);
  const close = useCallback(() => useEditor.getState().setModal('showGangSheet', false), []);
  const [sources, setSources] = useState<GangSheetSource[]>([]);
  const [presetId, setPresetId] = useState('24in');
  const [rollW, setRollW] = useState(609.6);
  const [gapMm, setGapMm] = useState(5);
  const [dpi, setDpi] = useState(300);
  const [allowRotate, setAllowRotate] = useState(true);
  const [result, setResult] = useState<GangSheetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Full-resolution bitmaps for the export compose — kept outside state (they
  // are opaque platform objects, and the preview never needs to re-render on
  // their identity).
  const bitmapsRef = useRef(new Map<string, ImageBitmap>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEscapeClose(open, close);
  useFocusRestore(open);

  /** Any change that invalidates the last build clears it (event handlers,
   *  not effects — the react-hooks/set-state-in-effect rule). */
  const invalidate = useCallback(() => setResult(null), []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const all = Array.from(files);
    const images = all.filter(f => ACCEPTED_TYPES.test(f.type));
    if (images.length === 0) {
      toast.warn(t('Unsupported file type — PNG, JPEG or WebP only.'), { title: t('Gang Sheet Builder') });
      return;
    }
    const skipped = all.length - images.length;
    setBusy(true);
    try {
      // Decode each file twice by design: the mask pass downsamples to ≤256px
      // inside loadGangSheetSource, the kept bitmap stays full resolution.
      const loaded = await Promise.all(images.map(async (file) => {
        const [src, bmp] = await Promise.all([loadGangSheetSource(file), createImageBitmap(file)]);
        return { src, bmp };
      }));
      for (const l of loaded) bitmapsRef.current.set(l.src.id, l.bmp);
      setSources(prev => [...prev, ...loaded.map(l => l.src)]);
      invalidate();
    } catch {
      toast.error(t('Could not decode the image files.'), { title: t('Gang Sheet Builder') });
    } finally {
      setBusy(false);
    }
    if (skipped > 0) toast.info(`${skipped} ${t('files skipped (unsupported type)')}`, { title: t('Gang Sheet Builder') });
  }, [t, invalidate]);

  const removeSource = useCallback((id: string) => {
    const bmp = bitmapsRef.current.get(id);
    if (bmp) { bmp.close(); bitmapsRef.current.delete(id); }
    setSources(prev => prev.filter(s => s.id !== id));
    invalidate();
  }, [invalidate]);

  const setQty = useCallback((id: string, qty: number) => {
    setSources(prev => prev.map(s => (s.id === id ? { ...s, qty } : s)));
    invalidate();
  }, [invalidate]);

  const totalParts = sources.reduce((n, s) => n + s.qty, 0);
  const trueShape = sources.some(s => s.mask);
  const overPartCap = trueShape && totalParts > RASTER_NEST_MAX_PARTS;

  // Build (deferred one tick so the busy state paints before the synchronous
  // nest run blocks the main thread).
  const build = useCallback(() => {
    if (busy || sources.length === 0) return;
    setBusy(true);
    window.setTimeout(() => {
      try {
        setResult(buildGangSheet(sources, { rollWidthMm: rollW, gapMm, dpi, allowRotate90: allowRotate }));
      } catch {
        toast.error(t('Building the gang sheet failed.'), { title: t('Gang Sheet Builder') });
      } finally {
        setBusy(false);
      }
    }, 0);
  }, [busy, sources, rollW, gapMm, dpi, allowRotate, t]);

  const exportPng = useCallback(async () => {
    if (!result || busy) return;
    setBusy(true);
    try {
      const blob = await composeGangSheetPng(result, sources, bitmapsRef.current, { dpi });
      download(`gang-sheet-${new Date().toISOString().slice(0, 10)}.png`, blob, 'image/png');
      toast.success(t('Gang sheet exported'), { title: t('Gang Sheet Builder') });
    } catch {
      toast.error(t('Export failed'), { title: t('Gang Sheet Builder') });
    } finally {
      setBusy(false);
    }
  }, [result, busy, sources, dpi, t]);

  // Preview: scaled layout boxes + file-name labels on a white sheet. Pure
  // canvas side effect — no state writes.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!open || !result || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = PREVIEW_W / Math.max(1, result.sheetWidthMm);
    canvas.width = PREVIEW_W;
    canvas.height = Math.max(1, Math.round(result.sheetHeightMm * scale));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const byId = new Map(sources.map(s => [s.id, s.name]));
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ff2e9a';
    ctx.fillStyle = '#71717a';
    ctx.font = '10px sans-serif';
    for (const p of result.placements) {
      const x = Math.round(p.x * scale) + 0.5;
      const y = Math.round(p.y * scale) + 0.5;
      const w = Math.max(1, Math.round(p.widthMm * scale) - 1);
      const h = Math.max(1, Math.round(p.heightMm * scale) - 1);
      ctx.strokeRect(x, y, w, h);
      if (w > 26 && h > 11) {
        const name = (byId.get(p.id) ?? p.id).replace(/\.[^.]+$/, '').slice(0, 20);
        ctx.fillText(name, x + 2, y + 10);
      }
    }
  }, [open, result, sources]);

  if (!open) return null;

  const stats = result
    ? `${result.placements.length - result.unfit.length}/${result.placements.length} ${t('parts')} · `
      + `${result.sheetWidthMm.toFixed(0)}×${result.sheetHeightMm.toFixed(1)} mm · `
      + `${Math.round(result.utilization * 100)}% ${t('material used')}`
      + (result.unfit.length > 0 ? ` · ${result.unfit.length} ${t('unfit')}` : '')
    : '';
  const unfitSummary = result && result.unfit.length > 0
    ? Object.entries(result.unfit.reduce<Record<string, number>>((acc, u) => {
      acc[u.reason] = (acc[u.reason] ?? 0) + 1;
      return acc;
    }, {})).map(([reason, n]) => `${n} × ${t(UNFIT_TEXT[reason as GangSheetUnfitReason])}`).join(' · ')
    : '';

  const applyPreset = (preset: { id: string; widthMm: number }) => {
    setPresetId(preset.id);
    setRollW(preset.widthMm);
    invalidate();
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gangsheet-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[560px] max-h-[92vh] overflow-y-auto p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="gangsheet-title" className="dialog-title flex items-center gap-2">
            <Layers size={14} aria-hidden="true" /> {t('Gang Sheet Builder')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        {/* Intake: drop zone + file picker (multi-select). */}
        <div
          className={`flex items-center justify-center gap-2 rounded border border-dashed px-3 py-3 text-[11px] transition-colors ${dragOver ? 'border-[#ff2e9a] bg-[#ff2e9a]/10 text-ink' : 'border-border text-muted'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
        >
          <Upload size={13} aria-hidden="true" />
          {t('Drop PNG / JPEG / WebP images here')}
          <button type="button" className="btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {t('Add files')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        {/* File list: name, mm size (at the current DPI), qty stepper, remove. */}
        <div className="mt-3">
          <div className="field-label">{t('Files')}</div>
          {sources.length === 0 ? (
            <div className="type-caption text-muted py-2">{t('No files yet — drop images or add files to build a gang sheet.')}</div>
          ) : (
            <ul className="max-h-40 overflow-y-auto rounded border border-border divide-y divide-border" aria-label={t('Files')}>
              {sources.map((s) => {
                const w = (s.widthPx * 25.4 / dpi).toFixed(1);
                const h = (s.heightPx * 25.4 / dpi).toFixed(1);
                return (
                  <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
                    <span className="flex-1 truncate text-ink" title={s.name}>{s.name}</span>
                    <span className="tabular-nums text-muted">{w}×{h} mm</span>
                    <span className="flex items-center gap-1">
                      <button type="button" className="btn px-1.5 py-0.5" aria-label={t('Decrease quantity')} disabled={s.qty <= 1} onClick={() => setQty(s.id, Math.max(1, s.qty - 1))}><Minus size={10} aria-hidden="true" /></button>
                      <input
                        type="number" min={1} max={99} step={1} value={s.qty}
                        onChange={(e) => setQty(s.id, Math.max(1, Math.min(99, Math.round(+e.target.value || 1))))}
                        className="input-num w-12 text-center" aria-label={`${t('Qty')} — ${s.name}`}
                      />
                      <button type="button" className="btn px-1.5 py-0.5" aria-label={t('Increase quantity')} disabled={s.qty >= 99} onClick={() => setQty(s.id, Math.min(99, s.qty + 1))}><Plus size={10} aria-hidden="true" /></button>
                    </span>
                    <button type="button" className="btn px-1.5 py-0.5" aria-label={`${t('Remove file')} — ${s.name}`} onClick={() => removeSource(s.id)}><Trash2 size={10} aria-hidden="true" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Parameters: roll width presets + custom, gap, DPI, rotation. */}
        <div className="mt-3">
          <div className="field-label">{t('Roll presets')}</div>
          <div className="grid grid-cols-5 gap-1">
            {ROLL_PRESETS.map((preset) => {
              const active = presetId === preset.id && Math.abs(rollW - preset.widthMm) < 0.05;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  title={`${t('Roll width (mm)')} ${preset.widthMm}`}
                  className={`px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`}
                  onClick={() => applyPreset(preset)}
                >
                  <span className="block font-medium">{t(preset.label)}</span>
                  <span className="block tabular-nums">{preset.widthMm} mm</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="block">
            <div className="field-label">{t('Roll width (mm)')}</div>
            <input
              type="number" min={50} max={2000} step={0.1} value={rollW}
              onChange={(e) => { setPresetId('custom'); setRollW(Math.max(50, Math.min(2000, +e.target.value || 50))); invalidate(); }}
              className="input-num w-full" aria-label={t('Roll width (mm)')}
            />
          </label>
          <label className="block">
            <div className="field-label">{t('Gap (mm)')}</div>
            <input
              type="number" min={0} max={20} step={0.5} value={gapMm}
              onChange={(e) => { setGapMm(Math.max(0, Math.min(20, +e.target.value || 0))); invalidate(); }}
              className="input-num w-full" aria-label={t('Gap (mm)')}
            />
          </label>
          <label className="block">
            <div className="field-label">{t('DPI')}</div>
            <input
              type="number" min={72} max={1200} step={1} value={dpi}
              onChange={(e) => { setDpi(Math.max(72, Math.min(1200, Math.round(+e.target.value || 300)))); invalidate(); }}
              className="input-num w-full" aria-label={t('DPI')}
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-1.5 text-[10px] text-muted cursor-pointer" title={t('Turn parts 90° when that nests tighter')}>
          <input type="checkbox" checked={allowRotate} onChange={(e) => { setAllowRotate(e.target.checked); invalidate(); }} />
          {t('Allow 90° rotation')}
        </label>

        {overPartCap && (
          <div className="mt-2 type-caption text-warning">
            {t('More than 60 parts — true-shape nesting places at most 60 per sheet; the rest are reported unfit.')}
          </div>
        )}

        {/* Preview + stats. */}
        <div className="mt-3" aria-live="polite">
          {result ? (
            <>
              <canvas
                ref={previewRef}
                role="img"
                aria-label={`${t('Gang sheet preview')} — ${stats}`}
                className="w-full max-h-[240px] object-contain rounded border border-border bg-white"
              />
              <div className="mt-1 text-[10px] text-muted tabular-nums">{stats}</div>
              {unfitSummary && <div className="mt-0.5 text-[10px] text-warning">{unfitSummary}</div>}
            </>
          ) : (
            <div className="type-caption text-muted py-2">
              {sources.length > 0 ? t('Press Build to nest the files onto the roll.') : t('Add images and press Build to nest them onto the roll.')}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn" onClick={close}>{t('Close')}</button>
          <button
            type="button" className="btn" onClick={() => { void exportPng(); }}
            disabled={!result || busy}
            title={t('Export the composed sheet as a PNG file')}
          >
            <Download size={12} aria-hidden="true" /> {t('Export PNG')}
          </button>
          <button
            type="button" className="btn-primary" onClick={build}
            disabled={sources.length === 0 || busy}
            aria-busy={busy}
            title={t('Nest the files onto the roll')}
          >
            {busy ? t('Building…') : t('Build')}
          </button>
        </div>
      </div>
    </div>
  );
}
