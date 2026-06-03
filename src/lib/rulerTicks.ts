// Ruler tick maths — pure helpers so the canvas-drawn Rulers component stays
// component-only (react-refresh) and the spacing logic is unit-testable.

/** 96-dpi mm→px convention shared across the editor. */
export const MM_TO_PX = 3.7795;

/**
 * Pick a "nice" major-tick interval (in label units) given how many on-screen
 * pixels one label unit currently spans. Follows the 1-2-5-10 progression that
 * Illustrator / CAD rulers use, targeting ~80px between labelled ticks so they
 * never crowd at low zoom nor sprawl when zoomed in. `pxPerUnit` is
 * `zoom * unitPx` (px = 1px/unit, mm = MM_TO_PX px/unit).
 */
export function niceMajor(pxPerUnit: number): number {
  const target = 80; // desired px between labelled ticks
  const raw = target / Math.max(pxPerUnit, 1e-6);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}

/** Format a tick label, trimming float noise from sub-unit major steps. */
export function formatTick(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
}
