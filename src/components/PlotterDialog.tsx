import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { X, Download, Loader2, Scissors, Crosshair, Code2, Eye, Image as ImageIcon, Usb, HardDriveDownload, FlipHorizontal2, Route, SquareDashed, Clock, Ruler, FlaskConical, Search, Play, FolderOpen, ChevronDown, Layers } from 'lucide-react';
import { useEditor, type CutPath } from '../store/editor';
import { buildForceTest, buildPlotterOutput, buildTestCut, defaultPlotterOptions, listSerialPorts, loadPlotterPrefs, savePlotterPrefs, sendOverSerial, MATERIAL_PRESETS, type HpglDialect, type NativeSerialPort, type PlotterOptions } from '../lib/plotter';
import { getSharedPlotterLink, type FlowControl } from '../lib/plotterLink';
import { buildAbortSnippet, lintJob, simulateMachineCode, sniffFormat, type LintResult, type MachineRun } from '../lib/hpglDebug';
import { MACHINE_PROFILES, getMachineProfile, profileConnectInit, profileForceSpeed } from '../lib/machineProfiles';
import { addJobLog, type MachineDraft, type MachineRecord } from '../lib/plotterRecords';
import { estimateEtaSeconds, estimateTransferSeconds } from '../lib/plotterDiag';
import { addPlotterBridges, addPlotterRegistrationMarks, addPlotterWeedBorder, clearPlotterBridges, clearPlotterRegistrationMarks, clearPlotterWeedBorders } from '../lib/cutPrepActions';
import type { RegMarkStyle } from '../lib/cutContour';
import { buildOutlineCutPaths } from '../lib/contourFromSelection';
import { optimizeOrder, cutStats, estimateSeconds, estimateJobSeconds, formatDuration, applyOvercut, applyBladeOffset, type PolyLite } from '../lib/cutOptimize';
import { weedCheck, WEED_PROFILES, type WeedIssueKind, type WeedProfileId, type WeedReport } from '../lib/weedCheck';
import { buildVinylLayers, type VinylLayer } from '../lib/layerJobs';
import { applyLayerTrap } from '../lib/layerTrap';
import { showConfirm } from '../lib/confirm';
import { getCanvas } from '../lib/canvasEngine';
import { download } from '../lib/io';
import { isTauri } from '../lib/runtime';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';
import { CutPreview } from './CutPreview';
import { PlotterConsole } from './PlotterConsole';
import { AnnotatedCode, MachineSim } from './PlotterCodeViews';

const OVERCUT_PRESETS_MM = [0, 0.1, 0.2, 0.3, 0.5, 1];
const BLADE_OFFSET_PRESETS_MM = [0, 0.25, 0.5];
/** Default ARMS block (open-graphtec-server defaults): 20 mm arms, type-2
 *  square marks, expecting a 200 × 150 mm mark rectangle until Auto-filled. */
const DEFAULT_ARMS: NonNullable<PlotterOptions['arms']> = { armMm: 20, type: 2, rectW: 200, rectH: 150 };
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
/** Material weeding profiles for the Weed check panel (weedCheck.ts) — the
 *  four WEED_PROFILES ids with their operator-facing labels. */
const WEED_PROFILE_OPTIONS: Array<{ value: WeedProfileId; label: string }> = [
  { value: 'vinyl', label: 'Vinyl' },
  { value: 'htv', label: 'HTV' },
  { value: 'glitter-htv', label: 'Glitter HTV' },
  { value: 'sticker-paper', label: 'Sticker paper' },
];
/** Weed issue kinds → display labels (t()'d at render). */
const WEED_ISSUE_LABELS: Record<WeedIssueKind, string> = {
  'thin-feature': 'Thin feature',
  'narrow-gap': 'Narrow gap',
  'small-island': 'Small island',
};
const CUT_STRATEGY_OPTIONS = [
  { key: 'mirror', label: 'Mirror (HTV)', title: 'Mirror output horizontally — required for heat-transfer vinyl (HTV).', icon: FlipHorizontal2 },
  { key: 'optimize', label: 'Optimize order', title: 'Reorder paths to minimise wasted travel between cuts.', icon: Route },
  { key: 'reverse', label: 'Reverse direction', title: 'Reverse the blade-travel direction of every path.', icon: FlipHorizontal2 },
  { key: 'insideFirst', label: 'Inner contours first', title: 'Cut contours nested inside others before the outer ones (print-and-cut).', icon: Scissors },
] as const;
const PREVIEW_MODES = ['outline', 'code'] as const;
type PreviewMode = typeof PREVIEW_MODES[number];
/** Code-tab sub-views: raw text / per-statement explanation / animated
 *  replay of the machine code itself (see PlotterCodeViews.tsx). */
const CODE_VIEW_OPTIONS = [
  { value: 'raw', label: 'Raw', title: 'The raw machine text exactly as it ships.' },
  { value: 'annotated', label: 'Annotated', title: 'Every statement explained: position, pen state, distances.' },
  { value: 'sim', label: 'Replay', title: 'Animated replay of the parsed machine code — cut vs travel, with a scrubbable playhead.' },
] as const;
type CodeViewMode = typeof CODE_VIEW_OPTIONS[number]['value'];
/** Shared empty run so the annotated/sim views can render before code exists. */
const EMPTY_RUN: MachineRun = { steps: [], cuts: [], travels: [], segs: [], bbox: null, cutLen: 0, travelLen: 0, penDownMoves: 0 };

