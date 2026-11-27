import { useEffect, useRef, useState } from 'react';
import { initCanvas, disposeCanvas, setTool, zoomFit } from '../lib/canvasEngine';
import { computeResizeViewportTransform } from '../lib/viewport';
import { emitViewport } from '../lib/canvasEvents';
import { loadArtboardsFromStorage } from '../lib/artboards';
import { getGridSize } from '../lib/preferences';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { Rulers } from './Rulers';
import { GridOverlay } from './GridOverlay';
import { ArtboardLayer } from './ArtboardLayer';
import { CutPathLayer } from './CutPathLayer';
import { GuidesLayer } from './GuidesLayer';
import { MeasureLayer } from './MeasureLayer';
import { EraserHUD } from './EraserHUD';
import { TransformHUD } from './TransformHUD';
import { EmptyCanvasHint } from './EmptyCanvasHint';
import { enhanceTouchSupport } from '../lib/touch';

export function CanvasView() {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tool = useEditor(s => s.tool);
  const rulersVisible = useEditor(s => s.rulersVisible);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    const el = canvasRef.current;
    const wrap = wrapRef.current;
    const c = initCanvas(el);
    // Hydrate artboards from localStorage right after canvas init so the
    // overlay has the right list on first paint.
    loadArtboardsFromStorage();
    // Apply the saved grid spacing to the store.
    useEditor.getState().setGridSize(getGridSize());
    // Wire touch / pinch-zoom / two-finger pan / pen-pressure tracking.
    const detachTouch = enhanceTouchSupport(el);

    // rAF-coalesced reflow. Fired by the ResizeObserver, the legacy
    // window.resize listener, and the DPR watcher below; the boolean guard
    // prevents queuing multiple rAF callbacks per frame when several signals
    // fire together (which is what happens on OS-window resize: ResizeObserver
    // fires as the layout settles, and `window.resize` fires for the same
    // event a moment later).
    let pending = false;
    // Wrap dimensions the previous reflow committed — the "old viewport" half
    // of the resize-preserving transform. Zero until the first layout, which
    // is exactly how reflow distinguishes "first mount" from "later resize".
    let lastW = 0;
    let lastH = 0;
    const reflow = () => {
      pending = false;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w === 0 || h === 0) return;
      // One call covers BOTH a CSS-size change and a DPR change (window moved
      // between monitors, OS display-scale adjusted): fabric v6 re-reads
      // devicePixelRatio live on every call — StaticCanvas#setDimensions →
      // _setDimensionsImpl → elements.setDimensions(size, getRetinaScaling())
      // (node_modules/fabric/dist/index.mjs, StaticCanvasDOMManager
      // .setDimensions → setCanvasDimensions) — and setCanvasDimensions
      // re-assigns `el.width`, which per the HTML canvas spec resets the
      // backstore bitmap and the ctx transform state before re-applying
      // ctx.scale(dpr, dpr). So even a same-size call after a DPR change
      // rebuilds the retina buffer at the new ratio; no extra API needed.
      // _setDimensionsImpl also ends with calcOffset(), keeping pointer
      // offsets fresh without a manual call here.
      // Capture the live canvas extent BEFORE resizing. `resizeCanvas`
      // (document settings, template apply, project load) can restamp the
      // fabric element without a wrap-size change, so lastW/lastH may no
      // longer describe the viewport the user was looking at — the element
      // itself does. Re-anchoring from the true previous extent keeps the
      // centred scene point stable even across that interleaved resize.
      const prevW = c.getWidth();
      const prevH = c.getHeight();
      c.setDimensions({ width: w, height: h }, { backstoreOnly: false });
      if (lastW === 0 || lastH === 0) {
        // First layout — establish the initial fit.
        zoomFit();
      } else if (prevW !== w || prevH !== h) {
        // Later resizes (window, sidebar drag, panel toggle) keep what the
        // user was looking at: zoom untouched, the scene point that was
        // centred stays centred — instead of stomping their viewport with a
        // refit on every layout change. A pure DPR change leaves the extent
        // untouched and skips the math.
        const vt = c.viewportTransform;
        if (vt) c.setViewportTransform(computeResizeViewportTransform(vt, prevW, prevH, w, h));
      }
      lastW = w;
      lastH = h;
      // Always broadcast, even when the VPT is mathematically identical (a
      // pure DPR change keeps w/h and thus the transform): canvasEngine's
      // after:render gate (lastViewportKey) stays silent on that path, but
      // the overlay canvases (rulers, grid, artboards, guides, cut paths,
      // measure) still need to re-sync to the rebuilt buffers.
      emitViewport();
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

    // Screen-DPI watcher. A resolution query pinned to the CURRENT
    // devicePixelRatio fires exactly once — when the ratio moves AWAY from
    // that value — so every change tears the listener down and re-arms one
    // pinned to the new ratio. The queued reflow is what actually rebuilds
    // fabric's retina buffers (see the setDimensions comment above); without
    // this watcher a same-CSS-size DPR change (OS display-scale slider)
    // emits no resize event at all and the canvas would keep its stale
    // bitmap dimensions.
    let teardownDpr: (() => void) | null = null;
    const watchDpr = () => {
      const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      const onChange = () => {
        mql.removeEventListener('change', onChange);
        watchDpr();
        queueReflow();
      };
      mql.addEventListener('change', onChange);
      teardownDpr = () => mql.removeEventListener('change', onChange);
    };
    watchDpr();

    return () => {
      teardownDpr?.();
      ro.disconnect();
      window.removeEventListener('resize', queueReflow);
      detachTouch();
      disposeCanvas();
      setReady(false);
    };
  }, []);

  useEffect(() => { setTool(tool); }, [tool]);

  // Drag-drop dispatcher (io3) — the window accepts file drops as soon as
  // this effect runs, while the io3 module itself stays a lazy chunk (keeps
  // the ~29 kB module out of the eagerly-parsed entry chunk — MenuBar /
  // CommandPalette reach it the same way).
  //
  // Phase 1, synchronous: a tiny guard on `window` cancels the browser's
  // default for file drags (navigating the tab to the file) and queues any
  // drop that lands before the chunk is ready, behind a "Preparing import…"
  // toast. Phase 2, once io3 resolves: the guard hands over — io3's own
  // window-level listeners take over and the queued drops are imported.
  // StrictMode-safe: if the effect tears down before the chunk lands,
  // `cancelled` skips the hand-off (no leaked listeners); if it already
  // attached, the cleanup detaches as before.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    type Io3 = typeof import('../lib/io3');
    type Drop = { files: File[]; clientX: number; clientY: number; overCanvas: boolean };
    let io3: Io3 | null = null;
    let loading = true;
    let detach: (() => void) | null = null;
    let cancelled = false;
    let preparingToast: string | null = null;
    const queued: Drop[] = [];
    const isFileDrag = (e: DragEvent): boolean => {
      const dt = e.dataTransfer;
      return !!dt && (Array.from(dt.types ?? []).includes('Files') || Array.from(dt.items ?? []).some((it) => it.kind === 'file'));
    };
    const importDrop = (m: Io3, drop: Drop) => {
      void m.importDroppedFiles(drop.files, { clientX: drop.clientX, clientY: drop.clientY }, drop.overCanvas);
    };
    const onDragOver = (e: DragEvent) => {
      if (isFileDrag(e) && !e.defaultPrevented) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e) || e.defaultPrevented) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      const drop: Drop = {
        files,
        clientX: e.clientX,
        clientY: e.clientY,
        overCanvas: e.target instanceof Node && wrap.contains(e.target),
      };
      if (io3) importDrop(io3, drop);
      else {
        queued.push(drop);
        preparingToast ??= toast.info(t('Preparing import…'), { duration: 0 });
        if (!loading) load();
      }
    };
    const detachGuard = () => {
      window.removeEventListener('dragenter', onDragOver);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
    const dismissPreparing = () => {
      if (preparingToast) toast.dismiss(preparingToast);
      preparingToast = null;
    };
    // A failed chunk fetch leaves the guard armed, so the page still never
    // navigates to the file; the next drop retries the load.
    const load = (): void => {
      loading = true;
      void import('../lib/io3')
        .then((m) => {
          io3 = m;
          if (cancelled) return;
          detachGuard();
          detach = m.attachDragDrop(wrap);
          for (const drop of queued.splice(0)) importDrop(m, drop);
          dismissPreparing();
        })
        .catch((e) => {
          console.warn('io3 chunk failed to load — drag-drop disabled', e);
          loading = false;
          if (cancelled) return;
          // The guard stays armed so the page still never navigates to the
          // file; the next drop retries the chunk.
          if (queued.length) toast.error(t("Import isn't ready yet. Reload the page and try again."), { title: t('Import failed') });
          queued.length = 0;
          dismissPreparing();
        });
    };
    window.addEventListener('dragenter', onDragOver);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    load();
    return () => {
      cancelled = true;
      detachGuard();
      dismissPreparing();
      detach?.();
    };
    // `t` is the stable translator from useT() — a dependency only in name.
  }, [t]);

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
      {ready && <CutPathLayer />}
      {ready && <GuidesLayer />}
      {ready && <MeasureLayer />}
      {ready && rulersVisible && <Rulers />}
      {/* eslint-disable-next-line react-hooks/refs -- wrapRef.current here is
          consumed by EraserHUD inside a useEffect (it attaches pointer
          listeners to the host element). Reading the ref during render to
          forward it as a prop is safe and intentional — the alternative
          (callback ref) loses the ergonomic prop shape. */}
      {ready && <EraserHUD host={wrapRef.current} />}
      {ready && <TransformHUD />}
      {ready && <EmptyCanvasHint />}
    </div>
  );
}
