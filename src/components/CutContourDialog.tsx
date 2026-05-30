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
  offsetPolyline,
  traceBitmap,
  generateRegMarks,
  flattenSvgPath,
  defaultTraceOptions,
} from '../lib/cutContour';
import { toast } from '../lib/toast';

const MM_TO_PX = 3.7795; // 96dpi convention used everywhere else

type Tab = 'contour' | 'trace' | 'regmark';

export function CutContourDialog() {
  const t = useT();
  const open = useEditor(s => s.showCutContour);
  const close = useCallback(() => useEditor.getState().setModal('showCutContour', false), []);
  const cutPaths = useEditor(s => s.cutPaths);
  const cutPathsVisible = useEditor(s => s.cutPathsVisible);
  const setCutPathsVisible = useEditor(s => s.setCutPathsVisible);
  const addCutPaths = useEditor(s => s.addCutPaths);
  const clearCutPaths = useEditor(s => s.clearCutPaths);

  const [tab, setTab] = useState<Tab>('contour');
  // Contour params
  const [offsetMm, setOffsetMm] = useState(2);
  const [offsetPasses, setOffsetPasses] = useState(1);
  // Trace params
  const [traceThreshold, setTraceThreshold] = useState(defaultTraceOptions.threshold);
  const [traceUseAlpha, setTraceUseAlpha] = useState(defaultTraceOptions.useAlpha);
  const [traceSimplify, setTraceSimplify] = useState(defaultTraceOptions.simplifyTolerance);
  // RegMark params. Roland CutStudio default is symmetric (5mm uniform
  // inset) but real print jobs often want a wider top inset to clear a
  // title bar / a deeper right inset to clear bleed. Split into X and Y
  // so the user can dial those in. The two values also accept negative
  // numbers — useful when the marks need to sit OUTSIDE the artwork
  // boundary (e.g. when the cutter scans an oversize substrate).
  const [regArm, setRegArm] = useState(10);
  const [regInsetX, setRegInsetX] = useState(5);
  const [regInsetY, setRegInsetY] = useState(5);
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

  if (!open) return null;

  const runContour = () => {
    const c = getCanvas();
    if (!c) return;
    const selected = c.getActiveObjects();
    if (selected.length === 0) {
      toast.warn(t('Select one or more shapes first.'), { title: t('Nothing to contour') });
      return;
    }
    const before = cutPaths.length;
    const newPaths: CutPath[] = [];
    for (const obj of selected) {
      // Convert fabric object → SVG path → flat polylines.
      const svg = obj.toSVG();
      // Extract the `d` attr from whatever the object emitted. Falls back
      // to converting from x/y/width/height for primitives.
      const dMatch = svg.match(/\sd="([^"]+)"/);
      let polylines: Array<{ points: Array<[number, number]>; closed: boolean }>;
      if (dMatch) {
        polylines = flattenSvgPath(dMatch[1], 0.5);
      } else {
        // Primitive shape (rect / circle / etc.) — derive a bounding box.
        const r = obj.getBoundingRect();
        polylines = [{
          points: [
            [r.left, r.top],
            [r.left + r.width, r.top],
            [r.left + r.width, r.top + r.height],
            [r.left, r.top + r.height],
            [r.left, r.top],
          ],
          closed: true,
        }];
      }
      // Apply the object's own transform to polyline coordinates.
      const matrix = obj.calcTransformMatrix();
      const ax = (obj.width ?? 0) / 2;
      const ay = (obj.height ?? 0) / 2;
      for (const pl of polylines) {
        const transformed: Array<[number, number]> = [];
        for (const [px, py] of pl.points) {
          const cx = px - ax;
          const cy = py - ay;
          const tx = matrix[0] * cx + matrix[2] * cy + matrix[4];
          const ty = matrix[1] * cx + matrix[3] * cy + matrix[5];
          transformed.push([tx / MM_TO_PX, ty / MM_TO_PX]);
        }
        // Offset operation. Returns a list (single offset can split into
        // multiple polygons when the inward offset crosses itself).
        const off = offsetPolyline(transformed, offsetMm, pl.closed);
        for (const polyOut of off) {
          newPaths.push({
            id: `outline-${Date.now().toString(36)}-${newPaths.length}`,
            points: polyOut,
            closed: pl.closed,
            kind: 'outline',
            sourceObjectId: (obj as fabric.FabricObject & { _id?: string })._id,
            passes: offsetPasses,
          });
        }
      }
    }
    if (newPaths.length === 0) {
      toast.warn(t('No geometry was produced — try a smaller offset distance.'), { title: t('Empty contour') });
      return;
    }
    addCutPaths(newPaths);
    toast.success(
      `${newPaths.length} ${t('contour(s) added')}`,
      { title: t('Contour generated') },
    );
    void before;
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
    addCutPaths(newPaths);
    toast.success(
      `${newPaths.length} ${t('contour(s) traced')}`,
      { title: t('Bitmap traced') },
    );
  };

  const runRegMarks = () => {
    // Three sources of bounds, in priority order:
    //   1. Current selection (when "fit to selection" is on AND something
    //      is selected on the canvas) — this is the print-and-cut flow:
    //      drop an image, frame it with marks the cutter can scan, send.
    //   2. First artboard (the standard "page" mode).
    //   3. Bounding box of all existing cut paths.
    //   4. A4-landscape fallback when the doc is empty.
    const editor = useEditor.getState();
    const c = getCanvas();
    let bounds: { x: number; y: number; w: number; h: number };

    const sel = regFitToSelection ? c?.getActiveObjects() ?? [] : [];
    if (sel.length > 0) {
      let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
      for (const o of sel) {
        const r = o.getBoundingRect();
        if (r.left < lx) lx = r.left;
        if (r.top < ly) ly = r.top;
        if (r.left + r.width > hx) hx = r.left + r.width;
        if (r.top + r.height > hy) hy = r.top + r.height;
      }
      bounds = {
        x: lx / MM_TO_PX,
        y: ly / MM_TO_PX,
        w: (hx - lx) / MM_TO_PX,
        h: (hy - ly) / MM_TO_PX,
      };
    } else if (editor.artboards.length > 0) {
      const a = editor.artboards[0];
      bounds = { x: a.x / MM_TO_PX, y: a.y / MM_TO_PX, w: a.width / MM_TO_PX, h: a.height / MM_TO_PX };
    } else if (cutPaths.length > 0) {
      let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
      for (const p of cutPaths) for (const [x, y] of p.points) {
        if (x < lx) lx = x; if (x > hx) hx = x;
        if (y < ly) ly = y; if (y > hy) hy = y;
      }
      bounds = { x: lx - 10, y: ly - 10, w: hx - lx + 20, h: hy - ly + 20 };
    } else {
      bounds = { x: 0, y: 0, w: 297, h: 210 };
    }

    // Clamp arm + insets so the four L-shapes never cross at the centre
    // of a small bounding box. Each L-arm needs (arm + insetX) on its
    // own side; two opposing marks need 2*(arm + insetX) < bounds.w to
    // fit without overlap. Cap arm length proportionally and surface a
    // toast when clamping kicked in so the user knows their input was
    // adjusted.
    const maxArmX = Math.max(2, bounds.w / 2 - regInsetX - 2);
    const maxArmY = Math.max(2, bounds.h / 2 - regInsetY - 2);
    const clampedArm = Math.min(regArm, maxArmX, maxArmY);
    const clampedInsetX = Math.min(regInsetX, bounds.w / 2 - clampedArm - 2);
    const clampedInsetY = Math.min(regInsetY, bounds.h / 2 - clampedArm - 2);
    const clamped = clampedArm < regArm
      || clampedInsetX < regInsetX
      || clampedInsetY < regInsetY;

    // generateRegMarks takes a single `inset`, but we want independent
    // X/Y insets. Pre-shrink the bounds by (insetY - insetX) on one axis
    // so the generator's symmetric inset comes out asymmetric overall.
    const insetDelta = clampedInsetY - clampedInsetX;
    const adjustedBounds = {
      x: bounds.x,
      y: bounds.y + insetDelta,
      w: bounds.w,
      h: bounds.h - insetDelta * 2,
    };
    clearCutPaths('regmark');
    addCutPaths(generateRegMarks({
      bounds: adjustedBounds,
      armLength: clampedArm,
      inset: Math.max(0, clampedInsetX),
    }));
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
      <div className="bg-panel border border-border rounded-lg w-[640px] max-w-[95%] shadow-2xl overflow-hidden">
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
        <div role="tablist" className="flex border-b border-border px-2 bg-panel2/40 text-xs">
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
          {tab === 'contour' && (
            <ContourPane
              offsetMm={offsetMm} setOffsetMm={setOffsetMm}
              passes={offsetPasses} setPasses={setOffsetPasses}
              onRun={runContour}
            />
          )}
          {tab === 'trace' && (
            <TracePane
              threshold={traceThreshold} setThreshold={setTraceThreshold}
              useAlpha={traceUseAlpha} setUseAlpha={setTraceUseAlpha}
              simplify={traceSimplify} setSimplify={setTraceSimplify}
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

          {/* Status row + bulk-clear affordance. Lives outside the
              tab body so it's visible in every mode. */}
          <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-[10px] text-muted">
            <span>{t('Current')}: <span className="text-ink">{counts.outline}</span> {t('outline')}</span>
            <span className="text-border">·</span>
            <span><span className="text-ink">{counts.trace}</span> {t('trace')}</span>
            <span className="text-border">·</span>
            <span><span className="text-ink">{counts.regmark}</span> {t('regmark')}</span>
            <div className="flex-1" />
            {counts.total > 0 && (
              <button
                type="button"
                className="btn flex items-center gap-1 text-[10px]"
                onClick={() => clearCutPaths()}
                title={t('Clear all cut paths')}
              >
                <Trash2 size={11} aria-hidden="true" />
                {t('Clear all')}
              </button>
            )}
          </div>

          {/* Footer — Cancel + Send-to-Plotter handoff. */}
          <div className="flex items-center gap-2 mt-4">
            <button type="button" className="btn" onClick={close}>{t('Close')}</button>
            <div className="flex-1" />
            <button
              type="button"
              className="btn-primary flex items-center gap-1"
              onClick={() => {
                close();
                useEditor.getState().setModal('showPlotter', true);
              }}
              disabled={counts.total === 0}
              title={counts.total === 0 ? t('Generate cut paths first') : undefined}
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

function TabButton({
  id, active, onClick, icon, label,
}: {
  id: string; active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      role="tab"
      id={`cut-tab-${id}`}
      aria-selected={active}
      onClick={onClick}
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
  onRun: () => void;
}) {
  const t = useT();
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
      <button
        type="button"
        className="btn-primary flex items-center gap-1.5 w-full justify-center"
        onClick={props.onRun}
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
  onRun: () => void;
}) {
  const t = useT();
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
      <button
        type="button"
        className="btn-primary flex items-center gap-1.5 w-full justify-center"
        onClick={props.onRun}
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
