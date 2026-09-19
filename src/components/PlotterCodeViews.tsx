/**
 * Code-tab debugging views for the plotter dialog.
 *
 *  - AnnotatedCode: every machine-code statement with a one-line human
 *    explanation (position, pen state, distances) — a "disassembly view"
 *    for HP-GL / G-code jobs.
 *  - MachineSim: replays the parsed machine code itself (not the design)
 *    as an animated carriage trace — cut vs travel segments, playhead
 *    scrubbing, and speed control. Catches generator/dialect bugs the
 *    design-side preview can't show.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useT } from '../lib/i18n';
import { explainStep, type MachineRun, type StepKind } from '../lib/hpglDebug';

const KIND_COLORS: Record<StepKind, string> = {
  cut: 'bg-[#ff2e9a]',
  travel: 'bg-[#5b9cff]',
  setup: 'bg-muted',
  query: 'bg-success',
  vendor: 'bg-[#ff9a1f]',
  end: 'bg-accent2',
  unknown: 'bg-danger',
};

/** Annotated statement list — the machine code explained line by line. */
export function AnnotatedCode({ run, unit }: { run: MachineRun; unit: 'mm' | 'in' }) {
  const t = useT();
  const MAX_ROWS = 400;
  const shown = run.steps.slice(0, MAX_ROWS);
  return (
    <div className="rounded border border-border bg-panel2 text-[10px] leading-relaxed">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-1 border-b border-border/60 text-muted tabular-nums">
        <span>{run.steps.length} {t('statements')}</span>
        <span className="text-[#ff2e9a]">{t('Cut')} {run.cutLen.toFixed(1)} {unit}</span>
        <span className="text-[#5b9cff]">{t('Travel')} {run.travelLen.toFixed(1)} {unit}</span>
        <span>{run.penDownMoves} {t('pen-down moves')}</span>
      </div>
      {run.steps.length === 0 ? (
        <div className="px-2 py-2 text-muted">{t('(click Generate Preview)')}</div>
      ) : (
        <div className="max-h-44 overflow-y-auto divide-y divide-border/40">
          {shown.map(step => (
            <div key={step.index} className="flex items-start gap-1.5 px-2 py-0.5">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-sm ${KIND_COLORS[step.kind]}`} aria-hidden="true" title={step.kind} />
              <span className="w-28 shrink-0 truncate font-mono text-muted" title={step.stmt}>{step.stmt}</span>
              <span className="min-w-0 flex-1 text-ink/85">{explainStep(step, unit)}</span>
            </div>
          ))}
          {run.steps.length > MAX_ROWS && (
            <div className="px-2 py-1 text-muted">+{run.steps.length - MAX_ROWS} {t('more statements not shown')}</div>
          )}
        </div>
      )}
    </div>
  );
}

interface SimSeg {
  pts: Array<[number, number]>;
  penDown: boolean;
  start: number;
  end: number;
}

const SIM_W = 400;
const SIM_H = 200;
const SIM_PAD = 12;

/** Animated replay of the parsed machine code — what the machine will
 *  actually do, cut by cut, in job order. */
export function MachineSim({ run, unit }: { run: MachineRun; unit: 'mm' | 'in' }) {
  const t = useT();
  const segs = useMemo<SimSeg[]>(() => {
    const out: SimSeg[] = [];
    let acc = 0;
    for (const penDown of [true, false]) {
      for (const pts of penDown ? run.cuts : run.travels) {
        let len = 0;
        for (let i = 1; i < pts.length; i++) {
          len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        }
        out.push({ pts, penDown, start: acc, end: acc + len });
        acc += len;
      }
    }
    out.sort((a, b) => a.start - b.start);
    return out;
  }, [run]);

  const total = segs.length > 0 ? segs[segs.length - 1].end : 0;
  const durationS = Math.min(40, Math.max(2, total / 60));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [played, setPlayed] = useState(0);
  const playedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  useEffect(() => {
    if (!playing) { lastTsRef.current = 0; return; }
    const tick = (ts: number) => {
      if (lastTsRef.current > 0) {
        const dt = (ts - lastTsRef.current) / 1000;
        const next = playedRef.current + (dt * speed * total) / durationS;
        if (next >= total) {
          playedRef.current = total;
          setPlayed(total);
          setPlaying(false);
          return;
        }
        playedRef.current = next;
        setPlayed(next);
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing, speed, total, durationS]);

  const seek = (mm: number) => {
    playedRef.current = mm;
    setPlayed(mm);
  };

  const bbox = run.bbox ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const bw = Math.max(bbox.maxX - bbox.minX, 1);
  const bh = Math.max(bbox.maxY - bbox.minY, 1);
  const scale = Math.min((SIM_W - 2 * SIM_PAD) / bw, (SIM_H - 2 * SIM_PAD) / bh);
  const px = (x: number) => SIM_PAD + (x - bbox.minX) * scale;
  const py = (y: number) => SIM_H - SIM_PAD - (y - bbox.minY) * scale;

  /** Points of a segment visible at the current playhead. */
  const visiblePts = (seg: SimSeg): Array<[number, number]> => {
    if (played >= seg.end) return seg.pts;
    if (played <= seg.start) return [];
    const out: Array<[number, number]> = [seg.pts[0]];
    let acc = seg.start;
    for (let i = 1; i < seg.pts.length; i++) {
      const [x0, y0] = seg.pts[i - 1];
      const [x1, y1] = seg.pts[i];
      const d = Math.hypot(x1 - x0, y1 - y0);
      if (d <= 0) continue;
      if (acc + d <= played) {
        out.push(seg.pts[i]);
        acc += d;
      } else {
        const f = (played - acc) / d;
        out.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]);
        break;
      }
    }
    return out;
  };

  const rendered = segs.map(seg => ({ seg, pts: visiblePts(seg) }));
  // Latest visible point = the pen position (closure writes confuse
  // control-flow narrowing, so derive it instead).
  const lastVisible = [...rendered].reverse().find(r => r.pts.length > 0);
  const pen: [number, number] | null = lastVisible ? lastVisible.pts[lastVisible.pts.length - 1] : null;

  const pct = total > 0 ? played / total : 0;

  return (
    <div className="rounded border border-border bg-panel2 p-2 text-[10px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="btn !py-1 !px-2 !text-[10px] flex items-center gap-1"
          onClick={() => {
            if (played >= total) seek(0);
            setPlaying(!playing);
          }}
          disabled={total <= 0}
          title={t('Replay the machine code as the carriage will execute it.')}
        >
          {playing ? <Pause size={11} aria-hidden="true" /> : <Play size={11} aria-hidden="true" />}
          {playing ? t('Pause') : t('Play')}
        </button>
        <button
          type="button"
          className="btn !py-1 !px-1.5 !text-[10px]"
          onClick={() => { setPlaying(false); seek(0); }}
          disabled={total <= 0}
          title={t('Back to the first statement')}
        >
          <RotateCcw size={11} aria-hidden="true" />
        </button>
        <label className="flex items-center gap-1 text-muted">
          {t('Speed')}
          <select className="input !py-0.5 !text-[10px]" value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label={t('Speed')}>
            {[0.25, 0.5, 1, 2, 4, 8].map(s => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <span className="ml-auto text-muted tabular-nums" aria-live="off">
          {played.toFixed(0)} / {total.toFixed(0)} {unit}
        </span>
      </div>
      <div className="mt-1.5 overflow-hidden rounded border border-border bg-panel">
        {total <= 0 ? (
          <div className="flex h-40 items-center justify-center text-muted">{t('(click Generate Preview)')}</div>
        ) : (
          <svg viewBox={`0 0 ${SIM_W} ${SIM_H}`} className="h-40 w-full" role="img" aria-label={t('Machine-code replay')}>
            {segs.map((seg, i) =>
              seg.pts.length > 1 ? (
                <polyline
                  key={`g${i}`}
                  points={seg.pts.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke="currentColor"
                  className="text-muted"
                  strokeWidth={0.4}
                  opacity={0.25}
                />
              ) : null,
            )}
            {rendered.map(({ seg, pts }, i) =>
              pts.length > 1 ? (
                <polyline
                  key={i}
                  points={pts.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={seg.penDown ? '#ff2e9a' : '#5b9cff'}
                  strokeWidth={seg.penDown ? 1.5 : 0.8}
                  strokeDasharray={seg.penDown ? undefined : '3 3'}
                  opacity={seg.penDown ? 1 : 0.55}
                />
              ) : null,
            )}
            {pen && (
              <circle cx={px(pen[0])} cy={py(pen[1])} r={3} fill="#ff2e9a" stroke="#fff" strokeWidth={0.8}>
                <title>{`(${pen[0].toFixed(1)}, ${pen[1].toFixed(1)}) ${unit}`}</title>
              </circle>
            )}
          </svg>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(total, 0.01)}
        step={Math.max(total / 500, 0.01)}
        value={played}
        onChange={e => { setPlaying(false); seek(Number(e.target.value)); }}
        className="mt-1 w-full"
        disabled={total <= 0}
        aria-label={t('Machine-code replay')}
      />
      <div className="mt-0.5 flex items-center justify-between text-muted tabular-nums">
        <span>{(pct * 100).toFixed(0)}%</span>
        <span>
          <span className="text-[#ff2e9a]">▬</span> {t('Cut')} · <span className="text-[#5b9cff]">┄</span> {t('Travel')}
        </span>
      </div>
    </div>
  );
}
