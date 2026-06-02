import { useMemo, useId } from 'react';
import { getCanvas } from '../lib/canvasEngine';
import { renderTrimMarksSVG, type PrintPrep } from '../lib/printPrep';
import { PAGE_DIMS_MM, type PrintOptions } from '../lib/printer';

interface Props {
  opts: PrintOptions;
  prep?: PrintPrep;
  /** Bump to force a fresh raster of the canvas (e.g. each dialog open). */
  refreshKey?: unknown;
  className?: string;
}

/**
 * WYSIWYG print preview — mirrors the exact layout `printer.ts#printCanvas`
 * produces, so the operator sees the page, margins, artwork fit, and any
 * crop/registration marks before hitting Print. Built as an mm-space SVG; the
 * artwork is a raster snapshot of the canvas (tainted-canvas safe).
 */
export function PrintPreview({ opts, prep, refreshKey, className }: Props) {
  const clipId = useId();

  const art = useMemo(() => {
    void refreshKey; // re-rasterise when the caller bumps this (e.g. dialog open)
    const c = getCanvas();
    if (!c) return null;
    try {
      return { url: c.toDataURL({ format: 'png', multiplier: 1 }) };
    } catch {
      return null; // tainted canvas (cross-origin image) — show the page only
    }
  }, [refreshKey]);

  const [pw0, ph0] = PAGE_DIMS_MM[opts.pageSize];
  const [pw, ph] = opts.orientation === 'portrait' ? [pw0, ph0] : [ph0, pw0];

  const prepActive = !!prep && (prep.cropMarks || prep.registrationMarks || prep.pageInfo || prep.bleedMm > 0);
  // 'fill' clips/overflows (slice); 'fit' and (approximately) 'actual' letterbox.
  const par = opts.fit === 'fill' ? 'xMidYMid slice' : 'xMidYMid meet';

  if (prepActive && prep) {
    const bleed = Math.max(0, prep.bleedMm);
    const MARK_MARGIN = 12; // matches printer.ts
    const outerW = pw + (bleed + MARK_MARGIN) * 2;
    const outerH = ph + (bleed + MARK_MARGIN) * 2;
    const off = bleed + MARK_MARGIN;
    const marks = renderTrimMarksSVG(pw, ph, prep);
    return (
      <svg viewBox={`0 0 ${outerW} ${outerH}`} className={className} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Print preview">
        <defs>
          <clipPath id={clipId}><rect x={0} y={0} width={pw} height={ph} /></clipPath>
        </defs>
        <rect x={0} y={0} width={outerW} height={outerH} fill="#ffffff" />
        <g transform={`translate(${off} ${off})`}>
          <rect x={0} y={0} width={pw} height={ph} fill="#fafafa" stroke="#c8c8c8" strokeWidth={0.25} vectorEffect="non-scaling-stroke" />
          {art && <image href={art.url} x={0} y={0} width={pw} height={ph} preserveAspectRatio={par} clipPath={`url(#${clipId})`} />}
          <g dangerouslySetInnerHTML={{ __html: marks }} />
        </g>
      </svg>
    );
  }

  const m = Math.max(0, opts.marginMm);
  const innerW = Math.max(0, pw - m * 2);
  const innerH = Math.max(0, ph - m * 2);
  return (
    <svg viewBox={`0 0 ${pw} ${ph}`} className={className} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Print preview">
      <defs>
        <clipPath id={clipId}><rect x={m} y={m} width={innerW} height={innerH} /></clipPath>
      </defs>
      <rect x={0} y={0} width={pw} height={ph} fill="#ffffff" stroke="#c8c8c8" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
      {/* Margin guide — dashed, the printable area inside the page margin. */}
      {m > 0 && (
        <rect x={m} y={m} width={innerW} height={innerH} fill="none" stroke="#d0d0d0" strokeWidth={0.25} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      )}
      {art && <image href={art.url} x={m} y={m} width={innerW} height={innerH} preserveAspectRatio={par} clipPath={`url(#${clipId})`} />}
    </svg>
  );
}
