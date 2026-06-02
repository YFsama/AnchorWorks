import { useMemo } from 'react';
import { getCanvas } from '../lib/canvasEngine';
import { optimizeOrder } from '../lib/cutOptimize';
import { useT } from '../lib/i18n';
import type { CutPath } from '../store/editor';

const MM_TO_PX = 3.7795; // 96dpi convention used across the cutter pipeline
/** Above this many outlines the numbered badges become noise — skip them. */
const ORDER_BADGE_LIMIT = 60;

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
export function CutPreview({ cutPaths, showPrint = false, mirror = false, showOrder = false, className }: CutPreviewProps) {
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

  return (
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
        const head = `${tip[0]},${tip[1]} ${tip[0] - ux * aw + px * aw * 0.6},${tip[1] - uy * aw + py * aw * 0.6} ${tip[0] - ux * aw - px * aw * 0.6},${tip[1] - uy * aw - py * aw * 0.6}`;
        return (
          <g key={`ord-${i}`}>
            <line x1={a[0]} y1={a[1]} x2={tip[0]} y2={tip[1]} stroke="#22d3ee" strokeWidth={1.3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <polygon points={head} fill="#22d3ee" />
            <circle cx={a[0]} cy={a[1]} r={badgeR} fill="#0b1220" stroke="#22d3ee" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={a[0]} y={a[1]} fontSize={badgeR * 1.5} fill="#22d3ee" textAnchor="middle" dominantBaseline="central" fontFamily="sans-serif">{i + 1}</text>
          </g>
        );
      })}
      </g>
    </svg>
  );
}
