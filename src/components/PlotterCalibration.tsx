import { useEffect, useMemo, useReducer, useState } from 'react';
import { Copy, Crosshair, FlaskConical, Move, Play, Ruler, Scissors, Slice, SquareDashed } from 'lucide-react';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import type { PlotterOptions } from '../lib/plotter';
import { paperHeightToMm } from '../lib/cutPreview';
import type { PlotterSimulator } from '../lib/plotterSimulator';
import {
  BLADE_OFFSET_STEPS_MM,
  CAL_BOX_SIZES_MM,
  OVERCUT_STEPS_MM,
  RULER_LENGTHS_MM,
  buildBladeOffsetTest,
  buildCalibrationBox,
  buildCornerMarks,
  buildDriftTest,
  buildOriginMark,
  buildOvercutTest,
  buildRuler,
  calBounds,
  calBoxNeedsMm,
  cellCenter,
  cornerRectFromBbox,
  parseSteps,
  scaleErrorPercent,
  skewFromDiagonals,
  suggestBladeOffset,
  suggestDrift,
  suggestGrblSteps,
  type CalBbox,
  type CalFormat,
  type CalPoly,
  type CalibrationPattern,
  type CalRect,
} from '../lib/plotterCalibration';

/**
 * "Calibrate & test" — the cutter workbench: dial in the blade, calibrate
 * distances and prove positioning BEFORE a real job. Self-contained: it only
 * reads the dialog's PlotterOptions and hands machine code back through
 * `onCut`, which routes every send through the dialog's own gated streamJob
 * (one "is it connected?" guard for the whole dialog). All geometry and
 * arithmetic live in plotterCalibration.ts (pure, unit-tested).
 */

export interface PlotterCalibrationProps {
  opts: PlotterOptions;
  format: CalFormat;
  /** What the Output page would cut, in document mm — the dry run walks it and the corner marks frame it. */
  jobPaths: CalPoly[];
  onChangeOpts: (patch: Partial<PlotterOptions>) => void;
  /** Send a test pattern over the dialog's gated link. Resolves true once it went out. */
  onCut: (code: string, label: string) => Promise<boolean>;
  onDryRun: () => Promise<boolean>;
  /** HP-GL only: the dialog's own force-test strip. */
  onForceTest: (() => void) | undefined;
  busy: boolean;
  simulated: boolean;
  simulator: PlotterSimulator | null;
  /** Connect to the built-in virtual plotter (no hardware needed). */
  onRehearse: () => void;
}

const CUT = '#ff2e9a';
const TRAVEL = '#9aa0a6';
const num = (text: string): number | null => {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number): string => String(Number(n.toFixed(3)));

/* ---- mini preview ------------------------------------------------------ */

/** A cell caption: centred on `x`, sitting just above the pattern. */
interface LabelAt {
  x: number;
  text: string;
}

/** The labelled previews are 64 px strips (h-16). Their view is always much
 *  wider than it is tall, so the drawing is scaled by HEIGHT — which lets the
 *  caption be sized in view units so that it lands at about 11 px on screen. */
const STRIP_PX = 62;
const CAPTION_PX = 11;

/** Document-mm geometry as a fitted SVG: cut paths solid, pen-up travel
 *  dashed, the machine origin as two small axis arrows. Line and text size
 *  follow the view, so nothing collapses at either scale. */
