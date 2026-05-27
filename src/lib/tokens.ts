/**
 * Design-token reader for `<canvas>` and other surfaces that can't reference
 * CSS custom properties directly. The editor's design tokens are defined as
 * RGB triplets (e.g. `--color-accent: 255 138 76;`) so they compose nicely
 * with Tailwind's `rgb(var(--color-X) / <alpha>)` pattern. This module
 * resolves the live token value at call time so consumers (rulers, grid
 * overlay, anchor handles, preview lines) re-paint correctly when the user
 * flips dark / light / high-contrast.
 *
 * Single source of truth for "read a CSS variable as rgb()" — previously
 * duplicated as `cssVar` in Rulers.tsx, `readToken` in GridOverlay.tsx, and
 * one-off wrappers in pathEdit.ts / canvasEngine.ts.
 */

/** Resolve `--color-{name}` (or any custom property) to an `rgb(r g b)`
 *  string. Returns `fallback` if the property isn't readable yet (SSR, very
 *  early boot, document detached). */
export function readToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
}

/** Same as `readToken` but applies an alpha channel via the modern CSS
 *  `rgb(r g b / alpha)` syntax — supported by every browser ≥2022. */
export function readTokenAlpha(name: string, alpha: number, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v} / ${alpha})` : fallback;
}
