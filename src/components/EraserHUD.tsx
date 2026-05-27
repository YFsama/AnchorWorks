import { useEffect, useState } from 'react';
import { useEditor } from '../store/editor';
import { useT } from '../lib/i18n';

/**
 * Floating overlay that surfaces eraser state while the eraser tool is active.
 *
 * Two pieces:
 *   1. A circular cursor ring that tracks the pointer at the current
 *      `eraserSize` (radius scaled by the live canvas zoom).
 *   2. A small badge in the top-right of the canvas showing the size with a
 *      hint about the `+` / `-` shortcuts.
 *
 * Pointer position is read from a `pointermove` listener on the host element
 * (passed via `hostRef`-style prop) — kept entirely local to this component so
 * the canvas engine doesn't need a new emitter.
 */
export function EraserHUD({ host }: { host: HTMLElement | null }) {
  const t = useT();
  const tool = useEditor(s => s.tool);
  const size = useEditor(s => s.eraserSize);
  const setEraserSize = useEditor(s => s.setEraserSize);
  const zoom = useEditor(s => s.zoom);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [inside, setInside] = useState(false);

  // Pointer tracking — only mounted (and listening) when tool === 'eraser'.
  useEffect(() => {
    if (tool !== 'eraser' || !host) return;
    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    const onEnter = () => setInside(true);
    const onLeave = () => setInside(false);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerenter', onEnter);
    host.addEventListener('pointerleave', onLeave);
    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerenter', onEnter);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, [tool, host]);

  // Keyboard `+` / `-` to nudge the brush size while the eraser is active.
  useEffect(() => {
    if (tool !== 'eraser') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setEraserSize(size + 2);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setEraserSize(size - 2);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, size, setEraserSize]);

  if (tool !== 'eraser') return null;

  // Visual radius = document radius * current zoom, since `eraserSize` is in
  // document pixels and the host is in screen pixels.
  const screenR = (size * zoom) / 2;

  return (
    <>
      {pos && inside && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: pos.x - screenR,
            top: pos.y - screenR,
            width: screenR * 2,
            height: screenR * 2,
            borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.9)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.6) inset, 0 0 6px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            mixBlendMode: 'difference',
            zIndex: 30,
          }}
        />
      )}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          // Inverted overlay-on-canvas pill (same pattern as TooltipHost):
          // `ink` surface at 0.85 alpha keeps the canvas dimly visible through
          // the badge; `panel` text always reads correctly in either theme.
          background: 'rgb(var(--color-ink) / 0.85)',
          color: 'rgb(var(--color-panel))',
          fontSize: 11,
          padding: '4px 8px',
          borderRadius: 4,
          border: '1px solid rgb(var(--color-ink))',
          pointerEvents: 'none',
          zIndex: 31,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: 0.2,
          // Freeze digit width so the badge doesn't reflow as +/- toggles
          // between e.g. 9px → 10px → 22px. Without tabular-nums the right
          // edge of the pill twitches a couple of pixels per keystroke.
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {t('Eraser')}: {size}px
        {/* aria-hidden on the static hint so the polite live-region announces
         *  just the changing "Eraser: 22px" tail, not the keyboard hint
         *  repeated on every +/- keypress. */}
        {' '}<span style={{ opacity: 0.55 }} aria-hidden="true">{t('(+/- to resize)')}</span>
      </div>
    </>
  );
}