function PatternPreview({ doc, extent, origin, axes, labels, name, className }: {
  doc: CalPoly[];
  extent: CalBbox;
  /** Machine origin in document mm; omit when it is not the point of the picture. */
  origin?: [number, number];
  /** Unit vectors of the machine +X / +Y axes in document mm. */
  axes?: [[number, number], [number, number]];
  labels?: LabelAt[];
  name: string;
  className?: string;
}) {
  const w0 = Math.max(1, extent.x1 - extent.x0);
  const h0 = Math.max(1, extent.y1 - extent.y0);
  const fs = (h0 + 2 * Math.max(3, h0 * 0.12)) / 7;
  const pad = fs * 0.5;
  const labelled = !!labels?.length;
  // caption = LABEL px once the (base + caption room) tall view fills the strip
  const caption = ((h0 + 2 * pad) * CAPTION_PX) / (STRIP_PX - CAPTION_PX * 1.5);
  const top = extent.y0 - pad - (labelled ? caption * 1.5 : 0);
  const left = extent.x0 - pad;
  const w = w0 + 2 * pad;
  const h = extent.y1 + pad - top;
  const path = (pts: Array<[number, number]>) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${fmt(px)} ${fmt(py)}`).join('');
  const arrowLen = Math.max(w, h) * 0.14;
  const inView = origin && origin[0] >= left - 1 && origin[0] <= left + w + 1 && origin[1] >= top - 1 && origin[1] <= top + h + 1;
  return (
    <svg
      viewBox={`${fmt(left)} ${fmt(top)} ${fmt(w)} ${fmt(h)}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={name}
      data-plotter-cal-preview=""
    >
      {doc.slice(1).map((p, i) => {
        const a = doc[i].points[doc[i].points.length - 1];
        const b = p.points[0];
        return a && b
          ? <line key={`t${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={TRAVEL} strokeWidth={fs * 0.09} strokeDasharray={`${fs * 0.35} ${fs * 0.4}`} opacity={0.55} />
          : null;
      })}
      {doc.map((p, i) => (
        <path key={i} d={path(p.points)} fill="none" stroke={CUT} strokeWidth={fs * 0.14} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {inView && axes && (
        <g stroke="#22d3ee" strokeWidth={fs * 0.13} strokeLinecap="round" data-plotter-cal-origin="">
          <line x1={origin[0]} y1={origin[1]} x2={origin[0] + axes[0][0] * arrowLen} y2={origin[1] + axes[0][1] * arrowLen} />
          <line x1={origin[0]} y1={origin[1]} x2={origin[0] + axes[1][0] * arrowLen} y2={origin[1] + axes[1][1] * arrowLen} />
          <circle cx={origin[0]} cy={origin[1]} r={fs * 0.14} fill="#22d3ee" stroke="none" />
        </g>
      )}
      {labels?.map((l, i) => (
        <text
          key={`l${i}`}
          x={l.x}
          y={extent.y0 - caption * 0.35}
          fontSize={caption}
          fontFamily="Inter, system-ui, sans-serif"
          textAnchor="middle"
          className="fill-current text-muted"
        >
          {l.text}
        </text>
      ))}
    </svg>
  );
}

/* ---- building blocks --------------------------------------------------- */

function Card({ id, icon, title, simulated, action, children }: {
  id: string;
  icon: React.ReactNode;
  title: string;
  simulated: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section
      id={`plotter-cal-${id}`}
      role="region"
      aria-labelledby={`plotter-cal-${id}-title`}
      data-plotter-card={`cal-${id}`}
      className="rounded border border-border bg-panel2/60 p-2 text-[11px]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`plotter-cal-${id}-title`} className="flex items-center gap-1.5 text-xs font-medium text-ink">
          <span className="text-[#ff2e9a]" aria-hidden="true">{icon}</span>{title}
        </h3>
        {simulated && (
          <span className="rounded bg-accent2/15 px-1.5 py-0.5 text-[10px] text-accent2" data-plotter-cal-rehearsal="">{t('Rehearsal mode')}</span>
        )}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

function CutButton({ test, label, onClick, disabled, title }: { test: string; label?: string; onClick: () => void; disabled?: boolean; title?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      className="btn-primary py-1! px-2! text-[10px]! flex items-center gap-1 whitespace-nowrap"
      title={title}
      data-plotter-cal-cut={test}
      onClick={onClick}
      disabled={disabled}
    >
      <Scissors size={11} aria-hidden="true" />{label ?? t('Cut test')}
    </button>
  );
}

/** The comma-separated test values behind a blade / overcut row. */
function ValuesInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-1 flex items-center gap-2">
      <span className="shrink-0 text-[10px] text-muted">{label}</span>
      <input
        type="text"
        className="input min-w-0 flex-1 py-0.5! font-mono text-[10px]"
        aria-label={label}
        value={value}
        onChange={(e) => { onChange(e.target.value); }}
        spellCheck={false}
      />
    </label>
  );
}

/** Labelled number input. The value is a STRING so "0." can be typed; read it with `num()`. */
function NumField({ label, value, onChange, step = '0.01', className = 'w-20', signed = false }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  className?: string;
  /** true = negative values are meaningful (measured offsets). */
  signed?: boolean;
}) {
  return (
    <label className="flex items-center gap-1 whitespace-nowrap">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={signed ? undefined : 0}
        aria-label={label}
        className={`input-num ${className}`}
        value={value}
        onChange={(e) => { onChange(e.target.value); }}
      />
    </label>
  );
}

/** One column per test cell — serial number, value, "Use" — so a row of six
 *  is three lines tall (the first screen has to fit a 960 × 600 window).
 *  The value the settings already use is highlighted. */
function StepTable({ steps, current, onUse, kind }: { steps: number[]; current: number; onUse: (v: number) => void; kind: 'blade' | 'overcut' }) {
  const t = useT();
  const rowHead = 'w-24 pr-2 text-left text-[10px] font-normal text-muted';
  return (
    <table className="w-full table-fixed border-collapse tabular-nums" data-plotter-cal-table={kind}>
      <tbody>
        <tr>
          <th scope="row" className={rowHead}>{t('#')}</th>
          {steps.map((_, i) => <td key={`n${i}`} className="text-center leading-tight text-muted">{i + 1}</td>)}
        </tr>
        <tr>
          <th scope="row" className={rowHead}>{kind === 'blade' ? t('Blade offset') : t('Overcut')} (mm)</th>
          {steps.map((v, i) => (
            <td key={`v${i}`} className={`text-center leading-tight ${Math.abs(v - current) < 1e-9 ? 'font-medium text-accent2' : ''}`}>{fmt(v)}</td>
          ))}
        </tr>
        <tr>
          <th scope="row" className={`${rowHead} sr-only`}>{t('Use')}</th>
          {steps.map((v, i) => (
            <td key={`u${i}`} className="p-0 text-center">
              <button
                type="button"
                className="btn py-0! px-1.5! text-[10px]!"
                data-plotter-cal-use={kind === 'blade' ? fmt(v) : undefined}
                data-plotter-cal-use-overcut={kind === 'overcut' ? fmt(v) : undefined}
                aria-label={`${t('Use')} ${fmt(v)} mm`}
                onClick={() => { onUse(v); }}
              >
                {t('Use')}
              </button>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function GroupLabel({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="mt-2 mb-0.5 flex min-h-6 items-center gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{children}</span>
      {trailing}
    </div>
  );
}

/* ---- rehearsal result --------------------------------------------------- */

/** What the VIRTUAL plotter has cut so far — so a rehearsal shows its result
 *  without any material. Material frame: origin bottom-left, Y up, mm. */
function RehearsalResult({ simulator }: { simulator: PlotterSimulator }) {
  const t = useT();
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = window.setInterval(tick, 400);
    return () => { window.clearInterval(id); };
  }, []);
  const segments = simulator.segments;
  const limits = simulator.travelLimits;
  const progress = simulator.progress;
  // Zoom to what has been drawn (never tighter than 60 × 40 mm around the origin).
  let x1 = 60, y1 = 40;
  for (const seg of segments) for (const [x, y] of seg.points) {
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const box = { w: Math.min(limits.widthMm, x1 * 1.12 + 4), h: Math.min(limits.heightMm, y1 * 1.2 + 4) };
  const fs = box.h / 9;
  const status = simulator.status;
  return (
    <Card id="rehearsal" icon={<Play size={12} aria-hidden="true" />} title={t('Rehearsal result')} simulated>
      <p className="mt-1 text-[10px] text-muted">
        {t('What the virtual plotter has cut so far — solid = blade down, faint = travel.')}{' '}
        {status === 'alarm' ? t('Alarm') : status === 'paused' ? t('Paused') : simulator.done ? t('Cut complete — the machine reports idle') : t('Virtual plotter running')}
        {progress.secondsTotal > 0 ? ` · ${Math.min(100, Math.round((progress.secondsExecuted / progress.secondsTotal) * 100))}%` : ''}
      </p>
      <svg
        viewBox={`0 0 ${fmt(box.w)} ${fmt(box.h)}`}
        preserveAspectRatio="xMidYMid meet"
        className="mt-1 h-40 w-full rounded border border-border bg-panel"
        role="img"
        aria-label={t('Rehearsal result')}
        data-plotter-cal-rehearsal-svg=""
      >
        <g transform={`translate(0 ${fmt(box.h)}) scale(1 -1)`}>
          {Array.from({ length: Math.floor(box.w / 50) + 1 }, (_, i) => i * 50).map((gx) => (
            <line key={`gx${gx}`} x1={gx} y1={0} x2={gx} y2={box.h} stroke="#3a3f47" strokeWidth={fs * 0.05} />
          ))}
          {Array.from({ length: Math.floor(box.h / 50) + 1 }, (_, i) => i * 50).map((gy) => (
            <line key={`gy${gy}`} x1={0} y1={gy} x2={box.w} y2={gy} stroke="#3a3f47" strokeWidth={fs * 0.05} />
          ))}
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.points.map(([x, y], k) => `${k ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join('')}
              fill="none"
              stroke={seg.penDown ? CUT : TRAVEL}
              strokeWidth={seg.penDown ? fs * 0.16 : fs * 0.09}
              strokeDasharray={seg.penDown ? undefined : `${fs * 0.35} ${fs * 0.4}`}
              opacity={seg.penDown ? 1 : 0.7}
              strokeLinecap="round" strokeLinejoin="round"
            />
          ))}
          <circle cx={0} cy={0} r={fs * 0.3} fill="#22d3ee" />
        </g>
      </svg>
    </Card>
  );
}

