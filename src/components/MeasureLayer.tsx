import { useEffect, useRef } from 'react';
import { getCanvas, subscribeViewport } from '../lib/canvasEngine';
import { useEditor } from '../store/editor';

const MM_TO_PX = 3.7795; // 96dpi

/**
 * Renders the Measure tool's live segment with end ticks and a distance/angle
 * readout, on its own overlay canvas (pointer-events: none). Distance is shown
 * in px and mm; angle is degrees CCW from horizontal (Illustrator convention).
 */
export function MeasureLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  const measure = useEditor(s => s.measure);

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
      const panX = vt[4], panY = vt[5];

      if (el.width !== cw * dpr || el.height !== ch * dpr) {
        el.width = cw * dpr; el.height = ch * dpr;
        el.style.width = `${cw}px`; el.style.height = `${ch}px`;
      }
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      if (!measure) return;

      const sx = measure.x1 * zoom + panX, sy = measure.y1 * zoom + panY;
      const ex = measure.x2 * zoom + panX, ey = measure.y2 * zoom + panY;

      // Segment + endpoint ticks.
      ctx.strokeStyle = '#22d3ee';
      ctx.fillStyle = '#22d3ee';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      for (const [px, py] of [[sx, sy], [ex, ey]] as const) {
        ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
      }

      // Readout near the midpoint: distance (scene px → mm) + angle.
      const dxScene = measure.x2 - measure.x1;
      const dyScene = measure.y2 - measure.y1;
      const distPx = Math.hypot(dxScene, dyScene);
      const distMm = distPx / MM_TO_PX;
      const angle = ((-Math.atan2(dyScene, dxScene) * 180) / Math.PI + 360) % 360;
      const label = `${distPx.toFixed(0)} px · ${distMm.toFixed(1)} mm · ${angle.toFixed(1)}°`;
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;

      ctx.font = '11px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      const bx = Math.min(Math.max(mx - tw / 2 - 4, 2), cw - tw - 10);
      const by = Math.min(Math.max(my - 22, 2), ch - 18);
      ctx.fillStyle = 'rgba(11,18,32,0.9)';
      ctx.fillRect(bx, by, tw + 8, 16);
      ctx.fillStyle = '#22d3ee';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 4, by + 8);
    };

    draw();
    return subscribeViewport(draw);
  }, [measure]);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}
      aria-hidden="true"
    />
  );
}
