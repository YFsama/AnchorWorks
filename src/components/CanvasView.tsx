import { useEffect, useRef, useState } from 'react';
import { initCanvas, disposeCanvas, setTool, zoomFit } from '../lib/canvasEngine';
import { attachDragDrop } from '../lib/io3';
import { loadArtboardsFromStorage } from '../lib/artboards';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { Rulers } from './Rulers';
import { GridOverlay } from './GridOverlay';
import { ArtboardLayer } from './ArtboardLayer';
import { EraserHUD } from './EraserHUD';
import { EmptyCanvasHint } from './EmptyCanvasHint';
import { enhanceTouchSupport } from '../lib/touch';

export function CanvasView() {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tool = useEditor(s => s.tool);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    const el = canvasRef.current;
    const wrap = wrapRef.current;
    const c = initCanvas(el);
    // Hydrate artboards from localStorage right after canvas init so the
    // overlay has the right list on first paint.
    loadArtboardsFromStorage();
    // Wire touch / pinch-zoom / two-finger pan / pen-pressure tracking.
    const detachTouch = enhanceTouchSupport(el);

    // rAF-coalesced reflow. Fired by both the ResizeObserver and the
    // legacy window.resize listener; the boolean guard prevents queuing
    // multiple rAF callbacks per frame when both signals fire together
    // (which is what happens on OS-window resize: ResizeObserver fires
    // as the layout settles, and `window.resize` fires for the same
    // event a moment later).
    let pending = false;
    const reflow = () => {
      pending = false;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w === 0 || h === 0) return;
      c.setDimensions({ width: w, height: h }, { backstoreOnly: false });
      zoomFit();
    };
    const queueReflow = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(reflow);
    };

    // Initial paint after wrap has layout dimensions.
    requestAnimationFrame(() => { reflow(); setReady(true); });

    // ResizeObserver catches every cause of size change — OS window
    // resize, sidebar drag-resize, panel toggles, mobile-aside slideovers
    // — without each call site needing to remember to dispatch a
    // `resize` event. Window-level listener kept too because the
    // sidebar's drag hook fires `window.resize` directly and other
    // consumers (Rulers, etc.) still listen for it.
    const ro = new ResizeObserver(queueReflow);
    ro.observe(wrap);
    window.addEventListener('resize', queueReflow);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', queueReflow);
      detachTouch();
      disposeCanvas();
      setReady(false);
    };
  }, []);

  useEffect(() => { setTool(tool); }, [tool]);

  useEffect(() => {
    if (!wrapRef.current) return;
    return attachDragDrop(wrapRef.current);
  }, []);

  // Surface a custom event when the user right-clicks anywhere inside the
  // canvas wrapper. `CanvasContextMenu` (mounted in App.tsx) listens for it
  // and pops itself open at the cursor. Fabric already calls preventDefault on
  // the underlying mousedown when `stopContextMenu: true` (see canvasEngine
  // initCanvas), but the browser still fires `contextmenu` on the wrapper —
  // intercept that and reroute it as our app-level signal.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent('vector:context-menu', {
          detail: { x: e.clientX, y: e.clientY },
        }),
      );
    };
    // Middle-button defaults — Chrome's "drag-to-scroll" anchor cursor and
    // the `auxclick` event that bubbles after a middle press. The pan logic
    // in canvasEngine.onMouseDown already swallows the Fabric-level event,
    // but the browser fires its own mousedown/auxclick on the wrapper that
    // we have to block at the DOM layer too.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    wrap.addEventListener('contextmenu', onContext);
    wrap.addEventListener('mousedown', onMouseDown);
    wrap.addEventListener('auxclick', onAuxClick);
    return () => {
      wrap.removeEventListener('contextmenu', onContext);
      wrap.removeEventListener('mousedown', onMouseDown);
      wrap.removeEventListener('auxclick', onAuxClick);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      id="main-canvas"
      tabIndex={0}
      role="application"
      aria-label={t('Anchorworks canvas — arrow keys nudge selection, Delete removes, Ctrl+Z undoes')}
      className="flex-1 relative canvas-host overflow-hidden"
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {ready && <ArtboardLayer />}
      {ready && <GridOverlay />}
      {ready && <Rulers />}
      {/* eslint-disable-next-line react-hooks/refs -- wrapRef.current here is
          consumed by EraserHUD inside a useEffect (it attaches pointer
          listeners to the host element). Reading the ref during render to
          forward it as a prop is safe and intentional — the alternative
          (callback ref) loses the ergonomic prop shape. */}
      {ready && <EraserHUD host={wrapRef.current} />}
      {ready && <EmptyCanvasHint />}
    </div>
  );
}