export function PlotterDialog() {
  const t = useT();
  const open = useEditor(s => s.showPlotter);
  const close = useCallback(() => useEditor.getState().setModal('showPlotter', false), []);
  // Machine settings hydrate from localStorage (see savePlotterPrefs) so a
  // dialled-in cutter setup survives dialog reopens and app restarts.
  const savedPrefs = useMemo(() => loadPlotterPrefs(), []);
  const [opts, setOpts] = useState<PlotterOptions>(savedPrefs.opts ?? defaultPlotterOptions);
  const [format, setFormat] = useState<'gcode' | 'hpgl'>(savedPrefs.format ?? 'hpgl');
  const [code, setCode] = useState('');
  // Filename when the code tab shows a loaded third-party file ('' = generated).
  const [codeSource, setCodeSource] = useState('');
  // Preflight dry-run result for the Code tab (see lintJob in hpglDebug).
  const [lint, setLint] = useState<LintResult | null>(null);
  // Code-tab sub-view: raw text / annotated statements / animated replay.
  const [codeView, setCodeView] = useState<CodeViewMode>('raw');
  const [busy, setBusy] = useState(false);
  // Shared persistent serial link — kept open across dialog reopens so the
  // console log, connection, and jog state survive a close/reopen cycle.
  const link = getSharedPlotterLink();
  const [baud, setBaud] = useState(savedPrefs.baud ?? 115200);
  const [flow, setFlow] = useState<FlowControl>(savedPrefs.flowControl ?? 'none');
  const [jobProgress, setJobProgress] = useState<{ sent: number; total: number; eta: number | null } | null>(null);
  // True while the operator paused the running job stream (see togglePauseJob).
  const [jobPaused, setJobPaused] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [, linkTick] = useReducer((x: number) => x + 1, 0);
  // Preview mode: 'outline' = graphical SVG of the cut geometry (default —
  // it's what a cutter operator actually wants to verify), 'code' = the
  // raw G-code / HP-GL text for the machine.
  const [previewMode, setPreviewMode] = useState<PreviewMode>('outline');
  const [showPrint, setShowPrint] = useState(true);
  const [showOrder, setShowOrder] = useState(false);
  // Animated cut simulation replaying the optimized job order.
  const [simulate, setSimulate] = useState(false);
  // Preview annotations: START marker on the first blade touch-down and a
  // W×H dimension frame around the job (see CutPreview).
  const [showStart, setShowStart] = useState(false);
  const [showDims, setShowDims] = useState(false);
  // Registration-mark recipe: shape + arm/shape size in mm (cutContour).
  const [markStyle, setMarkStyle] = useState<RegMarkStyle>('L');
  const [markArm, setMarkArm] = useState(10);
  // ARMS registration emit toggle. The values live in opts.arms (so they
  // persist with the prefs blob); the toggle gates whether buildOut actually
  // passes the block — only valid with the Graphtec FC dialect (see plotter.ts).
  const [armsEnabled, setArmsEnabled] = useState(() => !!savedPrefs.opts?.arms);
  const [materialId, setMaterialId] = useState(savedPrefs.materialId ?? '');
  const [materialQuery, setMaterialQuery] = useState('');
  // Cut-by-colour: which source swatches are muted (excluded from this job).
  const [mutedColors, setMutedColors] = useState<Set<string>>(() => new Set());
  // Per-layer mirror overrides (keyed by layer colour). Seeded empty — an
  // untouched layer follows the global opts.mirror; once a row's toggle is
  // clicked its colour sticks to that choice for the session (like
  // mutedColors, intentionally not reset when the layer set changes).
  const [layerMirrorOverrides, setLayerMirrorOverrides] = useState<Record<string, boolean>>({});
  // Trap overlap for the Layers section's "Trap layers" action (mm).
  const [trapMm, setTrapMm] = useState(0.5);
  // Weed grid dividers (0 = border only).
  const [weedRows, setWeedRows] = useState(0);
  const [bridgeCount, setBridgeCount] = useState(4);
  const [bridgeGap, setBridgeGap] = useState(1);
  const [weedCols, setWeedCols] = useState(0);
  const [reviewedFeedPreset, setReviewedFeedPreset] = useState('');
  const [reviewedTravelPreset, setReviewedTravelPreset] = useState('');
  const [reviewedTolerancePreset, setReviewedTolerancePreset] = useState('');
  const [reviewedOvercutPreset, setReviewedOvercutPreset] = useState('');
  const [reviewedBladeOffsetPreset, setReviewedBladeOffsetPreset] = useState('');
  const [reviewedCutStrategy, setReviewedCutStrategy] = useState('');
  const [reviewedPreviewToggle, setReviewedPreviewToggle] = useState('');
  const [reviewedColorAction, setReviewedColorAction] = useState('');
  const [reviewedOutputAction, setReviewedOutputAction] = useState('');
  const [reviewedWeedPreset, setReviewedWeedPreset] = useState('');
  const [reviewedBridgePreset, setReviewedBridgePreset] = useState('');
  const [reviewedPrepAction, setReviewedPrepAction] = useState('');
  const [nativePorts, setNativePorts] = useState<NativeSerialPort[]>([]);
  const [selectedPort, setSelectedPort] = useState(savedPrefs.lastPort ?? '');
  const [portsLoading, setPortsLoading] = useState(false);
  const [portsError, setPortsError] = useState('');
  // Selected brand profile (see machineProfiles.ts) — loads dialect/baud/
  // flow/force defaults + operator notes for the physical cutter in front
  // of the operator. '' = generic / manual.
  const [profileId, setProfileId] = useState(savedPrefs.profileId ?? '');
  const profile = getMachineProfile(profileId);
  // Bumped after every job-log entry so the console's history list refetches.
  const [jobLogVersion, setJobLogVersion] = useState(0);

  // Round-trip the machine settings whenever any of them change.
  useEffect(() => {
    savePlotterPrefs({ opts, format, materialId, baud, flowControl: flow, lastPort: selectedPort, profileId });
  }, [opts, format, materialId, baud, flow, selectedPort, profileId]);

  // Apply a brand profile: dialect + serial knobs + force/speed starting
  // points. Every field stays manually overridable afterwards — a profile
  // is a starting point, not a lock.
  const applyProfile = (id: string) => {
    setProfileId(id);
    const p = getMachineProfile(id);
    if (!p) return;
    setOpts(o => ({
      ...o,
      dialect: p.dialect,
      ...(p.panelOnly ? {} : { graphtecForce: p.defaultForce, graphtecSpeed: p.defaultSpeed }),
    }));
    setBaud(p.baud);
    setFlow(p.flowControl);
  };

  // Snapshot / restore the full cutter setup — backs the console's saved
  // machine rows (one record per physical cutter).
  const snapshotConfig = (): MachineDraft => ({
    name: '',
    profileId,
    format,
    opts,
    materialId,
    baud,
    flowControl: flow,
    portPath: selectedPort,
    notes: '',
  });
  const applyConfig = (rec: MachineRecord) => {
    setProfileId(rec.profileId);
    setFormat(rec.format);
    setOpts(rec.opts);
    setArmsEnabled(!!rec.opts.arms);
    setMaterialId(rec.materialId);
    setBaud(rec.baud);
    setFlow(rec.flowControl);
    if (rec.portPath) setSelectedPort(rec.portPath);
  };

  // Re-render on link status transitions so the Send button / hints reflect
  // connects and disconnects made from the console.
  useEffect(() => link.subscribe(ev => {
    if (ev.type === 'status' || ev.type === 'done') linkTick();
  }), [link]);

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

  // Layered-vinyl split of the FULL store job (muting is the manual cut-by-
  // colour workflow; layers manage their own per-colour subsets). The Layers
  // section only appears when this yields ≥2 colours to stack — otherwise
  // there is nothing multi-colour to cut and we render nothing at all.
  const layers = useMemo(() => buildVinylLayers(cutPaths), [cutPaths]);

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
  const native = isTauri();
  const webSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
  const canSend = native || webSerial;

  const refreshSerialPorts = useCallback(async () => {
    if (!native) return;
    setPortsLoading(true);
    setPortsError('');
    try {
      const ports = (await listSerialPorts()) ?? [];
      setNativePorts(ports);
      setSelectedPort((current) => {
        if (current && ports.some((port) => port.path === current)) return current;
        if (ports.length === 1) return ports[0].path;
        return ports.find((port) => port.kind === 'usb')?.path ?? '';
      });
    } catch (error) {
      setNativePorts([]);
      setSelectedPort('');
      setPortsError((error as Error).message);
    } finally {
      setPortsLoading(false);
    }
  }, [native]);

  useEffect(() => {
    if (!open || !native) return;
    const timer = window.setTimeout(() => { void refreshSerialPorts(); }, 0);
    return () => window.clearTimeout(timer);
  }, [open, native, refreshSerialPorts]);

  const stats = useMemo(() => {
    let polys: PolyLite[] = [];
    for (const c of previewPaths) {
      const passes = Math.max(1, c.passes ?? 1);
      for (let i = 0; i < passes; i++) polys.push({ points: c.points, closed: c.closed });
    }
    if (opts.optimize) polys = optimizeOrder(polys);
    // Corner count is taken BEFORE the blade-offset adjustment: the corner
    // loops themselves add ≥15° vertices (their overshoot/retro vertices turn
    // 70–110°), so counting on the adjusted geometry would inflate the
    // corner-swing term 2–5×. LENGTHS, however, must come from the adjusted
    // geometry — the same postProcess order plotter.ts applies to the shipped
    // job (overcut retrace first, then blade-offset loops) so cut length and
    // travel include them instead of under-reporting.
    const overcutMm = opts.overcutMm ?? 0;
    const bladeOffset = opts.bladeOffsetMm ?? 0;
    const pathCount = polys.length;
    const preStats = cutStats(polys);
    if (overcutMm > 0) polys = applyOvercut(polys, overcutMm);
    if (bladeOffset > 0) polys = applyBladeOffset(polys, bladeOffset);
    const s = cutStats(polys);
    const feedMmMin = opts.unit === 'mm' ? opts.feedRate : opts.feedRate * 25.4;
    const travelMmMin = opts.unit === 'mm' ? opts.travelRate : opts.travelRate * 25.4;
    // Physics twin (trapezoidal model, cutOptimize.estimateJobSeconds): the
    // SAME post-overcut/blade-offset geometry, but charged through per-
    // segment accel/cruise/decel profiles with corner junction slowdowns.
    // The loops and retrace are already in the coordinates, and the per-
    // vertex slowdowns model the corner-swing cost — so estimateSeconds'
    // overcut/corner extras are deliberately NOT stacked on this number.
    const accelMmS2 = currentMaterial?.accelMmS2;
    const physicsSeconds = accelMmS2 && feedMmMin > 0 && travelMmMin > 0
      ? estimateJobSeconds(polys, [0, 0], {
          feedMmMin,
          travelMmMin,
          accelMmS2,
          headUpS: currentMaterial?.headUpS,
          cornerSlow: true,
        })
      : undefined;
    // Adjustments are strictly 1:1 per path (loops/overcut add vertices,
    // never paths), so `paths` is the pre-adjustment count by construction —
    // keep it from the captured count regardless, so a future adjustment
    // that ever dropped a path can't wobble the displayed count.
    return {
      ...s,
      paths: polys.length === pathCount ? s.paths : pathCount,
      corners: preStats.corners,
      closedPaths: preStats.closedPaths,
      seconds: estimateSeconds(
        { ...s, corners: preStats.corners, closedPaths: preStats.closedPaths },
        feedMmMin,
        travelMmMin,
        { bladeOffsetMm: bladeOffset, overcutMm },
      ),
      physicsSeconds,
    };
    // Sim-timeline divergence: CutPreview rebuilds its own polys from the
    // `cutPaths` prop (passes → optimizeOrder → buildSimTimeline) and takes
    // CutPath[] — not adjusted polys — so the animated replay's ETA excludes
    // the overcut/corner-loop extras this estimate includes. CutPreview is
    // deliberately left untouched here (its props can't take adjusted polys
    // without refactoring); the numbers agree when both offsets are 0.
  }, [previewPaths, opts.optimize, opts.feedRate, opts.travelRate, opts.unit, opts.overcutMm, opts.bladeOffsetMm, currentMaterial]);

  // Escape close — capture phase, consistent with other dialogs.
  useEscapeClose(open, close);
  useFocusRestore(open);

  // Parsed carriage-run of the generated machine code — powers the
  // Annotated and Replay sub-views. Only computed while the code tab
  // could be visible.
  const codeRun = useMemo<MachineRun | null>(
    () => (previewMode === 'code' && code ? simulateMachineCode(format, code, opts.unit) : null),
    [previewMode, code, format, opts.unit],
  );
  if (!open) return null;

  // Two independent capabilities decide what the user can do:
  //   • native (Tauri) talks to the OS serial layer directly — works in
  //     the packaged desktop app on ANY platform, no Chrome involved.
  //   • web Serial is Chromium-only (Chrome/Edge over HTTPS/localhost).
  // EITHER one enables the direct "Send via USB" path; when neither is
  // present we steer the user to "Save File", which works literally
  // everywhere and is the normal cutter-software workflow anyway.

  // In cut-path mode, ship the colour-filtered set; otherwise let
  // buildPlotterOutput fall back to the canvas SVG.
  const outputBlocked = cutPathCount > 0 && activePaths.length === 0;
  const outputBlockedReason = outputBlocked ? t('No active cut paths — enable at least one color before saving or sending.') : '';
  const overrideCuts = cutPathCount > 0 ? activePaths : undefined;
  // ARMS is only emittable on the Graphtec FC dialect (generateHPGL throws
  // otherwise) — the section stays visible but disabled elsewhere so the
  // feature remains discoverable.
  const armsAvailable = format === 'hpgl' && opts.dialect === 'graphtec-fc';
  const armsActive = armsEnabled && !!opts.arms && armsAvailable;
  // The block rides along only while the toggle is on AND the current
  // format/dialect can emit it; otherwise strip it so a stale prefs blob or
  // a format switch to G-code can never claim ARMS it isn't sending.
  const effectiveOpts: PlotterOptions = armsActive ? opts : { ...opts, arms: undefined };
  const buildOut = () => buildPlotterOutput(format, effectiveOpts, overrideCuts);
  /** GenerateHPGL throws when ARMS is armed against a non-Graphtec dialect —
   *  surface the message and return null so the caller skips the action. */
  const safeGenerate = (build: () => string): string | null => {
    try {
      return build();
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };
  // Preflight dry-run of the machine code — lintJob is pure, so it can run
  // on every generate/preview refresh without touching the machine.
  const lintContext = {
    unit: opts.unit,
    originBottomLeft: opts.originBottomLeft,
    paperHeightUnits: opts.paperHeightUnits,
    penDownZ: opts.penDownZ,
    penUpZ: opts.penUpZ,
  };
  const runPreflight = (source?: string) => {
    if (outputBlocked) return;
    const src = source ?? (code || safeGenerate(buildOut));
    if (!src) return;
    setLint(lintJob(format, src, lintContext));
  };
  const generate = () => {
    if (outputBlocked) { toast.warn(outputBlockedReason, { title: t('Nothing to output') }); return; }
    const out = safeGenerate(buildOut);
    if (out === null) return;
    setCode(out);
    setCodeSource('');
    setLint(lintJob(format, out, lintContext));
  };
  /** Load a third-party .plt / .hpgl / .gcode file into the code tab for
   *  preflight / annotated / replay analysis — nothing is sent. The
   *  format tab auto-switches to the sniffed format so the parsers match. */
  const loadCodeFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.plt,.hpgl,.gcode,.nc,.ngc,.gcode.txt,.txt';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        if (!text.trim()) { toast.warn(t('The file is empty.')); return; }
        const sniffed = sniffFormat(text);
        if (sniffed !== format) setFormat(sniffed);
        setCode(text);
        setCodeSource(file.name);
        setLint(lintJob(sniffed, text, lintContext));
        setPreviewMode('code');
        toast.success(`${t('Loaded file')}: ${file.name}${sniffed !== format ? ` (${sniffed === 'gcode' ? 'G-code' : 'HP-GL'})` : ''}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    };
    input.click();
  };
  const setPreview = (mode: PreviewMode) => {
    setPreviewMode(mode);
    if (mode === 'code' && !code) {
      const out = safeGenerate(buildOut);
      if (out === null) return;
      setCode(out);
      setLint(lintJob(format, out, lintContext));
    }
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
  /** Download name at click time: profile + timestamp so the operator can
   *  tell yesterday's GX job from today's clone job in the downloads
   *  folder. Built inside handlers — reading the clock during render
   *  trips the purity lint. */
  const stampedFileName = (prefix = 'design') => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ext = format === 'gcode' ? 'gcode' : (opts.dialect !== 'bare' ? 'plt' : 'hpgl');
    return `${profileId ? `${profileId}-` : ''}${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
  };
  const saveFile = () => {
    if (outputBlocked) { toast.warn(outputBlockedReason, { title: t('Nothing to output') }); return; }
    const payload = code || safeGenerate(buildOut);
    if (payload === null) return;
    download(stampedFileName(), payload, 'text/plain');
  };

  /** Stream a job over the persistent link when connected — paced writes,
   *  live progress, and a real Cancel that lifts the blade. Falls back to
   *  the legacy one-shot send (which opens/picks the port itself) when the
   *  operator never connected. Every outcome lands in the job history
   *  (plotterRecords) so yesterday's working settings stay traceable. */
  const streamJob = async (payload: string, successMsg: string, kind: 'job' | 'test-cut' = 'job') => {
    const bytes = new TextEncoder().encode(payload).length;
    const logJob = (result: 'ok' | 'aborted' | 'error', seconds: number, target: string) => {
      addJobLog({
        kind,
        target,
        profileId,
        format,
        baud: link.status === 'connected' ? link.baud : baud,
        paths: kind === 'test-cut' ? 2 : previewPaths.length,
        bytes,
        seconds,
        result,
        materialId,
      });
      setJobLogVersion(v => v + 1);
    };
    if (link.status === 'connected') {
      const abort = new AbortController();
      abortRef.current = abort;
      // Fresh handle: mutating the render-scope link trips the compiler's
      // immutability lint — a handler-local reference is fine.
      getSharedPlotterLink().activeJobSignal = abort;
      setJobProgress({ sent: 0, total: bytes, eta: null });
      setJobPaused(false);
      const t0 = Date.now();
      try {
        await link.send(payload, {
          signal: abort.signal,
          onProgress: (sent, total) => setJobProgress({ sent, total, eta: estimateEtaSeconds(sent, total, Date.now() - t0) }),
        });
        toast.success(successMsg);
        logJob('ok', (Date.now() - t0) / 1000, link.describe());
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          // Stop safely: pen up (HP-GL) / feed hold (grbl) as a best effort.
          // pauseImmune so the snippet goes out even mid-pause.
          await link.send(buildAbortSnippet(format), { pauseImmune: true }).catch(() => undefined);
          toast.warn(t('Job cancelled — blade raised'));
          logJob('aborted', (Date.now() - t0) / 1000, link.describe());
        } else {
          toast.error((e as Error).message);
          logJob('error', (Date.now() - t0) / 1000, link.describe());
        }
      } finally {
        link.resume(); // release the pause gate whatever happened
        setJobPaused(false);
        setJobProgress(null);
        abortRef.current = null;
        getSharedPlotterLink().activeJobSignal = null;
      }
      return;
    }
    const t0 = Date.now();
    await sendOverSerial(payload, baud, native ? selectedPort || undefined : undefined);
    toast.success(successMsg);
    logJob('ok', (Date.now() - t0) / 1000, selectedPort || 'serial');
  };

  /** Pause the stream between chunks — the machine drains its buffer and
   *  stops. grbl machines additionally get a feed hold; resume sends the
   *  cycle-start. HP-GL machines just stop when the buffer runs dry. */
  const togglePauseJob = async () => {
    if (jobPaused) {
      link.resume();
      setJobPaused(false);
      if (format === 'gcode') await link.send('~', { pauseImmune: true }).catch(() => undefined);
    } else {
      link.pause();
      setJobPaused(true);
      if (format === 'gcode') await link.send('!', { pauseImmune: true }).catch(() => undefined);
    }
  };

  const cancelJob = () => {
    link.resume(); // unblock the sender so abort can take effect
    abortRef.current?.abort();
  };

  const send = async () => {
    if (outputBlocked) { toast.warn(outputBlockedReason, { title: t('Nothing to output') }); return; }
    // Last-chance preflight gate: lintJob is pure and fast, so run it on
    // the exact bytes about to ship and confirm on ERROR-level problems.
    const payload = code || safeGenerate(buildOut);
    if (payload === null) return;
    const check = lintJob(format, payload, lintContext);
    if (check.issues.some(i => i.severity === 'error')) {
      const first = check.issues.find(i => i.severity === 'error');
      const ok = window.confirm(`${t('Preflight found problems')}:\n${first?.message ?? ''}\n\n${t('Send anyway?')}`);
      if (!ok) {
        setLint(check);
        setPreviewMode('code');
        return;
      }
    }
    setBusy(true);
    try {
      await streamJob(payload, t('✅ Sent to plotter'));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  /* ---- Layered vinyl (multi-colour) ----
   * Each layer ships as its own job: that colour's paths + the shared
   * colourless geometry (regmarks, weed borders) — layerJobs' subset rule:
   * the marks cut identically into every layer, which is the layered-vinyl
   * alignment convention (stack layers by matching the same marks). Mirror
   * defaults to the global job option (opts.mirror via effectiveOpts) and
   * each row can override it per layer — HTV layers cut from the carrier
   * side need mirroring, a vinyl layer applied with transfer tape may not.
   */

  /** Effective mirror flag for a layer colour: the per-row override once
   *  touched, else the global option. */
  const layerMirror = (color: string) => layerMirrorOverrides[color] ?? opts.mirror;

  /** Build options for one layer's job — everything global, plus the
   *  layer's own mirror resolution (see layerMirror). */
  const layerOpts = (layer: VinylLayer): PlotterOptions => ({ ...effectiveOpts, mirror: layerMirror(layer.color) });

  /** Build + lint-gate one layer's job (same preflight gate as send());
   *  resolves false when the operator declined or generation failed, so
   *  batch sequences know to stop. */
  const sendLayerJob = async (layer: VinylLayer): Promise<boolean> => {
    const payload = safeGenerate(() => buildPlotterOutput(format, layerOpts(layer), layer.paths));
    if (payload === null) return false;
    const check = lintJob(format, payload, lintContext);
    if (check.issues.some(i => i.severity === 'error')) {
      const first = check.issues.find(i => i.severity === 'error');
      const ok = window.confirm(`${t('Preflight found problems')}:\n${first?.message ?? ''}\n\n${t('Send anyway?')}`);
      if (!ok) {
        setLint(check);
        setPreviewMode('code');
        return false;
      }
    }
    await streamJob(payload, t('✅ Sent to plotter'));
    return true;
  };

  const sendLayer = async (layer: VinylLayer) => {
    setBusy(true);
    try {
      await sendLayerJob(layer);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  /** Send every layer in stacking order. Between layers the operator swaps
   *  the vinyl sheet on the cutter — showConfirm gates the swap, and
   *  declining stops the remaining layers. Every send lands in the job
   *  history via streamJob's logging. */
  const sendAllLayers = async () => {
    setBusy(true);
    try {
      let sentCount = 0;
      for (let i = 0; i < layers.length; i++) {
        if (i > 0) {
          const next = layers[i];
          const proceed = await showConfirm({
            title: t('Layered vinyl'),
            message: `${t('Layer')} ${i + 1} ${t('of')} ${layers.length} (${next.color}). ${t('Swap the vinyl, then continue.')}`,
            confirmLabel: t('Send'),
          });
          if (!proceed) {
            if (sentCount > 0 && sentCount < layers.length) {
              toast.info(`${t('Stopped after')} ${t('Layer')} ${sentCount} ${t('of')} ${layers.length}.`, { title: t('Layered vinyl') });
            }
            break;
          }
        }
        const sent = await sendLayerJob(layers[i]);
        if (!sent) break;
        sentCount = i + 1;
      }
    } finally {
      setBusy(false);
    }
  };

  /** Filesystem-safe colour token for layer filenames ('#ff0000' → 'ff0000'). */
  const layerFileToken = (color: string) => color.replace(/[\\/:*?"<>|#]/g, '').trim() || 'uncolored';

  const saveLayer = (layer: VinylLayer, index: number) => {
    const payload = safeGenerate(() => buildPlotterOutput(format, layerOpts(layer), layer.paths));
    if (payload === null) return;
    download(stampedFileName(`layer-${index + 1}-${layerFileToken(layer.color)}`), payload, 'text/plain');
  };

  /** Save every layer, staggered ~300 ms apart — browsers swallow bursts of
   *  downloads (same stagger pattern as separations.exportPlates; the first
   *  file goes out immediately). */
  const saveAllLayers = () => {
    layers.forEach((layer, i) => {
      if (i === 0) saveLayer(layer, i);
      else setTimeout(() => saveLayer(layer, i), i * 300);
    });
  };

  const addRegMarks = () => addPlotterRegistrationMarks(t, markStyle, markArm);
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
    setArmsEnabled(false);
    setFormat('hpgl');
    setMaterialId('');
    setMaterialQuery('');
    setMutedColors(new Set());
    setLayerMirrorOverrides({});
    setWeedRows(0);
    setWeedCols(0);
    setBridgeCount(4);
    setBridgeGap(1);
    setTrapMm(0.5);
    setCode('');
    setPreviewMode('outline');
    setShowPrint(true);
    setShowOrder(false);
    setSimulate(false);
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
  const bladeOffsetMm = opts.bladeOffsetMm ?? 0;
  const speedSummaryLabel = `${t('Feed')} ${opts.feedRate} · ${t('Travel')} ${opts.travelRate} · ${t('Overcut')} ${opts.overcutMm}mm`
    + (bladeOffsetMm > 0 ? ` · ${t('blade offset')} ${bladeOffsetMm} mm` : '')
    + (armsActive ? ` · ${t('ARMS 4-mark')}` : '');
  const cutterPressureSummaryLabel = format === 'hpgl' && opts.dialect === 'graphtec-fc'
    ? ` · ${t('Force')} ${opts.graphtecForce} · ${t('Speed')} ${opts.graphtecSpeed}`
    : '';
  // Physics-estimate suffix: shown next to the classic `~` only when the
  // trapezoidal model produced a number AND it disagrees with the classic
  // estimate by more than a second — `≈` distinguishes it from `~`.
  const physicsEtaLabel = stats.physicsSeconds !== undefined && Math.abs(stats.physicsSeconds - stats.seconds) > 1
    ? ` · ≈${formatDuration(stats.physicsSeconds)} (${t('physics')})`
    : '';
  const jobSummaryLabel = `${format.toUpperCase()} · ${outputSourceLabel} · ${previewPaths.length} ${t('paths')} · ${colorSummaryLabel} · ${machineSummaryLabel} · ${materialSummaryLabel} · ${speedSummaryLabel}${cutterPressureSummaryLabel} · ~${formatDuration(stats.seconds)}${physicsEtaLabel}`;
  // Serial transfer preview at the current knobs — a 2 MB PLT at 9600 baud
  // is ~25 s of streaming before the blade moves; the operator should see
  // that coming. Uses the generated preview code when present.
  const transferEstimateLabel = code
    ? ` · ${t('transfer')} ~${estimateTransferSeconds(code.length, baud, flow)}s @${baud}`
    : '';
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
  // Overcut prefers the explicit defaultOvercutMm twin when research gave
  // one, else the legacy overcut field.
  const applyMaterial = (id: string) => {
    setMaterialId(id);
    const m = MATERIAL_PRESETS.find(p => p.id === id);
    if (!m) return;
    setOpts(o => ({
      ...o,
      feedRate: m.feedRate,
      graphtecForce: m.force,
      graphtecSpeed: m.speed,
      overcutMm: m.defaultOvercutMm ?? m.overcut,
      mirror: m.mirror ? true : o.mirror,
    }));
  };

  /** Auto-fill the ARMS expected-mark rectangle from the job's own tight
   *  bounding box — the same previewPaths set the stats/preview draw, already
   *  in mm (CutPath space). Falls back to the 200 × 150 default when there is
   *  nothing to measure yet. */
  const fillArmsRectFromJob = () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of previewPaths) {
      for (const [x, y] of p.points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const rectW = Number.isFinite(minX) ? Math.max(1, Math.round(maxX - minX)) : DEFAULT_ARMS.rectW;
    const rectH = Number.isFinite(minY) ? Math.max(1, Math.round(maxY - minY)) : DEFAULT_ARMS.rectH;
    setOpts(o => ({ ...o, arms: { ...(o.arms ?? DEFAULT_ARMS), rectW, rectH } }));
  };

  // Test cut: a tiny calibration pattern on scrap to dial in force/offset.
  // Sends when a direct path exists, otherwise saves the file. Never carries
  // the ARMS block — calibration runs on scrap, not on printed marks.
  const testCut = async () => {
    const out = safeGenerate(() => buildTestCut(format, { ...effectiveOpts, arms: undefined }));
    if (out === null) return;
    if (!canSend) { download(stampedFileName('test-cut'), out, 'text/plain'); return; }
    setBusy(true);
    try {
      await streamJob(out, t('✅ Test cut sent'), 'test-cut');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  // Force test strip: five squares at rising blade pressure in one pass —
  // weed them left→right and the first clean lift is the force to use.
  // HP-GL only (pen plotters have no force concept). Calibration runs on
  // scrap, so the ARMS block never rides along here either.
  const forceTest = async () => {
    const out = safeGenerate(() => buildForceTest(format, { ...effectiveOpts, arms: undefined }));
    if (out === null) return;
    if (!canSend) { download(stampedFileName('force-test'), out, 'text/plain'); return; }
    setBusy(true);
    try {
      await streamJob(out, t('✅ Force test sent'), 'test-cut');
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
                          {material.feedRate} {t('Feed rate')} · {material.force} {t('Force')} · {material.speed} {t('Speed')} · {material.overcut} mm {t('Overcut')}{material.mirror ? ` · ${t('Mirror')}` : ''}{material.bladeAngleDeg ? ` · ${material.bladeAngleDeg}° ${t('blade')}` : ''}{(material.passes ?? 1) > 1 ? ` · ${material.passes} ${t('passes')}` : ''}
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
            {format === 'hpgl' && (
              <div className="col-span-2">
                <Field label={t('Machine profile')}>
                  <select
                    className="input"
                    value={profileId}
                    onChange={(e) => applyProfile(e.target.value)}
                    aria-label={t('Machine profile')}
                    title={t('Pick your cutter brand — loads dialect, baud, flow control, force/speed defaults and field notes.')}
                  >
                    <option value="">{t('Generic / manual')}</option>
                    {MACHINE_PROFILES.map((p) => (
                      <option key={p.id} value={p.id}>{`${t(p.brand)} — ${t(p.label)}`}</option>
                    ))}
                  </select>
                  {profile && (
                    <div className="mt-1 rounded border border-border bg-panel2/60 px-2 py-1 text-[10px] text-muted leading-relaxed">
                      <div className="text-ink/80">{t(profile.models)}</div>
                      <div>{t('Recommends')} {profile.baud} {t('Baud').toLowerCase()} · {t(profile.flowControl === 'none' ? 'None (paced)' : profile.flowControl === 'hardware' ? 'Hardware RTS/CTS' : 'Software XON/XOFF')}{profile.panelOnly ? ` · ${t('force/speed on the machine panel')}` : ` · FS/VS ${profile.defaultForce}g/${profile.defaultSpeed}`}</div>
                      <ul className="mt-0.5 list-none space-y-0.5">
                        {profile.quirks.map((q) => (
                          <li key={q}>· {t(q)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Field>
              </div>
            )}
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
              {format === 'hpgl' && opts.dialect === 'roland-camm' && (
                <label className="mt-1 flex items-center gap-1.5 text-[10px] text-muted cursor-pointer" title={t('Feed the sheet out after the job finishes (Roland !PG). Turn off to nest several jobs on one piece of material.')}>
                  <input
                    type="checkbox"
                    checked={opts.ejectAfter}
                    onChange={(e) => setOpts({ ...opts, ejectAfter: e.target.checked })}
                  />
                  {t('Eject sheet after job (!PG)')}
                </label>
              )}
            </div>
            {/* ARMS optical registration (print & cut) — Graphtec FC/CE only.
                The section stays visible on other dialects (disabled, with
                the reason) so the feature is discoverable; generate/save
                guard the mismatch with a toast via safeGenerate. */}
            <div className="col-span-2 rounded border border-border bg-panel2/60 px-2 py-1.5">
              <label
                className={`flex items-center gap-1.5 text-[11px] ${armsAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                title={t('Emit the ARMS registration block so a Graphtec FC/CE cutter optically locates the printed marks before cutting.')}
              >
                <input
                  type="checkbox"
                  checked={armsEnabled && !!opts.arms}
                  disabled={!armsAvailable}
                  onChange={(e) => {
                    setArmsEnabled(e.target.checked);
                    setOpts(o => (e.target.checked
                      ? { ...o, arms: o.arms ?? { ...DEFAULT_ARMS } }
                      : { ...o, arms: undefined }));
                  }}
                />
                {t('ARMS registration (print & cut)')}
              </label>
              {!armsAvailable && (
                <div className="mt-1 text-[10px] text-muted leading-snug">
                  {t('ARMS registration marks require the Graphtec dialect.')}
                </div>
              )}
              {armsEnabled && opts.arms && (
                <div className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] ${armsActive ? '' : 'opacity-60'}`}>
                  <label className="flex items-center gap-1 text-muted" title={t('ARMS mark arm length in mm (4–20).')}>
                    <span>{t('Arm')}</span>
                    <input
                      type="number" min={4} max={20} step={0.5} value={opts.arms.armMm} disabled={!armsActive}
                      onChange={(e) => setOpts(o => o.arms ? { ...o, arms: { ...o.arms, armMm: Math.min(20, Math.max(4, parseFloat(e.target.value) || DEFAULT_ARMS.armMm)) } } : o)}
                      className="input-num !w-12 !py-0.5 !text-[10px] text-center"
                      aria-label={t('ARMS arm length (mm)')}
                    />
                    <span>mm</span>
                  </label>
                  <span className="inline-flex items-center gap-0.5" role="group" aria-label={t('ARMS mark type')}>
                    {([1, 2] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        disabled={!armsActive}
                        className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${opts.arms?.type === type ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink'}`}
                        onClick={() => setOpts(o => o.arms ? { ...o, arms: { ...o.arms, type } } : o)}
                        aria-pressed={opts.arms?.type === type}
                        title={type === 1 ? t('Circle marks (TB52 type 1).') : t('Square marks (TB52 type 2) — printed as four inward corner L-brackets. Default.')}
                      >
                        {type === 1 ? t('1 (circle)') : t('2 (square)')}
                      </button>
                    ))}
                  </span>
                  <label className="flex items-center gap-1 text-muted" title={t('Expected ARMS mark rectangle width in mm.')}>
                    <span>{t('Rect')}</span>
                    <input
                      type="number" min={1} max={10000} value={opts.arms.rectW} disabled={!armsActive}
                      onChange={(e) => setOpts(o => o.arms ? { ...o, arms: { ...o.arms, rectW: Math.max(1, parseFloat(e.target.value) || DEFAULT_ARMS.rectW) } } : o)}
                      className="input-num !w-12 !py-0.5 !text-[10px] text-center"
                      aria-label={t('ARMS rectangle width (mm)')}
                    />
                    <span>×</span>
                    <input
                      type="number" min={1} max={10000} value={opts.arms.rectH} disabled={!armsActive}
                      onChange={(e) => setOpts(o => o.arms ? { ...o, arms: { ...o.arms, rectH: Math.max(1, parseFloat(e.target.value) || DEFAULT_ARMS.rectH) } } : o)}
                      className="input-num !w-12 !py-0.5 !text-[10px] text-center"
                      aria-label={t('ARMS rectangle height (mm)')}
                    />
                    <span>mm</span>
                  </label>
                  <button
                    type="button"
                    className="btn !py-0.5 !px-1.5 !text-[10px]"
                    onClick={fillArmsRectFromJob}
                    disabled={!armsActive}
                    title={t('Fill the ARMS mark rectangle from the current job bounding box.')}
                  >
                    {t('Auto')}
                  </button>
                </div>
              )}
            </div>
            <Field label={`${t('Overcut')} (mm)`}>
              <input
                type="number" step={0.05} min={0} max={5} className="input-num"
                value={opts.overcutMm}
                onChange={(e) => setOpts({ ...opts, overcutMm: Math.max(0, parseFloat(e.target.value) || 0) })}
                title={t('Extend closed cuts slightly past the start so corners fully release.')}
              />
            </Field>
            <Field label={`${t('Blade offset')} (mm)`}>
              <input
                type="number" step={0.05} min={0} max={5} className="input-num"
                value={bladeOffsetMm}
                onChange={(e) => setOpts({ ...opts, bladeOffsetMm: Math.min(5, Math.max(0, parseFloat(e.target.value) || 0)) })}
                title={t('Drag-knife swivel compensation — 0.25 mm typical for a 45° blade')}
              />
              <div
                className="grid grid-cols-3 gap-1 mt-1"
                role="group"
                aria-label={t('Blade offset presets')}
                aria-describedby="plotter-blade-offset-preset-review-status"
                title={t('Use Left/Right arrows to switch options')}
                onKeyDown={(event) => handleSegmentKeys(event, BLADE_OFFSET_PRESETS_MM.map(String), `${bladeOffsetMm}`, (value) => setOpts({ ...opts, bladeOffsetMm: Number(value) }), (_value, button) => setReviewedBladeOffsetPreset(button?.dataset.review ?? ''))}
              >
                <span id="plotter-blade-offset-preset-review-status" className="sr-only" aria-live="polite">
                  {`${t('Reviewing')} ${reviewedBladeOffsetPreset || `${t('Blade offset')} ${bladeOffsetMm} mm`}`}
                </span>
                {BLADE_OFFSET_PRESETS_MM.map((value) => {
                  const active = Math.abs(bladeOffsetMm - value) < 0.001;
                  const review = `${t('Blade offset')} ${value} mm`;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-value={`${value}`}
                      data-review={review}
                      className={`rounded border px-1 py-0.5 text-[10px] transition-colors ${active ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border bg-panel2 text-muted hover:text-ink hover:border-accent2/60'}`}
                      onFocus={(event) => setReviewedBladeOffsetPreset(event.currentTarget.dataset.review ?? '')}
                      onClick={() => setOpts({ ...opts, bladeOffsetMm: value })}
                      title={`${t('Set blade offset to')} ${value} mm`}
                      aria-pressed={active}
                    >
                      {value === 0 ? '0' : `${value}`}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 text-[10px] text-muted leading-tight">
                {t('Drag-knife swivel compensation — 0.25 mm typical for a 45° blade')}
              </div>
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
              <>
              <CutPreview
                cutPaths={previewPaths}
                showPrint={showPrint}
                mirror={opts.mirror}
                showOrder={showOrder}
                showStart={showStart}
                showDims={showDims}
                simulate={simulate}
                feedMmMin={opts.unit === 'mm' ? opts.feedRate : opts.feedRate * 25.4}
                travelMmMin={opts.unit === 'mm' ? opts.travelRate : opts.travelRate * 25.4}
                optimize={opts.optimize}
                etaSeconds={stats.physicsSeconds ?? stats.seconds}
                className="w-full h-56 bg-panel2 border border-border rounded-sm"
              />

              {/* Colour legend for the preview overlays. */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9px] text-muted">
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-[#ff2e9a]" aria-hidden="true" />{t('Cut line')}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 border-t-2 border-[#ff9a1f]" aria-hidden="true" />{t('Positioning marks')}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 border-t-2 border-[#22d3ee]" aria-hidden="true" />{t('Order / start / dims')}</span>
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 border-t-2 border-[#4ade80]" aria-hidden="true" />{t('START point')}</span>
              </div>
              </>
            ) : (
              <div className="flex flex-col gap-1.5 min-h-0">
                <div className="flex items-center gap-1" role="group" aria-label={t('Code view modes')}>
                  {CODE_VIEW_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      data-value={option.value}
                      className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${codeView === option.value ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink'}`}
                      onClick={() => setCodeView(option.value)}
                      aria-pressed={codeView === option.value}
                      title={t(option.title)}
                    >
                      {t(option.label)}
                    </button>
                  ))}
                </div>
                {codeView === 'raw' && (
                  <pre className="bg-panel2 border border-border rounded-sm p-2 h-44 overflow-auto text-[10px] font-mono text-ink/85">
                    {code || t('(click Generate Preview)')}
                  </pre>
                )}
                {codeView === 'annotated' && (
                  <AnnotatedCode run={codeRun ?? EMPTY_RUN} unit={opts.unit} />
                )}
                {codeView === 'sim' && (
                  <MachineSim run={codeRun ?? EMPTY_RUN} unit={opts.unit} />
                )}
                {codeView !== 'sim' && <PreflightPanel lint={lint} unit={opts.unit} />}
                {codeView !== 'sim' && <WeedCheckPanel paths={activePaths} />}
              </div>
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
                  ~{formatDuration(stats.seconds)}{physicsEtaLabel}
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

            {/* Layers (multi-colour vinyl) — one job per colour, stacked
                bottom-first. Shared colourless geometry (regmarks, weed
                borders) rides every layer so the stack aligns (the
                layerJobs subset rule); mirror defaults to the global option
                with a per-row override (HTV carrier side per layer).
                Hidden entirely until the job has ≥2 vinyl colours. */}
            {layers.length >= 2 && (
              <div
                className="mt-2 rounded border border-border bg-panel2/60 px-2 py-1.5 text-[10px]"
                role="region"
                aria-label={t('Layers (multi-colour vinyl)')}
              >
                <div className="flex items-center gap-1.5">
                  <Layers size={12} aria-hidden="true" className="text-[#ff2e9a] shrink-0" />
                  <span className="font-medium text-ink">{t('Layers (multi-colour vinyl)')}</span>
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {layers.map((layer, i) => (
                    <div key={layer.color} data-plotter-layer={layer.color} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <button
                        type="button"
                        className="w-4 h-4 rounded-sm border border-ink shadow-sm shrink-0"
                        style={{ background: layer.color }}
                        onClick={() => soloColor(layer.color)}
                        title={`${t('Cut only')} ${layer.color}`}
                        aria-label={`${t('Cut only')} ${layer.color}`}
                      />
                      <span
                        className="px-1 rounded-sm border border-border text-muted tabular-nums"
                        title={t('Layer stacking order — layer 1 cuts first and sits at the bottom of the stack.')}
                      >
                        {layer.order === 1 ? `1 = ${t('bottom')}` : `${layer.order}`}
                      </span>
                      <span className="text-muted tabular-nums">{layer.cutCount} {t('paths')}</span>
                      <span className="text-muted tabular-nums">{Math.round(layer.areaMm2)} mm²</span>
                      <label
                        className="flex items-center gap-1 text-muted cursor-pointer"
                        title={t('Mirror this layer only (HTV carrier side)')}
                      >
                        <input
                          type="checkbox"
                          checked={layerMirror(layer.color)}
                          onChange={(e) => setLayerMirrorOverrides(prev => ({ ...prev, [layer.color]: e.target.checked }))}
                        />
                        {t('Mirror layer')}
                      </label>
                      <span className="flex-1" />
                      <button
                        type="button"
                        className="btn !py-0.5 !px-1.5 !text-[10px]"
                        onClick={() => { void sendLayer(layer); }}
                        disabled={busy}
                        title={`${t('Send')} ${t('Layer')} ${i + 1} (${layer.color})`}
                      >
                        {t('Send')}
                      </button>
                      <button
                        type="button"
                        className="btn !py-0.5 !px-1.5 !text-[10px]"
                        onClick={() => saveLayer(layer, i)}
                        disabled={busy}
                        title={`${t('Save')} ${t('Layer')} ${i + 1} (${layer.color})`}
                      >
                        {t('Save')}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    className="btn !py-0.5 !px-1.5 !text-[10px]"
                    onClick={() => { void sendAllLayers(); }}
                    disabled={busy}
                    title={t('Send every layer in stacking order, confirming between vinyl swaps.')}
                  >
                    {t('Send all layers')}
                  </button>
                  <button
                    type="button"
                    className="btn !py-0.5 !px-1.5 !text-[10px]"
                    onClick={saveAllLayers}
                    disabled={busy}
                    title={t('Save every layer as its own machine file.')}
                  >
                    {t('Save all layers')}
                  </button>
                  <button
                    type="button"
                    className="btn !py-0.5 !px-1.5 !text-[10px]"
                    onClick={() => applyLayerTrap(t, trapMm)}
                    disabled={busy}
                    title={t('Offset every upper layer outward for an intentional overlap, so ~1 mm misregistration shows as overlap, not a gap.')}
                  >
                    {t('Trap layers')}
                  </button>
                  <input
                    type="number" min={0.25} max={1.5} step={0.05} value={trapMm}
                    onChange={(e) => setTrapMm(Math.min(1.5, Math.max(0.25, parseFloat(e.target.value) || 0.5)))}
                    className="input-num !w-11 !py-0.5 !text-[10px] text-center"
                    aria-label={t('Trap overlap (mm)')}
                    title={t('Trap overlap (mm)')}
                  />
                  <span>mm</span>
                </div>
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
                    handleToolbarKeys(event, ['print', 'order', 'simulate', 'start', 'dims'] as const);
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      requestAnimationFrame(() => setReviewedPreviewToggle((document.activeElement as HTMLElement | null)?.dataset.review ?? ''));
                    }
                  }}
                >
                  <span id="plotter-preview-toggle-review-status" className="sr-only" aria-live="polite">
                    {`${t('Reviewing')} ${reviewedPreviewToggle || `${t('Plotter preview toggles')} · ${t('Show print')} ${showPrint ? t('on') : t('off')} · ${t('Cut order')} ${showOrder ? t('on') : t('off')} · ${t('Simulate')} ${simulate ? t('on') : t('off')} · ${t('Start mark')} ${showStart ? t('on') : t('off')} · ${t('Dimensions')} ${showDims ? t('on') : t('off')}`}`}
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
                  <button
                    type="button"
                    data-value="simulate"
                    data-review={`${t('Simulate')} · ${simulate ? t('on') : t('off')}`}
                    className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 transition-colors ${simulate ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink hover:bg-panel2'}`}
                    onFocus={(event) => setReviewedPreviewToggle(event.currentTarget.dataset.review ?? '')}
                    onClick={() => setSimulate(!simulate)}
                    title={t('Replay the optimized cut order as an animation paced by the feed rate.')}
                    aria-pressed={simulate}
                  >
                    <Play size={11} aria-hidden="true" />
                    {t('Simulate')}
                  </button>
                  <button
                    type="button"
                    data-value="start"
                    data-review={`${t('Start mark')} · ${showStart ? t('on') : t('off')}`}
                    className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 transition-colors ${showStart ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink hover:bg-panel2'}`}
                    onFocus={(event) => setReviewedPreviewToggle(event.currentTarget.dataset.review ?? '')}
                    onClick={() => setShowStart(!showStart)}
                    title={t('Mark where the blade first touches the material (first path in cut order).')}
                    aria-pressed={showStart}
                  >
                    <Crosshair size={11} aria-hidden="true" />
                    {t('Start mark')}
                  </button>
                  <button
                    type="button"
                    data-value="dims"
                    data-review={`${t('Dimensions')} · ${showDims ? t('on') : t('off')}`}
                    className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 transition-colors ${showDims ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink hover:bg-panel2'}`}
                    onFocus={(event) => setReviewedPreviewToggle(event.currentTarget.dataset.review ?? '')}
                    onClick={() => setShowDims(!showDims)}
                    title={t('Frame the job with its W×H dimensions in mm.')}
                    aria-pressed={showDims}
                  >
                    <Ruler size={11} aria-hidden="true" />
                    {t('Dimensions')}
                  </button>
                </span>
              )}
              {previewMode === 'code' && (
                <>
                  <button type="button" className="btn !py-1 !text-[10px]" onClick={generate}>{t('Generate Preview')}</button>
                  <button
                    type="button"
                    className={`btn !py-1 !text-[10px] ${lint && !lint.ok ? 'border-warning text-warning' : lint ? 'border-success text-success' : ''}`}
                    onClick={() => runPreflight()}
                    title={t('Dry-run check of the machine code — catches empty jobs, plots taller than the page, negative coordinates, missing feed rates.')}
                  >
                    {t('Preflight')}
                  </button>
                  <button
                    type="button"
                    className="btn !py-1 !text-[10px]"
                    onClick={() => { void loadCodeFile(); }}
                    title={t('Load an existing .plt / .hpgl / .gcode file to preflight, explain and replay it here — debug a third-party file before it touches the machine.')}
                  >
                    <FolderOpen size={11} aria-hidden="true" />{t('Load file…')}
                  </button>
                  {codeSource && (
                    <span className="flex items-center gap-1 rounded border border-accent2/40 bg-accent2/10 px-1.5 py-0.5 text-[10px] text-accent2">
                      {codeSource}
                      <button
                        type="button"
                        className="text-accent2/70 hover:text-accent2"
                        onClick={() => { setCode(''); setCodeSource(''); setLint(null); }}
                        title={t('Discard the loaded file and go back to generated code.')}
                        aria-label={t('Discard the loaded file and go back to generated code.')}
                      >
                        <X size={10} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </>
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
                <span className="inline-flex items-center gap-0.5" role="group" aria-label={t('Positioning mark style')}>
                  {(['L', 'cross', 'square', 'circle'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      className={`rounded border px-1 py-0.5 text-[10px] transition-colors ${markStyle === style ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink'}`}
                      onClick={() => setMarkStyle(style)}
                      aria-pressed={markStyle === style}
                      title={t('Positioning mark style for the Add positioning marks action.')}
                    >
                      {style === 'L' ? 'L' : style === 'cross' ? '+' : style === 'square' ? '■' : '●'}
                    </button>
                  ))}
                  <input
                    type="number" min={2} max={40} value={markArm}
                    onChange={(e) => setMarkArm(Math.max(2, Math.min(40, parseFloat(e.target.value) || 10)))}
                    className="input-num !w-10 !py-0.5 !text-[10px] text-center"
                    aria-label={t('Mark size (mm)')}
                    title={t('Arm length for L/cross marks, side/diameter for square/circle marks.')}
                  />
                </span>
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
            <span>{jobSummaryLabel}{transferEstimateLabel}</span>
          </div>
          {outputBlocked && (
            <div className="-mt-2 mb-3 rounded border border-warning/50 bg-warning/10 px-2 py-1.5 text-[10px] text-warning">
              {outputBlockedReason}
            </div>
          )}

          {/* Connection + debug console. The native port picker lives here
              now, alongside baud / flow control, quick machine commands,
              jog, and the TX/RX traffic log. */}
          <PlotterConsole
            link={link}
            format={format}
            unit={opts.unit}
            native={native}
            webSerial={webSerial}
            sending={jobProgress !== null}
            nativePorts={nativePorts}
            selectedPort={selectedPort}
            setSelectedPort={setSelectedPort}
            refreshPorts={() => { void refreshSerialPorts(); }}
            portsLoading={portsLoading}
            portsError={portsError}
            baud={baud}
            setBaud={setBaud}
            flow={flow}
            setFlow={setFlow}
            force={opts.graphtecForce}
            speed={opts.graphtecSpeed}
            feedRate={opts.feedRate}
            profile={profile}
            connectInit={format === 'hpgl' ? profileConnectInit(profile, opts.graphtecForce, opts.graphtecSpeed) : ''}
            forceSpeedCommand={format === 'hpgl' ? profileForceSpeed(profile, opts.graphtecForce, opts.graphtecSpeed) : ''}
            snapshotConfig={snapshotConfig}
            applyConfig={applyConfig}
            jobLogVersion={jobLogVersion}
            applyProfile={applyProfile}
          />

          {jobProgress && (
            <div className="mb-3 flex items-center gap-2 text-[10px] text-muted tabular-nums" role="status" aria-live="polite">
              <span className={`shrink-0 ${jobPaused ? 'text-warning' : ''}`}>
                {jobPaused ? t('Paused') : t('Sending')} {jobProgress.sent}/{jobProgress.total} B ({Math.floor((jobProgress.sent / Math.max(1, jobProgress.total)) * 100)}%){jobProgress.eta !== null ? ` · ETA ~${jobProgress.eta}s` : ''}
              </span>
              <div className="h-1.5 min-w-0 flex-1 rounded bg-border overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-150 ${jobPaused ? 'bg-warning' : 'bg-accent2'}`}
                  style={{ width: `${(jobProgress.sent / Math.max(1, jobProgress.total)) * 100}%` }}
                />
              </div>
              <button
                type="button"
                className="btn !py-1 !px-2 !text-[10px] shrink-0"
                onClick={() => { void togglePauseJob(); }}
                title={t('Hold the stream between chunks — the machine drains its buffer and stops. grbl also gets a feed hold.')}
              >
                {jobPaused ? t('Resume') : t('Pause')}
              </button>
              <button type="button" className="btn !py-1 !px-2 !text-[10px] text-danger shrink-0" onClick={cancelJob}>
                {t('Stop job')}
              </button>
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
            {format === 'hpgl' && (
              <button
                type="button"
                data-value="force-test"
                data-review={`${t('Force test')} · ${t('Cut a strip of 5 squares at increasing force to find the right blade pressure in one pass.')}`}
                className="btn flex items-center gap-1"
                onFocus={(event) => setReviewedOutputAction(event.currentTarget.dataset.review ?? '')}
                onClick={forceTest}
                disabled={busy}
                title={t('Cut a strip of 5 squares at increasing force to find the right blade pressure in one pass.')}
              >
                <FlaskConical size={12} aria-hidden="true" />{t('Force test')}
              </button>
            )}
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

/** Preflight dry-run panel for the Code tab — issue list + plot extents
 *  computed by lintJob, so the operator can sanity-check the job before
 *  it reaches a blade. */
function PreflightPanel({ lint, unit }: { lint: LintResult | null; unit: 'mm' | 'in' }) {
  const t = useT();
  if (!lint) return null;
  const counts = { error: 0, warn: 0, info: 0 };
  for (const issue of lint.issues) counts[issue.severity]++;
  const headline = counts.error > 0
    ? { cls: 'text-danger', icon: '✕', text: t('Preflight found problems') }
    : counts.warn > 0
      ? { cls: 'text-warning', icon: '!', text: t('Preflight passed with warnings') }
      : { cls: 'text-success', icon: '✓', text: t('Preflight passed') };
  return (
    <div
      className="rounded border border-border bg-panel2 px-2 py-1.5 text-[10px] leading-relaxed"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex items-center gap-1 font-medium ${headline.cls}`}>
          <span aria-hidden="true">{headline.icon}</span>
          {headline.text}
        </span>
        <span className="text-muted tabular-nums">
          {lint.stats.statements} {t('statements')} · {lint.stats.penDownMoves} {t('pen-down moves')}
          {lint.stats.plot ? ` · ${t('Plot size')} ${lint.stats.plot.w.toFixed(0)} × ${lint.stats.plot.h.toFixed(0)} ${unit}` : ''}
        </span>
      </div>
      {lint.issues.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {lint.issues.map((issue, i) => (
            <li
              key={i}
              className={`flex gap-1.5 ${issue.severity === 'error' ? 'text-danger' : issue.severity === 'warn' ? 'text-warning' : 'text-muted'}`}
            >
              <span aria-hidden="true" className="shrink-0 font-semibold">{issue.severity === 'error' ? '✕' : issue.severity === 'warn' ? '!' : 'ℹ'}</span>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Weedability preflight — lints the job's cut geometry against a material
 *  weeding profile (weedCheck: thin features, narrow gaps, small islands a
 *  human can't weed by hand). Manual like Preflight: the operator clicks
 *  "Check weeding" and the report persists until re-run; nothing draws on
 *  the canvas. Collapsible; the profile segmented control follows the
 *  house idiom (role=group + aria-pressed). */
function WeedCheckPanel({ paths }: { paths: CutPath[] }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [profile, setProfile] = useState<WeedProfileId>('vinyl');
  const [report, setReport] = useState<WeedReport | null>(null);
  const run = () => setReport(weedCheck(paths, WEED_PROFILES[profile]));
  return (
    <div
      className="rounded border border-border bg-panel2 px-2 py-1.5 text-[10px] leading-relaxed"
      role="region"
      aria-label={t('Weed check (weeding preflight)')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 font-medium text-ink"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="plotter-weed-check-body"
        >
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          {t('Weed check (weeding preflight)')}
        </button>
        <span className="flex-1" />
        <span
          className="inline-flex items-center gap-1"
          role="group"
          aria-label={t('Weed check material profile')}
        >
          {WEED_PROFILE_OPTIONS.map((option) => {
            const active = profile === option.value;
            return (
              <button
                key={option.value}
                type="button"
                data-value={option.value}
                className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${active ? 'border-accent2 bg-accent2/10 text-accent2' : 'border-border text-muted hover:text-ink'}`}
                onClick={() => { setProfile(option.value); setReport(null); }}
                aria-pressed={active}
                title={`${t('Set weeding profile to')} ${t(option.label)}`}
              >
                {t(option.label)}
              </button>
            );
          })}
        </span>
        <button type="button" className="btn !py-0.5 !px-1.5 !text-[10px]" onClick={run}>
          {t('Check weeding')}
        </button>
      </div>
      {open && (
        <div id="plotter-weed-check-body" className="mt-1">
          {report && (report.skipped ? (
            <div className="text-muted" role="status">
              {t('Weed check skipped — too many paths to analyse.')}
            </div>
          ) : (
            <div role="status" aria-live="polite">
              <div className={`flex items-center gap-1 tabular-nums ${report.issues.length === 0 ? 'text-success' : 'text-muted'}`}>
                <span aria-hidden="true" className="font-semibold">{report.issues.length === 0 ? '✓' : '!'}</span>
                {report.issues.length} {t('issues')} · {report.checkedPaths} {t('paths checked')}
              </div>
              {report.issues.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {report.issues.map((issue, i) => (
                    <li key={i} className="flex gap-1.5 text-warning">
                      <span aria-hidden="true" className="shrink-0 font-semibold">!</span>
                      <span className="tabular-nums">
                        {t(WEED_ISSUE_LABELS[issue.kind])} · {issue.metricMm.toFixed(1)} mm · {issue.pathIds.length} {t('paths')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
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
