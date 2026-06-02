import { useEffect, useRef } from 'react';
import { getCanvas, subscribeViewport } from '../lib/canvasEngine';
import { useEditor } from '../store/editor';

/**
 * Persistent user-guide overlay — the cyan lines dragged off the rulers. Drawn
 * on its own absolutely-positioned canvas above the Fabric surface (pointer-
 * events: none) so guides never intercept clicks. Re-renders on viewport
 * changes (zoom/pan) and whenever the guide list or the live drag changes.
 *
 * Guides live in scene space; screen = scene * zoom + pan, matching the ruler
 * and CutPathLayer maths.
 */
export function GuidesLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  const guides = useEditor(s => s.userGuides);
  const drag = useEditor(s => s.guideDrag);

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

      const line = (axis: 'h' | 'v', pos: number, preview: boolean) => {
        ctx.strokeStyle = preview ? '#22d3ee' : 'rgba(34,211,238,0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash(preview ? [4, 3] : []);
        ctx.beginPath();
        if (axis === 'h') {
          const y = Math.round(pos * zoom + panY) + 0.5;
          ctx.moveTo(0, y); ctx.lineTo(cw, y);
        } else {
          const x = Math.round(pos * zoom + panX) + 0.5;
          ctx.moveTo(x, 0); ctx.lineTo(x, ch);
        }
        ctx.stroke();
      };

      for (const g of guides) line(g.axis, g.pos, false);
      if (drag) line(drag.axis, drag.pos, true);
      ctx.setLineDash([]);
    };

    draw();
    return subscribeViewport(draw);
  }, [guides, drag]);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
      aria-hidden="true"
    />
  );
}
