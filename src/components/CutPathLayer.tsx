import { useEffect, useMemo, useRef } from 'react';
import { getCanvas, subscribeViewport } from '../lib/canvasEngine';
import { useEditor, type CanvasCutPreview, type CutPath } from '../store/editor';
import { previewGeometry, type CutPreviewGeometry } from '../lib/cutPreview';
import { t, useI18n } from '../lib/i18n';

/**
 * Magenta-dashed overlay rendering the editor's CutPath set on top of the
 * Fabric canvas. Dashed-magenta is the industry-standard "this is what
 * the blade will follow" colour — same convention as Roland CutStudio,
 * Adobe Illustrator's cut-contour preview, etc.
 *
 * Stroke styling per CutPath kind:
 *   outline / trace / manual  →  magenta dashed, 1.2px
 *   regmark                   →  amber solid, 1.5px (more conspicuous so
 *                                the user can immediately spot when the
 *                                regmarks have been generated and where)
 *   kiss                      →  cyan dashed, 1.2px (scores the sticker
 *                                layer only — distinct from through-cuts)
 *   perf                      →  orange solid, 1.5px (through-cut border
 *                                released last — reads as "final cut")
 *
 * On top of that, while the store holds a `canvasCutPreview` (set by the
 * Plotter dialog through lib/cutPreview.ts), the layer also draws the job
 * as the MACHINE will see it — the positioning aid for "where does this
 * land on the material":
 *
 *   1. preview cut lines — same kind colours, but thin solid over a dark
 *      halo so they read apart from the dashed generated cut paths, with a
 *      dot on every closed path's start;
 *   2. machine origin — crosshair at document (0, 0) for a top-left origin
 *      or (0, paperHeightMm) for a bottom-left one, with X / Y arrows along
 *      the machine's positive axes (X points left when mirroring is on; Y
 *      points down for a top-left origin, which is where +Y maps to);
 *   3. material band — the paper height measured from the origin, as two
 *      dashed lines plus a tint; paths that leave it (or start left of the
 *      origin) turn red;
 *   4. job frame — corner brackets on the job's bounding box, its size and
 *      its offset from the origin in machine mm;
 *   5. mirror notice — and a ghost of the mirrored toolpath.
 *
 * All geometry is document mm (Y down, the CutPath convention) mapped with
 * the same chain as the cut paths: mm * MM_TO_PX * zoom + pan. Labels are
 * canvas text at a fixed pixel size on theme-coloured chips, so they stay
 * legible on paper, on the scratch area, in dark and in light.
 *
 * Layout: positioned absolutely over the canvas, pointer-events: none so
 * the user can keep manipulating fabric objects through it. Re-renders on
 * subscribeViewport (zoom/pan) and on the cut-path / preview store changing.
 */
export function CutPathLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  const cutPaths = useEditor(s => s.cutPaths);
  const visible = useEditor(s => s.cutPathsVisible);
  const preview = useEditor(s => s.canvasCutPreview);
  // Nothing below draws these: they only decide WHEN to redraw, because the
  // overlay reads theme colours and translated labels at draw time.
  const skin = useEditor(s => `${s.theme}:${s.highContrast}`);
  const lang = useI18n(s => `${s.lang}:${s.zhReady}`);
  const geometry = useMemo(() => (preview ? previewGeometry(preview) : null), [preview]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const draw = () => {
      const c = getCanvas();
      if (!c) return;
      const cw = c.getWidth();
      const ch = c.getHeight();
      const zoom = c.getZoom();
      const vt = c.viewportTransform;
      if (!vt) return;
      const panX = vt[4];
      const panY = vt[5];
      // Read at draw time — a DPR change (monitor move / OS scale change)
      // reallocates the backing store via the width check below.
      const dpr = Math.max(1, window.devicePixelRatio || 1);

      if (el.width !== cw * dpr || el.height !== ch * dpr) {
        el.width = cw * dpr;
        el.height = ch * dpr;
        el.style.width = `${cw}px`;
        el.style.height = `${ch}px`;
      }

      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      // mm-space → screen-space: fabric stores doc geometry in canvas
      // px, and our CutPath coords are mm. The document already maps
      // 1 px = 1/3.7795 mm (96 dpi), but the canvas zoom + pan apply on
      // top, so the chain is: mm * MM_TO_PX * zoom + pan. Match the
      // pxPerMm constant used everywhere else in the codebase.
      const screen: Screen = { scale: MM_TO_PX * zoom, panX, panY, cw, ch, zoom };

      // The job preview goes down first: generated cut paths stay on top.
      if (preview && geometry) drawPreview(ctx, preview, geometry, screen, visible && cutPaths.length > 0);
      if (visible && cutPaths.length > 0) drawCutPaths(ctx, cutPaths, screen);
    };

    draw();
    // App.tsx applies the theme attribute in its own effect, which runs
    // AFTER this one — paint once more after the frame so the colours
    // picked up here are the new theme's.
    const raf = requestAnimationFrame(draw);
    const unsubscribe = subscribeViewport(draw);
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
    };
  }, [cutPaths, visible, preview, geometry, skin, lang]);

  return (
    <canvas
      ref={ref}
      // Sit just below the rulers and the artboard chrome so they paint
      // on top, but above the Fabric canvas so the cut paths render over
      // user content. pointer-events: none so the overlay never steals
      // a click from fabric.
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 4,
      }}
      aria-hidden="true"
      // Observability hook: the overlay announces the preview it is showing
      // (path count; mirroring) on the element itself — nothing when there is
      // no preview.
      data-cut-preview={preview ? preview.paths.length : undefined}
      data-cut-preview-mirror={preview?.mirror ? 'true' : undefined}
    />
  );
}

