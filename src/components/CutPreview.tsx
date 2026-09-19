import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { getCanvas } from '../lib/canvasEngine';
import { buildSimTimeline, cutPrefixPoints, formatDuration, optimizeOrder, sampleSimTimeline, type PolyLite, type SimTimeline } from '../lib/cutOptimize';
import { useT } from '../lib/i18n';
import type { CutPath } from '../store/editor';

const MM_TO_PX = 3.7795; // 96dpi convention used across the cutter pipeline
/** Above this many outlines the numbered badges become noise — skip them. */
const ORDER_BADGE_LIMIT = 60;
/** Simulation playback speed presets (multipliers of real job time). */
const SIM_SPEED_PRESETS = [0.5, 1, 2, 4] as const;

interface CutPreviewProps {
  cutPaths: CutPath[];
  /** Overlay a faint raster of the printed artwork behind the cut lines so
   *  the user can confirm the cut aligns with the print (print-and-cut). */
  showPrint?: boolean;
  /** Mirror the cut geometry horizontally (HTV preview). The print overlay
   *  stays put — only the blade path flips, which is what the machine does. */
  mirror?: boolean;
  /** Overlay cut-order numbers + a start arrow per path (same greedy order the
   *  output uses) so the operator can see the travel sequence. */
  showOrder?: boolean;
  /** Replay the job as an animated cut simulation: a cutter-head marker
   *  travels each polyline at the configured feed rate, pen-up hops render
   *  as faint dashed lines, with play / pause / restart + speed controls. */
  simulate?: boolean;
  /** Blade-down speed (mm/min) pacing the simulation. */
  feedMmMin?: number;
  /** Pen-up travel speed (mm/min) pacing the simulation. */
  travelMmMin?: number;
  /** Reorder paths for the simulation exactly the way the output pipeline
   *  does (greedy travel optimise). Off keeps document order. */
  optimize?: boolean;
  className?: string;
}

interface Bounds { minX: number; minY: number; w: number; h: number }

/**
 * Standalone graphical preview of a vinyl-cutter job. Renders the cut
 * geometry as a true-to-scale SVG so the operator can SEE the outline the
 * blade will follow, where the registration / positioning marks sit, and —
 * with `showPrint` — how those line up against the printed art, all before
 * a single millimetre of vinyl is touched.
 *
 * Everything is mm-space (same as CutPath). The SVG viewBox is mm, but
 * strokes use `vector-effect: non-scaling-stroke` so line weights stay
 * crisp at any preview scale instead of vanishing on a small sticker.
 */