/* ---- the workbench ------------------------------------------------------ */

export function PlotterCalibration({
  opts, format, jobPaths, onChangeOpts, onCut, onDryRun, onForceTest, busy, simulated, simulator, onRehearse,
}: PlotterCalibrationProps) {
  const t = useT();
  const gcode = format === 'gcode';
  const pageMm = paperHeightToMm(opts.paperHeightUnits, opts.unit);

  // Typed test values (strings while being edited).
  const [bladeText, setBladeText] = useState(() => BLADE_OFFSET_STEPS_MM.join(', '));
  const [overcutText, setOvercutText] = useState(() => OVERCUT_STEPS_MM.join(', '));
  const bladeSteps = useMemo(() => parseSteps(bladeText, BLADE_OFFSET_STEPS_MM), [bladeText]);
  const overcutSteps = useMemo(() => parseSteps(overcutText, OVERCUT_STEPS_MM), [overcutText]);

  // Blade-offset calculator.
  const [calcCurrent, setCalcCurrent] = useState(String(opts.bladeOffsetMm ?? 0));
  const [calcGap, setCalcGap] = useState('');
  const [calcOverlap, setCalcOverlap] = useState('');
  const [calcSyncOvercut, setCalcSyncOvercut] = useState(false);

  // Distance calibration.
  const [boxSize, setBoxSize] = useState<number>(100);
  const [measuredX, setMeasuredX] = useState('');
  const [measuredY, setMeasuredY] = useState('');
  const [diagAc, setDiagAc] = useState('');
  const [diagBd, setDiagBd] = useState('');
  const [stepsX, setStepsX] = useState('250');
  const [stepsY, setStepsY] = useState('250');

  // Positioning.
  const jobBounds = useMemo(() => calBounds(jobPaths), [jobPaths]);
  const [rectW, setRectW] = useState('');
  const [rectH, setRectH] = useState('');
  const [rulerLength, setRulerLength] = useState<number>(100);

  // Drift.
  const [driftTopDx, setDriftTopDx] = useState('');
  const [driftTopDy, setDriftTopDy] = useState('');
  const [driftBottomDx, setDriftBottomDx] = useState('');
  const [driftBottomDy, setDriftBottomDy] = useState('');

  /* ---- geometry (pure, memoised on exactly the settings it reads) ---- */
  const blade = useMemo(() => buildBladeOffsetTest(bladeSteps, opts, format), [bladeSteps, opts, format]);
  const overcut = useMemo(() => buildOvercutTest(overcutSteps, opts, format), [overcutSteps, opts, format]);
  const box = useMemo(() => buildCalibrationBox(boxSize, opts, format), [boxSize, opts, format]);
  // A box that would run off the page is not cut: its far crosshair crosses
  // the origin line and trips the machine's travel limit. Only the page
  // height is a setting — the material's width is whatever is loaded.
  const boxNeeds = calBoxNeedsMm(boxSize);
  const boxFits = boxNeeds <= pageMm + 1e-6;
  const boxHint = `${t('Paper height is')} ${fmt(pageMm)} mm — ${t('pick a smaller box or raise Paper height')}`;
  const boxTooLarge = `${t('Needs')} ${boxNeeds} mm ${t('from the page corner')}; ${boxHint}`;
  const originMark = useMemo(() => buildOriginMark(opts, format), [opts, format]);
  const autoRect = useMemo(() => cornerRectFromBbox(jobBounds), [jobBounds]);
  // Manual width / height override the job-derived rectangle while they are filled in.
  const rect = useMemo<CalRect>(
    () => ({ x: autoRect.x, y: autoRect.y, w: num(rectW) ?? autoRect.w, h: num(rectH) ?? autoRect.h }),
    [autoRect, rectW, rectH],
  );
  const corners = useMemo(() => buildCornerMarks(rect, opts, format), [rect, opts, format]);
  const ruler = useMemo(() => buildRuler(rulerLength, opts, format), [rulerLength, opts, format]);
  const drift = useMemo(() => buildDriftTest(opts, format), [opts, format]);

  /* ---- readouts ---- */
  const baseReadout = [
    gcode ? t('G-code') : t(opts.dialect === 'bare' ? 'Bare HP-GL' : opts.dialect === 'roland-camm' ? 'Roland dialect' : 'Graphtec dialect'),
    opts.unit === 'mm' ? 'mm' : t('inches'),
    t(opts.originBottomLeft ? 'Bottom-left origin' : 'Top-left origin'),
    gcode
      ? `G1 F${opts.feedRate} · G0 F${opts.travelRate} · Z ${opts.penDownZ} / ${opts.penUpZ}`
      : `FS ${Math.round(opts.graphtecForce)} · VS ${Math.round(opts.graphtecSpeed)}${opts.dialect === 'bare' ? ` (${t('not sent in the bare dialect')})` : ''}`,
    t(opts.mirror ? 'Mirror' : 'No mirror'),
  ].join(' · ');
  const size = (p: CalibrationPattern) => `${t('Needs')} ${Math.ceil(p.extent.x1 - p.extent.x0)} × ${Math.ceil(p.extent.y1 - p.extent.y0)} mm`;
  const originDoc: [number, number] = [0, opts.originBottomLeft ? pageMm : 0];
  const axes: [[number, number], [number, number]] = [[1, 0], [0, opts.originBottomLeft ? -1 : 1]];
  const showOrigin = (p: CalibrationPattern) => p.extent.x0 < 40 && p.extent.y0 < 40;
  const cellLabels = (p: CalibrationPattern, steps: number[]): LabelAt[] => {
    const axis = p.extent.x0 + p.extent.x1;
    return steps.map((v, i) => {
      const [cx] = cellCenter(i);
      return { x: opts.mirror ? axis - cx : cx, text: `${i + 1} · ${fmt(v)}` };
    });
  };
  const dryBounds = jobPaths.length > 0 ? calBounds(jobPaths) : null;
  const dryPreview: CalPoly[] = dryBounds
    ? [{ closed: true, points: [[dryBounds.x0, dryBounds.y0], [dryBounds.x1, dryBounds.y0], [dryBounds.x1, dryBounds.y1], [dryBounds.x0, dryBounds.y1], [dryBounds.x0, dryBounds.y0]] }, ...jobPaths]
    : [];

  /* ---- calculator results ---- */
  const suggested = suggestBladeOffset(num(calcCurrent) ?? 0, num(calcGap) ?? 0, num(calcOverlap) ?? 0);
  const errX = scaleErrorPercent(boxSize, num(measuredX) ?? 0);
  const errY = scaleErrorPercent(boxSize, num(measuredY) ?? 0);
  const newStepsX = suggestGrblSteps(num(stepsX) ?? 0, boxSize, num(measuredX) ?? 0);
  const newStepsY = suggestGrblSteps(num(stepsY) ?? 0, boxSize, num(measuredY) ?? 0);
  const skew = skewFromDiagonals(boxSize, num(diagAc), num(diagBd));
  const grblCommands = newStepsX !== null || newStepsY !== null
    ? [newStepsX !== null ? `$100=${newStepsX}` : '', newStepsY !== null ? `$101=${newStepsY}` : ''].filter(Boolean).join('\n')
    : '';
  const copyCommands = async () => {
    try {
      await navigator.clipboard.writeText(grblCommands);
      toast.success(t('Copied'));
    } catch {
      toast.info(grblCommands);
    }
  };
  const applyDrift = () => {
    onChangeOpts({ drift: suggestDrift(num(driftTopDx) ?? 0, num(driftTopDy) ?? 0, num(driftBottomDx) ?? 0, num(driftBottomDy) ?? 0) ?? undefined });
    toast.success(t('Drift compensation applied'));
  };

  const previewClass = 'w-full rounded border border-border bg-panel';
  const rowPreviewClass = 'h-14 w-28 shrink-0 rounded border border-border bg-panel';

  return (
    <div className="flex flex-col gap-2 text-[11px]" data-plotter-calibration="">

      {/* ================= a. Blade ================= */}
      <GroupLabel
        trailing={!simulated && (
          <button
            type="button"
            className="btn ml-auto py-0.5! px-1.5! text-[10px]! flex items-center gap-1 normal-case tracking-normal"
            data-plotter-cal-action="rehearse"
            onClick={onRehearse}
            disabled={busy}
            title={t('No cutter at hand? Rehearse every test on the built-in virtual plotter — nothing is sent to a real machine.')}
            aria-label={t('Rehearse on virtual plotter')}
          >
            <Play size={11} aria-hidden="true" />{t('Rehearse on virtual plotter')}
          </button>
        )}
      >
        {t('Blade')}
      </GroupLabel>
      {simulated && simulator && <RehearsalResult simulator={simulator} />}

      <Card
        id="blade"
        icon={<Slice size={12} aria-hidden="true" />}
        title={t('Blade offset test')}
        simulated={simulated}
        action={<CutButton test="blade" disabled={busy} onClick={() => { void onCut(blade.code, t('Blade offset test')); }} />}
      >
        <PatternPreview
          doc={blade.doc}
          extent={blade.extent}
          origin={showOrigin(blade) ? originDoc : undefined}
          axes={axes}
          labels={cellLabels(blade, bladeSteps)}
          name={t('Blade offset test')}
          className={`${previewClass} mt-1 h-16`}
        />
        <p className="mt-1 text-[10px] text-muted" data-plotter-cal-readout="blade">
          {baseReadout} · {size(blade)}
        </p>
        <ValuesInput label={t('Blade offset values (mm)')} value={bladeText} onChange={setBladeText} />
        <StepTable
          kind="blade"
          steps={bladeSteps}
          current={opts.bladeOffsetMm ?? 0}
          onUse={(v) => { onChangeOpts({ bladeOffsetMm: v }); }}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-muted">
          {t('Each circle is cut with the blade offset shown above it: the triangle shows the corner loops, the seam at the top shows whether the circle closes, the ticks below are its number. Pick sharp corners and a seam that just closes — then run the overcut test: closed shapes only close when overcut is at least the blade offset.')}
        </p>
      </Card>

      <Card
        id="overcut"
        icon={<Slice size={12} aria-hidden="true" />}
        title={t('Overcut test')}
        simulated={simulated}
        action={<CutButton test="overcut" disabled={busy} onClick={() => { void onCut(overcut.code, t('Overcut test')); }} />}
      >
        <PatternPreview
          doc={overcut.doc}
          extent={overcut.extent}
          labels={cellLabels(overcut, overcutSteps)}
          name={t('Overcut test')}
          className={`${previewClass} mt-1 h-16`}
        />
        <p className="mt-1 text-[10px] text-muted" data-plotter-cal-readout="overcut">
          {baseReadout} · {t('Blade offset')} {fmt(opts.bladeOffsetMm ?? 0)} mm · {size(overcut)}
        </p>
        <ValuesInput label={t('Overcut values (mm)')} value={overcutText} onChange={setOvercutText} />
        <StepTable
          kind="overcut"
          steps={overcutSteps}
          current={opts.overcutMm}
          onUse={(v) => { onChangeOpts({ overcutMm: v }); }}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-muted">
          {t('Each circle retraces its start by the overcut shown above it: too little leaves a nick at the seam, too much a visible overlap. The blade offset from the Cut settings rides along unchanged.')}
        </p>
      </Card>

      <Card
        id="calculator"
        icon={<FlaskConical size={12} aria-hidden="true" />}
        title={t('Blade offset calculator')}
        simulated={simulated}
      >
        <p className="mt-1 text-[10px] leading-relaxed text-muted">
          {t('Cut any closed shape (the blade offset test or a job). At the point where the cut meets its own start: a sliver of uncut material is a gap — the offset is too small; a cut that runs past the start is an overlap — it is too large. Measure it with calipers.')}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <NumField label={`${t('Current blade offset')} (mm)`} value={calcCurrent} onChange={setCalcCurrent} />
          <NumField label={`${t('Gap at the seam')} (mm)`} value={calcGap} onChange={setCalcGap} />
          <NumField label={`${t('Overlap')} (mm)`} value={calcOverlap} onChange={setCalcOverlap} />
          <span className="rounded bg-panel px-2 py-1 tabular-nums">
            {t('Suggested blade offset')}: <strong className="text-ink">{fmt(suggested)} mm</strong>
          </span>
          <label className="flex items-center gap-1 text-[10px]">
            <input type="checkbox" checked={calcSyncOvercut} onChange={(e) => { setCalcSyncOvercut(e.target.checked); }} />
            <span className="text-muted">{t('Also set overcut to the same value')}</span>
          </label>
          <button
            type="button"
            className="btn-primary py-1! px-2! text-[10px]!"
            data-plotter-cal-action="apply-blade"
            onClick={() => {
              onChangeOpts(calcSyncOvercut ? { bladeOffsetMm: suggested, overcutMm: Math.max(suggested, opts.overcutMm) } : { bladeOffsetMm: suggested });
              toast.success(`${t('Blade offset')}: ${fmt(suggested)} mm`);
            }}
          >
            {t('Apply')}
          </button>
        </div>
        {onForceTest && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <span className="text-muted">{t('Blade pressure (force):')}</span>
            <button type="button" className="btn py-1! px-2! text-[10px]!" data-plotter-cal-cut="force" disabled={busy} onClick={onForceTest}>
              {t('Force test')}
            </button>
          </div>
        )}
      </Card>

      {/* ================= b. Distance ================= */}
      <GroupLabel>{t('Distance')}</GroupLabel>

      <Card
        id="distance"
        icon={<SquareDashed size={12} aria-hidden="true" />}
        title={t('Distance calibration')}
        simulated={simulated}
        action={<CutButton test="distance" disabled={busy || !boxFits} title={boxFits ? undefined : boxTooLarge} onClick={() => { void onCut(box.code, t('Distance calibration')); }} />}
      >
        <div className="mt-1.5 flex flex-wrap items-start gap-3">
          <div className="w-40 shrink-0">
            <PatternPreview doc={box.doc} extent={box.extent} name={t('Distance calibration')} className={`${previewClass} h-40`} />
            <p className={`mt-1 text-[10px] ${boxFits ? 'text-muted' : 'text-warning'}`} data-plotter-cal-readout="distance">
              {baseReadout} · {t('Needs')} {boxNeeds} × {boxNeeds} mm {t('from the page corner')}
              {!boxFits && `; ${boxHint}`}
            </p>
          </div>
          <div className="min-w-[16rem] flex-1">
            <p className="text-[10px] leading-relaxed text-muted">
              {t('Cut the box, then measure its outer width (X) and height (Y) with a ruler or calipers. The crosshairs sit exactly on the corners. The box is cut without blade compensation, so it measures the machine’s own travel.')}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="flex items-center gap-1 whitespace-nowrap">
                <span className="text-muted">{t('Nominal size')}</span>
                <select
                  className="input"
                  aria-label={t('Nominal size')}
                  value={boxSize}
                  onChange={(e) => { setBoxSize(Number(e.target.value)); }}
                >
                  {CAL_BOX_SIZES_MM.map((s) => (
                    <option key={s} value={s} disabled={calBoxNeedsMm(s) > pageMm + 1e-6}>
                      {s} × {s} mm{calBoxNeedsMm(s) > pageMm + 1e-6 ? ` — ${t('needs')} ${calBoxNeedsMm(s)} mm` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <NumField label={`${t('Measured width (X)')} (mm)`} value={measuredX} onChange={setMeasuredX} />
              <NumField label={`${t('Measured height (Y)')} (mm)`} value={measuredY} onChange={setMeasuredY} />
              <NumField label={`${t('Diagonal A–C (top-left → bottom-right)')} (mm)`} value={diagAc} onChange={setDiagAc} />
              <NumField label={`${t('Diagonal B–D (top-right → bottom-left)')} (mm)`} value={diagBd} onChange={setDiagBd} />
            </div>
            {(errX !== null || errY !== null || skew !== null) && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded bg-panel px-2 py-1.5 tabular-nums">
                {errX !== null && (
                  <>
                    <dt className="text-muted">{t('X error')}</dt>
                    <dd className={Math.abs(errX) >= 0.5 ? 'text-warning' : ''}>{errX > 0 ? '+' : ''}{errX.toFixed(2)} % {t(errX > 0 ? 'cuts longer than nominal' : errX < 0 ? 'cuts shorter than nominal' : 'exact')}</dd>
                  </>
                )}
                {errY !== null && (
                  <>
                    <dt className="text-muted">{t('Y error')}</dt>
                    <dd className={Math.abs(errY) >= 0.5 ? 'text-warning' : ''}>{errY > 0 ? '+' : ''}{errY.toFixed(2)} % {t(errY > 0 ? 'cuts longer than nominal' : errY < 0 ? 'cuts shorter than nominal' : 'exact')}</dd>
                  </>
                )}
                {skew !== null && (
                  <>
                    <dt className="text-muted">{t('Axis squareness error')}</dt>
                    <dd className={Math.abs(skew) >= 0.2 ? 'text-warning' : ''}>{skew.toFixed(2)}° {t('from the two diagonals')}</dd>
                  </>
                )}
              </dl>
            )}
            {gcode ? (
              <div className="mt-2">
                <p className="text-[10px] leading-relaxed text-muted">
                  {t('grbl keeps steps per millimetre in $100 (X) and $101 (Y). Enter the values your machine reports for $$ , then send the suggested lines.')}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <NumField label="$100" value={stepsX} onChange={setStepsX} step="0.01" className="w-20" />
                  <NumField label="$101" value={stepsY} onChange={setStepsY} step="0.01" className="w-20" />
                  <code className="select-all rounded bg-panel px-2 py-1 font-mono text-[10px] text-ink" data-plotter-cal-grbl="">
                    {grblCommands || '—'}
                  </code>
                  <button
                    type="button"
                    className="btn py-1! px-2! text-[10px]! flex items-center gap-1"
                    data-plotter-cal-action="copy"
                    disabled={!grblCommands}
                    onClick={() => { void copyCommands(); }}
                  >
                    <Copy size={11} aria-hidden="true" />{t('Copy')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                {t('HP-GL cutters have no steps-per-millimetre setting. If the box is off by the same percentage every time, check the machine’s scale / step setting on its panel; otherwise scale the artwork by nominal ÷ measured before sending.')}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ================= c. Positioning ================= */}
      <GroupLabel>{t('Positioning')}</GroupLabel>

      <Card
        id="dry-run"
        icon={<Move size={12} aria-hidden="true" />}
        title={t('Dry run (pen up)')}
        simulated={simulated}
        action={<CutButton test="dry-run" label={t('Dry run')} disabled={busy || dryBounds === null} onClick={() => { void onDryRun(); }} />}
      >
        <div className="mt-1.5 flex flex-wrap items-start gap-3">
          <div className="w-40 shrink-0">
            <PatternPreview
              doc={dryPreview}
              extent={dryBounds ?? { x0: 0, y0: 0, x1: 40, y1: 40 }}
              origin={originDoc}
              axes={axes}
              name={t('Dry run (pen up)')}
              className={`${previewClass} h-28`}
            />
          </div>
          <div className="min-w-[16rem] flex-1">
            <p className="text-[10px] leading-relaxed text-muted">
              {t('The head travels the job’s bounding box first, then every path in cut order, with the blade up — the same geometry, origin, mirroring and order as the real job. Watch where it lands before you cut.')}
            </p>
            {dryBounds ? (
              <p className="mt-1.5 rounded bg-panel px-2 py-1 tabular-nums" data-plotter-cal-readout="dry-run">
                {t('Job')} {(dryBounds.x1 - dryBounds.x0).toFixed(1)} × {(dryBounds.y1 - dryBounds.y0).toFixed(1)} mm ·{' '}
                {t('lower-left corner')} X {dryBounds.x0.toFixed(1)} · Y {(opts.originBottomLeft ? pageMm - dryBounds.y1 : dryBounds.y0).toFixed(1)} mm
              </p>
            ) : (
              <p className="mt-1.5 text-warning">{t('Nothing to dry-run — add cut paths or artwork first.')}</p>
            )}
          </div>
        </div>
      </Card>

      <Card id="positioning" icon={<Crosshair size={12} aria-hidden="true" />} title={t('Positioning marks')} simulated={simulated}>
        <ul className="mt-1.5 flex flex-col gap-2">
          <li className="flex flex-wrap items-start gap-3">
            <PatternPreview doc={originMark.doc} extent={originMark.extent} name={t('Mark origin')} className={rowPreviewClass} />
            <div className="min-w-[14rem] flex-1">
              <div className="font-medium text-ink">{t('Mark origin')}</div>
              <p className="text-[10px] leading-relaxed text-muted">
                {t('A 10 mm corner bracket and a dot right at the current origin — use it after “Set origin” to see where the origin really is and which way +X and +Y point.')}
              </p>
            </div>
            <CutButton test="origin" disabled={busy} onClick={() => { void onCut(originMark.code, t('Mark origin')); }} />
          </li>
          <li className="flex flex-wrap items-start gap-3">
            <PatternPreview doc={corners.doc} extent={corners.extent} name={t('Positioning corner marks')} className={rowPreviewClass} />
            <div className="min-w-[14rem] flex-1">
              <div className="font-medium text-ink">{t('Positioning corner marks')}</div>
              <p className="text-[10px] leading-relaxed text-muted">
                {t('Corner brackets around the job (10 mm outside it) plus a small diagonal on its top-left corner. With mirroring on the diagonal jumps to the top-right — that is how you tell a mirrored job.')}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <NumField label={`${t('Width')} (mm)`} value={rectW === '' && jobBounds ? String(Math.round(autoRect.w * 10) / 10) : rectW} onChange={setRectW} className="w-20" />
                <NumField label={`${t('Height')} (mm)`} value={rectH === '' && jobBounds ? String(Math.round(autoRect.h * 10) / 10) : rectH} onChange={setRectH} className="w-20" />
                {jobBounds && (
                  <button
                    type="button"
                    className="btn py-0.5! px-1.5! text-[10px]!"
                    data-plotter-cal-action="rect-from-job"
                    onClick={() => { setRectW(String(Math.round(autoRect.w * 10) / 10)); setRectH(String(Math.round(autoRect.h * 10) / 10)); }}
                  >
                    {t('Use job size')}
                  </button>
                )}
              </div>
            </div>
            <CutButton test="corners" disabled={busy} onClick={() => { void onCut(corners.code, t('Positioning corner marks')); }} />
          </li>
          <li className="flex flex-wrap items-start gap-3">
            <PatternPreview doc={ruler.doc} extent={ruler.extent} name={t('Ruler')} className={rowPreviewClass} />
            <div className="min-w-[14rem] flex-1">
              <div className="font-medium text-ink">{t('Ruler')}</div>
              <p className="text-[10px] leading-relaxed text-muted">
                {t('From the origin along +X and +Y: a tick every 10 mm, longer every 50 mm, an arrow where each axis ends. Direction, origin corner and scale in one look.')}
              </p>
              <label className="mt-1 flex items-center gap-1 whitespace-nowrap">
                <span className="text-muted">{t('Length')}</span>
                <select className="input" aria-label={t('Ruler length')} value={rulerLength} onChange={(e) => { setRulerLength(Number(e.target.value)); }}>
                  {RULER_LENGTHS_MM.map((len) => <option key={len} value={len}>{len} mm</option>)}
                </select>
              </label>
            </div>
            <CutButton test="ruler" disabled={busy} onClick={() => { void onCut(ruler.code, t('Ruler')); }} />
          </li>
        </ul>
      </Card>

      <Card
        id="drift"
        icon={<Ruler size={12} aria-hidden="true" />}
        title={t('Drift test')}
        simulated={simulated}
        action={<CutButton test="drift" disabled={busy} onClick={() => { void onCut(drift.code, t('Drift test')); }} />}
      >
        <div className="mt-1.5 flex flex-wrap items-start gap-3">
          <div className="w-40 shrink-0">
            <PatternPreview doc={drift.doc} extent={drift.extent} origin={originDoc} axes={axes} name={t('Drift test')} className={`${previewClass} h-40`} />
          </div>
          <div className="min-w-[16rem] flex-1">
            <p className="text-[10px] leading-relaxed text-muted">
              {t('A vertical reference line plus the same row of crosses near the top and near the bottom of the page. Lay a straight edge along the material’s left edge: how far each row sits right / down of where it should be (nominal 10 mm from the edge, 20 mm from the top and bottom) is the drift to enter here.')}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <NumField label={`${t('Top row')} X (mm)`} value={driftTopDx} onChange={setDriftTopDx} signed />
              <NumField label={`${t('Top row')} Y (mm)`} value={driftTopDy} onChange={setDriftTopDy} signed />
              <NumField label={`${t('Bottom row')} X (mm)`} value={driftBottomDx} onChange={setDriftBottomDx} signed />
              <NumField label={`${t('Bottom row')} Y (mm)`} value={driftBottomDy} onChange={setDriftBottomDy} signed />
              <button
                type="button"
                className="btn py-1! px-2! text-[10px]!"
                data-plotter-cal-action="apply-drift"
                onClick={applyDrift}
              >
                {t('Apply to drift compensation')}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-muted">
              {opts.drift
                ? `${t('Drift compensation')}: ${t('Top row')} ${opts.drift.topDxMm} / ${opts.drift.topDyMm} · ${t('Bottom row')} ${opts.drift.bottomDxMm} / ${opts.drift.bottomDyMm} mm`
                : t('Drift compensation is off.')}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