const MM_TO_PX = 3.7795;

/** Document mm → screen px, plus the viewport size for clamping labels. */
interface Screen {
  /** mm → screen px factor: MM_TO_PX × zoom. */
  scale: number;
  panX: number;
  panY: number;
  cw: number;
  ch: number;
  zoom: number;
}

const toX = (s: Screen, mm: number): number => mm * s.scale + s.panX;
const toY = (s: Screen, mm: number): number => mm * s.scale + s.panY;

const KIND_COLOR: Record<CutPath['kind'], string> = {
  outline: '#ff2e9a',
  trace: '#ff2e9a',
  manual: '#ff2e9a',
  regmark: '#ff9a1f',
  kiss: '#22d3ee',
  perf: '#f59e0b',
};

/** Dark-theme values of the theme tokens, used until the real ones are readable. */
const TOKEN_FALLBACK = {
  ink: 'rgb(231, 231, 234)',
  panel: 'rgb(30, 28, 33)',
  accent2: 'rgb(90, 200, 216)',
  danger: 'rgb(224, 85, 107)',
};
const FONT = '600 11px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
/** Dark under-stroke that keeps light lines legible on white paper. */
const HALO = 'rgba(0, 0, 0, 0.38)';
/** Keep labels clear of the 20 px ruler strips, which paint above this layer. */
const EDGE = 28;

/** Live value of a theme token as `rgb(r, g, b)` — accepts both the `R G B`
 *  triplet and the `rgb(R G B)` spellings used in index.css. */
function token(name: string, fallback: string): string {
  let raw = '';
  try {
    raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    /* no layout engine (tests) — fall through to the fallback */
  }
  const m = raw.match(/(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/);
  const rgb = m ? m.slice(1, 4) : fallback.match(/\d+/g) ?? ['0', '0', '0'];
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** `color` (an `rgb(…)` token or a `#rrggbb` literal) at the given opacity. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) {
    return `rgba(${parseInt(hex[1], 16)}, ${parseInt(hex[2], 16)}, ${parseInt(hex[3], 16)}, ${alpha})`;
  }
  return `rgba(${color.slice(4, -1)}, ${alpha})`;
}

