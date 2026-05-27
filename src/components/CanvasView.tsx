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
    if (!canvasRef.current) return;
    const el = canvasRef.current;
    const c = initCanvas(el);
    // Hydrate artboards from localStorage right after canvas init so the
    // overlay has the right list on first paint.
    loadArtboardsFromStorage();
    // Wire touch / pinch-zoom / two-finger pan / pen-pressure tracking.
    const detachTouch = enhanceTouchSupport(el);
    const onResize = () => {
      if (!wrapRef.current) return;
      const w = wrapRef.current.clientWidth;
      const h = wrapRef.current.clientHeight;
      c.setDimensions({ width: w, height: h }, { backstoreOnly: false });
      zoomFit();
    };
    requestAnimationFrame(() => { onResize(); setReady(true); });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
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
