import { useEffect, useRef } from 'react';
import { getCanvas, subscribeViewport, subscribeGuides, type Guide } from '../lib/canvasEngine';
import { useEditor } from '../store/editor';

import { readToken, readTokenAlpha } from '../lib/tokens';

// Resolve the live theme tokens at draw time so the overlay re-colors itself
// when the user flips dark/light. `accent2` is the cyan-ish "secondary brand"
// token which inverts to a dark teal in light theme for WCAG-AA contrast.
const guideColor = () => readToken('--color-accent2', '#5ac8d8');
const anchorPointColor = () => readToken('--color-accent2', '#5ac8d8');
const gridColorMinor = () => readTokenAlpha('--color-muted', 0.08, 'rgba(120, 160, 220, 0.06)');
const gridColorMajor = () => readTokenAlpha('--color-muted', 0.2, 'rgba(120, 160, 220, 0.15)');

export function GridOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  const guidesRef = useRef<Guide[]>([]);
  const gridVisible = useEditor(s => s.gridVisible);
  const gridSize = useEditor(s => s.gridSize);

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

      if (gridVisible && gridSize > 0) {
        const g = gridSize;
        const step = g * zoom;
        if (step >= 4) {
          const startX = Math.floor(-panX / zoom / g) * g;
          const endX = Math.ceil((cw - panX) / zoom / g) * g;
          const startY = Math.floor(-panY / zoom / g) * g;
          const endY = Math.ceil((ch - panY) / zoom / g) * g;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.strokeStyle = gridColorMinor();
          for (let dx = startX; dx <= endX; dx += g) {
            const x = Math.round(dx * zoom + panX) + 0.5;
            if (dx % (g * 5) === 0) continue;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ch);
          }
          for (let dy = startY; dy <= endY; dy += g) {
            const y = Math.round(dy * zoom + panY) + 0.5;
            if (dy % (g * 5) === 0) continue;
            ctx.moveTo(0, y);
            ctx.lineTo(cw, y);
          }
          ctx.stroke();

          ctx.beginPath();
          ctx.strokeStyle = gridColorMajor();
          for (let dx = startX; dx <= endX; dx += g) {
            if (dx % (g * 5) !== 0) continue;
            const x = Math.round(dx * zoom + panX) + 0.5;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ch);
          }
          for (let dy = startY; dy <= endY; dy += g) {
            if (dy % (g * 5) !== 0) continue;
            const y = Math.round(dy * zoom + panY) + 0.5;
            ctx.moveTo(0, y);
            ctx.lineTo(cw, y);
          }
          ctx.stroke();
        }
      }

      // Smart guides — edge lines first, then anchor-snap point markers on top.
      const guides = guidesRef.current;
      if (guides.length) {
        ctx.strokeStyle = guideColor();
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const g of guides) {
          if (g.kind === 'point') continue; // point markers rendered separately below
          const x1 = g.x1 * zoom + panX;
          const y1 = g.y1 * zoom + panY;
          const x2 = g.x2 * zoom + panX;
          const y2 = g.y2 * zoom + panY;
          ctx.moveTo(x1 + 0.5, y1 + 0.5);
          ctx.lineTo(x2 + 0.5, y2 + 0.5);
        }
        ctx.stroke();
        // Endpoint marks for edge guides (blue 3×3 squares).
        ctx.fillStyle = guideColor();
        for (const g of guides) {
          if (g.kind === 'point') continue;
          const pts = [
            [g.x1 * zoom + panX, g.y1 * zoom + panY],
            [g.x2 * zoom + panX, g.y2 * zoom + panY],
          ];
          for (const [px, py] of pts) ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        }
        // Anchor-snap point markers — distinct cyan cross-hair (4×4 lines).
        ctx.strokeStyle = anchorPointColor();
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const g of guides) {
          if (g.kind !== 'point') continue;
          const cx = g.x1 * zoom + panX;
          const cy = g.y1 * zoom + panY;
          ctx.moveTo(cx - 4, cy + 0.5); ctx.lineTo(cx + 4, cy + 0.5);
          ctx.moveTo(cx + 0.5, cy - 4); ctx.lineTo(cx + 0.5, cy + 4);
        }
        ctx.stroke();
      }
    };

    draw();
    const unsubVp = subscribeViewport(draw);
    const unsubGuides = subscribeGuides((g) => { guidesRef.current = g; draw(); });
    window.addEventListener('resize', draw);
    return () => {
      unsubVp();
      unsubGuides();
      window.removeEventListener('resize', draw);
    };
  }, [gridVisible, gridSize]);

  return (
    <canvas
      ref={ref}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ zIndex: 5 }}
    />
  );
}
