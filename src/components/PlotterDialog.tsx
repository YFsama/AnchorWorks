import { useCallback, useMemo, useState } from 'react';
import { X, Download, Loader2, Scissors, Crosshair, Code2, Eye, Image as ImageIcon, Usb, HardDriveDownload, FlipHorizontal2, Route, SquareDashed, Clock, Ruler, FlaskConical, Search } from 'lucide-react';
import { useEditor } from '../store/editor';
import { buildPlotterOutput, buildTestCut, defaultPlotterOptions, sendOverSerial, MATERIAL_PRESETS, type HpglDialect, type PlotterOptions } from '../lib/plotter';
import { addPlotterBridges, addPlotterRegistrationMarks, addPlotterWeedBorder, clearPlotterBridges, clearPlotterRegistrationMarks, clearPlotterWeedBorders } from '../lib/cutPrepActions';
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

const OVERCUT_PRESETS_MM = [0, 0.1, 0.2, 0.3, 0.5, 1];
const FEED_RATE_PRESETS = [200, 400, 800, 1200];
const TRAVEL_RATE_PRESETS = [800, 1200, 2000, 3000];
const CURVE_TOLERANCE_PRESETS_PX = [0.25, 0.5, 1, 2];
const OUTPUT_FORMAT_OPTIONS = [
  { value: 'hpgl', label: 'HP-GL / PLT (vinyl cutter)' },
  { value: 'gcode', label: 'G-code (CNC / pen plotter)' },
] as const;
const OUTPUT_UNIT_OPTIONS = [
  { value: 'mm', label: 'mm', pxPerUnit: 3.7795 },
  { value: 'in', label: 'inches', pxPerUnit: 96 },
] as const;
const HPGL_DIALECT_OPTIONS: Array<{ value: HpglDialect; label: string }> = [
  { value: 'bare', label: 'Bare HP-GL (generic)' },
  { value: 'roland-camm', label: 'Roland CAMM (TB / CT / !PG)' },
  { value: 'graphtec-fc', label: 'Graphtec FC (FS / VS)' },
];
const ORIGIN_OPTIONS = [
  { value: 'top-left', bottomLeft: false, label: 'Top-left origin', title: 'Use screen-style top-left origin.' },
  { value: 'bottom-left', bottomLeft: true, label: 'Bottom-left origin', title: 'Use CNC-style bottom-left origin.' },
] as const;
const BRIDGE_PRESETS = [
  { value: 'none', label: 'None', count: 0, gap: 1 },
  { value: 'light', label: 'Light', count: 2, gap: 0.6 },
  { value: 'standard', label: 'Standard', count: 4, gap: 1 },
  { value: 'heavy', label: 'Heavy', count: 6, gap: 1.5 },
] as const;
const WEED_GRID_PRESETS = [
  { value: 'none', label: 'None', rows: 0, cols: 0 },
  { value: 'rows', label: 'Weed rows', rows: 2, cols: 0 },
  { value: 'columns', label: 'Weed columns', rows: 0, cols: 2 },
  { value: '2x2', label: '2×2', rows: 2, cols: 2 },
  { value: '3x2', label: '3×2', rows: 3, cols: 2 },
] as const;
const CUT_STRATEGY_OPTIONS = [
  { key: 'mirror', label: 'Mirror (HTV)', title: 'Mirror output horizontally — required for heat-transfer vinyl (HTV).', icon: FlipHorizontal2 },
  { key: 'optimize', label: 'Optimize order', title: 'Reorder paths to minimise wasted travel between cuts.', icon: Route },
  { key: 'reverse', label: 'Reverse direction', title: 'Reverse the blade-travel direction of every path.', icon: FlipHorizontal2 },
  { key: 'insideFirst', label: 'Inner contours first', title: 'Cut contours nested inside others before the outer ones (print-and-cut).', icon: Scissors },
] as const;
const PREVIEW_MODES = ['outline', 'code'] as const;
type PreviewMode = typeof PREVIEW_MODES[number];

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
  const [previewMode, setPreviewMode] = useState<PreviewMode>('outline');
  const [showPrint, setShowPrint] = useState(true);
  const [showOrder, setShowOrder] = useState(false);
  const [materialId, setMaterialId] = useState('');
  const [materialQuery, setMaterialQuery] = useState('');
  // Cut-by-colour: which source swatches are muted (excluded from this job).
  const [mutedColors, setMutedColors] = useState<Set<string>>(() => new Set());
  // Weed grid dividers (0 = border only).
  const [weedRows, setWeedRows] = useState(0);
  const [bridgeCount, setBridgeCount] = useState(4);
  const [bridgeGap, setBridgeGap] = useState(1);
  const [weedCols, setWeedCols] = useState(0);
  const [reviewedFeedPreset, setReviewedFeedPreset] = useState('');
  const [reviewedTravelPreset, setReviewedTravelPreset] = useState('');
  const [reviewedTolerancePreset, setReviewedTolerancePreset] = useState('');
  const [reviewedOvercutPreset, setReviewedOvercutPreset] = useState('');
  const [reviewedCutStrategy, setReviewedCutStrategy] = useState('');
  const [reviewedPreviewToggle, setReviewedPreviewToggle] = useState('');
  const [reviewedColorAction, setReviewedColorAction] = useState('');
  const [reviewedOutputAction, setReviewedOutputAction] = useState('');
  const [reviewedWeedPreset, setReviewedWeedPreset] = useState('');
  const [reviewedBridgePreset, setReviewedBridgePreset] = useState('');
  const [reviewedPrepAction, setReviewedPrepAction] = useState('');

  const cutPaths = useEditor(s => s.cutPaths);
  const clearCutPaths = useEditor(s => s.clearCutPaths);
  const cutPathCount = cutPaths.length;
  const cutPathCounts = useMemo(() => ({
    outline: cutPaths.filter(p => p.kind === 'outline').length,
    trace: cutPaths.filter(p => p.kind === 'trace').length,
    regmark: cutPaths.filter(p => p.kind === 'regmark').length,
  }), [cutPaths]);
  const hasRegmarks = cutPathCounts.regmark > 0;
  const activeWeedGridPreset = WEED_GRID_PRESETS.find((preset) => weedRows === preset.rows && weedCols === preset.cols)?.value ?? '';
  const activeBridgePreset = BRIDGE_PRESETS.find((preset) => bridgeCount === preset.count && Math.abs(bridgeGap - preset.gap) < 0.001)?.value ?? '';

  // Distinct source colours present, for the separation swatch row.
  const colors = useMemo(() => {
    const set = new Set<string>();
    for (const p of cutPaths) if (p.color) set.add(p.color);
    return [...set];
  }, [cutPaths]);

  const normalizedMaterialQuery = materialQuery.trim().toLowerCase();
  const filteredMaterials = useMemo(() => {
    if (!normalizedMaterialQuery) return MATERIAL_PRESETS;
    return MATERIAL_PRESETS.filter((material) => [
      material.label,
      t(material.label),
      material.id,
      `${material.feedRate}`,
      `${material.force}`,
      `${material.speed}`,
      `${material.overcut}`,
      material.mirror ? 'htv mirror heat transfer' : '',
    ].some((value) => value.toLowerCase().includes(normalizedMaterialQuery)));
  }, [normalizedMaterialQuery, t]);
  const currentMaterial = materialId ? MATERIAL_PRESETS.find((material) => material.id === materialId) : null;
  const selectedMaterialHidden = materialId && !filteredMaterials.some((material) => material.id === materialId);
  const selectedMaterial = selectedMaterialHidden ? currentMaterial : null;
  const reviewedMaterial = materialId && filteredMaterials.some((material) => material.id === materialId)
    ? filteredMaterials.find((material) => material.id === materialId)
    : filteredMaterials[0];
  const reviewedMaterialIndex = reviewedMaterial ? filteredMaterials.findIndex((material) => material.id === reviewedMaterial.id) : -1;

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
  const outputBlocked = cutPathCount > 0 && activePaths.length === 0;
  const outputBlockedReason = outputBlocked ? t('No active cut paths — enable at least one color before saving or sending.') : '';
  const overrideCuts = cutPathCount > 0 ? activePaths : undefined;
  const buildOut = () => buildPlotterOutput(format, opts, overrideCuts);
  const generate = () => {
    if (outputBlocked) { toast.warn(outputBlockedReason, { title: t('Nothing to output') }); return; }
    setCode(buildOut());
  };
  const setPreview = (mode: PreviewMode) => {
    setPreviewMode(mode);
    if (mode === 'code' && !code) setCode(buildOut());
  };
  const focusPreviewTab = (mode: PreviewMode) => {
    setPreview(mode);
    requestAnimationFrame(() => document.getElementById(`plotter-preview-tab-${mode}`)?.focus());
  };
  const handlePreviewTabsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = PREVIEW_MODES.indexOf(previewMode);
    if (event.key === 'Home') { focusPreviewTab(PREVIEW_MODES[0]); return; }
    if (event.key === 'End') { focusPreviewTab(PREVIEW_MODES[PREVIEW_MODES.length - 1]); return; }
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    focusPreviewTab(PREVIEW_MODES[(index + delta + PREVIEW_MODES.length) % PREVIEW_MODES.length]);
  };

  const handleSegmentKeys = <T extends string>(
    event: React.KeyboardEvent<HTMLElement>,
    values: readonly T[],
    current: T,
    apply: (value: T) => void,
    onReview?: (value: T, button?: HTMLButtonElement | null) => void,
  ) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const group = event.currentTarget;
    const index = values.indexOf(current);
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    const nextValue = event.key === 'Home'
      ? values[0]
      : event.key === 'End'
        ? values[values.length - 1]
        : values[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length];
    apply(nextValue);
    requestAnimationFrame(() => {
      const button = group.querySelector<HTMLButtonElement>(`[data-value="${nextValue}"]`);
      onReview?.(nextValue, button);
      button?.focus();
    });
  };

  const handleMaterialPresetKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-material-option]'));
    if (buttons.length === 0) return;
    event.preventDefault();
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const selectedIndex = filteredMaterials.findIndex((material) => material.id === materialId);
    const currentIndex = activeIndex >= 0 ? activeIndex : Math.max(0, selectedIndex);
    const columns = 2;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : Math.min(buttons.length - 1, Math.max(0, currentIndex + (event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowRight' ? 1 : -1)));
    const nextMaterial = filteredMaterials[nextIndex];
    if (!nextMaterial) return;
    applyMaterial(nextMaterial.id);
    requestAnimationFrame(() => buttons[nextIndex]?.focus());
  };
  const handleMaterialSearchActionKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-material-search-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : event.key === 'ArrowRight'
          ? (activeIndex + 1) % actions.length
          : (activeIndex - 1 + actions.length) % actions.length;
    event.preventDefault();
    actions[nextIndex]?.focus();
  };

  const handlePrepActionKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-plotter-prep-action]'))
      .filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    if (actions.length === 0) return;
    const activeIndex = Math.max(0, actions.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : Math.max(0, Math.min(actions.length - 1, activeIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const nextAction = actions[nextIndex];
    setReviewedPrepAction(nextAction?.dataset.plotterPrepActionReview ?? nextAction?.textContent?.trim() ?? '');
    nextAction?.focus();
  };

  const getNextToolbarValue = <T extends string>(
    event: React.KeyboardEvent<HTMLElement>,
    values: readonly T[],
  ) => {
    const group = event.currentTarget;
    const activeValue = group.contains(document.activeElement)
      ? (document.activeElement as HTMLElement | null)?.dataset.value
      : undefined;
    const index = activeValue ? values.indexOf(activeValue as T) : -1;
    const baseIndex = index >= 0 ? index : event.key === 'ArrowLeft' ? 0 : -1;
    return event.key === 'Home'
      ? values[0]
      : event.key === 'End'
        ? values[values.length - 1]
        : values[(baseIndex + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length];
  };

  const focusToolbarValue = (group: HTMLElement, value: string, onReview?: (button?: HTMLButtonElement | null) => void) => {
    requestAnimationFrame(() => {
      const button = group.querySelector<HTMLButtonElement>(`[data-value="${value}"]`);
      onReview?.(button);
      button?.focus();
    });
  };

  const handleToolbarKeys = <T extends string>(
    event: React.KeyboardEvent<HTMLElement>,
    values: readonly T[],
    onReview?: (button?: HTMLButtonElement | null) => void,
  ) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    focusToolbarValue(event.currentTarget, getNextToolbarValue(event, values), onReview);
  };

  const handleCutStrategyKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextValue = getNextToolbarValue(event, CUT_STRATEGY_OPTIONS.map(option => option.key));
    setOpts({ ...opts, [nextValue]: !opts[nextValue] } as PlotterOptions);
    const button = event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${nextValue}"]`);
    setReviewedCutStrategy(button?.dataset.review ?? '');
    focusToolbarValue(event.currentTarget, nextValue);
  };

  const fileName = `design.${format === 'gcode' ? 'gcode' : (opts.dialect !== 'bare' ? 'plt' : 'hpgl')}`;
  const saveFile = () => {
    if (outputBlocked) { toast.warn(outputBlockedReason, { title: t('Nothing to output') }); return; }
    download(fileName, code || buildOut(), 'text/plain');
  };

  const send = async () => {
    if (outputBlocked) { toast.warn(outputBlockedReason, { title: t('Nothing to output') }); return; }
    setBusy(true);
    try {
      const out = code || buildOut();
      await sendOverSerial(out);
      toast.success(t('✅ Sent to plotter'));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const addRegMarks = () => addPlotterRegistrationMarks(t);
  const clearRegMarks = () => clearPlotterRegistrationMarks(t);

  const applyWeedGridPreset = (value: string) => {
    const preset = WEED_GRID_PRESETS.find((item) => item.value === value);
    if (!preset) return;
    setWeedRows(preset.rows);
    setWeedCols(preset.cols);
  };

  const applyBridgePreset = (value: string) => {
    const preset = BRIDGE_PRESETS.find((item) => item.value === value);
    if (!preset) return;
    setBridgeCount(preset.count);
    setBridgeGap(preset.gap);
  };

  const resetOutputSettings = () => {
    setOpts(defaultPlotterOptions);
    setFormat('hpgl');
    setMaterialId('');
    setMaterialQuery('');
    setMutedColors(new Set());
    setWeedRows(0);
    setWeedCols(0);
    setBridgeCount(4);
    setBridgeGap(1);
    setCode('');
    setPreviewMode('outline');
    setShowPrint(true);
    setShowOrder(false);
    setReviewedPrepAction(t('Reset output settings'));
    toast.success(t('Output settings reset'));
  };

  const toggleColor = (c: string) => {
    setMutedColors(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const showAllColors = () => setMutedColors(new Set());
  const muteAllColors = () => setMutedColors(new Set(colors));
  const invertColors = () => setMutedColors(prev => new Set(colors.filter(c => !prev.has(c))));
  const soloColor = (color: string) => setMutedColors(new Set(colors.filter(c => c !== color)));
  const visibleColors = colors.filter(c => !mutedColors.has(c));
  const outputSourceLabel = cutPathCount > 0 ? t('Cut paths') : t('Canvas artwork');
  const colorSummaryLabel = colors.length > 0
    ? `${visibleColors.length}/${colors.length} ${t('colors active')}`
    : t('all colors');
  const machineSummaryLabel = [
    format === 'hpgl' ? t(opts.dialect === 'bare' ? 'Bare HP-GL' : opts.dialect === 'roland-camm' ? 'Roland dialect' : 'Graphtec dialect') : t('G-code'),
    opts.unit,
    t(opts.originBottomLeft ? 'Bottom-left origin' : 'Top-left origin'),
    opts.mirror ? t('Mirrored') : t('Not mirrored'),
  ].join(' · ');
  const materialSummaryLabel = currentMaterial ? t(currentMaterial.label) : t('Custom material');
  const speedSummaryLabel = `${t('Feed')} ${opts.feedRate} · ${t('Travel')} ${opts.travelRate} · ${t('Overcut')} ${opts.overcutMm}mm`;
  const cutterPressureSummaryLabel = format === 'hpgl' && opts.dialect === 'graphtec-fc'
    ? ` · ${t('Force')} ${opts.graphtecForce} · ${t('Speed')} ${opts.graphtecSpeed}`
    : '';
  const jobSummaryLabel = `${format.toUpperCase()} · ${outputSourceLabel} · ${previewPaths.length} ${t('paths')} · ${colorSummaryLabel} · ${machineSummaryLabel} · ${materialSummaryLabel} · ${speedSummaryLabel}${cutterPressureSummaryLabel} · ~${formatDuration(stats.seconds)}`;
  const allColorsVisible = colors.length > 0 && mutedColors.size === 0;
  const noColorsVisible = colors.length > 0 && visibleColors.length === 0;
  const activeSoloColor = visibleColors.length === 1 ? visibleColors[0] : null;
  const colorActionSummary = `${visibleColors.length}/${colors.length} ${t('colors active')}`;
  const nextColorLabel = colors.length > 0 ? colors[(activeSoloColor ? colors.indexOf(activeSoloColor) : -1) + 1 >= colors.length ? 0 : (activeSoloColor ? colors.indexOf(activeSoloColor) : -1) + 1] : '';
  const nextColor = () => {
    if (colors.length === 0) return;
    const currentIndex = activeSoloColor ? colors.indexOf(activeSoloColor) : -1;
    soloColor(colors[(currentIndex + 1) % colors.length]);
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

  const addWeedBorder = () => addPlotterWeedBorder(t, weedRows, weedCols);
  const clearWeedBorders = () => clearPlotterWeedBorders(t);

  // Bridges — break closed cut paths with small uncut gaps so the cut-out
  // pieces stay attached to the material (stencils / no-shift weeding).
  const applyBridges = () => {
    addPlotterBridges(t, bridgeCount, bridgeGap);
  };
  const clearBridges = () => clearPlotterBridges(t);

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
                <div className="input-num mb-1 flex items-center gap-1.5 px-2 py-1 focus-within:border-accent2">
                  <Search size={12} className="text-muted shrink-0" aria-hidden="true" />
                  <input
                    type="search"
                    className="flex-1 bg-transparent outline-none text-xs text-ink placeholder:text-muted/70 min-w-0"
                    placeholder={t('Search materials…')}
                    value={materialQuery}
                    onChange={(e) => setMaterialQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && filteredMaterials[0]) {
                        e.preventDefault();
                        applyMaterial(filteredMaterials[0].id);
                        return;
                      }
                      if (e.key === 'ArrowDown' && filteredMaterials[0]) {
                        e.preventDefault();
                        requestAnimationFrame(() => document.getElementById(`plotter-material-${filteredMaterials[0].id}`)?.focus());
                        return;
                      }
                      if (e.key === 'Escape' && materialQuery) {
                        e.preventDefault();
                        e.stopPropagation();
                        setMaterialQuery('');
                      }
                    }}
                    aria-label={t('Search materials…')}
                    title={`${t('Press Enter to use first search result')} · ${t('Press Arrow Down to focus material list')}`}
                  />
                  <span className="text-[10px] text-muted tabular-nums shrink-0" aria-live="polite">
                    {normalizedMaterialQuery ? `${filteredMaterials.length} / ${MATERIAL_PRESETS.length} ${t('matches')}` : `${MATERIAL_PRESETS.length} ${t('materials')}`}
                  </span>
                  {materialQuery && (
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      role="toolbar"
                      aria-label={t('Material search actions')}
                      title={t('Use arrow keys to review material search actions')}
                      onKeyDown={handleMaterialSearchActionKeys}
                    >
                      <button
                        type="button"
                        className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0 disabled:opacity-40 disabled:hover:no-underline"
                        data-material-search-action
                        onClick={() => { if (filteredMaterials[0]) applyMaterial(filteredMaterials[0].id); }}
                        disabled={filteredMaterials.length === 0}
                        title={t('Use first search result')}
                      >
                        {t('Use First')}
                      </button>
                      <button
                        type="button"
                        className="text-[10px] text-muted hover:text-ink underline-offset-2 hover:underline transition-colors shrink-0"
                        data-material-search-action
                        onClick={() => setMaterialQuery('')}
                        title={t('Clear search')}
                      >
                        {t('Clear search')}
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`mb-1 w-full rounded border px-2 py-1 text-left text-xs transition ${materialId === '' ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                  onClick={() => setMaterialId('')}
                  aria-pressed={materialId === ''}
                >
                  {t('Custom / manual')}
                </button>
                {selectedMaterial && (
                  <div className="mb-1 rounded border border-accent2/40 bg-accent2/10 px-2 py-1 text-[11px] text-accent2">
                    {t('Current material hidden by search')}: {t(selectedMaterial.label)}
                  </div>
                )}
                <div id="plotter-material-review-status" className="sr-only" aria-live="polite">
                  {reviewedMaterial
                    ? `${t('Reviewing')} ${t(reviewedMaterial.label)} ${reviewedMaterialIndex + 1} / ${filteredMaterials.length}. ${t('Use arrow keys to review material presets')}`
                    : t('No materials found.')}
                </div>
                <div
                  className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto rounded border border-border bg-panel2 p-1"
                  role="listbox"
                  aria-label={t('Material presets')}
                  aria-describedby="plotter-material-review-status"
                  title={t('Use arrow keys to review material presets')}
                  onKeyDown={handleMaterialPresetKeys}
                >
                  {filteredMaterials.map((material) => {
                    const active = materialId === material.id;
                    return (
                      <button
                        key={material.id}
                        id={`plotter-material-${material.id}`}
                        type="button"
                        data-material-option
                        role="option"
                        aria-selected={active}
                        className={`rounded-md border px-2 py-1 text-left transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel hover:text-ink hover:border-accent2/60 text-muted'}`}
                        onClick={() => applyMaterial(material.id)}
                      >
                        <span className="block text-xs font-medium">{t(material.label)}</span>
                        <span className="mt-0.5 block text-[10px] leading-tight opacity-80">
                          {material.feedRate} {t('Feed rate')} · {material.force} {t('Force')} · {material.speed} {t('Speed')} · {material.overcut} mm {t('Overcut')}{material.mirror ? ` · ${t('Mirror')}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {normalizedMaterialQuery && filteredMaterials.length === 0 && (
                  <div className="type-caption mt-1 flex flex-col items-start gap-2">
                    <span>{t('No materials found.')}</span>
                    <button
                      type="button"
                      className="btn !py-1 !px-2 text-[10px]"
                      onClick={() => setMaterialQuery('')}
                    >
                      {t('Clear search')}
                    </button>
                  </div>
                )}
              </Field>
            </div>
            <Field label={t('Format')}>
              <div
                className="grid grid-cols-2 gap-1"
                role="group"
                aria-label={t('Format')}
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, OUTPUT_FORMAT_OPTIONS.map(option => option.value), format, setFormat)}
              >
                {OUTPUT_FORMAT_OPTIONS.map((option) => {
                  const active = format === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-value={option.value}
                      className={`rounded-md border px-2 py-1 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onClick={() => setFormat(option.value)}
                      title={`${t('Set output format to')} ${t(option.label)}`}
                      aria-pressed={active}
                    >
                      {t(option.label)}
                    </button>
                  );
                })}
              </div>
            </Field>
            {format === 'hpgl' && (
              <Field label={t('Cutter dialect')}>
                <div
                  className="grid grid-cols-3 gap-1"
                  role="group"
                  aria-label={t('Cutter dialect')}
                  title={t('Use Left/Right arrows to switch options')}
                  onKeyDown={(event) => handleSegmentKeys(event, HPGL_DIALECT_OPTIONS.map(option => option.value), opts.dialect, (value) => setOpts({ ...opts, dialect: value }))}
                >
                  {HPGL_DIALECT_OPTIONS.map((option) => {
                    const active = opts.dialect === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        data-value={option.value}
                        className={`rounded-md border px-2 py-1 text-[11px] leading-tight transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                        onClick={() => setOpts({ ...opts, dialect: option.value })}
                        title={`${t('Set cutter dialect to')} ${t(option.label)}`}
                        aria-pressed={active}
                      >
                        {t(option.label)}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            <Field label={t('Unit')}>
              <div
                className="grid grid-cols-2 gap-1"
                role="group"
                aria-label={t('Unit')}
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, OUTPUT_UNIT_OPTIONS.map(option => option.value), opts.unit, (value) => {
                  const option = OUTPUT_UNIT_OPTIONS.find(item => item.value === value);
                  if (option) setOpts({ ...opts, unit: option.value, pxPerUnit: option.pxPerUnit });
                })}
              >
                {OUTPUT_UNIT_OPTIONS.map((option) => {
                  const active = opts.unit === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-value={option.value}
                      className={`rounded-md border px-2 py-1 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onClick={() => setOpts({ ...opts, unit: option.value, pxPerUnit: option.pxPerUnit })}
                      title={`${t('Set output unit to')} ${t(option.label)}`}
                      aria-pressed={active}
                    >
                      {t(option.label)}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label={`${t('Feed rate')} (${opts.unit}/min)`}>
              <input type="number" className="input-num" value={opts.feedRate} onChange={(e) => setOpts({ ...opts, feedRate: +e.target.value })} />
              <div
                className="grid grid-cols-4 gap-1 mt-1"
                role="group"
                aria-label={t('Feed rate presets')}
                aria-describedby="plotter-feed-preset-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, FEED_RATE_PRESETS.map(String), `${opts.feedRate}`, (value) => setOpts({ ...opts, feedRate: Number(value) }), (_value, button) => setReviewedFeedPreset(button?.dataset.review ?? ''))}
              >
                <span id="plotter-feed-preset-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedFeedPreset || `${t('Feed rate')} ${opts.feedRate} ${opts.unit}/min`}`}
                </span>
                {FEED_RATE_PRESETS.map((value) => {
                  const active = Math.abs(opts.feedRate - value) < 0.001;
                  const review = `${t('Feed rate')} ${value} ${opts.unit}/min`;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-value={`${value}`}
                      data-review={review}
                      className={`rounded border px-1 py-0.5 text-[10px] transition-colors ${active ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onFocus={(event) => setReviewedFeedPreset(event.currentTarget.dataset.review ?? '')}
                      onClick={() => setOpts({ ...opts, feedRate: value })}
                      title={`${t('Set feed rate to')} ${value} ${opts.unit}/min`}
                      aria-pressed={active}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label={`${t('Travel rate')} (${opts.unit}/min)`}>
              <input type="number" className="input-num" value={opts.travelRate} onChange={(e) => setOpts({ ...opts, travelRate: +e.target.value })} />
              <div
                className="grid grid-cols-4 gap-1 mt-1"
                role="group"
                aria-label={t('Travel rate presets')}
                aria-describedby="plotter-travel-preset-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, TRAVEL_RATE_PRESETS.map(String), `${opts.travelRate}`, (value) => setOpts({ ...opts, travelRate: Number(value) }), (_value, button) => setReviewedTravelPreset(button?.dataset.review ?? ''))}
              >
                <span id="plotter-travel-preset-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedTravelPreset || `${t('Travel rate')} ${opts.travelRate} ${opts.unit}/min`}`}
                </span>
                {TRAVEL_RATE_PRESETS.map((value) => {
                  const active = Math.abs(opts.travelRate - value) < 0.001;
                  const review = `${t('Travel rate')} ${value} ${opts.unit}/min`;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-value={`${value}`}
                      data-review={review}
                      className={`rounded border px-1 py-0.5 text-[10px] transition-colors ${active ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onFocus={(event) => setReviewedTravelPreset(event.currentTarget.dataset.review ?? '')}
                      onClick={() => setOpts({ ...opts, travelRate: value })}
                      title={`${t('Set travel rate to')} ${value} ${opts.unit}/min`}
                      aria-pressed={active}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
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
              <div
                className="grid grid-cols-4 gap-1 mt-1"
                role="group"
                aria-label={t('Curve tolerance presets')}
                aria-describedby="plotter-tolerance-preset-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, CURVE_TOLERANCE_PRESETS_PX.map(String), `${opts.curveTolerance}`, (value) => setOpts({ ...opts, curveTolerance: Number(value) }), (_value, button) => setReviewedTolerancePreset(button?.dataset.review ?? ''))}
              >
                <span id="plotter-tolerance-preset-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedTolerancePreset || `${t('Curve tolerance')} ${opts.curveTolerance} px`}`}
                </span>
                {CURVE_TOLERANCE_PRESETS_PX.map((value) => {
                  const active = Math.abs(opts.curveTolerance - value) < 0.001;
                  const review = `${t('Curve tolerance')} ${value} px`;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-value={`${value}`}
                      data-review={review}
                      className={`rounded border px-1 py-0.5 text-[10px] transition-colors ${active ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onFocus={(event) => setReviewedTolerancePreset(event.currentTarget.dataset.review ?? '')}
                      onClick={() => setOpts({ ...opts, curveTolerance: value })}
                      title={`${t('Set curve tolerance to')} ${value} px`}
                      aria-pressed={active}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="col-span-2">
              <div className="field-label !mb-1">{t('Origin')}</div>
              <div
                className="grid grid-cols-2 gap-1"
                role="group"
                aria-label={t('Origin')}
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, ORIGIN_OPTIONS.map(option => option.value), opts.originBottomLeft ? 'bottom-left' : 'top-left', (value) => {
                  const option = ORIGIN_OPTIONS.find(item => item.value === value);
                  if (option) setOpts({ ...opts, originBottomLeft: option.bottomLeft });
                })}
              >
                {ORIGIN_OPTIONS.map((option) => {
                  const active = opts.originBottomLeft === option.bottomLeft;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-value={option.value}
                      className={`rounded-md border px-2 py-1 text-xs transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onClick={() => setOpts({ ...opts, originBottomLeft: option.bottomLeft })}
                      title={t(option.title)}
                      aria-pressed={active}
                    >
                      {t(option.label)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2">
              <div className="field-label !mb-1">{t('Cut strategy')}</div>
              <div
                className="grid grid-cols-4 gap-1"
                role="group"
                aria-label={t('Cut strategy')}
                aria-describedby="plotter-cut-strategy-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={handleCutStrategyKeys}
              >
                <span id="plotter-cut-strategy-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedCutStrategy || `${t('Cut strategy')} · ${CUT_STRATEGY_OPTIONS.filter(option => opts[option.key]).map(option => t(option.label)).join(' · ') || t('None')}`}`}
                </span>
                {CUT_STRATEGY_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = opts[option.key];
                  const review = `${t(option.label)} · ${active ? t('on') : t('off')}`;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      data-value={option.key}
                      data-review={review}
                      className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] leading-tight transition ${active ? 'border-accent2 bg-accent2/15 text-ink' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onFocus={(event) => setReviewedCutStrategy(event.currentTarget.dataset.review ?? '')}
                      onClick={() => setOpts({ ...opts, [option.key]: !active } as PlotterOptions)}
                      title={t(option.title)}
                      aria-pressed={active}
                    >
                      <Icon size={13} aria-hidden="true" />
                      {t(option.label)}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label={`${t('Overcut')} (mm)`}>
              <input
                type="number" step={0.05} min={0} max={5} className="input-num"
                value={opts.overcutMm}
                onChange={(e) => setOpts({ ...opts, overcutMm: Math.max(0, parseFloat(e.target.value) || 0) })}
                title={t('Extend closed cuts slightly past the start so corners fully release.')}
              />
            </Field>
            <div className="col-span-2">
              <div className="field-label !mb-1">{t('Overcut presets')}</div>
              <div
                className="grid grid-cols-6 gap-1"
                role="group"
                aria-label={t('Overcut presets')}
                aria-describedby="plotter-overcut-preset-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, OVERCUT_PRESETS_MM.map(String), `${opts.overcutMm}`, (value) => setOpts({ ...opts, overcutMm: Number(value) }), (_value, button) => setReviewedOvercutPreset(button?.dataset.review ?? ''))}
              >
                <span id="plotter-overcut-preset-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedOvercutPreset || `${t('Overcut')} ${opts.overcutMm} mm`}`}
                </span>
                {OVERCUT_PRESETS_MM.map((value) => {
                  const review = `${t('Overcut')} ${value} mm`;
                  return (
                  <button
                    key={value}
                    type="button"
                    data-value={`${value}`}
                    data-review={review}
                    className={`btn !py-1 !px-1 !text-[10px] ${Math.abs(opts.overcutMm - value) < 0.001 ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                    onFocus={(event) => setReviewedOvercutPreset(event.currentTarget.dataset.review ?? '')}
                    onClick={() => setOpts({ ...opts, overcutMm: value })}
                    aria-pressed={Math.abs(opts.overcutMm - value) < 0.001}
                    title={t('Apply overcut preset')}
                  >
                    {value.toFixed(value === 1 ? 0 : 1)}
                  </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---- Right column: visual / code preview ---- */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <div className="field-label mb-1">{t('Graphical cut preview')}</div>
                <div role="tablist" className="flex gap-1 text-[11px]" onKeyDown={handlePreviewTabsKeyDown} aria-label={t('Plotter preview modes')}>
                  <PreviewTab id="outline" active={previewMode === 'outline'} onClick={() => setPreview('outline')} icon={<Eye size={11} aria-hidden="true" />} label={t('Outline')} />
                  <PreviewTab id="code" active={previewMode === 'code'} onClick={() => setPreview('code')} icon={<Code2 size={11} aria-hidden="true" />} label={t('Code')} />
                </div>
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
                <span
                  className="inline-flex items-center gap-1"
                  role="group"
                  aria-label={t('Cut by color quick actions')}
                  aria-describedby="plotter-color-action-review-status"
                  title={t('Use Left/Right arrows to switch options')}
                  onKeyDown={(event) => {
                    handleToolbarKeys(event, ['all', 'none', 'invert', 'next'] as const);
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      requestAnimationFrame(() => setReviewedColorAction((document.activeElement as HTMLElement | null)?.dataset.review ?? ''));
                    }
                  }}
                >
                  <span id="plotter-color-action-review-status" className="sr-only" aria-live="polite">
                    {`${t('Reviewing')} ${reviewedColorAction || `${t('Cut by color')} · ${colorActionSummary}`}`}
                  </span>
                  <button
                    type="button"
                    data-value="all"
                    data-review={`${t('All colors')} · ${colors.length}/${colors.length} ${t('colors active')}`}
                    className={`btn !px-1.5 !py-0.5 !text-[10px] ${allColorsVisible ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                    onFocus={(event) => setReviewedColorAction(event.currentTarget.dataset.review ?? '')}
                    onClick={showAllColors}
                    aria-pressed={allColorsVisible}
                  >
                    {t('All colors')}
                  </button>
                  <button
                    type="button"
                    data-value="none"
                    data-review={`${t('No colors')} · 0/${colors.length} ${t('colors active')}`}
                    className={`btn !px-1.5 !py-0.5 !text-[10px] ${noColorsVisible ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                    onFocus={(event) => setReviewedColorAction(event.currentTarget.dataset.review ?? '')}
                    onClick={muteAllColors}
                    aria-pressed={noColorsVisible}
                  >
                    {t('No colors')}
                  </button>
                  <button
                    type="button"
                    data-value="invert"
                    data-review={`${t('Invert')} · ${colors.length - visibleColors.length}/${colors.length} ${t('colors active')}`}
                    className="btn !px-1.5 !py-0.5 !text-[10px]"
                    onFocus={(event) => setReviewedColorAction(event.currentTarget.dataset.review ?? '')}
                    onClick={invertColors}
                  >
                    {t('Invert')}
                  </button>
                  <button
                    type="button"
                    data-value="next"
                    data-review={`${t('Next color')} · ${nextColorLabel || t('None')}`}
                    className={`btn !px-1.5 !py-0.5 !text-[10px] ${activeSoloColor ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                    onFocus={(event) => setReviewedColorAction(event.currentTarget.dataset.review ?? '')}
                    onClick={nextColor}
                    aria-pressed={!!activeSoloColor}
                    title={t('Solo next color')}
                  >
                    {t('Next color')}
                  </button>
                </span>
                {colors.map(c => {
                  const muted = mutedColors.has(c);
                  const solo = !muted && colors.every((color) => color === c || mutedColors.has(color));
                  return (
                    <span key={c} className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleColor(c)}
                        aria-pressed={!muted}
                        title={`${c}${muted ? ` (${t('muted')})` : ''}`}
                        className={`w-4 h-4 rounded-sm border transition-opacity ${muted ? 'opacity-25 border-border' : 'border-ink shadow-sm'}`}
                        style={{ background: c }}
                      />
                      <button
                        type="button"
                        aria-pressed={solo}
                        className={`px-1 h-4 rounded-sm border text-[9px] transition-colors ${solo ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink hover:bg-panel2'}`}
                        onClick={() => soloColor(c)}
                        title={`${t('Cut only')} ${c}`}
                      >
                        {t('Only')}
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Preview controls — print overlay + quick positioning marks. */}
            <div className="flex items-center gap-2 mt-2 text-[10px]">
              <span id="plotter-prep-action-review-status" className="sr-only" aria-live="polite">
                {`${t('Reviewing')} ${reviewedPrepAction || t('Plotter prep actions')}`}
              </span>
              {previewMode === 'outline' && (
                <span
                  className="inline-flex items-center gap-1"
                  role="group"
                  aria-label={t('Plotter preview toggles')}
                  aria-describedby="plotter-preview-toggle-review-status"
                  title={t('Use Left/Right arrows to switch options')}
                  onKeyDown={(event) => {
                    handleToolbarKeys(event, ['print', 'order'] as const);
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      requestAnimationFrame(() => setReviewedPreviewToggle((document.activeElement as HTMLElement | null)?.dataset.review ?? ''));
                    }
                  }}
                >
                  <span id="plotter-preview-toggle-review-status" className="sr-only" aria-live="polite">
                    {`${t('Reviewing')} ${reviewedPreviewToggle || `${t('Plotter preview toggles')} · ${t('Show print')} ${showPrint ? t('on') : t('off')} · ${t('Cut order')} ${showOrder ? t('on') : t('off')}`}`}
                  </span>
                  <button
                    type="button"
                    data-value="print"
                    data-review={`${t('Show print')} · ${showPrint ? t('on') : t('off')}`}
                    className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 transition-colors ${showPrint ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink hover:bg-panel2'}`}
                    onFocus={(event) => setReviewedPreviewToggle(event.currentTarget.dataset.review ?? '')}
                    onClick={() => setShowPrint(!showPrint)}
                    title={t('Overlay the printed artwork behind the cut lines.')}
                    aria-pressed={showPrint}
                  >
                    <ImageIcon size={11} aria-hidden="true" />
                    {t('Show print')}
                  </button>
                  <button
                    type="button"
                    data-value="order"
                    data-review={`${t('Cut order')} · ${showOrder ? t('on') : t('off')}`}
                    className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 transition-colors ${showOrder ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink hover:bg-panel2'}`}
                    onFocus={(event) => setReviewedPreviewToggle(event.currentTarget.dataset.review ?? '')}
                    onClick={() => setShowOrder(!showOrder)}
                    title={t('Number the cut paths in travel order with a start arrow.')}
                    aria-pressed={showOrder}
                  >
                    <Route size={11} aria-hidden="true" />
                    {t('Cut order')}
                  </button>
                </span>
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
              <span
                className="inline-flex items-center gap-1"
                role="group"
                aria-label={t('Weed grid presets')}
                aria-describedby="plotter-weed-preset-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, WEED_GRID_PRESETS.map(preset => preset.value), activeWeedGridPreset, applyWeedGridPreset, (_value, button) => setReviewedWeedPreset(button?.dataset.review ?? ''))}
              >
                <span id="plotter-weed-preset-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedWeedPreset || `${t('None')}: 0 × 0`}`}
                </span>
                {WEED_GRID_PRESETS.map((preset) => {
                  const active = weedRows === preset.rows && weedCols === preset.cols;
                  const review = `${t(preset.label)}: ${preset.rows} × ${preset.cols}`;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      data-value={preset.value}
                      data-review={review}
                      className={`btn !py-1 !px-1.5 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                      onFocus={(event) => setReviewedWeedPreset(event.currentTarget.dataset.review ?? '')}
                      onClick={() => applyWeedGridPreset(preset.value)}
                      aria-pressed={active}
                      title={t('Apply weed grid preset')}
                    >
                      {t(preset.label)}
                    </button>
                  );
                })}
              </span>
              <span
                className="inline-flex flex-wrap items-center gap-1"
                role="toolbar"
                aria-label={t('Plotter prep actions')}
                aria-describedby="plotter-prep-action-review-status"
                title={t('Use arrow keys to review output prep actions')}
                onKeyDown={handlePrepActionKeys}
              >
                <button
                  type="button"
                  data-plotter-prep-action
                  data-plotter-prep-action-review={t('Weed border')}
                  className="btn !py-1 !text-[10px] flex items-center gap-1"
                  onClick={addWeedBorder}
                  onFocus={() => setReviewedPrepAction(t('Weed border'))}
                  title={t('Add a rectangular weed border around the whole job.')}
                >
                  <SquareDashed size={11} aria-hidden="true" />
                  {t('Weed border')}
                </button>
                <button
                  type="button"
                  data-plotter-prep-action
                  data-plotter-prep-action-review={hasRegmarks ? t('Redo marks') : t('Add positioning marks')}
                  className={`btn !py-1 !text-[10px] flex items-center gap-1 ${hasRegmarks ? '' : 'text-[#ff9a1f]'}`}
                  onClick={addRegMarks}
                  onFocus={(event) => setReviewedPrepAction(event.currentTarget.dataset.plotterPrepActionReview ?? '')}
                  title={t('Add 4-corner positioning marks around the artwork.')}
                >
                  <Crosshair size={11} aria-hidden="true" />
                  {hasRegmarks ? t('Redo marks') : t('Add positioning marks')}
                </button>
                <button
                  type="button"
                  data-plotter-prep-action
                  data-plotter-prep-action-review={t('Clear weed borders')}
                  className="btn !py-1 !text-[10px] flex items-center gap-1"
                  onClick={clearWeedBorders}
                  onFocus={() => setReviewedPrepAction(t('Clear weed borders'))}
                  title={t('Clear weed borders')}
                >
                  <SquareDashed size={11} aria-hidden="true" />
                  {t('Clear weed borders')}
                </button>
                <button
                  type="button"
                  data-plotter-prep-action
                  data-plotter-prep-action-review={t('Clear positioning marks')}
                  className="btn !py-1 !text-[10px] flex items-center gap-1"
                  onClick={clearRegMarks}
                  onFocus={() => setReviewedPrepAction(t('Clear positioning marks'))}
                  title={t('Clear positioning marks')}
                >
                  <Crosshair size={11} aria-hidden="true" />
                  {t('Clear positioning marks')}
                </button>
                {cutPathCounts.outline > 0 && (
                  <button
                    type="button"
                    data-plotter-prep-action
                    data-plotter-prep-action-review={t('Clear contour')}
                    className="btn !py-1 !text-[10px]"
                    onClick={() => clearCutPaths('outline')}
                    onFocus={() => setReviewedPrepAction(t('Clear contour'))}
                    title={t('Clear contour cut paths')}
                  >
                    {t('Clear contour')}
                  </button>
                )}
                {cutPathCounts.trace > 0 && (
                  <button
                    type="button"
                    data-plotter-prep-action
                    data-plotter-prep-action-review={t('Clear trace')}
                    className="btn !py-1 !text-[10px]"
                    onClick={() => clearCutPaths('trace')}
                    onFocus={() => setReviewedPrepAction(t('Clear trace'))}
                    title={t('Clear traced cut paths')}
                  >
                    {t('Clear trace')}
                  </button>
                )}
                {cutPathCounts.regmark > 0 && (
                  <button
                    type="button"
                    data-plotter-prep-action
                    data-plotter-prep-action-review={t('Clear regmarks')}
                    className="btn !py-1 !text-[10px]"
                    onClick={() => clearCutPaths('regmark')}
                    onFocus={() => setReviewedPrepAction(t('Clear regmarks'))}
                    title={t('Clear registration marks')}
                  >
                    {t('Clear regmarks')}
                  </button>
                )}
                <button
                  type="button"
                  data-plotter-prep-action
                  data-plotter-prep-action-review={t('Clear cut paths')}
                  className="btn !py-1 !text-[10px]"
                  onClick={() => clearCutPaths()}
                  onFocus={() => setReviewedPrepAction(t('Clear cut paths'))}
                  disabled={cutPathCount === 0}
                  title={t('Clear cut paths')}
                >
                  {t('Clear cut paths')}
                </button>
                <button
                  type="button"
                  data-plotter-prep-action
                  data-plotter-prep-action-review={t('Reset output settings')}
                  className="btn !py-1 !text-[10px]"
                  onClick={resetOutputSettings}
                  onFocus={() => setReviewedPrepAction(t('Reset output settings'))}
                  title={t('Reset output settings')}
                >
                  {t('Reset output settings')}
                </button>
              </span>
            </div>

            {/* Bridges — leave small uncut gaps so cut pieces / stencil islands
                stay attached to the material. */}
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted">
              <span title={t('Number of bridges per path × gap width (mm).')}>{t('Bridges')}</span>
              <span
                className="inline-flex items-center gap-1"
                role="group"
                aria-label={t('Bridge presets')}
                aria-describedby="plotter-bridge-preset-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, BRIDGE_PRESETS.map(preset => preset.value), activeBridgePreset, applyBridgePreset, (_value, button) => setReviewedBridgePreset(button?.dataset.review ?? ''))}
              >
                <span id="plotter-bridge-preset-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedBridgePreset || `${t('Standard')}: 4 × 1 mm`}`}
                </span>
                {BRIDGE_PRESETS.map((preset) => {
                  const active = bridgeCount === preset.count && Math.abs(bridgeGap - preset.gap) < 0.001;
                  const review = `${t(preset.label)}: ${preset.count} × ${preset.gap} mm`;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      data-value={preset.value}
                      data-review={review}
                      className={`btn !py-1 !px-1.5 !text-[10px] ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                      onFocus={(event) => setReviewedBridgePreset(event.currentTarget.dataset.review ?? '')}
                      onClick={() => applyBridgePreset(preset.value)}
                      aria-pressed={active}
                      title={t('Apply bridge preset')}
                    >
                      {t(preset.label)}
                    </button>
                  );
                })}
              </span>
              <input
                type="number" min={0} max={20} value={bridgeCount}
                onChange={(e) => setBridgeCount(Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)))}
                className="input-num !w-9 !py-0.5 !text-[10px] text-center"
                aria-label={t('Bridge count')}
              />
              <span>×</span>
              <input
                type="number" min={0.2} max={10} step={0.2} value={bridgeGap}
                onChange={(e) => setBridgeGap(Math.max(0.2, parseFloat(e.target.value) || 0.2))}
                className="input-num !w-10 !py-0.5 !text-[10px] text-center"
                aria-label={t('Bridge gap (mm)')}
              />
              <span>mm</span>
              <span
                className="inline-flex items-center gap-1 ml-auto"
                role="toolbar"
                aria-label={t('Bridge actions')}
                aria-describedby="plotter-prep-action-review-status"
                title={t('Use arrow keys to review bridge actions')}
                onKeyDown={handlePrepActionKeys}
              >
                <button
                  type="button"
                  data-plotter-prep-action
                  data-plotter-prep-action-review={t('Add bridges')}
                  className="btn !py-1 !text-[10px] flex items-center gap-1"
                  onClick={applyBridges}
                  onFocus={() => setReviewedPrepAction(t('Add bridges'))}
                  disabled={bridgeCount < 1}
                  title={bridgeCount < 1 ? t('Choose a bridge preset first.') : t('Break closed cut paths with uncut bridges.')}
                >
                  <SquareDashed size={11} aria-hidden="true" />
                  {t('Add bridges')}
                </button>
                <button
                  type="button"
                  data-plotter-prep-action
                  data-plotter-prep-action-review={t('Clear bridges')}
                  className="btn !py-1 !text-[10px] flex items-center gap-1"
                  onClick={clearBridges}
                  onFocus={() => setReviewedPrepAction(t('Clear bridges'))}
                  title={t('Clear bridges')}
                >
                  <SquareDashed size={11} aria-hidden="true" />
                  {t('Clear bridges')}
                </button>
              </span>
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
          <div className="mb-3 rounded border border-accent2/40 bg-accent2/10 px-2 py-1.5 text-[10px] text-accent2 flex items-center gap-1.5 tabular-nums" title={t('Final output summary before Save or Send')}>
            <Scissors size={12} aria-hidden="true" className="shrink-0" />
            <span className="font-medium">{t('Ready to output')}:</span>
            <span>{jobSummaryLabel}</span>
          </div>
          {outputBlocked && (
            <div className="-mt-2 mb-3 rounded border border-warning/50 bg-warning/10 px-2 py-1.5 text-[10px] text-warning">
              {outputBlockedReason}
            </div>
          )}

          <div
            className="flex items-center gap-2 pt-3 border-t border-border"
            role="group"
            aria-label={t('Plotter output actions')}
            aria-describedby="plotter-output-action-review-status"
            title={t('Use Left/Right arrows to switch options')}
            onKeyDown={(event) => handleToolbarKeys(event, ['cancel', 'test-cut', 'save-file', 'send-usb'] as const, (button) => setReviewedOutputAction(button?.dataset.review ?? ''))}
          >
            <span id="plotter-output-action-review-status" className="sr-only" aria-live="polite">
              {`${t('Reviewing')} ${reviewedOutputAction || `${t('Plotter output actions')} · ${jobSummaryLabel}`}`}
            </span>
            <button type="button" data-value="cancel" data-review={t('Cancel')} className="btn" onFocus={(event) => setReviewedOutputAction(event.currentTarget.dataset.review ?? '')} onClick={close}>{t('Cancel')}</button>
            <button
              type="button"
              data-value="test-cut"
              data-review={`${t('Test cut')} · ${t('Cut a small calibration pattern on scrap to dial in force / offset.')}`}
              className="btn flex items-center gap-1"
              onFocus={(event) => setReviewedOutputAction(event.currentTarget.dataset.review ?? '')}
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
              data-value="save-file"
              data-review={`${t('Save File')} · ${outputBlocked ? outputBlockedReason : fileName}`}
              className={`${canSend ? 'btn' : 'btn-primary'} flex items-center gap-1`}
              onFocus={(event) => setReviewedOutputAction(event.currentTarget.dataset.review ?? '')}
              onClick={saveFile}
              disabled={outputBlocked}
              title={outputBlocked ? outputBlockedReason : undefined}
            >
              <Download size={12} aria-hidden="true" />{t('Save File')}
            </button>
            <button
              type="button"
              data-value="send-usb"
              data-review={`${t('Send via USB')} · ${outputBlocked ? outputBlockedReason : canSend ? jobSummaryLabel : t('Direct USB sending needs the desktop app or Chrome/Edge over HTTPS / localhost. Use Save File instead.')}`}
              className="btn-primary flex items-center gap-1"
              onFocus={(event) => setReviewedOutputAction(event.currentTarget.dataset.review ?? '')}
              onClick={send}
              disabled={busy || !canSend || outputBlocked}
              aria-busy={busy}
              title={outputBlocked ? outputBlockedReason : canSend ? undefined : t('Direct USB sending needs the desktop app or Chrome/Edge over HTTPS / localhost. Use Save File instead.')}
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

function PreviewTab({ id, active, onClick, icon, label }: { id: PreviewMode; active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  const t = useT();
  return (
    <button
      id={`plotter-preview-tab-${id}`}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      title={t('Use Left/Right arrows to switch preview')}
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
