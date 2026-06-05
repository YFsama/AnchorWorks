import { useCallback, useMemo, useState } from 'react';
import * as fabric from 'fabric';
import {
  X, Scissors, ImageDown, Crosshair, Eye, EyeOff, Trash2, Wand2, RefreshCw,
} from 'lucide-react';
import { useEditor, type CutPath } from '../store/editor';
import { useT } from '../lib/i18n';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { getCanvas } from '../lib/canvasEngine';
import {
  traceBitmap,
  generateRegMarks,
  defaultTraceOptions,
} from '../lib/cutContour';
import { buildOutlineCutPaths } from '../lib/contourFromSelection';
import { toast } from '../lib/toast';
import { CutPreview } from './CutPreview';

const MM_TO_PX = 3.7795; // 96dpi convention used everywhere else

type Tab = 'contour' | 'trace' | 'regmark';
const TABS: Tab[] = ['contour', 'trace', 'regmark'];

function handlePresetToolbarKeys(event: React.KeyboardEvent<HTMLDivElement>, onReview?: (label: string) => void) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-cut-preset-action]'));
  const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? actions.length - 1
      : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
  actions[nextIndex]?.click();
  onReview?.(actions[nextIndex]?.dataset.cutPresetReview ?? '');
  actions[nextIndex]?.focus();
}

