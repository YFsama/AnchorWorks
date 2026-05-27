import { useEffect, useRef } from 'react';
import { getCanvas, subscribeViewport } from '../lib/canvasEngine';
import { useEditor } from '../store/editor';

/**
 * Overlay canvas that visually separates artboard-interior from the
 * "scratch" workspace outside.
 *
 * Approach (Figma / XD style):
 *   1. Paint a semi-opaque dim layer over the ENTIRE viewport — this
 *      de-emphasises whatever's outside the page, including stray shapes
 *      the user might leave in the scratch area.
 *   2. Use `destination-out` composite to PUNCH a transparent hole for
 *      each artboard rectangle. The Fabric canvas underneath shines
 *      through unmodified inside the page area.
 *   3. Draw a soft drop shadow under each hole so the page reads as
 *      FLOATING on top of the scratch (the shadow is on the dim layer's
 *      own context, painted BEFORE punching).
 *   4. Draw a 1px accent2 outline + a name pill on top.
 *
 * This is `pointer-events-none` so the dim layer doesn't intercept
 * clicks — users can still grab and drag objects sitting in the
 * scratch area.
 */
export function ArtboardLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLCanvasElement>(null);
  const artboards = useEditor(s => s.artboards);

  useEffect(() => {
    const el = ref.current;
    const labelEl = labelRef.current;
    if (!el || !labelEl) return;
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

      for (const target of [el, labelEl]) {
        if (target.width !== cw * dpr || target.height !== ch * dpr) {
          target.width = cw * dpr;
          target.height = ch * dpr;
          target.style.width = `${cw}px`;
          target.style.height = `${ch}px`;
        }
      }

      const ctx = el.getContext('2d');
      const lctx = labelEl.getContext('2d');
      if (!ctx || !lctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      lctx.clearRect(0, 0, cw, ch);

      const DIM = cssVarA('--color-canvas-bg', 0.55, 'rgba(0, 0, 0, 0.55)');
      const STROKE = cssVarA('--color-accent2', 0.5, 'rgba(120, 160, 220, 0.5)');
      const SHADOW = cssVarA('--color-artboard-shadow', 0.45, 'rgba(0, 0, 0, 0.45)');
      const LABEL_BG = cssVarA('--color-ink', 0.88, 'rgba(15, 15, 18, 0.88)');
      const LABEL_FG = cssVar('--color-panel', '#e6e8eb');

      // No artboards yet → no dim, no labels. Empty doc looks normal.
      if (artboards.length === 0) return;

      // Step 1: dim the whole viewport.
      ctx.fillStyle = DIM;
      ctx.fillRect(0, 0, cw, ch);

      // Step 2: paint shadows around each artboard BEFORE punching the
      // holes — the shadow has to land on the dim layer so it shows up
      // against the scratch. (Painting after the hole would clip into
      // the artboard interior, which the destination-out below also
      // erases.)
      const shadowBlur = Math.min(24, Math.max(8, 12 * Math.sqrt(zoom)));
      const shadowOffset = Math.min(8, Math.max(3, 4 * Math.sqrt(zoom)));
      ctx.save();
      ctx.shadowColor = SHADOW;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = shadowOffset;
      for (const a of artboards) {
        const x = a.x * zoom + panX;
        const y = a.y * zoom + panY;
        const w = a.width * zoom;
        const h = a.height * zoom;
        // Use a dummy fill — only the shadow matters, the fill itself
        // gets overwritten by destination-out below.
        ctx.fillStyle = 'rgba(0,0,0,0.001)';
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();

      // Step 3: punch transparent holes for each artboard interior.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (const a of artboards) {
        const x = a.x * zoom + panX;
        const y = a.y * zoom + panY;
        const w = a.width * zoom;
        const h = a.height * zoom;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();

      // Step 4: thin accent outline + name label on the label canvas
      // (so a full-page shape can't hide the chrome).
      lctx.font = '500 11px Inter, system-ui, sans-serif';
      for (const a of artboards) {
        const x = a.x * zoom + panX;
        const y = a.y * zoom + panY;
        const w = a.width * zoom;
        const h = a.height * zoom;

        lctx.strokeStyle = STROKE;
        lctx.lineWidth = 1;
        lctx.strokeRect(x + 0.5, y + 0.5, w, h);

        const text = a.name;
        const tw = lctx.measureText(text).width;
        const padX = 6;
        const labelH = 16;
        const labelW = tw + padX * 2;
        const lx = x;
        const ly = y - labelH - 4;
        lctx.fillStyle = LABEL_BG;
        roundedRect(lctx, lx, ly, labelW, labelH, 3);
        lctx.fill();
        lctx.fillStyle = LABEL_FG;
        lctx.textBaseline = 'middle';
        lctx.fillText(text, lx + padX, ly + labelH / 2);
      }
    };

    draw();
    const unsub = subscribeViewport(draw);
    window.addEventListener('resize', draw);
    return () => {
      unsub();
      window.removeEventListener('resize', draw);
    };
  }, [artboards]);

  return (
    <>
      {/* Dim-everything-then-punch-artboards layer. Sits ABOVE Fabric so
          shapes in scratch are visibly dimmed; inside the punched
          artboard rectangles, Fabric content shows through unchanged. */}
      <canvas
        ref={ref}
        aria-hidden="true"
        className="absolute top-0 left-0 pointer-events-none"
        style={{ zIndex: 4 }}
      />
      {/* Labels + outlines on top of the grid, so they remain visible
          regardless of viewport content. */}
      <canvas
        ref={labelRef}
        aria-hidden="true"
        className="absolute top-0 left-0 pointer-events-none"
        style={{ zIndex: 8 }}
      />
    </>
  );
}

const cssVar = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
};
const cssVarA = (name: string, alpha: number, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v} / ${alpha})` : fallback;
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
