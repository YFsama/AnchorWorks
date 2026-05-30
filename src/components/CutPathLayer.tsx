import { useEffect, useRef } from 'react';
import { getCanvas, subscribeViewport } from '../lib/canvasEngine';
import { useEditor, type CutPath } from '../store/editor';

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
 *
 * Layout: positioned absolutely over the canvas, pointer-events: none so
 * the user can keep manipulating fabric objects through it. Re-renders on
 * subscribeViewport (zoom/pan) and on the cut-path store mutating.
 */
export function CutPathLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  const cutPaths = useEditor(s => s.cutPaths);
  const visible = useEditor(s => s.cutPathsVisible);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

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

      if (!visible || cutPaths.length === 0) return;

      // mm-space → screen-space: fabric stores doc geometry in canvas
      // px, and our CutPath coords are mm. The document already maps
      // 1 px = 1/3.7795 mm (96 dpi), but the canvas zoom + pan apply on
      // top, so the chain is: mm * MM_TO_PX * zoom + pan. Match the
      // pxPerMm constant used everywhere else in the codebase.
      const MM_TO_PX = 3.7795;
      const scale = MM_TO_PX * zoom;

      const drawPath = (path: CutPath) => {
        if (path.points.length < 2) return;
        ctx.beginPath();
        const [sx, sy] = path.points[0];
        ctx.moveTo(sx * scale + panX, sy * scale + panY);
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
    };

    draw();
    return subscribeViewport(draw);
  }, [cutPaths, visible]);

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
    />
  );
}
