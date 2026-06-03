import { useEffect, useRef, useCallback } from 'react';
import { getCanvas, subscribeViewport } from '../lib/canvasEngine';
import { useEditor } from '../store/editor';
import { readToken as cssVar, readTokenAlpha as cssVarA } from '../lib/tokens';
import { niceMajor, formatTick, MM_TO_PX } from '../lib/rulerTicks';

const RULER_SIZE = 20; // px thickness of each ruler strip

// CSS-variable-driven colours so the ruler retains contrast in light theme.
// Tokens chosen to mirror the surrounding panel chrome: panel3 for the ruler
// strip itself (slightly raised), panel2 for the corner square (recessed),
// border/ink for ticks, and muted for labels. Resolved at draw time because
// <canvas> can't reference CSS variables directly.

interface Size { w: number; h: number; }

export function Rulers() {
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<Size>({ w: 0, h: 0 });
  // Rulers tick in the same unit the inspector + status bar show (shared store
  // flag). px ⇒ 1 doc-px/label-unit; mm ⇒ MM_TO_PX doc-px/label-unit.
  const dimUnit = useEditor(s => s.dimUnit);
  const unitPx = dimUnit === 'mm' ? MM_TO_PX : 1;

  useEffect(() => {
    const top = topRef.current;
    const left = leftRef.current;
    if (!top || !left) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const draw = () => {
      const canvas = getCanvas();
      if (!canvas) return;
      const cw = canvas.getWidth();
      const ch = canvas.getHeight();
      const zoom = canvas.getZoom();
      const vt = canvas.viewportTransform;
      if (!vt) return;
      const panX = vt[4];
      const panY = vt[5];

      // Resize top ruler if needed
      const topW = cw;
      const topH = RULER_SIZE;
      if (sizeRef.current.w !== topW) {
        top.width = topW * dpr;
        top.height = topH * dpr;
        top.style.width = `${topW}px`;
        top.style.height = `${topH}px`;
      }
      if (sizeRef.current.h !== ch) {
        left.width = RULER_SIZE * dpr;
        left.height = ch * dpr;
        left.style.width = `${RULER_SIZE}px`;
        left.style.height = `${ch}px`;
      }
      sizeRef.current = { w: topW, h: ch };

      drawTop(top, dpr, topW, topH, zoom, panX, unitPx);
      drawLeft(left, dpr, RULER_SIZE, ch, zoom, panY, unitPx);
    };

    draw();
    const unsub = subscribeViewport(draw);
    const ro = new ResizeObserver(draw);
    const c = getCanvas();
    if (c) {
      // Watch the upper-canvas element (rendered by Fabric) for size changes
      const upper = (c as unknown as { upperCanvasEl?: HTMLCanvasElement }).upperCanvasEl;
      if (upper) ro.observe(upper);
    }
    window.addEventListener('resize', draw);
    return () => {
      unsub();
      ro.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [unitPx]);

  // Pull a new guide off a ruler. Top ruler → horizontal guide (varies in Y);
  // left ruler → vertical guide (varies in X). Tracks the pointer globally and
  // commits on release once it's dragged onto the canvas (past the ruler strip).
  const startGuide = useCallback((axis: 'h' | 'v') => (e: React.PointerEvent) => {
    const c = getCanvas();
    if (!c || useEditor.getState().guidesLocked) return;
    e.preventDefault();
    const el = (c as unknown as { upperCanvasEl?: HTMLElement }).upperCanvasEl ?? c.getElement();
    let lastX = e.clientX, lastY = e.clientY;
    const scenePos = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const vt = c.viewportTransform!;
      const zoom = c.getZoom();
      return axis === 'h'
        ? (clientY - rect.top - vt[5]) / zoom
        : (clientX - rect.left - vt[4]) / zoom;
    };
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX; lastY = ev.clientY;
      useEditor.getState().setGuideDrag({ axis, pos: scenePos(ev.clientX, ev.clientY) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const drag = useEditor.getState().guideDrag;
      useEditor.getState().setGuideDrag(null);
      const rect = el.getBoundingClientRect();
      // Only commit if released over the canvas, not back on the ruler strip.
      const onCanvas = axis === 'h'
        ? lastY > rect.top + RULER_SIZE
        : lastX > rect.left + RULER_SIZE;
      if (drag && onCanvas) useEditor.getState().addUserGuide(drag.axis, drag.pos);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    move(e.nativeEvent);
  }, []);

  return (
    <>
      {/* Corner square covering the top-left intersection of the rulers */}
      <div
        className="absolute top-0 left-0 z-10"
        style={{
          width: RULER_SIZE,
          height: RULER_SIZE,
          background: 'rgb(var(--color-panel2))',
          borderRight: '1px solid rgb(var(--color-border))',
          borderBottom: '1px solid rgb(var(--color-border))',
        }}
      />
      <canvas
        ref={topRef}
        onPointerDown={startGuide('h')}
        className="absolute top-0 z-10"
        style={{ left: RULER_SIZE, borderBottom: '1px solid rgb(var(--color-border))', cursor: 'row-resize' }}
      />
      <canvas
        ref={leftRef}
        onPointerDown={startGuide('v')}
        className="absolute left-0 z-10"
        style={{ top: RULER_SIZE, borderRight: '1px solid rgb(var(--color-border))', cursor: 'col-resize' }}
      />
    </>
  );
}

function drawTop(el: HTMLCanvasElement, dpr: number, w: number, h: number, zoom: number, panX: number, unitPx: number) {
  const ctx = el.getContext('2d');
  if (!ctx) return;
  // Resolve theme-aware colours fresh each frame so toggling theme repaints
  // correctly on the next viewport tick.
  const BG = cssVar('--color-panel3', '#1a1a1f');
  const TICK_COLOR = cssVar('--color-border', '#3a3a44');
  const TICK_COLOR_MAJOR = cssVarA('--color-ink', 0.55, '#5a5a66');
  const LABEL_COLOR = cssVar('--color-muted', '#9a9aa6');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = LABEL_COLOR;

  // Ticks are spaced in *label units* (px or mm) and converted to doc-px via
  // unitPx, then to screen-x via zoom/pan. Major step is chosen adaptively so
  // labels stay ~80px apart; minor = major/10, mid emphasis at major/2.
  const major = niceMajor(zoom * unitPx);
  const minor = major / 10;
  const i0 = Math.floor(-panX / zoom / unitPx / minor);
  const i1 = Math.ceil((w - panX) / zoom / unitPx / minor);
  for (let i = i0; i <= i1; i++) {
    const x = i * minor * unitPx * zoom + panX;
    if (x < 0 || x > w) continue;
    const isMajor = i % 10 === 0;
    let tickH = 4;
    let color = TICK_COLOR;
    if (isMajor) { tickH = h; color = TICK_COLOR_MAJOR; }
    else if (i % 5 === 0) { tickH = 8; color = TICK_COLOR_MAJOR; }
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, h - tickH);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = LABEL_COLOR;
      ctx.fillText(formatTick(i * minor), x + 2, 1);
    }
  }
}

function drawLeft(el: HTMLCanvasElement, dpr: number, w: number, h: number, zoom: number, panY: number, unitPx: number) {
  const ctx = el.getContext('2d');
  if (!ctx) return;
  const BG = cssVar('--color-panel3', '#1a1a1f');
  const TICK_COLOR = cssVar('--color-border', '#3a3a44');
  const TICK_COLOR_MAJOR = cssVarA('--color-ink', 0.55, '#5a5a66');
  const LABEL_COLOR = cssVar('--color-muted', '#9a9aa6');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = LABEL_COLOR;

  const major = niceMajor(zoom * unitPx);
  const minor = major / 10;
  const i0 = Math.floor(-panY / zoom / unitPx / minor);
  const i1 = Math.ceil((h - panY) / zoom / unitPx / minor);
  for (let i = i0; i <= i1; i++) {
    const y = i * minor * unitPx * zoom + panY;
    if (y < 0 || y > h) continue;
    const isMajor = i % 10 === 0;
    let tickW = 4;
    let color = TICK_COLOR;
    if (isMajor) { tickW = w; color = TICK_COLOR_MAJOR; }
    else if (i % 5 === 0) { tickW = 8; color = TICK_COLOR_MAJOR; }
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(w - tickW, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
    if (isMajor) {
      ctx.save();
      ctx.translate(2, y + 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'top';
      ctx.fillStyle = LABEL_COLOR;
      ctx.fillText(formatTick(i * minor), -22, 0);
      ctx.restore();
    }
  }
}