export function CutPreview({
  cutPaths,
  showPrint = false,
  mirror = false,
  showOrder = false,
  simulate = false,
  feedMmMin = 200,
  travelMmMin = 800,
  optimize = false,
  className,
}: CutPreviewProps) {
  const t = useT();
  // Rasterise the canvas once per render-input change. Tainted-canvas
  // (cross-origin image) safely degrades to "no print overlay".
  const print = useMemo(() => {
    if (!showPrint) return null;
    const c = getCanvas();
    if (!c) return null;
    try {
      const url = c.toDataURL({ format: 'png', multiplier: 1 });
      return { url, wMm: c.getWidth() / MM_TO_PX, hMm: c.getHeight() / MM_TO_PX };
    } catch {
      return null; // tainted canvas — skip the overlay, keep the cut lines
    }
  }, [showPrint]);

  const bounds = useMemo<Bounds | null>(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of cutPaths) {
      for (const [x, y] of p.points) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (print) {
      minX = Math.min(minX, 0); minY = Math.min(minY, 0);
      maxX = Math.max(maxX, print.wMm); maxY = Math.max(maxY, print.hMm);
    }
    if (!Number.isFinite(minX)) return null;
    const pad = Math.max(4, (maxX - minX + maxY - minY) * 0.03);
    return { minX: minX - pad, minY: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }, [cutPaths, print]);

  // Simulation timeline: expand passes (like the job estimate), order exactly
  // the way the output does, then hand off to the animated overlay + controls.
  // (Memo runs unconditionally — the empty-state early return sits below.)
  const sim = useMemo(() => {
    if (!simulate || cutPaths.length === 0) return null;
    let polys: PolyLite[] = [];
    for (const c of cutPaths) {
      const passes = Math.max(1, c.passes ?? 1);
      for (let i = 0; i < passes; i++) polys.push({ points: c.points, closed: c.closed });
    }
    if (optimize) polys = optimizeOrder(polys);
    // Map each ordered path back to its source kind (regmarks draw amber
    // ink, everything else magenta). Signatures are matched as a queue so
    // duplicate shapes stay deterministic; multi-pass sources contribute
    // one queue entry per pass.
    const queue = new Map<string, string[]>();
    for (const c of cutPaths) {
      const passes = Math.max(1, c.passes ?? 1);
      const sig = `${c.points.length}|${c.closed}`;
      const list = queue.get(sig) ?? [];
      for (let i = 0; i < passes; i++) list.push(c.kind);
      queue.set(sig, list);
    }
    const kinds = polys.map(p => (queue.get(`${p.points.length}|${p.closed}`) ?? []).shift() ?? 'outline');
    return { timeline: buildSimTimeline(polys, feedMmMin, travelMmMin), kinds };
  }, [simulate, cutPaths, optimize, feedMmMin, travelMmMin]);

  if (!bounds) {
    return (
      <div className={`flex items-center justify-center text-[11px] text-muted ${className ?? ''}`}>
        <span>{t('No cut paths yet — generate an outline, trace, or registration marks.')}</span>
      </div>
    );
  }

  const outlines = cutPaths.filter(p => p.kind === 'outline' || p.kind === 'trace' || p.kind === 'manual');
  const regmarks = cutPaths.filter(p => p.kind === 'regmark');

  const toPts = (path: CutPath) => path.points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  // Cut-order overlay: order the outlines exactly the way the output does
  // (greedy travel optimise) and place a numbered badge + start arrow on each.
  const badgeR = Math.max(2, Math.max(bounds.w, bounds.h) * 0.018);
  const order = (showOrder && outlines.length > 0 && outlines.length <= ORDER_BADGE_LIMIT)
    ? optimizeOrder(outlines.map(p => ({ points: p.points, closed: p.closed })))
    : [];

  const renderSvg = (overlay: React.ReactNode) => (
    <svg
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={t('Cut preview')}
    >
      {/* Checkerboard so a transparent print / empty sheet reads as "page". */}
      <defs>
        <pattern id="cut-checker" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#1b1b22" />
          <rect width="3" height="3" fill="#23232c" />
          <rect x="3" y="3" width="3" height="3" fill="#23232c" />
        </pattern>
      </defs>
      <rect x={bounds.minX} y={bounds.minY} width={bounds.w} height={bounds.h} fill="url(#cut-checker)" />

      {/* Printed artwork, faint, so the cut lines pop on top. */}
      {print && (
        <image href={print.url} x={0} y={0} width={print.wMm} height={print.hMm} opacity={0.85} preserveAspectRatio="none" />
      )}

      <g transform={mirror ? `translate(${(bounds.minX + bounds.minX + bounds.w)} 0) scale(-1 1)` : undefined}>
      {/* Cut outline — magenta dashed, industry-standard "blade follows this". */}
      {outlines.map((p) => {
        const common = {
          fill: 'none',
          stroke: '#ff2e9a',
          strokeWidth: 1.2,
          strokeDasharray: '4 3',
          strokeLinejoin: 'round' as const,
          strokeLinecap: 'round' as const,
          vectorEffect: 'non-scaling-stroke' as const,
        };
        return p.closed
          ? <polygon key={p.id} points={toPts(p)} {...common} />
          : <polyline key={p.id} points={toPts(p)} {...common} />;
      })}

      {/* Registration / positioning marks — amber solid + a dot on the
          corner so the alignment point is unmistakable. */}
      {regmarks.map((p) => (
        <polyline
          key={p.id}
          points={toPts(p)}
          fill="none"
          stroke="#ff9a1f"
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {regmarks.map((p) => {
        const corner = p.points[1] ?? p.points[0];
        if (!corner) return null;
        return (
          <circle
            key={`${p.id}-dot`}
            cx={corner[0]}
            cy={corner[1]}
            r={1.4}
            fill="#ff9a1f"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* Cut-order overlay — start arrow + numbered badge per path. */}
      {order.map((p, i) => {
        const a = p.points[0];
        const b = p.points[1] ?? a;
        if (!a) return null;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const tip: [number, number] = [a[0] + ux * badgeR * 3, a[1] + uy * badgeR * 3];
        // Arrowhead triangle at the tip.
        const aw = badgeR * 1.1;
        const px = -uy, py = ux; // perpendicular
        const head = `${tip[0]},${tip[1]} ${tip[0] - ux * aw + px * aw * 0.6},${tip[1] - uy * aw + py * aw * 0.6} ${tip[0] - ux * aw - px * aw * 0.6},${tip[1] - uy * aw - px * aw * 0.6}`;
        return (
          <g key={`ord-${i}`}>
            <line x1={a[0]} y1={a[1]} x2={tip[0]} y2={tip[1]} stroke="#22d3ee" strokeWidth={1.3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <polygon points={head} fill="#22d3ee" />
            <circle cx={a[0]} cy={a[1]} r={badgeR} fill="#0b1220" stroke="#22d3ee" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={a[0]} y={a[1]} fontSize={badgeR * 1.5} fill="#22d3ee" textAnchor="middle" dominantBaseline="central" fontFamily="sans-serif">{i + 1}</text>
          </g>
        );
      })}

      {overlay}
      </g>
    </svg>
  );

  if (!sim || sim.timeline.paths.length === 0) return renderSvg(null);
  return (
    <CutSimulation
      timeline={sim.timeline}
      kinds={sim.kinds}
      feedMmMin={feedMmMin}
      svg={renderSvg}
      className={className}
    />
  );
}

/** One-time `prefers-reduced-motion` check — reduced-motion users get the
 *  final state instantly instead of an animated replay. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animated replay of the optimized job. Renders the static preview SVG via
 * the `svg(overlay)` callback with a simulation overlay injected (already-cut
 * ink, pen-up travel dashes, moving cutter head) plus a play / pause /
 * restart / speed control strip. requestAnimationFrame-driven; pauses on
 * unmount and when the job finishes; jumps straight to the end for
 * reduced-motion users.
 */
function CutSimulation({ timeline, kinds, feedMmMin, svg, className }: {
  timeline: SimTimeline;
  kinds: string[];
  feedMmMin: number;
  svg: (overlay: React.ReactNode) => React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const total = timeline.totalSeconds;
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [playing, setPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState(reduced ? total : 0);
  const elapsedRef = useRef(reduced ? total : 0);
  const [reviewedControl, setReviewedControl] = useState('');

  // rAF loop — advances the simulation clock by real elapsed time × speed.
  // Reduced-motion users never enter the loop (handlers snap them to the
  // final state instead). Cleanup cancels the frame on pause / unmount /
  // prop change, so the animation can never outlive this component.
  useEffect(() => {
    if (!playing || reduced) return;
    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      const next = Math.min(total, elapsedRef.current + dt);
      elapsedRef.current = next;
      setElapsed(next);
      if (next >= total) { setPlaying(false); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total, reduced]);

  const restart = () => {
    if (reduced) { // no animation — snap back to the completed state.
      elapsedRef.current = total;
      setElapsed(total);
      return;
    }
    elapsedRef.current = 0;
    setElapsed(0);
    setPlaying(true);
  };

  const togglePlay = () => {
    // Restart when finished (or immediately complete for reduced motion —
    // there is no animated replay to sit through).
    if (elapsed >= total - 1e-9 || reduced) { restart(); return; }
    setPlaying(!playing);
  };

  // Cumulative cut-phase start times, so per-path ink prefixes are cheap.
  const cutStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const p of timeline.paths) {
      acc += p.travelSeconds;
      starts.push(acc);
      acc += p.cutSeconds;
    }
    return starts;
  }, [timeline]);

  const state = sampleSimTimeline(timeline, elapsed);
  const headR = 2.5; // fixed-size cutter-head marker (non-scaling stroke)

  // Ink + travel overlay driven by the sampled state.
  const overlay = (
    <g>
      {/* Pen-up hops already flown — faint dashed lines. */}
      {timeline.paths.map((p, i) => {
        if (i > state.pathIndex) return null;
        const partial = i === state.pathIndex && !state.cutting;
        const to = partial ? state.point : p.travelTo;
        return (
          <line
            key={`sim-travel-${i}`}
            x1={p.travelFrom[0]} y1={p.travelFrom[1]}
            x2={to[0]} y2={to[1]}
            stroke="#22d3ee" strokeWidth={1} opacity={0.35}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {/* Blade-down ink: completed paths solid, active path as a prefix. */}
      {timeline.paths.map((p, i) => {
        if (i > state.pathIndex) return null;
        const pts = i === state.pathIndex
          ? (state.cutting ? cutPrefixPoints(p.points, elapsed - cutStarts[i], feedMmMin) : [])
          : p.points;
        if (pts.length < 2) return null;
        const stroke = kinds[i] === 'regmark' ? '#ff9a1f' : '#ff2e9a';
        const d = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
        return p.closed
          ? <polygon key={`sim-ink-${i}`} points={d} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          : <polyline key={`sim-ink-${i}`} points={d} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
      })}
      {/* Cutter head — crosshair marker at the current position. */}
      <g>
        <circle cx={state.point[0]} cy={state.point[1]} r={headR} fill="#0b1220" stroke="#22d3ee" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <line x1={state.point[0] - headR * 1.7} y1={state.point[1]} x2={state.point[0] - headR * 0.7} y2={state.point[1]} stroke="#22d3ee" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        <line x1={state.point[0] + headR * 0.7} y1={state.point[1]} x2={state.point[0] + headR * 1.7} y2={state.point[1]} stroke="#22d3ee" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        <line x1={state.point[0]} y1={state.point[1] - headR * 1.7} x2={state.point[0]} y2={state.point[1] - headR * 0.7} stroke="#22d3ee" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        <line x1={state.point[0]} y1={state.point[1] + headR * 0.7} x2={state.point[0]} y2={state.point[1] + headR * 1.7} stroke="#22d3ee" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      </g>
    </g>
  );

  const pct = total > 0 ? Math.min(100, Math.floor((elapsed / total) * 100)) : 100;

  const handleControlKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-sim-control]'))
      .filter((button) => !button.disabled);
    if (buttons.length === 0) return;
    const activeIndex = Math.max(0, buttons.findIndex((button) => button === document.activeElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    const next = buttons[nextIndex];
    setReviewedControl(next?.dataset.simReview ?? next?.textContent?.trim() ?? '');
    next?.focus();
  };

  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full">{svg(overlay)}</div>
      <div
        className="absolute inset-x-1 bottom-1 flex items-center gap-1 rounded border border-border bg-panel/90 backdrop-blur px-1.5 py-1 text-[10px]"
        role="toolbar"
        aria-label={t('Simulation controls')}
        aria-describedby="cut-sim-control-review-status"
        title={t('Use arrow keys to review simulation controls')}
        onKeyDown={handleControlKeys}
      >
        <span id="cut-sim-control-review-status" className="sr-only" aria-live="polite">
          {`${t('Reviewing')} ${reviewedControl || t('Simulation controls')}`}
        </span>
        <button
          type="button"
          data-sim-control
          data-sim-review={playing ? t('Pause simulation') : t('Play simulation')}
          className="btn !px-1.5 !py-0.5 flex items-center gap-1"
          onClick={togglePlay}
          onFocus={(event) => setReviewedControl(event.currentTarget.dataset.simReview ?? '')}
          aria-label={playing ? t('Pause simulation') : t('Play simulation')}
          title={playing ? t('Pause simulation') : t('Play simulation')}
        >
          {playing ? <Pause size={11} aria-hidden="true" /> : <Play size={11} aria-hidden="true" />}
        </button>
        <button
          type="button"
          data-sim-control
          data-sim-review={t('Restart simulation')}
          className="btn !px-1.5 !py-0.5 flex items-center gap-1"
          onClick={restart}
          onFocus={(event) => setReviewedControl(event.currentTarget.dataset.simReview ?? '')}
          aria-label={t('Restart simulation')}
          title={t('Restart simulation')}
        >
          <RotateCcw size={11} aria-hidden="true" />
        </button>
        <span className="inline-flex items-center gap-0.5" role="group" aria-label={t('Simulation speed')}>
          {SIM_SPEED_PRESETS.map((value) => {
            const active = Math.abs(speed - value) < 1e-9;
            const review = `${t('Simulation speed')} ${value}×`;
            return (
              <button
                key={value}
                type="button"
                data-sim-control
                data-sim-review={review}
                className={`btn !px-1 !py-0.5 ${active ? 'border-accent2 text-accent2 bg-accent2/10' : ''}`}
                aria-pressed={active}
                onClick={() => setSpeed(value)}
                onFocus={(event) => setReviewedControl(event.currentTarget.dataset.simReview ?? '')}
                title={`${t('Set simulation speed to')} ${value}×`}
              >
                {value}×
              </button>
            );
          })}
        </span>
        <div className="flex-1" />
        <span className="tabular-nums text-muted" role="progressbar" aria-label={t('Simulation progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          {pct}%
        </span>
        <span className="tabular-nums text-muted" title={t('Estimated job time')}>
          {formatDuration(elapsed)} / {formatDuration(total)}
        </span>
      </div>
    </div>
  );
}
