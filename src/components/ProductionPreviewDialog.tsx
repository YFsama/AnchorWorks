import { useCallback, useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { X, Printer } from 'lucide-react';
import { useEditor } from '../store/editor';
import { getCanvas, pushHistory } from '../lib/canvasEngine';
import {
  buildProductionPreview,
  cutPathsForSelection,
  SHEET_PRESETS,
  type ProductionPreviewResult,
} from '../lib/productionPreview';
import { toast } from '../lib/toast';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { actionReviewKey, makeRovingKeys, useReviewedAction } from './ui/useRovingActions';
import { PresetRow } from './ui/PresetRow';
import { ReviewedFooter } from './ui/ReviewedFooter';

/** 96dpi mm→px divisor shared across the cutter pipeline (canvas px per mm). */
const MM_TO_PX = 3.7795;

/** Debounce for the live preview rebuild (typing cadence, not per keystroke). */
const PREVIEW_DEBOUNCE_MS = 250;

/**
 * Production Preview (生产预览) — impose the selection onto a printable
 * sheet: artwork copies nested true-shape (nestPolygons), Cricut-style ink
 * bleed baked in (bleedExpand), magenta cut-line overlay, Roland corner
 * registration marks — composed live by lib/productionPreview. Apply turns
 * the preview into real output: the sheet PNG is inserted as one image at
 * scale 1/raster-multiplier with its top-left at the DOCUMENT ORIGIN
 * (0,0), and the store's cut paths are REPLACED by the imposed per-copy
 * contours + regmarks — what you previewed is exactly what prints and cuts.
 */
export function ProductionPreviewDialog() {
  const t = useT();
  const open = useEditor(s => s.showProductionPreview);
  const [presetId, setPresetId] = useState('a4');
  const [sheetW, setSheetW] = useState(210);
  /** 0 = roll: height grows to whatever the nesting consumes. */
  const [sheetH, setSheetH] = useState(297);
  const [gapMm, setGapMm] = useState(2);
  const [bleedMm, setBleedMm] = useState(1.6);
  const [bleedMode, setBleedMode] = useState<'ring' | 'nearest'>('ring');
  const [copies, setCopies] = useState(50);
  const [allowRotation, setAllowRotation] = useState(true);
  const [showCutLines, setShowCutLines] = useState(true);
  const [showMarks, setShowMarks] = useState(true);
  const [result, setResult] = useState<ProductionPreviewResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [reviewedPreset, setReviewedPreset] = useReviewedAction();
  const [reviewedFooterAction, setReviewedFooterAction] = useReviewedAction();
  // Modal-only dismiss (zustand = external system) for the open-guard effect,
  // mirroring MakeStickerDialog — React setState in an effect body is banned.
  const dismiss = useCallback(() => useEditor.getState().setModal('showProductionPreview', false), []);
  // Every close path (Cancel, backdrop, Escape, Apply) re-arms the one-shot
  // Apply so the next open starts fresh — React setState lives in the event
  // handler, not an effect (react-hooks/set-state-in-effect).
  const close = useCallback(() => {
    setApplied(false);
    setApplying(false);
    useEditor.getState().setModal('showProductionPreview', false);
  }, []);

  useEscapeClose(open, close);
  useFocusRestore(open);

  // Guard on open: imposition needs a selection to rasterize. Menu/palette/
  // context-menu entries already guard, but programmatic opens land here
  // unguarded — mirror the toast + close (MakeStickerDialog pattern).
  useEffect(() => {
    if (!open) return;
    if ((getCanvas()?.getActiveObjects().length ?? 0) < 1) {
      toast.warn(t('Select something first.'), { title: t('Production Preview') });
      dismiss();
    }
  }, [open, t, dismiss]);

  // Live preview — rebuild debounced 250ms after any option settles. The
  // store's non-regmark cut paths feed the footprint (falls back to the
  // selection bbox when none exist). A cancelled build never clobbers a
  // newer one.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      const c = getCanvas();
      const objects = c?.getActiveObjects() ?? [];
      // Only SELECTION-derived contours impose — the whole store would fold
      // unrelated contours and doc-wide weed borders into every copy.
      const storeCuts = cutPathsForSelection(useEditor.getState().cutPaths, objects);
      setBuilding(true);
      void buildProductionPreview(objects, storeCuts, {
        sheetWidthMm: sheetW,
        sheetHeightMm: sheetH > 0 ? sheetH : undefined,
        gapMm,
        copies,
        bleedMm,
        bleedMode,
        allowRotation,
        showCutLines,
        showMarks,
      }).then((r) => {
        if (!cancelled) { setResult(r); setBuilding(false); }
      }).catch(() => {
        if (!cancelled) { setResult(null); setBuilding(false); }
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [open, sheetW, sheetH, gapMm, copies, bleedMm, bleedMode, allowRotation, showCutLines, showMarks]);

  if (!open) return null;

  const applyPreset = (preset: { id: string; widthMm: number; heightMm?: number }) => {
    setPresetId(preset.id);
    setSheetW(preset.widthMm);
    setSheetH(preset.heightMm ?? 0);
  };

  const resetSettings = () => {
    setPresetId('a4');
    setSheetW(210);
    setSheetH(297);
    setGapMm(2);
    setBleedMm(1.6);
    setBleedMode('ring');
    setCopies(50);
    setAllowRotation(true);
    setShowCutLines(true);
    setShowMarks(true);
    setReviewedPreset('');
    setReviewedFooterAction(t('Reset production preview settings'));
  };

  const apply = async () => {
    const c = getCanvas();
    const selected = c?.getActiveObjects() ?? [];
    if (!c || !selected.length) {
      toast.warn(t('Select something first.'), { title: t('Production Preview') });
      return;
    }
    if (!result || applying || applied) return;
    setApplying(true);
    try {
      // Bitmap px are result.pxPerMm per mm; the canvas draws 3.7795 px per
      // mm → scale = 3.7795/pxPerMm (= 1 / the bleed raster's multiplier).
      // The sheet lands with its top-left at the document origin (0,0).
      const img = await fabric.FabricImage.fromURL(result.url, { crossOrigin: null });
      const s = MM_TO_PX / result.pxPerMm;
      img.set({ left: 0, top: 0, scaleX: s, scaleY: s });
      img.setCoords();
      c.add(img);

      const ed = useEditor.getState();
      if (!ed.cutPaths.some(p => p.kind !== 'regmark')) {
        toast.info(t('No cut paths found — sheet cut carries only registration marks.'), { title: t('Production Preview') });
      }
      // REPLACING the store's cut paths: this is the imposed production
      // layout, not an addition to the design-time contours.
      ed.setCutPaths(result.cutPaths);
      ed.setCutPathsVisible(true);
      c.requestRenderAll();
      pushHistory();
      toast.success(t('Production layout applied'), { title: t('Production Preview') });
      setApplied(true);
      close();
    } catch {
      setApplying(false);
      toast.error(t('Preview failed — try Ring bleed mode or a smaller sheet.'), { title: t('Production Preview') });
    }
  };

  const handleFooterActionKeys = makeRovingKeys({
    selector: '[data-pprev-action]',
    reviewKey: actionReviewKey('data-pprev-action'),
    fallbackToText: true,
    setReview: setReviewedFooterAction,
  });

  const handlePresetActionKeys = makeRovingKeys({
    selector: '[data-pprev-preset-action]',
    wrap: true,
    guardEmpty: true,
    defer: true,
    setReview: setReviewedPreset,
    onNavigate: (_button, index) => {
      const preset = SHEET_PRESETS[index];
      if (preset) applyPreset(preset);
    },
  });

  // Live stats line — "12 copies · 210×297 mm · 78% material".
  const stats = result
    ? `${result.copies} ${t('copies')} · ${result.sheetW.toFixed(0)}×${result.sheetH.toFixed(0)} mm · ${Math.round(result.utilization * 100)}% ${t('material used')}`
    : '';

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pprev-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[460px] p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="pprev-title" className="dialog-title flex items-center gap-2">
            <Printer size={14} aria-hidden="true" /> {t('Production Preview')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}><X size={14} aria-hidden="true" /></button>
        </div>

        <div className="field-label">{t('Sheet presets')}</div>
        <PresetRow
          statusId="pprev-preset-review-status"
          className="grid grid-cols-5 gap-1"
          label={t('Production preview sheet presets')}
          title={t('Use arrow keys to review sheet presets')}
          onKeyDown={handlePresetActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedPreset}
          fallback={`${t('Sheet width (mm)')} ${sheetW} · ${sheetH > 0 ? `${t('Sheet height (mm)')} ${sheetH}` : t('roll (auto height)')}`}
          actionAttr="data-pprev-preset-action"
          setReviewed={setReviewedPreset}
          items={SHEET_PRESETS.map((preset) => {
            const active = presetId === preset.id && sheetW === preset.widthMm && sheetH === (preset.heightMm ?? 0);
            return {
              key: preset.id,
              className: `px-2 py-1 rounded-sm border text-left text-[10px] transition-colors ${active ? 'border-[#ff2e9a] text-ink bg-[#ff2e9a]/10' : 'border-border text-muted hover:text-ink'}`,
              pressed: active,
              onClick: () => applyPreset(preset),
              title: `${t(preset.label)}`,
              data: { review: `${t(preset.label)} · ${preset.widthMm}${preset.heightMm ? `×${preset.heightMm}` : ` ${t('roll (auto height)')}`}` },
              children: (
                <>
                  <span className="block font-medium">{t(preset.label)}</span>
                  <span className="block tabular-nums">{preset.heightMm ? `${preset.widthMm}×${preset.heightMm}` : `${preset.widthMm} mm`}</span>
                </>
              ),
            };
          })}
        />

        <div className="mt-3 grid grid-cols-4 gap-2">
          <label className="block">
            <div className="field-label">{t('Sheet width (mm)')}</div>
            <input
              type="number" min={50} max={1500} step={1} value={sheetW}
              onChange={(e) => { setPresetId('custom'); setSheetW(Math.max(50, Math.min(1500, +e.target.value || 50))); }}
              className="input-num w-full" aria-label={t('Sheet width (mm)')}
            />
          </label>
          <label className="block">
            <div className="field-label">{t('Sheet height (mm)')}</div>
            <input
              type="number" min={0} max={3000} step={1} value={sheetH}
              onChange={(e) => { setPresetId('custom'); setSheetH(Math.max(0, Math.min(3000, +e.target.value || 0))); }}
              className="input-num w-full" aria-label={t('Sheet height (mm)')}
            />
            <div className="mt-1 type-caption text-muted">{t('0 = roll (auto height)')}</div>
          </label>
          <label className="block">
            <div className="field-label">{t('Gap (mm)')}</div>
            <input
              type="number" min={0} max={10} step={0.5} value={gapMm}
              onChange={(e) => setGapMm(Math.max(0, Math.min(10, +e.target.value || 0)))}
              className="input-num w-full" aria-label={t('Gap (mm)')}
            />
          </label>
          <label className="block">
            <div className="field-label">{t('Copies')}</div>
            <input
              type="number" min={1} max={200} step={1} value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(200, Math.round(+e.target.value || 1))))}
              className="input-num w-full" aria-label={t('Copies')}
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 items-start">
          <label className="block">
            <div className="field-label">{t('Bleed (mm)')}</div>
            <input
              type="number" min={0} max={5} step={0.1} value={bleedMm}
              onChange={(e) => setBleedMm(Math.max(0, Math.min(5, +e.target.value || 0)))}
              className="input-num w-full" aria-label={t('Bleed (mm)')}
            />
          </label>
          <div>
            <div className="field-label">{t('Bleed mode')}</div>
            <div className="flex gap-1" role="radiogroup" aria-label={t('Bleed mode')}>
              {(['ring', 'nearest'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={bleedMode === mode}
                  title={mode === 'ring' ? t('Ring-draw edge smear — works everywhere') : t('Nearest-colour HQ smear — needs real canvas pixels')}
                  className={`flex-1 ${bleedMode === mode ? 'btn-primary' : 'btn'}`}
                  onClick={() => setBleedMode(mode)}
                >
                  {mode === 'ring' ? t('Ring smear') : t('Nearest')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <label className="flex items-center gap-1.5 text-[10px] text-muted cursor-pointer" title={t('Turn copies 90° when that nests tighter')}>
            <input type="checkbox" checked={allowRotation} onChange={(e) => setAllowRotation(e.target.checked)} />
            {t('Allow 90° rotation')}
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted cursor-pointer" title={t('Overlay the proposed cut contours on the preview')}>
            <input type="checkbox" checked={showCutLines} onChange={(e) => setShowCutLines(e.target.checked)} />
            {t('Cut lines')}
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted cursor-pointer" title={t('Four corner L registration marks for print-then-cut alignment')}>
            <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} />
            {t('Registration marks')}
          </label>
        </div>

        {/* Live composed sheet — constrained to the dialog width. */}
        <div className="mt-3" aria-live="polite">
          {building && !result && <div className="type-caption text-muted">{t('Building preview…')}</div>}
          {!building && !result && (
            <div className="type-caption text-warning">{t('Preview failed — try Ring bleed mode or a smaller sheet.')}</div>
          )}
          {result && (
            <>
              <img
                src={result.url}
                alt={t('Production Preview')}
                className="max-w-full max-h-[220px] object-contain rounded border border-border bg-white"
              />
              <div className="mt-1 text-[10px] text-muted tabular-nums">{stats}</div>
            </>
          )}
        </div>

        <ReviewedFooter
          statusId="pprev-action-review-status"
          className="flex justify-end gap-2 mt-4"
          label={t('Production Preview actions')}
          title={t('Use arrow keys to review dialog actions')}
          onKeyDown={handleFooterActionKeys}
          reviewingLabel={t('Reviewing')}
          reviewed={reviewedFooterAction}
          fallback={t('Production Preview actions')}
          actionAttr="data-pprev-action"
          setReviewed={setReviewedFooterAction}
          actions={[
            { children: t('Cancel'), review: t('Cancel'), className: 'btn', onClick: close },
            { children: t('Reset'), review: t('Reset production preview settings'), className: 'btn', onClick: resetSettings, title: t('Reset production preview settings') },
            {
              children: t('Apply'), review: t('Apply'), className: 'btn-primary', onClick: () => { void apply(); },
              title: t('Insert the imposed sheet and replace cut paths'),
              disabled: building || applying || applied || !result,
              'aria-busy': applying,
            },
          ]}
        />
      </div>
    </div>
  );
}
