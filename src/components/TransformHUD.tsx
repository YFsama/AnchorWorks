import { useEditor } from '../store/editor';

/**
 * Live transform readout — Illustrator's transform tooltip equivalent.
 *
 * While the user scales or rotates a selection, canvasEngine publishes the
 * live value into `transformHud` (object:scaling / object:rotating events)
 * and clears it ~650 ms after mouse:up so the final number lingers. This
 * overlay just formats + renders it: W×H in the document's display unit
 * while scaling, the angle in degrees while rotating.
 *
 * aria-hidden on purpose: the value updates at pointer-event frequency and
 * would spam screen readers. SR users get the same information from the
 * status bar's selection summary once the gesture commits.
 */
export function TransformHUD() {
  const hud = useEditor(s => s.transformHud);
  const dimUnit = useEditor(s => s.dimUnit);

  if (!hud) return null;

  // Same px→mm conversion the status bar uses (96 DPI → 3.7795 px/mm).
  const dim = (px: number) => (dimUnit === 'mm' ? Math.round((px / 3.7795) * 10) / 10 : Math.round(px * 10) / 10);

  // Angle normalises to [0, 360) so a -5° drag reads as 355°, matching the
  // properties panel's convention.
  const text = hud.kind === 'scale'
    ? `${dim(hud.w)} × ${dim(hud.h)} ${dimUnit}`
    : `${(() => { const n = ((hud.angle % 360) + 360) % 360; return Number.isInteger(n) ? n : Number(n.toFixed(1)); })()}°`;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        // Inverted overlay-on-canvas pill (same pattern as EraserHUD's
        // badge): ink surface at 0.85 alpha, panel text — reads correctly
        // in both themes.
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
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {text}
    </div>
  );
}
