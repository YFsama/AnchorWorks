import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { X, Shapes, Upload, Wand2, ImageDown, Plus } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas, getHistory, pushHistory } from '../lib/canvasEngine';
import {
  traceToArtAsync,
  buildTracedArtGroup,
  TRACE_ART_MAX_DIM,
  type TraceToArtResult,
} from '../lib/traceToArt';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

const MM_TO_PX = 3.7795; // 96dpi convention shared across the trace pipeline
const ACCEPTED_TYPES = /^image\/(png|jpeg|webp)$/;
/** Uploaded files have no on-canvas size — default them to 96 dpi. */
const UPLOAD_PPI = 96;
/** Decode cap for uploaded files (the selection path caps at TRACE_ART_MAX_DIM). */
const UPLOAD_MAX_DIM = 1024;
/** Preview raster width (px); height follows the traced-art aspect. */
const PREVIEW_W = 560;

type DetailId = 'coarse' | 'medium' | 'fine';
const DETAIL_PRESETS: { id: DetailId; label: string; tolerance: number }[] = [
  { id: 'coarse', label: 'Coarse', tolerance: 2 },
  { id: 'medium', label: 'Medium', tolerance: 1 },
  { id: 'fine', label: 'Fine', tolerance: 0.5 },
];
const COLOR_CHIPS = [2, 4, 6, 8];

/** A decoded, trace-ready source: pixels + the mm geometry needed to place
 *  the result back onto the document. */
interface PreparedSource {
  kind: 'selection' | 'upload';
  name: string;
  imgData: ImageData;
  pixelSizeMm: number;
  /** The source's own on-document width (mm) — the default output size. */
  naturalWidthMm: number;
  /** Document-mm position of the source's (0,0). Null for uploads (placed
   *  onto the first artboard at insert time). */
  originMm: { x: number; y: number } | null;
}

/**
 * Trace to Vector Art (Kittl Vectorizer / Linearity Auto Trace / Illustrator
 * Image Trace counterpart): turn a bitmap — a selected canvas image or an
 * uploaded PNG/JPEG/WebP — into editable filled vector paths, one per colour
 * cluster, grouped as a single named object. Geometry lives in
 * lib/traceToArt; this dialog is the source-intake + parameters + preview +
 * insert shell.
 */
