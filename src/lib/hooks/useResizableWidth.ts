import { useCallback, useEffect, useRef, useState } from 'react';

/** Horizontal space the panel must leave for everything else in its row:
 *  toolbar (56) + resize handle (4) + the smallest workable canvas (660).
 *  The panel's upper clamp never eats into this, whatever the window width
 *  — see the matching `.aside-right { max-width }` backstop in index.css. */
const CANVAS_RESERVE_PX = 720;

/** Medium-window band, mirroring `@media (max-width: 1200px)` in index.css:
 *  below this the CSS backstop also caps the panel at min(320px, 32vw). The
 *  JS clamp applies the same terms so the drag handle and the painted width
 *  never disagree — without this, a window of e.g. 1100px lets JS accept
 *  380px while CSS squeezes the aside to 320px, and the last 60px of drag
 *  move the handle with no visual feedback (a dead zone). Keep the numbers
 *  in sync with the `.aside-right` rules when touching either side. */
const MID_BAND_MAX_WIDTH_PX = 1200;
const MID_BAND_CAP_PX = 320;
const MID_BAND_CAP_VW = 0.32;

/**
 * Drag-to-resize a panel along its left or right edge. Persists the chosen
 * width to localStorage so it survives reloads, and dispatches a window
 * `resize` event after each commit so descendants that listen for it (the
 * Fabric canvas, rulers, the eraser HUD) reflow without manual wiring.
 *
 * @param storageKey  localStorage slot — null disables persistence.
 * @param edge        Which edge of the panel exposes the drag handle.
 *                    For a right-side panel (e.g. the properties sidebar)
 *                    set `'left'`: pulling the handle leftward widens the
 *                    panel, rightward shrinks it.
 * @param min/max     Pixel clamp. The handle never lets the user go below
 *                    `min` (panel becomes unusable) or above `max` (eats
 *                    the canvas). The effective ceiling is additionally
 *                    capped by the viewport (see `viewportMax` below).
 * @param initial     Initial width if no value is persisted yet.
 *
 * Returns the current width plus an `onMouseDown` to wire onto the
 * resize-handle <div>. Touch is intentionally NOT wired — the mobile
 * (≤ 900px) layout uses a slide-over instead of the inline panel, so the
 * resize handle is hidden there and a touch event-listener would just add
 * dead code.
 */
export function useResizableWidth(opts: {
  storageKey: string | null;
  edge: 'left' | 'right';
  min: number;
  max: number;
  initial: number;
}) {
  const { storageKey, edge, min, max, initial } = opts;

  // Viewport-aware upper clamp: `max`, but never wider than what leaves
  // CANVAS_RESERVE_PX for the rest of the row, and inside the medium-window
  // band additionally capped at min(320px, 32vw) exactly like the CSS
  // backstop (see MID_BAND_* above). Floored at `min` so a very narrow
  // window degrades to the minimum panel instead of 0/negative. Without a
  // `window` (SSR) the static `max` applies — the CSS backstop covers first
  // paint there anyway.
  const viewportMax = useCallback(() => {
    if (typeof window === 'undefined') return max;
    const vw = window.innerWidth;
    let cap = Math.min(max, vw - CANVAS_RESERVE_PX);
    if (vw <= MID_BAND_MAX_WIDTH_PX) {
      cap = Math.min(cap, MID_BAND_CAP_PX, vw * MID_BAND_CAP_VW);
    }
    return Math.max(min, cap);
  }, [min, max]);

  const [width, setWidth] = useState<number>(() => {
    let base = initial;
    if (storageKey) {
      try {
        const raw = window.localStorage.getItem(storageKey);
        const n = raw ? parseInt(raw, 10) : NaN;
        if (Number.isFinite(n) && n >= min && n <= max) base = n;
      } catch { /* localStorage blocked — fall through to default */ }
    }
    return Math.max(min, Math.min(viewportMax(), base));
  });

  // Hold drag state in refs so the mousemove/mouseup closures see the
  // latest values without re-binding listeners every render.
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef(width);
  // Keep the ref in sync after each render (not during it) so the drag closures
  // read the latest width without re-binding listeners.
  useEffect(() => { widthRef.current = width; });

  const persist = useCallback((w: number) => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, String(w)); }
    catch { /* ignore */ }
  }, [storageKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: widthRef.current };
    // Body cursor + select-none so the drag feels continuous even when the
    // mouse strays off the handle's hit area.
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    // rAF-throttled resize event so the Fabric canvas's window.resize
    // listener updates its backing-store dimensions smoothly during drag
    // (not just at mouseup). Without this, the canvas content looks
    // squashed/blurry mid-drag until the user releases.
    let pendingResize = false;
    const flushResize = () => {
      pendingResize = false;
      window.dispatchEvent(new Event('resize'));
    };

    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      // Right-side panel: dragging the LEFT handle leftward widens
      // (delta is negative, width grows by -delta).
      const next = edge === 'left' ? drag.startWidth - delta : drag.startWidth + delta;
      const clamped = Math.max(min, Math.min(viewportMax(), next));
      setWidth(clamped);
      if (!pendingResize) {
        pendingResize = true;
        requestAnimationFrame(flushResize);
      }
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      persist(widthRef.current);
      // Final reflow after the React state commits, in case the last
      // rAF tick raced ahead of the React render.
      window.dispatchEvent(new Event('resize'));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [edge, min, viewportMax, persist]);

  // A width persisted on a bigger display (or the window shrinking since
  // the last run) must fall back on its own: re-clamp downward on every
  // window resize. Shrink-only by design — the panel never auto-grows past
  // the value the user actually chose, and the persisted value is left
  // untouched so the preferred width returns when the window grows again.
  // rAF-throttled like the drag path; after the state commits we dispatch
  // one extra `resize` so the Fabric canvas reflows with the panel's new
  // width (the native resize it already handled fired before React
  // committed ours).
  useEffect(() => {
    let raf = 0;
    const onWindowResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const cap = viewportMax();
        if (widthRef.current > cap) {
          setWidth(cap);
          requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        }
      });
    };
    window.addEventListener('resize', onWindowResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [viewportMax]);

  const reset = useCallback(() => {
    const w = Math.max(min, Math.min(viewportMax(), initial));
    setWidth(w);
    persist(w);
    window.dispatchEvent(new Event('resize'));
  }, [initial, min, viewportMax, persist]);

  return { width, onMouseDown, reset };
}