export function CutContourDialog() {
  const t = useT();
  const open = useEditor(s => s.showCutContour);
  const close = useCallback(() => useEditor.getState().setModal('showCutContour', false), []);
  const cutPaths = useEditor(s => s.cutPaths);
  const cutPathsVisible = useEditor(s => s.cutPathsVisible);
  const selectionKey = useEditor(s => s.selectionIds.join('|'));
  const setCutPathsVisible = useEditor(s => s.setCutPathsVisible);
  const addCutPaths = useEditor(s => s.addCutPaths);
  const clearCutPaths = useEditor(s => s.clearCutPaths);

  const [tab, setTab] = useState<Tab>('contour');
  // Contour params
  const [offsetMm, setOffsetMm] = useState(2);
  const [offsetPasses, setOffsetPasses] = useState(1);
  const [replaceExistingContour, setReplaceExistingContour] = useState(true);
  // Trace params
  const [traceThreshold, setTraceThreshold] = useState(defaultTraceOptions.threshold);
  const [traceUseAlpha, setTraceUseAlpha] = useState(defaultTraceOptions.useAlpha);
  const [traceSimplify, setTraceSimplify] = useState(defaultTraceOptions.simplifyTolerance);
  const [replaceExistingTrace, setReplaceExistingTrace] = useState(true);
  // RegMark params. Roland CutStudio default is symmetric (5mm uniform
  // inset) but real print jobs often want a wider top inset to clear a
  // title bar / a deeper right inset to clear bleed. Split into X and Y
  // so the user can dial those in. The two values also accept negative
  // numbers — useful when the marks need to sit OUTSIDE the artwork
  // boundary (e.g. when the cutter scans an oversize substrate).
  const [regArm, setRegArm] = useState(10);
  const [regInsetX, setRegInsetX] = useState(5);
  const [regInsetY, setRegInsetY] = useState(5);
  const [reviewedCleanupAction, setReviewedCleanupAction] = useState('');
  const [reviewedOutputAction, setReviewedOutputAction] = useState('');
  // When set, the next "Place" call uses the selected image's bbox
  // instead of the first artboard. Lets users contour-cut around a
  // specific printed item even when the artboard is the full sheet.
  const [regFitToSelection, setRegFitToSelection] = useState(false);

  useEscapeClose(open, close);
  useFocusRestore(open);

  // Live count of cut-path kinds drives the "Clear" buttons + status row.
  const counts = useMemo(() => ({
    outline: cutPaths.filter(p => p.kind === 'outline').length,
    trace: cutPaths.filter(p => p.kind === 'trace').length,
    regmark: cutPaths.filter(p => p.kind === 'regmark').length,
    total: cutPaths.length,
  }), [cutPaths]);


  const handleCutActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-cut-contour-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedCleanupAction(nextAction?.dataset.cutContourActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const handleOutputActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-cut-output-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedOutputAction(nextAction?.dataset.cutOutputActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const contourPreview = useMemo(() => {
    void selectionKey;
    if (!open || tab !== 'contour') return [];
    const selected = getCanvas()?.getActiveObjects() ?? [];
    if (selected.length === 0) return [];
    return buildOutlineCutPaths(selected, offsetMm, offsetPasses).map((path, i) => ({
      ...path,
      id: `preview-contour-${i}`,
      kind: 'outline' as const,
    }));
  }, [open, tab, selectionKey, offsetMm, offsetPasses]);

  const regMarkPreview = useMemo(() => {
    void selectionKey;
    if (!open || tab !== 'regmark') return [];
    const bounds = resolveRegMarkBounds(regFitToSelection, cutPaths);
    const { spec } = buildRegMarkSpec(bounds, regArm, regInsetX, regInsetY);
    return generateRegMarks(spec).map((path, i) => ({ ...path, id: `preview-regmark-${i}` }));
  }, [open, tab, selectionKey, cutPaths, regFitToSelection, regArm, regInsetX, regInsetY]);

  const previewPaths = tab === 'contour'
    ? [...cutPaths.filter(p => !replaceExistingContour || p.kind !== 'outline'), ...contourPreview]
    : tab === 'trace'
      ? cutPaths.filter(p => !replaceExistingTrace || p.kind !== 'trace')
      : tab === 'regmark'
        ? [...cutPaths.filter(p => p.kind !== 'regmark'), ...regMarkPreview]
        : cutPaths;
  const previewActionSummary = tab === 'contour'
    ? `${replaceExistingContour ? `${t('Will replace')} ${counts.outline}` : t('Will append')} · ${contourPreview.length} ${t('new contour paths')}`
    : tab === 'trace'
      ? `${replaceExistingTrace ? `${t('Will replace')} ${counts.trace}` : t('Will append')} · ${t('Trace runs on Generate')}`
      : tab === 'regmark'
        ? `${t('Will replace')} ${counts.regmark} · ${regMarkPreview.length} ${t('new regmark paths')}`
        : '';

  if (!open) return null;

  const focusTab = (nextTab: Tab) => {
    setTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`cut-tab-${nextTab}`)?.focus());
  };
  const handleTabListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.indexOf(tab);
    if (event.key === 'Home') { focusTab(TABS[0]); return; }
    if (event.key === 'End') { focusTab(TABS[TABS.length - 1]); return; }
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    focusTab(TABS[(index + delta + TABS.length) % TABS.length]);
  };

  const runContour = () => {
    const c = getCanvas();
    if (!c) return;
    const selected = c.getActiveObjects();
    if (selected.length === 0) {
      toast.warn(t('Select one or more shapes first.'), { title: t('Nothing to contour') });
      return;
    }
    const newPaths = buildOutlineCutPaths(selected, offsetMm, offsetPasses);
    if (newPaths.length === 0) {
      toast.warn(t('No geometry was produced — try a smaller offset distance.'), { title: t('Empty contour') });
      return;
    }
    if (replaceExistingContour) clearCutPaths('outline');
    addCutPaths(newPaths);
    toast.success(
      replaceExistingContour
        ? `${newPaths.length} ${t('contour(s) replaced')}`
        : `${newPaths.length} ${t('contour(s) added')}`,
      { title: t('Contour generated') },
    );
  };

  const runTrace = async () => {
    const c = getCanvas();
    if (!c) return;
    const selected = c.getActiveObjects();
    const image = selected.find((o): o is fabric.FabricImage => o instanceof fabric.FabricImage);
    if (!image) {
      toast.warn(t('Select a placed image first.'), { title: t('Nothing to trace') });
      return;
    }
    // Render the image to an offscreen canvas at native pixel size so we
    // can read its pixels for marching squares.
    const src = (image as fabric.FabricImage & { _src?: string; _element?: HTMLImageElement })._element;
    if (!src) {
      toast.error(t('Image source unavailable.'), { title: t('Trace failed') });
      return;
    }
    const tmp = document.createElement('canvas');
    tmp.width = src.naturalWidth;
    tmp.height = src.naturalHeight;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    if (!tctx) return;
    tctx.drawImage(src, 0, 0);
    // getImageData throws SecurityError on a tainted canvas — that's what
    // happens when the placed image was loaded from a cross-origin URL
    // (e.g. dragged from a browser tab rather than the file system).
    // Catch and surface a clearer message so the user knows what to do.
    let imgData: ImageData;
    try {
      imgData = tctx.getImageData(0, 0, tmp.width, tmp.height);
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
      return;
    }

    // Pixel size in mm: image's on-canvas display width divided by its
    // natural pixel width tells us how big a single source pixel renders
    // on the page, then divide by MM_TO_PX to get mm.
    const screenW = (image.width ?? 1) * (image.scaleX ?? 1);
    const pixelSizeMm = (screenW / Math.max(1, tmp.width)) / MM_TO_PX;

    const contours = traceBitmap(imgData, {
      threshold: traceThreshold,
      useAlpha: traceUseAlpha,
      simplifyTolerance: traceSimplify,
      pixelSizeMm,
    });

    if (contours.length === 0) {
      toast.warn(t('No traceable regions found. Try lowering the threshold or toggling alpha.'), { title: t('Trace empty') });
      return;
    }

    // Translate so contour origin lines up with the image's on-canvas
    // top-left corner. Fabric stores left/top at the centre by default
    // when originX/Y === 'center'; account for both modes.
    const r = image.getBoundingRect();
    const offX = r.left / MM_TO_PX;
    const offY = r.top / MM_TO_PX;

    const newPaths: CutPath[] = contours.map((pts, i) => ({
      id: `trace-${Date.now().toString(36)}-${i}`,
      points: pts.map(([x, y]) => [x + offX, y + offY] as [number, number]),
      closed: true,
      kind: 'trace',
      sourceObjectId: (image as fabric.FabricImage & { _id?: string })._id,
      passes: 1,
    }));
    if (replaceExistingTrace) clearCutPaths('trace');
    addCutPaths(newPaths);
    toast.success(
      replaceExistingTrace
        ? `${newPaths.length} ${t('trace contour(s) replaced')}`
        : `${newPaths.length} ${t('contour(s) traced')}`,
      { title: t('Bitmap traced') },
    );
  };

  const runRegMarks = () => {
    const bounds = resolveRegMarkBounds(regFitToSelection, cutPaths);
    const { clamped, clampedArm, spec } = buildRegMarkSpec(bounds, regArm, regInsetX, regInsetY);
    clearCutPaths('regmark');
    addCutPaths(generateRegMarks(spec));
    if (clamped) {
      toast.warn(
        `${t('Marks would have overlapped — auto-shrunk to fit.')} ${t('Arm')}: ${clampedArm.toFixed(1)}mm`,
        { title: t('Reg marks (clamped)') },
      );
    } else {
      toast.success(
        `${t('4-corner registration marks added.')} ${bounds.w.toFixed(0)}×${bounds.h.toFixed(0)} mm`,
        { title: t('Reg marks') },
      );
    }
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cut-dialog-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[920px] max-w-[96%] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="cut-dialog-title" className="dialog-title flex items-center gap-2">
            <Scissors size={14} aria-hidden="true" className="text-[#ff2e9a]" />
            {t('Cut Contour')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Tab strip — three operations sharing the same dialog. Reads
            and feels exactly like a mini-toolbar inside the dialog so
            switching modes doesn't navigate the user anywhere. */}
        <div role="tablist" className="flex border-b border-border px-2 bg-panel2/40 text-xs" onKeyDown={handleTabListKeyDown} aria-label={t('Cut Contour modes')}>
          <TabButton id="contour" active={tab === 'contour'} onClick={() => setTab('contour')} icon={<Scissors size={12} aria-hidden="true" />} label={t('Outline')} />
          <TabButton id="trace" active={tab === 'trace'} onClick={() => setTab('trace')} icon={<ImageDown size={12} aria-hidden="true" />} label={t('Trace Bitmap')} />
          <TabButton id="regmark" active={tab === 'regmark'} onClick={() => setTab('regmark')} icon={<Crosshair size={12} aria-hidden="true" />} label={t('Reg Marks')} />
          <div className="flex-1" />
          {/* Preview toggle is global to the dialog because it controls
              the canvas overlay, not any single tab. */}
          <button
            type="button"
            className="px-2 py-1.5 flex items-center gap-1 text-muted hover:text-ink transition-colors"
            onClick={() => setCutPathsVisible(!cutPathsVisible)}
            title={cutPathsVisible ? t('Hide preview') : t('Show preview')}
            aria-pressed={cutPathsVisible}
          >
            {cutPathsVisible ? <Eye size={12} aria-hidden="true" /> : <EyeOff size={12} aria-hidden="true" />}
            <span>{t('Preview')}</span>
          </button>
        </div>

        <div className="px-4 py-4 text-xs">
          <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
            <div>
              {tab === 'contour' && (
                <ContourPane
                  offsetMm={offsetMm} setOffsetMm={setOffsetMm}
                  passes={offsetPasses} setPasses={setOffsetPasses}
                  replaceExisting={replaceExistingContour}
                  setReplaceExisting={setReplaceExistingContour}
                  onRun={runContour}
                />
              )}
              {tab === 'trace' && (
                <TracePane
                  threshold={traceThreshold} setThreshold={setTraceThreshold}
                  useAlpha={traceUseAlpha} setUseAlpha={setTraceUseAlpha}
                  simplify={traceSimplify} setSimplify={setTraceSimplify}
                  replaceExisting={replaceExistingTrace}
                  setReplaceExisting={setReplaceExistingTrace}
                  onRun={runTrace}
                />
              )}
              {tab === 'regmark' && (
                <RegMarkPane
                  arm={regArm} setArm={setRegArm}
                  insetX={regInsetX} setInsetX={setRegInsetX}
                  insetY={regInsetY} setInsetY={setRegInsetY}
                  fitToSelection={regFitToSelection}
                  setFitToSelection={setRegFitToSelection}
                  onRun={runRegMarks}
                />
              )}
            </div>
            <div>
              <div className="field-label flex items-center justify-between mb-1">
                <span>{t(tab === 'regmark' ? 'Mark position preview' : 'Cut preview')}</span>
                <span className="text-[10px] text-muted tabular-nums">{previewPaths.length} {t('cut paths')}</span>
              </div>
              <CutPreview
                cutPaths={previewPaths}
                showPrint={false}
                showOrder={false}
                className="w-full h-52 bg-panel2 border border-border rounded-sm"
              />
              <p className="mt-1.5 text-[10px] text-muted leading-relaxed">
                {t(tab === 'regmark'
                  ? 'Preview updates before placement so you can verify registration-mark positions.'
                  : 'Preview shows the final cut job after replace/append settings are applied.')}
              </p>
              <p className="mt-1 text-[10px] text-[#ff2e9a] tabular-nums">{previewActionSummary}</p>
            </div>
          </div>

          {/* Status row + bulk-clear affordance. Lives outside the
              tab body so it's visible in every mode. */}
          <div
            className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-[10px] text-muted"
            role="toolbar"
            aria-label={t('Cut Contour cleanup actions')}
            aria-describedby="cut-contour-cleanup-action-review-status"
            title={t('Use arrow keys to review dialog actions')}
            onKeyDown={handleCutActionKeys}
          >
            <span id="cut-contour-cleanup-action-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedCleanupAction || t('Cut Contour cleanup actions')}`}
            </span>
            <span>{t('Current')}: <span className="text-ink">{counts.outline}</span> {t('outline')}</span>
            <span className="text-border">·</span>
            <span><span className="text-ink">{counts.trace}</span> {t('trace')}</span>
            <span className="text-border">·</span>
            <span><span className="text-ink">{counts.regmark}</span> {t('regmark')}</span>
            <div className="flex-1" />
            {counts.outline > 0 && (
              <button
                type="button"
                data-cut-contour-action
                data-cut-contour-action-review={t('Clear contour')}
                className="btn flex items-center gap-1 text-[10px]"
                onClick={() => clearCutPaths('outline')}
                onFocus={() => setReviewedCleanupAction(t('Clear contour'))}
                title={t('Clear contour cut paths')}
              >
                {t('Clear contour')}
              </button>
            )}
            {counts.trace > 0 && (
              <button
                type="button"
                data-cut-contour-action
                data-cut-contour-action-review={t('Clear trace')}
                className="btn flex items-center gap-1 text-[10px]"
                onClick={() => clearCutPaths('trace')}
                onFocus={() => setReviewedCleanupAction(t('Clear trace'))}
                title={t('Clear traced cut paths')}
              >
                {t('Clear trace')}
              </button>
            )}
            {counts.regmark > 0 && (
              <button
                type="button"
                data-cut-contour-action
                data-cut-contour-action-review={t('Clear regmarks')}
                className="btn flex items-center gap-1 text-[10px]"
                onClick={() => clearCutPaths('regmark')}
                onFocus={() => setReviewedCleanupAction(t('Clear regmarks'))}
                title={t('Clear registration marks')}
              >
                {t('Clear regmarks')}
              </button>
            )}
            {counts.total > 0 && (
              <button
                type="button"
                data-cut-contour-action
                data-cut-contour-action-review={t('Clear all')}
                className="btn flex items-center gap-1 text-[10px]"
                onClick={() => clearCutPaths()}
                onFocus={() => setReviewedCleanupAction(t('Clear all'))}
                title={t('Clear all cut paths')}
              >
                <Trash2 size={11} aria-hidden="true" />
                {t('Clear all')}
              </button>
            )}
          </div>

          {/* Footer — Cancel + Send-to-Plotter handoff. */}
          <div
            className="flex items-center gap-2 mt-4"
            role="toolbar"
            aria-label={t('Cut Contour output actions')}
            aria-describedby="cut-contour-output-action-review-status"
            title={t('Use arrow keys to review dialog actions')}
            onKeyDown={handleOutputActionKeys}
          >
            <span id="cut-contour-output-action-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedOutputAction || t('Cut Contour output actions')}`}
            </span>
            <button
              type="button"
              data-cut-output-action
              data-cut-output-action-review={t('Close')}
              className="btn"
              onClick={close}
              onFocus={() => setReviewedOutputAction(t('Close'))}
            >
              {t('Close')}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              data-cut-output-action
              data-cut-output-action-review={t('Send to Plotter…')}
              className="btn-primary flex items-center gap-1"
              onClick={() => {
                close();
                useEditor.getState().setModal('showPlotter', true);
              }}
              disabled={counts.total === 0}
              title={counts.total === 0 ? t('Generate cut paths first') : undefined}
              onFocus={() => setReviewedOutputAction(t('Send to Plotter…'))}
            >
              <Wand2 size={12} aria-hidden="true" />
              {t('Send to Plotter…')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============== sub-panes ================================== */


function resolveRegMarkBounds(fitToSelection: boolean, cutPaths: CutPath[]): { x: number; y: number; w: number; h: number } {
  const editor = useEditor.getState();
  const c = getCanvas();
  const sel = fitToSelection ? c?.getActiveObjects() ?? [] : [];
  if (sel.length > 0) {
    let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
    for (const o of sel) {
      const r = o.getBoundingRect();
      if (r.left < lx) lx = r.left;
      if (r.top < ly) ly = r.top;
      if (r.left + r.width > hx) hx = r.left + r.width;
      if (r.top + r.height > hy) hy = r.top + r.height;
    }
    return { x: lx / MM_TO_PX, y: ly / MM_TO_PX, w: (hx - lx) / MM_TO_PX, h: (hy - ly) / MM_TO_PX };
  }
  if (editor.artboards.length > 0) {
    const a = editor.artboards[0];
    return { x: a.x / MM_TO_PX, y: a.y / MM_TO_PX, w: a.width / MM_TO_PX, h: a.height / MM_TO_PX };
  }
  if (cutPaths.length > 0) {
    let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
    for (const p of cutPaths) for (const [x, y] of p.points) {
      if (x < lx) lx = x; if (x > hx) hx = x;
      if (y < ly) ly = y; if (y > hy) hy = y;
    }
    return { x: lx - 10, y: ly - 10, w: hx - lx + 20, h: hy - ly + 20 };
  }
  return { x: 0, y: 0, w: 297, h: 210 };
}

function buildRegMarkSpec(bounds: { x: number; y: number; w: number; h: number }, arm: number, insetX: number, insetY: number) {
  const maxArmX = Math.max(2, bounds.w / 2 - insetX - 2);
  const maxArmY = Math.max(2, bounds.h / 2 - insetY - 2);
  const clampedArm = Math.min(arm, maxArmX, maxArmY);
  const clampedInsetX = Math.min(insetX, bounds.w / 2 - clampedArm - 2);
  const clampedInsetY = Math.min(insetY, bounds.h / 2 - clampedArm - 2);
  const clamped = clampedArm < arm || clampedInsetX < insetX || clampedInsetY < insetY;
  const insetDelta = clampedInsetY - clampedInsetX;
  const adjustedBounds = {
    x: bounds.x,
    y: bounds.y + insetDelta,
    w: bounds.w,
    h: bounds.h - insetDelta * 2,
  };
  return {
    clamped,
    clampedArm,
    spec: { bounds: adjustedBounds, armLength: clampedArm, inset: Math.max(0, clampedInsetX) },
  };
}

function TabButton({
  id, active, onClick, icon, label,
}: {
  id: string; active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  const t = useT();
  return (
    <button
      role="tab"
      id={`cut-tab-${id}`}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      title={t('Use Left/Right arrows to switch modes')}
      className={`px-3 py-2 flex items-center gap-1.5 border-b-2 transition-colors -mb-px ${
        active
          ? 'border-[#ff2e9a] text-ink'
          : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ContourPane(props: {
  offsetMm: number; setOffsetMm: (n: number) => void;
  passes: number; setPasses: (n: number) => void;
  replaceExisting: boolean; setReplaceExisting: (v: boolean) => void;
  onRun: () => void;
}) {
  const t = useT();
  const [reviewPreset, setReviewPreset] = useState('');
  const presets = [
    { label: t('Kiss-cut'), offset: 0, passes: 1 },
    { label: t('Sticker bleed'), offset: 2, passes: 1 },
    { label: t('Wide decal'), offset: 5, passes: 1 },
    { label: t('Inside cut'), offset: -1, passes: 1 },
    { label: t('Heavy material'), offset: 2, passes: 2 },
  ];
  const currentPreset = reviewPreset || `${presets[0].label}: ${presets[0].offset} mm / ${presets[0].passes} ${t('pass(es)')}`;
  return (
    <div className="space-y-3">
      <p className="text-muted leading-relaxed">
        {t('Generate a parallel-offset cut line around the selected shapes. Positive values offset outward, negative shrink inward.')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`${t('Offset')} (mm)`}>
          <input
            type="number" step={0.1} className="input-num"
            value={props.offsetMm}
            onChange={(e) => props.setOffsetMm(parseFloat(e.target.value) || 0)}
          />
        </Field>
        <Field label={t('Passes')}>
          <input
            type="number" min={1} max={5} className="input-num"
            value={props.passes}
            onChange={(e) => props.setPasses(Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1)))}
          />
        </Field>
      </div>
      <div>
        <div className="field-label">{t('Contour presets')}</div>
        <div
          className="grid grid-cols-5 gap-1"
          role="toolbar"
          aria-label={t('Contour preset actions')}
          aria-describedby="contour-preset-review-status"
          title={t('Use arrow keys to review presets')}
          onKeyDown={(event) => handlePresetToolbarKeys(event, setReviewPreset)}
        >
          <div id="contour-preset-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${currentPreset}`}
          </div>
          {presets.map((preset) => {
            const active = Math.abs(props.offsetMm - preset.offset) < 0.001 && props.passes === preset.passes;
            const review = `${preset.label}: ${preset.offset} mm / ${preset.passes} ${t('pass(es)')}`;
            return (
              <button
                key={`${preset.offset}-${preset.passes}`}
                type="button"
                data-cut-preset-action
                data-cut-preset-review={review}
                className={`min-h-10 rounded border px-1.5 py-1 text-[10px] leading-tight transition-colors ${active ? 'bg-[#ff2e9a]/15 border-[#ff2e9a] text-ink' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
                onFocus={(event) => setReviewPreset(event.currentTarget.dataset.cutPresetReview ?? '')}
                onClick={() => { props.setOffsetMm(preset.offset); props.setPasses(preset.passes); }}
                title={review}
                aria-pressed={active}
              >
                <span className="block font-medium">{preset.label}</span>
                <span className="block text-muted tabular-nums">{preset.offset} mm · {preset.passes}×</span>
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-[11px]">
        <input
          type="checkbox"
          checked={props.replaceExisting}
          onChange={(e) => props.setReplaceExisting(e.target.checked)}
        />
        <span>{t('Replace existing contour paths')}</span>
      </label>
      <button
        type="button"
        className="btn-primary flex items-center gap-1.5 w-full justify-center"
        onClick={props.onRun}
        title={props.replaceExisting ? t('Replace old outline cuts and keep trace/reg marks') : t('Append contour paths to the current cut job')}
      >
        <Scissors size={12} aria-hidden="true" />
        {t('Generate Contour from Selection')}
      </button>
    </div>
  );
}

function TracePane(props: {
  threshold: number; setThreshold: (n: number) => void;
  useAlpha: boolean; setUseAlpha: (v: boolean) => void;
  simplify: number; setSimplify: (n: number) => void;
  replaceExisting: boolean; setReplaceExisting: (v: boolean) => void;
  onRun: () => void;
}) {
  const t = useT();
  const [reviewPreset, setReviewPreset] = useState('');
  const presets = [
    { label: t('Logo'), threshold: 128, simplify: 1, useAlpha: false },
    { label: t('Dark art'), threshold: 96, simplify: 0.5, useAlpha: false },
    { label: t('Photo high contrast'), threshold: 160, simplify: 2, useAlpha: false },
    { label: t('Transparent PNG'), threshold: 128, simplify: 1, useAlpha: true },
    { label: t('Noisy scan'), threshold: 140, simplify: 3, useAlpha: false },
  ];
  const describePreset = (preset: (typeof presets)[number]) => `${preset.label}: ${preset.threshold} / ${preset.simplify}px${preset.useAlpha ? ` · ${t('Alpha')}` : ''}`;
  const currentPreset = reviewPreset || describePreset(presets[0]);
  return (
    <div className="space-y-3">
      <p className="text-muted leading-relaxed">
        {t('Convert a placed bitmap (PNG/JPG) into vector cut paths by tracing the edges of dark or opaque regions.')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`${t('Threshold')} (0–255)`}>
          <input
            type="range" min={0} max={255}
            value={props.threshold}
            onChange={(e) => props.setThreshold(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <div className="text-[10px] text-muted text-right tabular-nums">{props.threshold}</div>
        </Field>
        <Field label={`${t('Simplify')} (px)`}>
          <input
            type="number" step={0.1} min={0} max={20} className="input-num"
            value={props.simplify}
            onChange={(e) => props.setSimplify(Math.max(0, parseFloat(e.target.value) || 0))}
          />
        </Field>
        <label className="col-span-2 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={props.useAlpha}
            onChange={(e) => props.setUseAlpha(e.target.checked)}
          />
          <span>{t('Use alpha channel (best for transparent PNGs)')}</span>
        </label>
      </div>
      <div>
        <div className="field-label">{t('Trace presets')}</div>
        <div
          className="grid grid-cols-5 gap-1"
          role="toolbar"
          aria-label={t('Trace preset actions')}
          aria-describedby="trace-preset-review-status"
          title={t('Use arrow keys to review presets')}
          onKeyDown={(event) => handlePresetToolbarKeys(event, setReviewPreset)}
        >
          <div id="trace-preset-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${currentPreset}`}
          </div>
          {presets.map((preset) => {
            const active = props.threshold === preset.threshold && Math.abs(props.simplify - preset.simplify) < 0.001 && props.useAlpha === preset.useAlpha;
            const review = describePreset(preset);
            return (
              <button
                key={preset.label}
                type="button"
                data-cut-preset-action
                data-cut-preset-review={review}
                className={`min-h-10 rounded border px-1.5 py-1 text-[10px] leading-tight transition-colors ${active ? 'bg-[#ff2e9a]/15 border-[#ff2e9a] text-ink' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
                onFocus={(event) => setReviewPreset(event.currentTarget.dataset.cutPresetReview ?? '')}
                onClick={() => {
                  props.setThreshold(preset.threshold);
                  props.setSimplify(preset.simplify);
                  props.setUseAlpha(preset.useAlpha);
                }}
                title={review}
                aria-pressed={active}
              >
                <span className="block font-medium">{preset.label}</span>
                <span className="block text-muted tabular-nums">{preset.threshold} · {preset.simplify}px{preset.useAlpha ? ' · A' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-[11px]">
        <input
          type="checkbox"
          checked={props.replaceExisting}
          onChange={(e) => props.setReplaceExisting(e.target.checked)}
        />
        <span>{t('Replace existing trace paths')}</span>
      </label>
      <button
        type="button"
        className="btn-primary flex items-center gap-1.5 w-full justify-center"
        onClick={props.onRun}
        title={props.replaceExisting ? t('Replace old bitmap traces and keep outline/reg marks') : t('Append trace paths to the current cut job')}
      >
        <ImageDown size={12} aria-hidden="true" />
        {t('Trace Selected Image')}
      </button>
    </div>
  );
}

function RegMarkPane(props: {
  arm: number; setArm: (n: number) => void;
  insetX: number; setInsetX: (n: number) => void;
  insetY: number; setInsetY: (n: number) => void;
  fitToSelection: boolean; setFitToSelection: (v: boolean) => void;
  onRun: () => void;
}) {
  const t = useT();
  const [reviewPreset, setReviewPreset] = useState('');
  const presets = [
    { label: t('Roland standard'), arm: 10, insetX: 5, insetY: 5 },
    { label: t('Graphtec scan'), arm: 12, insetX: 8, insetY: 8 },
    { label: t('Outside bleed'), arm: 10, insetX: -3, insetY: -3 },
    { label: t('Compact sheet'), arm: 6, insetX: 3, insetY: 3 },
    { label: t('Long banner'), arm: 15, insetX: 10, insetY: 20 },
  ];
  const describePreset = (preset: (typeof presets)[number]) => `${preset.label}: ${preset.arm} / ${preset.insetX} / ${preset.insetY} mm`;
  const currentPreset = reviewPreset || describePreset(presets[0]);
  return (
    <div className="space-y-3">
      <p className="text-muted leading-relaxed">
        {t('Add 4-corner L-shape registration marks (Roland CutStudio convention) so the cutter\'s optical sensor can align with your printed art.')}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`${t('Arm length')} (mm)`}>
          <input
            type="number" step={0.5} min={3} max={30} className="input-num"
            value={props.arm}
            onChange={(e) => props.setArm(Math.max(3, parseFloat(e.target.value) || 10))}
          />
        </Field>
        <Field label={`${t('Inset X')} (mm)`}>
          <input
            type="number" step={0.5} className="input-num"
            value={props.insetX}
            onChange={(e) => props.setInsetX(parseFloat(e.target.value) || 0)}
          />
        </Field>
        <Field label={`${t('Inset Y')} (mm)`}>
          <input
            type="number" step={0.5} className="input-num"
            value={props.insetY}
            onChange={(e) => props.setInsetY(parseFloat(e.target.value) || 0)}
          />
        </Field>
      </div>
      <div>
        <div className="field-label">{t('Reg mark presets')}</div>
        <div
          className="grid grid-cols-5 gap-1"
          role="toolbar"
          aria-label={t('Reg mark preset actions')}
          aria-describedby="regmark-preset-review-status"
          title={t('Use arrow keys to review presets')}
          onKeyDown={(event) => handlePresetToolbarKeys(event, setReviewPreset)}
        >
          <div id="regmark-preset-review-status" className="sr-only" aria-live="polite">
            {`${t('Reviewing')} ${currentPreset}`}
          </div>
          {presets.map((preset) => {
            const active = Math.abs(props.arm - preset.arm) < 0.001 && Math.abs(props.insetX - preset.insetX) < 0.001 && Math.abs(props.insetY - preset.insetY) < 0.001;
            const review = describePreset(preset);
            return (
              <button
                key={preset.label}
                type="button"
                data-cut-preset-action
                data-cut-preset-review={review}
                className={`min-h-10 rounded border px-1.5 py-1 text-[10px] leading-tight transition-colors ${active ? 'bg-[#ff2e9a]/15 border-[#ff2e9a] text-ink' : 'bg-panel2 border-border hover:bg-panel3 text-ink'}`}
                onFocus={(event) => setReviewPreset(event.currentTarget.dataset.cutPresetReview ?? '')}
                onClick={() => {
                  props.setArm(preset.arm);
                  props.setInsetX(preset.insetX);
                  props.setInsetY(preset.insetY);
                }}
                title={review}
                aria-pressed={active}
              >
                <span className="block font-medium">{preset.label}</span>
                <span className="block text-muted tabular-nums">{preset.arm} · {preset.insetX}/{preset.insetY}</span>
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-[11px]">
        <input
          type="checkbox"
          checked={props.fitToSelection}
          onChange={(e) => props.setFitToSelection(e.target.checked)}
        />
        <span>{t('Fit to current selection (otherwise: first artboard / all cut paths)')}</span>
      </label>
      <button
        type="button"
        className="btn-primary flex items-center gap-1.5 w-full justify-center"
        onClick={props.onRun}
      >
        <RefreshCw size={12} aria-hidden="true" />
        {t('Place Registration Marks')}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="field-label">{label}</div>
      {children}
    </label>
  );
}