export function TraceArtDialog() {
  const t = useT();
  const open = useEditor(s => s.showTraceArt);
  const close = useCallback(() => useEditor.getState().setModal('showTraceArt', false), []);

  const [source, setSource] = useState<PreparedSource | null>(null);
  const [colorCount, setColorCount] = useState(6);
  const [detail, setDetail] = useState<DetailId>('medium');
  const [minSizeMm, setMinSizeMm] = useState(2);
  const [outWidthMm, setOutWidthMm] = useState('');
  const [result, setResult] = useState<TraceToArtResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEscapeClose(open, close);
  useFocusRestore(open);

  /** Any parameter change invalidates the traced preview (event handlers,
   *  not effects — the react-hooks/set-state-in-effect rule). */
  const invalidate = useCallback(() => setResult(null), []);

  /** Read the active fabric image: render offscreen (cap TRACE_ART_MAX_DIM),
   *  grab pixels, derive pixelSizeMm + the image's document-mm origin. Mirrors
   *  CutContourDialog.prepareTraceImage; returns null after toasting. */
  const prepareSelection = useCallback((): PreparedSource | null => {
    const c = getCanvas();
    if (!c) return null;
    const active = c.getActiveObject();
    if (!(active instanceof fabric.FabricImage)) {
      toast.warn(t('The selected object is not a bitmap image.'), { title: t('Trace to Vector Art') });
      return null;
    }
    const img = active as fabric.FabricImage & { _element?: HTMLImageElement };
    const src = img._element ?? img.getElement?.() as HTMLImageElement | undefined;
    if (!src) {
      toast.error(t('Image source unavailable.'), { title: t('Trace failed') });
      return null;
    }
    const naturalW = src.naturalWidth || src.width;
    const naturalH = src.naturalHeight || src.height;
    if (!naturalW || !naturalH) return null;
    const scale = Math.min(1, TRACE_ART_MAX_DIM / Math.max(naturalW, naturalH));
    let imgData: ImageData;
    try {
      imgData = rasterize(src, naturalW * scale, naturalH * scale);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'SecurityError') {
        toast.error(
          t('The image is cross-origin and cannot be read pixel-by-pixel. Save it locally and drag it in as a file.'),
          { title: t('Trace blocked by browser') },
        );
      } else {
        toast.error((err as Error).message, { title: t('Trace failed') });
      }
      return null;
    }
    // On-canvas display width ÷ rendered pixels → screen px per rendered
    // pixel, ÷ MM_TO_PX → mm per rendered pixel (CutContour convention).
    const screenW = (img.width ?? 1) * (img.scaleX ?? 1);
    const pixelSizeMm = (screenW / Math.max(1, imgData.width)) / MM_TO_PX;
    const r = img.getBoundingRect();
    return {
      kind: 'selection',
      name: (img as fabric.FabricImage & { name?: string }).name || t('Selected image'),
      imgData,
      pixelSizeMm,
      naturalWidthMm: imgData.width * pixelSizeMm,
      originMm: { x: r.left / MM_TO_PX, y: r.top / MM_TO_PX },
    };
  }, [t]);

  // Auto-pick-up the active image on open. The scan reads pixels (a side
  // effect), so it runs deferred via timeout — setState lands in an async
  // callback, not synchronously inside the effect (ProductionPreview's
  // open-scan pattern).
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const prepared = prepareSelection();
      if (prepared) {
        setSource(prepared);
        setOutWidthMm(prepared.naturalWidthMm.toFixed(1));
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, prepareSelection]);

  /** Reset everything a new source invalidates. */
  const adoptSource = useCallback((next: PreparedSource) => {
    setSource(next);
    setOutWidthMm(next.naturalWidthMm.toFixed(1));
    setResult(null);
  }, []);

  const useSelected = useCallback(() => {
    const prepared = prepareSelection();
    if (prepared) adoptSource(prepared);
  }, [prepareSelection, adoptSource]);

  const addFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.test(file.type)) {
      toast.warn(t('Unsupported file type — PNG, JPEG or WebP only.'), { title: t('Trace to Vector Art') });
      return;
    }
    setBusy(true);
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, UPLOAD_MAX_DIM / Math.max(bmp.width, bmp.height));
      const imgData = rasterize(bmp, bmp.width * scale, bmp.height * scale);
      bmp.close();
      const pixelSizeMm = 25.4 / UPLOAD_PPI;
      adoptSource({
        kind: 'upload',
        name: file.name,
        imgData,
        pixelSizeMm,
        naturalWidthMm: imgData.width * pixelSizeMm,
        originMm: null,
      });
    } catch {
      toast.error(t('Could not decode the image file.'), { title: t('Trace to Vector Art') });
    } finally {
      setBusy(false);
    }
  }, [t, adoptSource]);

  const runTrace = useCallback(async () => {
    if (!source || busy) return;
    setBusy(true);
    setProgress(t('Tracing colour {0} of {1}…').replace('{0}', '0').replace('{1}', String(colorCount)));
    try {
      const res = await traceToArtAsync(
        source.imgData,
        source.pixelSizeMm,
        { colorCount, simplifyTolerance: DETAIL_PRESETS.find(d => d.id === detail)!.tolerance, minSizeMm },
        (done, total) => {
          setProgress(t('Tracing colour {0} of {1}…').replace('{0}', String(done)).replace('{1}', String(total)));
        },
      );
      setResult(res);
      if (res.pieces.length === 0) {
        toast.warn(t('Nothing to trace — try more colours or a smaller minimum size.'), { title: t('Trace to Vector Art') });
      }
    } catch (err) {
      toast.error((err as Error).message, { title: t('Trace failed') });
      setResult(null);
    } finally {
      setProgress('');
      setBusy(false);
    }
  }, [source, busy, t, colorCount, detail, minSizeMm]);

  /** Where an uploaded (unplaced) source lands: the first artboard's top-left
   *  plus a 10 mm margin, or the document origin when there are no artboards. */
  const uploadOrigin = useCallback((): { x: number; y: number } => {
    const a = useEditor.getState().artboards[0];
    return a
      ? { x: a.x / MM_TO_PX + 10, y: a.y / MM_TO_PX + 10 }
      : { x: 0, y: 0 };
  }, []);

  const insert = useCallback(async () => {
    const c = getCanvas();
    if (!c || !source || busy) return;
    const widthMm = parseFloat(outWidthMm);
    setBusy(true);
    try {
      const { group, result: res } = await buildTracedArtGroup(
        source.imgData,
        source.pixelSizeMm,
        source.originMm ?? uploadOrigin(),
        {
          colorCount,
          simplifyTolerance: DETAIL_PRESETS.find(d => d.id === detail)!.tolerance,
          minSizeMm,
          targetWidthMm: Number.isFinite(widthMm) && widthMm > 0 ? widthMm : undefined,
        },
      );
      // One undo entry for the whole artwork insert (the multi-trace
      // suspend/resume + pushHistory idiom).
      getHistory()?.suspend();
      c.add(group);
      getHistory()?.resume();
      pushHistory();
      c.setActiveObject(group);
      c.requestRenderAll();
      toast.success(`${res.pieces.length} ${t('color layers inserted')}`, { title: t('Trace to Vector Art') });
      close();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.warn(
        /nothing to trace/i.test(message)
          ? t('Nothing to trace — try more colours or a smaller minimum size.')
          : message || t('Trace failed'),
        { title: t('Trace to Vector Art') },
      );
    } finally {
      setBusy(false);
    }
  }, [source, busy, t, colorCount, detail, minSizeMm, outWidthMm, close, uploadOrigin]);

  // Preview: paint every piece's path data with evenodd onto a white canvas,
  // scaled to fit. Pure canvas side effect — no state writes.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!open || !result || !canvas || result.pieces.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof Path2D === 'undefined') return;
    const { minX, minY, maxX, maxY } = result.boundsMm;
    const wMm = Math.max(1e-6, maxX - minX);
    const hMm = Math.max(1e-6, maxY - minY);
    const scale = Math.min(PREVIEW_W / wMm, 240 / hMm);
    canvas.width = Math.max(1, Math.round(wMm * scale));
    canvas.height = Math.max(1, Math.round(hMm * scale));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
    for (const piece of result.pieces) {
      ctx.fillStyle = piece.color;
      ctx.fill(new Path2D(piece.pathData), 'evenodd');
    }
    ctx.restore();
  }, [open, result]);

  if (!open) return null;

  const totalRings = result?.pieces.reduce((n, p) => n + p.ringCount, 0) ?? 0;
  const stats = result && result.pieces.length > 0
    ? `${result.pieces.length} ${t('colors')} · ${totalRings} ${t('rings')} · `
      + `${(result.boundsMm.maxX - result.boundsMm.minX).toFixed(1)}×${(result.boundsMm.maxY - result.boundsMm.minY).toFixed(1)} mm`
    : '';
  const hasSelectionImage = getCanvas()?.getActiveObject() instanceof fabric.FabricImage;

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="traceart-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[560px] max-h-[92vh] overflow-y-auto p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="traceart-title" className="dialog-title flex items-center gap-2">
            <Shapes size={14} aria-hidden="true" /> {t('Trace to Vector Art')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <p className="text-muted text-[11px] leading-relaxed mb-3">
          {t('Convert a bitmap into editable vector art — one filled path per colour, ready for clean outlines, layered vinyl and infinite scaling.')}
        </p>

        {/* Source: the selected canvas bitmap, or an uploaded file. */}
        <div className="flex items-center gap-2">
          <span className="field-label shrink-0">{t('Source')}</span>
          <span className="flex-1 truncate text-[11px] text-ink" title={source?.name ?? ''}>
            {source
              ? `${source.kind === 'selection' ? t('Selected image') : t('Uploaded file')} — ${source.name} (${source.imgData.width}×${source.imgData.height} px)`
              : t('No source yet — select a bitmap on the canvas or upload a PNG, JPEG or WebP file.')}
          </span>
          <button
            type="button" className="btn" onClick={useSelected}
            disabled={busy || !hasSelectionImage}
            title={t('Use selected image')}
          >
            <ImageDown size={12} aria-hidden="true" /> {t('Use selected image')}
          </button>
          <button
            type="button" className="btn" onClick={() => fileInputRef.current?.click()} disabled={busy}
            title={t('Upload file…')}
          >
            <Upload size={12} aria-hidden="true" /> {t('Upload file…')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void addFile(f); e.target.value = ''; }}
          />
        </div>

        {/* Colour count: preset chips + free stepper. */}
        <div className="mt-3">
          <div className="field-label">{t('Colors')} (2–8)</div>
          <div className="flex items-center gap-1">
            {COLOR_CHIPS.map((n) => {
              const active = colorCount === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={active}
                  className={`px-2.5 py-1 rounded-sm border text-[11px] tabular-nums transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`}
                  onClick={() => { setColorCount(n); invalidate(); }}
                  title={`${t('Colors')}: ${n}`}
                >
                  {n}
                </button>
              );
            })}
            <input
              type="number" min={2} max={8} step={1} value={colorCount}
              onChange={(e) => { setColorCount(Math.max(2, Math.min(8, Math.round(+e.target.value || 6)))); invalidate(); }}
              className="input-num w-14 ml-1" aria-label={`${t('Colors')} (2–8)`}
            />
          </div>
        </div>

        {/* Detail: three tolerance presets. */}
        <div className="mt-3">
          <div className="field-label">{t('Detail')}</div>
          <div className="grid grid-cols-3 gap-1" role="toolbar" aria-label={t('Detail')}>
            {DETAIL_PRESETS.map((d) => {
              const active = detail === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={active}
                  className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${active ? 'bg-[#ff2e9a]/15 border-[#ff2e9a] text-ink' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
                  onClick={() => { setDetail(d.id); invalidate(); }}
                >
                  {t(d.label)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <div className="field-label">{t('Minimum size')} (mm)</div>
            <input
              type="number" min={1} max={10} step={0.5} value={minSizeMm}
              onChange={(e) => { setMinSizeMm(Math.max(1, Math.min(10, +e.target.value || 2))); invalidate(); }}
              className="input-num w-full" aria-label={`${t('Minimum size')} (mm)`}
            />
          </label>
          <label className="block">
            <div className="field-label">{t('Output width (mm)')}</div>
            <input
              type="number" min={1} step={0.1} value={outWidthMm}
              placeholder={source ? source.naturalWidthMm.toFixed(1) : '—'}
              onChange={(e) => { setOutWidthMm(e.target.value); }}
              className="input-num w-full" aria-label={t('Output width (mm)')}
            />
          </label>
        </div>
        <div className="mt-1 text-[10px] text-muted">{t('Leave empty to keep the source size.')}</div>

        {/* Preview + stats. */}
        <div className="mt-3" aria-live="polite">
          {result && result.pieces.length > 0 ? (
            <>
              <canvas
                ref={previewRef}
                role="img"
                aria-label={`${t('Traced preview')} — ${stats}`}
                className="w-full max-h-[240px] object-contain rounded border border-border bg-white"
              />
              <div className="mt-1 text-[10px] text-muted tabular-nums">{stats}</div>
              <div className="mt-0.5 text-[10px] text-muted">{t('Preview shows the traced colour layers before insertion.')}</div>
            </>
          ) : (
            <div className="type-caption text-muted py-2">
              {source ? t('Press Trace to convert the source into colour layers.') : ''}
            </div>
          )}
        </div>

        {progress && (
          <p className="mt-2 text-[10px] text-[#ff2e9a] tabular-nums" aria-live="polite">{progress}</p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn" onClick={close}>{t('Close')}</button>
          <button
            type="button" className="btn-primary flex items-center gap-1.5" onClick={() => { void runTrace(); }}
            disabled={!source || busy}
            aria-busy={busy}
            title={t('Trace the source into colour layers')}
          >
            <Wand2 size={12} aria-hidden="true" /> {t('Trace')}
          </button>
          <button
            type="button" className="btn-primary flex items-center gap-1.5" onClick={() => { void insert(); }}
            disabled={!source || busy || !result || result.pieces.length === 0}
            aria-busy={busy}
            title={t('Insert the traced artwork onto the canvas')}
          >
            <Plus size={12} aria-hidden="true" /> {t('Insert as artwork')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Draw a bitmap source into a fresh ImageData buffer at the requested size. */
function rasterize(src: CanvasImageSource, w: number, h: number): ImageData {
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(w));
  tmp.height = Math.max(1, Math.round(h));
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(src, 0, 0, tmp.width, tmp.height);
  return ctx.getImageData(0, 0, tmp.width, tmp.height);
}
