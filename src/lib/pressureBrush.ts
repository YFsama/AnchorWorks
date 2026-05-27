/**
 * PressureBrush — a variable-width free-drawing brush for Fabric.js v6 that
 * responds to pen pressure (PointerEvent.pressure) and, when pressure is
 * unavailable (mouse, or browsers reporting the default 0.5), falls back to a
 * speed-modulated width for a "calligraphy" feel: faster strokes get thinner.
 *
 * Strategy
 * ────────
 * 1. Collect (x, y, pressure) samples on every move.
 * 2. Render a fast preview to `canvas.contextTop` so the user sees the stroke
 *    while drawing. The preview uses small connecting line segments whose
 *    individual widths track the running pressure.
 * 3. On mouse-up, compute a tapered outline by walking the centerline and
 *    offsetting each sample by ±(baseWidth * pressure) along the perpendicular.
 *    The forward outline + reverse outline form a closed polygon which we
 *    encode as a `fabric.Path` (fill = brush color, no stroke).
 */
import * as fabric from 'fabric';

type Canvas = fabric.Canvas;
type TBrushEventData = { e: PointerEvent | MouseEvent | TouchEvent; pointer: fabric.Point };

interface Sample {
  x: number;
  y: number;
  /** Normalized pressure in 0..1. */
  p: number;
  /** Timestamp (ms) at sample, used for speed fallback. */
  t: number;
}

/** Read a normalized pressure value from a (possibly pen) event. */
function readPressure(e: Event): number | null {
  // PointerEvent path — pen / stylus / mouse all expose `.pressure`.
  const pe = e as PointerEvent;
  if (typeof pe.pressure === 'number' && pe.pointerType) {
    if (pe.pointerType === 'pen' && pe.pressure > 0) return pe.pressure;
    // Mouse PointerEvents report 0.5 on buttoned moves, 0 otherwise — not
    // useful as pressure. Signal "unknown" so the caller can use speed instead.
    if (pe.pointerType === 'mouse') return null;
    if (pe.pointerType === 'touch' && pe.pressure > 0 && pe.pressure !== 0.5) return pe.pressure;
  }
  // Touch events: legacy `force` on iOS.
  const te = e as TouchEvent;
  if (te.touches && te.touches.length) {
    const t0 = te.touches[0] as Touch & { force?: number };
    if (typeof t0.force === 'number' && t0.force > 0) return t0.force;
  }
  return null;
}

export class PressureBrush extends fabric.BaseBrush {
  /** Base width — actual stroke width is baseWidth * pressureFactor at each sample. */
  baseWidth = 6;
  /** Minimum width as a fraction of baseWidth (avoids ultra-thin slivers). */
  minWidthRatio = 0.15;
  /**
   * When pressure is unavailable, modulate width by speed. Larger value =
   * stronger thinning at high speed.
   */
  speedSensitivity = 0.6;

  private samples: Sample[] = [];
  private drawing = false;

  constructor(canvas: Canvas) {
    super(canvas);
  }

  onMouseDown(pointer: fabric.Point, ev: TBrushEventData): void {
    this.drawing = true;
    this.samples = [];
    this._pushSample(pointer, ev);
    this._renderPreview();
  }

  onMouseMove(pointer: fabric.Point, ev: TBrushEventData): void {
    if (!this.drawing) return;
    this._pushSample(pointer, ev);
    this._renderPreview();
  }

  onMouseUp(_ev: TBrushEventData): boolean | void {
    if (!this.drawing) return;
    this.drawing = false;
    const samples = this.samples;
    this.samples = [];
    // Clear the preview from the top canvas — the finalized path will be added
    // to the main canvas instead.
    this.canvas.clearContext(this.canvas.contextTop);
    if (samples.length < 2) return;
    const path = this._buildTaperedPath(samples);
    if (path) {
      this.canvas.add(path);
      this.canvas.requestRenderAll();
    }
  }

  /** Abstract member required by BaseBrush; renders the in-flight preview. */
  _render(): void {
    this._renderPreview();
  }

  // ────────────────────────────────────────────────────────────── internals