function tracePath(ctx: CanvasRenderingContext2D, path: CutPath, s: Screen): void {
  ctx.moveTo(toX(s, path.points[0][0]), toY(s, path.points[0][1]));
  for (let i = 1; i < path.points.length; i++) {
    ctx.lineTo(toX(s, path.points[i][0]), toY(s, path.points[i][1]));
  }
  if (path.closed) ctx.closePath();
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, width: number, dash: number[], halo: boolean,
): void {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.lineCap = 'round';
  if (halo) {
    ctx.strokeStyle = HALO;
    ctx.lineWidth = width + 1.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** Arrow with a solid head, in `color` over a halo. */
function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 6;
  const wing = (side: number): [number, number] => [
    x2 - Math.cos(angle + side * 0.5) * head,
    y2 - Math.sin(angle + side * 0.5) * head,
  ];
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    const first = wing(1);
    const second = wing(-1);
    ctx.moveTo(x2, y2);
    ctx.lineTo(first[0], first[1]);
    ctx.moveTo(x2, y2);
    ctx.lineTo(second[0], second[1]);
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = HALO;
  ctx.lineWidth = 3.4;
  path();
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  path();
  ctx.stroke();
  ctx.restore();
}

/** Label on a rounded theme chip, kept inside the viewport. */
function drawChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  s: Screen,
  colors: { ink: string; panel: string; tone: string },
  align: 'left' | 'center' | 'right' = 'left',
): void {
  const padX = 7;
  const height = 19;
  const radius = 5;
  ctx.save();
  ctx.font = FONT;
  const width = ctx.measureText(text).width + padX * 2;
  const rawLeft = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
  const left = Math.max(EDGE, Math.min(rawLeft, s.cw - width - EDGE));
  const top = Math.max(EDGE, Math.min(y - height / 2, s.ch - height - EDGE));
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(left + width - radius, top);
  ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
  ctx.lineTo(left + width, top + height - radius);
  ctx.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
  ctx.lineTo(left + radius, top + height);
  ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.closePath();
  ctx.fillStyle = withAlpha(colors.panel, 0.92);
  ctx.fill();
  ctx.strokeStyle = colors.tone;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = colors.ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, left + padX, top + height / 2 + 0.5);
  ctx.restore();
}

/** Axis letter at a fixed pixel size, outlined so it reads on any background. */
function drawTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.save();
  ctx.font = '700 12px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = HALO;
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** One decimal below 100 mm, whole numbers above — the precision a ruler gives. */
function fmtMm(v: number): string {
  return Math.abs(v) < 100 ? v.toFixed(1) : v.toFixed(0);
}

/* ------------------------------------------------------------------ *
 * Generated cut paths — the original overlay.
 * ------------------------------------------------------------------ */

