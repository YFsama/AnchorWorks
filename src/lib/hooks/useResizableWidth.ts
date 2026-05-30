import { useCallback, useEffect, useRef, useState } from 'react';

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
 *                    the canvas).
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

  const [width, setWidth] = useState<number>(() => {
    if (!storageKey) return initial;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const n = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(n) && n >= min && n <= max) return n;
    } catch { /* localStorage blocked — fall through to default */ }
    return initial;
  });

  // Hold drag state in refs so the mousemove/mouseup closures see the
  // latest values without re-binding listeners every render.
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

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
      const clamped = Math.max(min, Math.min(max, next));
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
  }, [edge, min, max, persist]);

  const reset = useCallback(() => {
    setWidth(initial);
    persist(initial);
    window.dispatchEvent(new Event('resize'));
  }, [initial, persist]);

  return { width, onMouseDown, reset };
}