  private _pushSample(pointer: fabric.Point, ev: TBrushEventData) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const rawP = readPressure(ev.e);
    let p: number;
    if (rawP != null) {
      p = Math.min(1, Math.max(0.05, rawP));
    } else {
      // Speed-based fallback: faster pointer => thinner stroke.
      const prev = this.samples[this.samples.length - 1];
      if (!prev) {
        p = 0.6;
      } else {
        const dt = Math.max(1, now - prev.t);
        const dx = pointer.x - prev.x;
        const dy = pointer.y - prev.y;
        const speed = Math.hypot(dx, dy) / dt; // px / ms
        // Map speed 0..2 px/ms to width factor 1..(1 - sensitivity).
        const factor = Math.max(this.minWidthRatio, 1 - Math.min(1, speed / 2) * this.speedSensitivity);
        p = factor;
      }
    }
    this.samples.push({ x: pointer.x, y: pointer.y, p, t: now });
  }

  /** Live preview on contextTop while the user is drawing. */
  private _renderPreview() {
    const ctx = this.canvas.contextTop;
    this.canvas.clearContext(ctx);
    if (this.samples.length < 1) return;

    ctx.save();
    const v = this.canvas.viewportTransform;
    if (v) ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw connecting segments — each segment uses the average width of its
    // two endpoints, so the line visibly tapers as pressure changes.
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      const w = Math.max(1, this.baseWidth * (a.p + b.p) * 0.5);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // A small dot at the start for taps that never move.
    if (this.samples.length === 1) {
      const s = this.samples[0];
      const r = Math.max(0.5, (this.baseWidth * s.p) / 2);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Build the final tapered outline as a `fabric.Path`.
   * For each sample we compute a perpendicular offset of ±(baseWidth*p/2)
   * relative to the local tangent, then join the two offset polylines into a
   * single closed polygon. End-caps are rounded by sampling a half-circle of
   * additional points at the head and tail.
   */
  private _buildTaperedPath(samples: Sample[]): fabric.Path | null {
    // Smooth pressure a touch so single jittery samples don't pinch the line.
    const ps = samples.map(s => s.p);
    const smoothed: Sample[] = samples.map((s, i) => {
      const prev = ps[i - 1] ?? ps[i];
      const next = ps[i + 1] ?? ps[i];
      const p = (prev + 2 * ps[i] + next) / 4;
      return { ...s, p };
    });

    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    for (let i = 0; i < smoothed.length; i++) {
      const cur = smoothed[i];
      const prev = smoothed[i - 1] ?? cur;
      const next = smoothed[i + 1] ?? cur;
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      // Perpendicular unit vector (rotate tangent 90°).
      const nx = -ty / len;
      const ny = tx / len;
      const half = Math.max(0.5, (this.baseWidth * cur.p) / 2);
      left.push({ x: cur.x + nx * half, y: cur.y + ny * half });
      right.push({ x: cur.x - nx * half, y: cur.y - ny * half });
    }

    // Compose closed path: left forward, then right reverse.
    const cmds: string[] = [];
    const first = left[0];
    cmds.push(`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`);
    for (let i = 1; i < left.length; i++) {
      cmds.push(`L ${left[i].x.toFixed(2)} ${left[i].y.toFixed(2)}`);
    }
    // Cap at the tail (semicircle from last-left to last-right).
    const tail = smoothed[smoothed.length - 1];
    const tailR = Math.max(0.5, (this.baseWidth * tail.p) / 2);
    const lastL = left[left.length - 1];
    const lastR = right[right.length - 1];
    cmds.push(`A ${tailR.toFixed(2)} ${tailR.toFixed(2)} 0 0 1 ${lastR.x.toFixed(2)} ${lastR.y.toFixed(2)}`);
    for (let i = right.length - 2; i >= 0; i--) {
      cmds.push(`L ${right[i].x.toFixed(2)} ${right[i].y.toFixed(2)}`);
    }
    // Cap at the head.
    const head = smoothed[0];
    const headR = Math.max(0.5, (this.baseWidth * head.p) / 2);
    cmds.push(`A ${headR.toFixed(2)} ${headR.toFixed(2)} 0 0 1 ${lastL.x.toFixed(2)} ${lastL.y.toFixed(2)}`);
    cmds.push('Z');

    const d = cmds.join(' ');
    if (!d) return null;
    return new fabric.Path(d, {
      fill: this.color,
      stroke: '',
      strokeWidth: 0,
      objectCaching: true,
    });
  }
}