function drawCutPaths(ctx: CanvasRenderingContext2D, cutPaths: CutPath[], s: Screen): void {
  const { scale, panX, panY, zoom } = s;

  const drawPath = (path: CutPath) => {
    if (path.points.length < 2) return;
    ctx.beginPath();
    const [px, py] = path.points[0];
    ctx.moveTo(px * scale + panX, py * scale + panY);
    for (let i = 1; i < path.points.length; i++) {
      const [x, y] = path.points[i];
      ctx.lineTo(x * scale + panX, y * scale + panY);
    }
    if (path.closed) ctx.closePath();
    ctx.stroke();
  };

  // Group by kind so we set linestyle once per group instead of per
  // path. Cuts down state changes — relevant when traces produce
  // hundreds of polylines.
  const outlines = cutPaths.filter(p => p.kind === 'outline' || p.kind === 'trace' || p.kind === 'manual');
  const regmarks = cutPaths.filter(p => p.kind === 'regmark');
  const kisses = cutPaths.filter(p => p.kind === 'kiss');
  const perfs = cutPaths.filter(p => p.kind === 'perf');

  if (outlines.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#ff2e9a';
    ctx.lineWidth = 1.2;
    // Dash pattern scaled with zoom so dashes don't become a solid
    // line when zoomed in or a few sparse dots when zoomed out.
    const dashOn = Math.max(4, 6 / Math.sqrt(zoom));
    const dashOff = Math.max(3, 4 / Math.sqrt(zoom));
    ctx.setLineDash([dashOn, dashOff]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of outlines) drawPath(p);
    ctx.restore();
  }

  if (kisses.length > 0) {
    ctx.save();
    // Kiss-cut: cyan dashed — the cut only scores the sticker layer, so
    // it gets its own colour family away from the magenta through-cuts.
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.2;
    const dashOn = Math.max(4, 6 / Math.sqrt(zoom));
    const dashOff = Math.max(3, 4 / Math.sqrt(zoom));
    ctx.setLineDash([dashOn, dashOff]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of kisses) drawPath(p);
    ctx.restore();
  }

  if (perfs.length > 0) {
    ctx.save();
    // Perf border: orange solid — the through-cut released last, solid so
    // it reads as the final cut even next to dashed kiss/contour lines.
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of perfs) drawPath(p);
    ctx.restore();
  }

  if (regmarks.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#ff9a1f';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of regmarks) drawPath(p);
    // Highlight corner dots so the user sees the alignment points
    // clearly even when the L-arms shrink at low zoom.
    ctx.fillStyle = '#ff9a1f';
    for (const p of regmarks) {
      if (p.points.length < 2) continue;
      const corner = p.points[1] ?? p.points[0]; // middle = corner
      const x = corner[0] * scale + panX;
      const y = corner[1] * scale + panY;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ *
 * Canvas cut preview — the job as the machine will see it.
 * ------------------------------------------------------------------ */

function drawPreview(
  ctx: CanvasRenderingContext2D,
  preview: CanvasCutPreview,
  g: CutPreviewGeometry,
  s: Screen,
  withCutPaths: boolean,
): void {
  const accent = token('--accent2', TOKEN_FALLBACK.accent2);
  const danger = token('--danger', TOKEN_FALLBACK.danger);
  const ink = token('--ink', TOKEN_FALLBACK.ink);
  const panel = token('--panel', TOKEN_FALLBACK.panel);
  const info = { ink, panel, tone: accent };
  const warn = { ink, panel, tone: danger };

  /* 3. Material band: the paper height measured from the origin. ------- */
  const bandTop = toY(s, g.materialTopMm);
  const bandBottom = toY(s, g.materialBottomMm);
  const bandLeft = toX(s, 0);
  ctx.save();
  ctx.fillStyle = withAlpha(accent, 0.05);
  ctx.fillRect(0, bandTop, s.cw, bandBottom - bandTop);
  ctx.restore();
  strokeLine(ctx, 0, bandTop, s.cw, bandTop, accent, 1, [6, 4], true);
  strokeLine(ctx, 0, bandBottom, s.cw, bandBottom, accent, 1, [6, 4], true);
  // The material's left edge is the origin's X line.
  strokeLine(ctx, bandLeft, bandTop, bandLeft, bandBottom, withAlpha(accent, 0.6), 1, [6, 4], false);

  /* 5. Ghost of the mirrored toolpath, under the preview lines. -------- */
  if (g.ghostPaths) {
    ctx.save();
    ctx.strokeStyle = withAlpha(accent, 0.55);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const p of g.ghostPaths) {
      if (p.points.length >= 2) tracePath(ctx, p, s);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* 1. Preview cut lines: thin solid in the kind colour; red when the
   *    path leaves the material. -------------------------------------- */
  const groups = new Map<string, CutPath[]>();
  preview.paths.forEach((path, i) => {
    if (path.points.length < 2) return;
    const key = g.outside[i] ? 'outside' : path.kind;
    const list = groups.get(key);
    if (list) list.push(path);
    else groups.set(key, [path]);
  });
  for (const [key, paths] of groups) {
    const outside = key === 'outside';
    const color = outside ? danger : KIND_COLOR[key as CutPath['kind']];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const p of paths) tracePath(ctx, p, s);
    ctx.strokeStyle = HALO;
    ctx.lineWidth = (outside ? 1.8 : 1.2) + 1.6;
    ctx.stroke();
    ctx.strokeStyle = outside ? color : withAlpha(color, 0.92);
    ctx.lineWidth = outside ? 1.8 : 1.2;
    ctx.stroke();
    // Start dot on every closed path (and the corner of a reg mark):
    // where the blade touches down.
    ctx.fillStyle = color;
    ctx.strokeStyle = HALO;
    ctx.lineWidth = 1;
    for (const p of paths) {
      const anchor = p.closed ? p.points[0] : p.kind === 'regmark' ? p.points[1] ?? p.points[0] : null;
      if (!anchor) continue;
      ctx.beginPath();
      ctx.arc(toX(s, anchor[0]), toY(s, anchor[1]), 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 2. Machine origin: crosshair + X / Y arrows. ---------------------- */
  const originX = toX(s, g.originMm.x);
  const originY = toY(s, g.originMm.y);
  // Machine +X is document right, or left when mirrored; machine +Y is
  // document up for a bottom-left origin and down for a top-left one.
  const dirX = g.xSign;
  const dirY = preview.originBottomLeft ? -1 : 1;
  const radius = 7;
  const reach = 34;
  ctx.save();
  ctx.beginPath();
  ctx.arc(originX, originY, radius, 0, Math.PI * 2);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    ctx.moveTo(originX + dx * (radius - 2), originY + dy * (radius - 2));
    ctx.lineTo(originX + dx * (radius + 4), originY + dy * (radius + 4));
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = HALO;
  ctx.lineWidth = 3.4;
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
  drawArrow(ctx, originX + dirX * (radius + 5), originY, originX + dirX * (radius + reach), originY, accent);
  drawArrow(ctx, originX, originY + dirY * (radius + 5), originX, originY + dirY * (radius + reach), accent);
  drawTag(ctx, 'X', originX + dirX * (radius + reach + 10), originY, accent);
  drawTag(ctx, 'Y', originX, originY + dirY * (radius + reach + 10), accent);
  // Under the X arrow. A top-left origin sits on the document's top edge,
  // where the app keeps its own readout, so there the chip moves right too.
  drawChip(ctx, t('Origin (0, 0)'), originX + radius + 8 + (dirY === 1 ? reach + 12 : 0), originY - dirY * 16, s, info);

  /* 4. Job frame, size and offset from the origin. -------------------- */
  if (g.bboxMm && g.machineBboxMm) {
    const b = g.bboxMm;
    const left = toX(s, b.x0);
    const right = toX(s, b.x1);
    const top = toY(s, b.y0);
    const bottom = toY(s, b.y1);
    const midX = (left + right) / 2;
    const leg = Math.min(10, Math.max(4, (right - left) / 4), Math.max(4, (bottom - top) / 4));
    const corners: Array<[number, number, number, number]> = [
      [left, top, 1, 1], [right, top, -1, 1], [left, bottom, 1, -1], [right, bottom, -1, -1],
    ];
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const [px, py, dx, dy] of corners) {
      ctx.moveTo(px, py);
      ctx.lineTo(px + dx * leg, py);
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + dy * leg);
    }
    ctx.stroke();
    ctx.restore();

    // L-guide from the origin to the corner of the job nearest to it.
    const nearX = toX(s, g.xSign === 1 ? b.x0 : b.x1);
    const nearY = toY(s, preview.originBottomLeft ? b.y1 : b.y0);
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(nearX, originY);
    ctx.lineTo(nearX, nearY);
    ctx.stroke();
    ctx.restore();

    const mb = g.machineBboxMm;
    drawChip(ctx, `${t('Job')}: ${fmtMm(mb.x1 - mb.x0)} × ${fmtMm(mb.y1 - mb.y0)} mm`, midX, top - 14, s, info, 'center');
    drawChip(
      ctx,
      `${t('From origin')}: X ${fmtMm(mb.x0)} mm · Y ${fmtMm(mb.y0)} mm`,
      midX,
      top - 35,
      s,
      mb.x0 < -1e-6 || mb.y0 < -1e-6 ? warn : info,
      'center',
    );
  }

  const outsideCount = g.outside.reduce((n, flag) => n + (flag ? 1 : 0), 0);
  if (outsideCount > 0) {
    drawChip(
      ctx,
      `${outsideCount} ${t(outsideCount === 1 ? 'path outside the material' : 'paths outside the material')}`,
      g.bboxMm ? (toX(s, g.bboxMm.x0) + toX(s, g.bboxMm.x1)) / 2 : s.cw / 2,
      g.bboxMm ? toY(s, g.bboxMm.y1) + 15 : bandBottom - 22,
      s,
      warn,
      'center',
    );
  }

  /* Labels: material height, mirror notice, legend. ------------------- */
  drawChip(ctx, `${t('Material height')}: ${fmtMm(preview.paperHeightMm)} mm`, s.cw - EDGE, bandBottom, s, info, 'right');
  if (preview.mirror) {
    // Top-right: the app keeps its own readout in the top-left corner.
    drawChip(ctx, t('Mirror on: the machine cuts a left-right mirrored copy'), s.cw - EDGE, EDGE, s, warn, 'right');
  }
  drawChip(ctx, withCutPaths ? `${t('Cut preview')} · ${t('cut paths: dashed')}` : t('Cut preview'), EDGE, s.ch - EDGE, s, info);
}
