import { useCallback, useMemo, useState } from 'react';
import { X, Download, Loader2, Scissors, Crosshair, Code2, Eye, Image as ImageIcon, Usb, HardDriveDownload, FlipHorizontal2, Route, SquareDashed, Clock, Ruler, FlaskConical } from 'lucide-react';
import { useEditor } from '../store/editor';
import { buildPlotterOutput, buildTestCut, defaultPlotterOptions, sendOverSerial, MATERIAL_PRESETS, type HpglDialect, type PlotterOptions } from '../lib/plotter';
import { generateRegMarks, generateWeedBorder, generateWeedLines } from '../lib/cutContour';
import { buildOutlineCutPaths } from '../lib/contourFromSelection';
import { optimizeOrder, cutStats, estimateSeconds, formatDuration, type PolyLite } from '../lib/cutOptimize';
import { getCanvas } from '../lib/canvasEngine';
import { download } from '../lib/io';
import { isTauri } from '../lib/runtime';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { CutPreview } from './CutPreview';

const MM_TO_PX = 3.7795;

export function PlotterDialog() {
  const t = useT();
  const open = useEditor(s => s.showPlotter);
  const close = useCallback(() => useEditor.getState().setModal('showPlotter', false), []);
  const [opts, setOpts] = useState<PlotterOptions>(defaultPlotterOptions);
  const [format, setFormat] = useState<'gcode' | 'hpgl'>('hpgl');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // Preview mode: 'outline' = graphical SVG of the cut geometry (default —
  // it's what a cutter operator actually wants to verify), 'code' = the
  // raw G-code / HP-GL text for the machine.
  const [previewMode, setPreviewMode] = useState<'outline' | 'code'>('outline');
  const [showPrint, setShowPrint] = useState(true);
  const [showOrder, setShowOrder] = useState(false);
  const [materialId, setMaterialId] = useState('');
  // Cut-by-colour: which source swatches are muted (excluded from this job).
  const [mutedColors, setMutedColors] = useState<Set<string>>(() => new Set());
  // Weed grid dividers (0 = border only).
  const [weedRows, setWeedRows] = useState(0);
  const [weedCols, setWeedCols] = useState(0);

  const cutPaths = useEditor(s => s.cutPaths);
  const addCutPaths = useEditor(s => s.addCutPaths);
  const clearCutPaths = useEditor(s => s.clearCutPaths);
  const cutPathCount = cutPaths.length;
  const hasRegmarks = cutPaths.some(p => p.kind === 'regmark');

  // Distinct source colours present, for the separation swatch row.
  const colors = useMemo(() => {
    const set = new Set<string>();
    for (const p of cutPaths) if (p.color) set.add(p.color);
    return [...set];
  }, [cutPaths]);

  // The job that will actually ship: colour-muted outlines drop out, but
  // colourless paths (reg marks, weed borders) always cut.
  const activePaths = useMemo(
    () => cutPaths.filter(p => !p.color || !mutedColors.has(p.color)),
    [cutPaths, mutedColors],
  );

  // What the preview + stats draw. With cut paths present, that's the active
  // (colour-filtered) set. With NONE, the plotter exports the canvas geometry
  // itself — so preview THAT (each object's outline, zero offset) instead of
  // showing an empty "no cut paths" state for a job that will in fact cut.
  const previewPaths = useMemo(() => {
    if (cutPathCount > 0) return activePaths;
    const c = getCanvas();
    const objs = c?.getObjects().filter(o => !(o as { excludeFromExport?: boolean }).excludeFromExport) ?? [];
    return buildOutlineCutPaths(objs, 0, 1);
  }, [cutPathCount, activePaths]);

  // Live job estimate — the numbers a sign shop checks before feeding a
  // metre of vinyl. Built in mm-space from the cut paths (passes expanded),
  // ordered the same way the output will be so travel/time are honest.
  const stats = useMemo(() => {
    let polys: PolyLite[] = [];
    for (const c of previewPaths) {
      const passes = Math.max(1, c.passes ?? 1);
      for (let i = 0; i < passes; i++) polys.push({ points: c.points, closed: c.closed });
    }
    if (opts.optimize) polys = optimizeOrder(polys);
    const s = cutStats(polys);
    const feedMmMin = opts.unit === 'mm' ? opts.feedRate : opts.feedRate * 25.4;
    const travelMmMin = opts.unit === 'mm' ? opts.travelRate : opts.travelRate * 25.4;
    return { ...s, seconds: estimateSeconds(s, feedMmMin, travelMmMin) };
  }, [previewPaths, opts.optimize, opts.feedRate, opts.travelRate, opts.unit]);

  // Escape close — capture phase, consistent with other dialogs.
  useEscapeClose(open, close);
  useFocusRestore(open);

  if (!open) return null;

  // Two independent capabilities decide what the user can do:
  //   • native (Tauri) talks to the OS serial layer directly — works in
  //     the packaged desktop app on ANY platform, no Chrome involved.
  //   • web Serial is Chromium-only (Chrome/Edge over HTTPS/localhost).
  // EITHER one enables the direct "Send via USB" path; when neither is
  // present we steer the user to "Save File", which works literally
  // everywhere and is the normal cutter-software workflow anyway.
  const native = isTauri();
  const webSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
  const canSend = native || webSerial;

  // In cut-path mode, ship the colour-filtered set; otherwise let
  // buildPlotterOutput fall back to the canvas SVG.
  const overrideCuts = cutPathCount > 0 ? activePaths : undefined;
  const buildOut = () => buildPlotterOutput(format, opts, overrideCuts);
  const generate = () => setCode(buildOut());

  const fileName = `design.${format === 'gcode' ? 'gcode' : (opts.dialect !== 'bare' ? 'plt' : 'hpgl')}`;
  const saveFile = () => download(fileName, code || buildOut(), 'text/plain');

  const send = async () => {
    setBusy(true);
    try {
      const out = code || buildOut();
      await sendOverSerial(out);
      toast.success(t('✅ Sent to plotter'));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  // Quick "drop registration marks" without leaving the dialog. Bounds come
  // from existing non-regmark cut geometry, else the first artboard, else an
  // A4-landscape fallback — same priority the contour dialog uses.
  const addRegMarks = () => {
    const editor = useEditor.getState();
    const geom = editor.cutPaths.filter(p => p.kind !== 'regmark');
    let bounds: { x: number; y: number; w: number; h: number };
    if (geom.length) {
      let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
      for (const p of geom) for (const [x, y] of p.points) {
        if (x < lx) lx = x; if (x > hx) hx = x;
        if (y < ly) ly = y; if (y > hy) hy = y;
      }
      bounds = { x: lx - 5, y: ly - 5, w: hx - lx + 10, h: hy - ly + 10 };
    } else if (editor.artboards.length) {
      const a = editor.artboards[0];
      bounds = { x: a.x / MM_TO_PX, y: a.y / MM_TO_PX, w: a.width / MM_TO_PX, h: a.height / MM_TO_PX };
    } else {
      bounds = { x: 0, y: 0, w: 297, h: 210 };
    }
    clearCutPaths('regmark');
    addCutPaths(generateRegMarks({ bounds, armLength: 10, inset: 5 }));
    toast.success(`${t('4-corner registration marks added.')} ${bounds.w.toFixed(0)}×${bounds.h.toFixed(0)} mm`, { title: t('Reg marks') });
  };

  const toggleColor = (c: string) => {
    setMutedColors(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  // Apply a material preset to the machine fields. HTV is cut face-down, so
  // selecting it auto-enables the mirror toggle — one less footgun.
  const applyMaterial = (id: string) => {
    setMaterialId(id);
    const m = MATERIAL_PRESETS.find(p => p.id === id);
    if (!m) return;
    setOpts(o => ({
      ...o,
      feedRate: m.feedRate,
      graphtecForce: m.force,
      graphtecSpeed: m.speed,
      overcutMm: m.overcut,
      mirror: m.mirror ? true : o.mirror,
    }));
  };

  // Test cut: a tiny calibration pattern on scrap to dial in force/offset.
  // Sends when a direct path exists, otherwise saves the file.
  const testCut = async () => {
    const out = buildTestCut(format, opts);
    if (!canSend) { download(`test-cut.${format === 'gcode' ? 'gcode' : (opts.dialect !== 'bare' ? 'plt' : 'hpgl')}`, out, 'text/plain'); return; }
    setBusy(true);
    try {
      await sendOverSerial(out);
      toast.success(t('✅ Test cut sent'));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  // Rectangular weed border around the whole job — peel the waste in one
  // pull. Bounds from existing geometry (excluding any prior weed border),
  // else the first artboard.
  const addWeedBorder = () => {
    const editor = useEditor.getState();
    const geom = editor.cutPaths.filter(p => !p.id.startsWith('weed-'));
    let bounds: { x: number; y: number; w: number; h: number };
    if (geom.length) {
      let lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
      for (const p of geom) for (const [x, y] of p.points) {
        if (x < lx) lx = x; if (x > hx) hx = x;
        if (y < ly) ly = y; if (y > hy) hy = y;
      }
      bounds = { x: lx, y: ly, w: hx - lx, h: hy - ly };
    } else if (editor.artboards.length) {
      const a = editor.artboards[0];
      bounds = { x: a.x / MM_TO_PX, y: a.y / MM_TO_PX, w: a.width / MM_TO_PX, h: a.height / MM_TO_PX };
    } else {
      bounds = { x: 0, y: 0, w: 297, h: 210 };
    }
    const paths = [generateWeedBorder(bounds, 5)];
    if (weedRows > 0 || weedCols > 0) paths.push(...generateWeedLines(bounds, weedRows, weedCols, 5));
    addCutPaths(paths);
    toast.success(t('Weed border added.'), { title: t('Weeding') });
  };

  return (
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plotter-dialog-title"
    >
      <div className="bg-panel border border-border rounded-lg w-[720px] max-w-[96%] shadow-2xl overflow-hidden">
        {/* Title row — consistent with Print / Templates dialogs. */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2">
          <h2 id="plotter-dialog-title" className="dialog-title flex items-center gap-2">
            <Scissors size={14} aria-hidden="true" className="text-[#ff2e9a]" />
            {t('Send to Plotter / Cutter')}
          </h2>
          <button onClick={close} className="btn-dialog-close" aria-label={t('Close')}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 px-4 py-4">
          {/* ---- Left column: machine options ---- */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 text-xs content-start">
            <div className="col-span-2">
              <Field label={t('Material')}>
                <select className="input-num" value={materialId} onChange={(e) => applyMaterial(e.target.value)}>
                  <option value="">{t('Custom / manual')}</option>
                  {MATERIAL_PRESETS.map(m => (
                    <option key={m.id} value={m.id}>{t(m.label)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t('Format')}>
              <select className="input-num" value={format} onChange={(e) => setFormat(e.target.value as 'gcode' | 'hpgl')}>
                <option value="hpgl">{t('HP-GL / PLT (vinyl cutter)')}</option>
                <option value="gcode">{t('G-code (CNC / pen plotter)')}</option>
              </select>
            </Field>
            {format === 'hpgl' && (
              <Field label={t('Cutter dialect')}>
                <select
                  className="input-num"
                  value={opts.dialect}
                  onChange={(e) => setOpts({ ...opts, dialect: e.target.value as HpglDialect })}
                  title={t('Picks the wrapper commands. Bare = generic; Roland adds TB/CT/!PG; Graphtec adds FS/VS.')}
                >
                  <option value="bare">{t('Bare HP-GL (generic)')}</option>
                  <option value="roland-camm">{t('Roland CAMM (TB / CT / !PG)')}</option>
                  <option value="graphtec-fc">{t('Graphtec FC (FS / VS)')}</option>
                </select>
              </Field>
            )}
            <Field label={t('Unit')}>
              <select className="input-num" value={opts.unit} onChange={(e) => setOpts({ ...opts, unit: e.target.value as 'mm' | 'in', pxPerUnit: e.target.value === 'mm' ? 3.7795 : 96 })}>
                <option value="mm">{t('mm')}</option><option value="in">{t('inches')}</option>
              </select>
            </Field>
            <Field label={`${t('Feed rate')} (${opts.unit}/min)`}>
              <input type="number" className="input-num" value={opts.feedRate} onChange={(e) => setOpts({ ...opts, feedRate: +e.target.value })} />
            </Field>
            <Field label={`${t('Travel rate')} (${opts.unit}/min)`}>
              <input type="number" className="input-num" value={opts.travelRate} onChange={(e) => setOpts({ ...opts, travelRate: +e.target.value })} />
            </Field>
            <Field label={t('Pen down Z')}>
              <input type="number" step={0.1} className="input-num" value={opts.penDownZ} onChange={(e) => setOpts({ ...opts, penDownZ: +e.target.value })} />
            </Field>
            <Field label={t('Pen up Z')}>
              <input type="number" step={0.1} className="input-num" value={opts.penUpZ} onChange={(e) => setOpts({ ...opts, penUpZ: +e.target.value })} />
            </Field>
            <Field label={`${t('Paper height')} (${opts.unit})`}>
              <input type="number" className="input-num" value={opts.paperHeightUnits} onChange={(e) => setOpts({ ...opts, paperHeightUnits: +e.target.value })} />
            </Field>
            <Field label={t('Curve tolerance (px)')}>
              <input type="number" step={0.1} className="input-num" value={opts.curveTolerance} onChange={(e) => setOpts({ ...opts, curveTolerance: +e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 col-span-2 text-xs text-ink mt-1 cursor-pointer">
              <input type="checkbox" checked={opts.originBottomLeft} onChange={(e) => setOpts({ ...opts, originBottomLeft: e.target.checked })} />
              {t('Origin at bottom-left (CNC convention)')}
            </label>
            <label className="flex items-center gap-2 text-xs text-ink cursor-pointer" title={t('Mirror output horizontally — required for heat-transfer vinyl (HTV).')}>
              <input type="checkbox" checked={opts.mirror} onChange={(e) => setOpts({ ...opts, mirror: e.target.checked })} />
              <FlipHorizontal2 size={13} aria-hidden="true" />
              {t('Mirror (HTV)')}
            </label>
            <label className="flex items-center gap-2 text-xs text-ink cursor-pointer" title={t('Reorder paths to minimise wasted travel between cuts.')}>
              <input type="checkbox" checked={opts.optimize} onChange={(e) => setOpts({ ...opts, optimize: e.target.checked })} />
              <Route size={13} aria-hidden="true" />
              {t('Optimize order')}
            </label>
            <label className="flex items-center gap-2 text-xs text-ink cursor-pointer" title={t('Reverse the blade-travel direction of every path.')}>
              <input type="checkbox" checked={opts.reverse} onChange={(e) => setOpts({ ...opts, reverse: e.target.checked })} />
              <FlipHorizontal2 size={13} aria-hidden="true" />
              {t('Reverse direction')}
            </label>
            <label className="flex items-center gap-2 text-xs text-ink cursor-pointer" title={t('Cut contours nested inside others before the outer ones (print-and-cut).')}>
              <input type="checkbox" checked={opts.insideFirst} onChange={(e) => setOpts({ ...opts, insideFirst: e.target.checked })} />
              <Scissors size={13} aria-hidden="true" />
              {t('Inner contours first')}
            </label>
            <Field label={`${t('Overcut')} (mm)`}>
              <input
                type="number" step={0.05} min={0} max={5} className="input-num"
                value={opts.overcutMm}
                onChange={(e) => setOpts({ ...opts, overcutMm: Math.max(0, parseFloat(e.target.value) || 0) })}
                title={t('Extend closed cuts slightly past the start so corners fully release.')}
              />
            </Field>
          </div>

          {/* ---- Right column: visual / code preview ---- */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <div role="tablist" className="flex gap-1 text-[11px]">
                <PreviewTab active={previewMode === 'outline'} onClick={() => setPreviewMode('outline')} icon={<Eye size={11} aria-hidden="true" />} label={t('Outline')} />
                <PreviewTab active={previewMode === 'code'} onClick={() => { setPreviewMode('code'); if (!code) generate(); }} icon={<Code2 size={11} aria-hidden="true" />} label={t('Code')} />
              </div>
              {cutPathCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-[#ff2e9a]" title={t('Output will use cut paths instead of canvas SVG.')}>
                  <Scissors size={10} aria-hidden="true" />
                  {cutPathCount} {t('cut paths')}
                </span>
              )}
            </div>

            {previewMode === 'outline' ? (
              <CutPreview
                cutPaths={previewPaths}
                showPrint={showPrint}
                mirror={opts.mirror}
                showOrder={showOrder}
                className="w-full h-56 bg-panel2 border border-border rounded-sm"
              />
            ) : (
              <pre className="bg-panel2 border border-border rounded-sm p-2 h-56 overflow-auto text-[10px] font-mono text-ink/85">
                {code || t('(click Generate Preview)')}
              </pre>
            )}

            {/* Job estimate — cut length, travel saved by ordering, time. */}
            {previewPaths.length > 0 && (
              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted tabular-nums">
                <span className="flex items-center gap-1" title={t('Total blade-down distance')}>
                  <Ruler size={11} aria-hidden="true" />
                  {fmtMm(stats.cutLen)}
                </span>
                <span className="flex items-center gap-1" title={t('Pen-up travel between cuts')}>
                  <Route size={11} aria-hidden="true" />
                  {fmtMm(stats.travelLen)}
                </span>
                <span className="flex items-center gap-1" title={t('Estimated job time')}>
                  <Clock size={11} aria-hidden="true" />
                  ~{formatDuration(stats.seconds)}
                </span>
                <span className="flex items-center gap-1">
                  <Scissors size={11} aria-hidden="true" />
                  {stats.paths}
                </span>
              </div>
            )}

            {/* Cut by colour — mute swatches to cut one colour of vinyl at a
                time. Reg marks / weed borders (colourless) always cut. */}
            {colors.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] flex-wrap">
                <span className="text-muted">{t('Cut by color')}:</span>
                {colors.map(c => {
                  const muted = mutedColors.has(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleColor(c)}
                      aria-pressed={!muted}
                      title={`${c}${muted ? ` (${t('muted')})` : ''}`}
                      className={`w-4 h-4 rounded-sm border transition-opacity ${muted ? 'opacity-25 border-border' : 'border-ink shadow-sm'}`}
                      style={{ background: c }}
                    />
                  );
                })}
              </div>
            )}

            {/* Preview controls — print overlay + quick positioning marks. */}
            <div className="flex items-center gap-2 mt-2 text-[10px]">
              {previewMode === 'outline' && (
                <label className="flex items-center gap-1 cursor-pointer text-muted hover:text-ink" title={t('Overlay the printed artwork behind the cut lines.')}>
                  <input type="checkbox" checked={showPrint} onChange={(e) => setShowPrint(e.target.checked)} />
                  <ImageIcon size={11} aria-hidden="true" />
                  {t('Show print')}
                </label>
              )}
              {previewMode === 'outline' && (
                <label className="flex items-center gap-1 cursor-pointer text-muted hover:text-ink" title={t('Number the cut paths in travel order with a start arrow.')}>
                  <input type="checkbox" checked={showOrder} onChange={(e) => setShowOrder(e.target.checked)} />
                  <Route size={11} aria-hidden="true" />
                  {t('Cut order')}
                </label>
              )}
              {previewMode === 'code' && (
                <button type="button" className="btn !py-1 !text-[10px]" onClick={generate}>{t('Generate Preview')}</button>
              )}
              <div className="flex-1" />
              <span className="flex items-center gap-0.5 text-muted" title={t('Weed grid dividers (rows × columns).')}>
                <input
                  type="number" min={0} max={20} value={weedRows}
                  onChange={(e) => setWeedRows(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="input-num !w-9 !py-0.5 !text-[10px] text-center"
                  aria-label={t('Weed grid rows')}
                />
                <span>×</span>
                <input
                  type="number" min={0} max={20} value={weedCols}
                  onChange={(e) => setWeedCols(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="input-num !w-9 !py-0.5 !text-[10px] text-center"
                  aria-label={t('Weed grid columns')}
                />
              </span>
              <button
                type="button"
                className="btn !py-1 !text-[10px] flex items-center gap-1"
                onClick={addWeedBorder}
                title={t('Add a rectangular weed border around the whole job.')}
              >
                <SquareDashed size={11} aria-hidden="true" />
                {t('Weed border')}
              </button>
              <button
                type="button"
                className={`btn !py-1 !text-[10px] flex items-center gap-1 ${hasRegmarks ? '' : 'text-[#ff9a1f]'}`}
                onClick={addRegMarks}
                title={t('Add 4-corner positioning marks around the artwork.')}
              >
                <Crosshair size={11} aria-hidden="true" />
                {hasRegmarks ? t('Redo marks') : t('Add positioning marks')}
              </button>
            </div>
          </div>
        </div>

        {/* Capability hint + footer. */}
        <div className="px-4 pb-4">
          <div className="text-[10px] text-muted mb-3 flex items-start gap-1.5 leading-relaxed">
            <HardDriveDownload size={12} aria-hidden="true" className="mt-px shrink-0 text-success" />
            <span>
              {native
                ? t('Desktop app — direct USB sending is available.')
                : webSerial
                  ? t('Save the .plt/.gcode file to open in your cutter software, or send straight over USB.')
                  : t('Save the file (works in any browser) and open it in your cutter software. Direct USB sending needs the desktop app or Chrome/Edge.')}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-border">
            <button type="button" className="btn" onClick={close}>{t('Cancel')}</button>
            <button
              type="button"
              className="btn flex items-center gap-1"
              onClick={testCut}
              disabled={busy}
              title={t('Cut a small calibration pattern on scrap to dial in force / offset.')}
            >
              <FlaskConical size={12} aria-hidden="true" />{t('Test cut')}
            </button>
            <div className="flex-1" />
            {/* Save File is the primary action when direct USB isn't
                available, so non-Chrome / PWA users get an unmistakable
                "this is your button" instead of a disabled dead-end. */}
            <button
              type="button"
              className={`${canSend ? 'btn' : 'btn-primary'} flex items-center gap-1`}
              onClick={saveFile}
            >
              <Download size={12} aria-hidden="true" />{t('Save File')}
            </button>
            <button
              type="button"
              className="btn-primary flex items-center gap-1"
              onClick={send}
              disabled={busy || !canSend}
              aria-busy={busy}
              title={canSend ? undefined : t('Direct USB sending needs the desktop app or Chrome/Edge over HTTPS / localhost. Use Save File instead.')}
            >
              {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Usb size={12} aria-hidden="true" />}
              {busy ? t('Sending…') : t('Send via USB')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-2 py-1 rounded-sm flex items-center gap-1 border transition-colors ${
        active ? 'border-[#ff2e9a] text-ink bg-panel2' : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {icon}{label}
    </button>
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

/** Compact mm distance: metres past 1000mm, else millimetres. */
function fmtMm(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`;
}
