/**
 * WCAG contrast utilities.
 *
 * Pure helpers — no DOM, no Fabric imports — so they can be unit-tested
 * and shared by the live ContrastChecker panel or future a11y reports.
 *
 * References:
 *   https://www.w3.org/TR/WCAG20/#relativeluminancedef
 *   https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */

export type RGB = [number, number, number];

/* -------------------------------------------------------------------------- */
/*  Parsing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Parse a CSS colour string into an [r, g, b] tuple (0..255 each), or null
 * if the input is unrecognised. Accepts:
 *   - `#abc`         (3-digit hex, expanded to 6)
 *   - `#aabbcc`      (6-digit hex)
 *   - `#aabbccdd`    (8-digit hex — alpha discarded for contrast purposes)
 *   - `rgb(r, g, b)` / `rgba(r, g, b, a)`
 *
 * Named colours and `hsl()` are not supported — Vector's pickers always
 * emit hex/rgb so this stays small. Returns null on any parse failure.
 */
export function hexToRgb(input: string): RGB | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // Hex form.
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if ([r, g, b].some(Number.isNaN)) return null;
      return [r, g, b];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].some(Number.isNaN)) return null;
      return [r, g, b];
    }
    return null;
  }

  // rgb()/rgba() form.
  const m = s.match(/^rgba?\(\s*([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim());
    if (parts.length < 3) return null;
    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
    return [clamp255(r), clamp255(g), clamp255(b)];
  }

  return null;
}

function clamp255(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return Math.round(n);
}

/* -------------------------------------------------------------------------- */
/*  Luminance & ratio                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Relative luminance per WCAG 2.0:
 *   L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where each channel is the linearised sRGB value in 0..1.
 */
export function relativeLuminance(rgb: RGB): number {
  const linear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Contrast ratio between two CSS colour strings. Returns NaN if either
 * input is unparseable, otherwise a value in [1, 21].
 */
export function contrastRatio(fg: string, bg: string): number {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!f || !b) return NaN;
  const lf = relativeLuminance(f);
  const lb = relativeLuminance(b);
  const lighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/* -------------------------------------------------------------------------- */
/*  Grading                                                                   */
/* -------------------------------------------------------------------------- */

export interface WcagGrade {
  passAA: boolean;       // ≥ 4.5 (normal text)
  passAAA: boolean;      // ≥ 7   (normal text)
  passAALarge: boolean;  // ≥ 3   (large/bold text)
  passAAALarge: boolean; // ≥ 4.5 (large/bold text)
  label: 'Excellent' | 'Good' | 'Fair' | 'Fail';
}

export interface GradeOptions {
  // Reserved for future use (e.g. force "large text" thresholds). Kept
  // optional so callers can pass nothing today and stay forward-compatible.
  large?: boolean;
}

/**
 * Bucket a contrast ratio into pass/fail flags + a single human label.
 * NaN is treated as a hard Fail with all pass flags false.
 */
export function wcagGrade(ratio: number, _opts?: GradeOptions): WcagGrade {
  if (!Number.isFinite(ratio)) {
    return {
      passAA: false,
      passAAA: false,
      passAALarge: false,
      passAAALarge: false,
      label: 'Fail',
    };
  }
  const passAA = ratio >= 4.5;
  const passAAA = ratio >= 7;
  const passAALarge = ratio >= 3;
  const passAAALarge = ratio >= 4.5;
  let label: WcagGrade['label'];
  if (ratio >= 7) label = 'Excellent';
  else if (ratio >= 4.5) label = 'Good';
  else if (ratio >= 3) label = 'Fair';
  else label = 'Fail';
  return { passAA, passAAA, passAALarge, passAAALarge, label };
}

/* -------------------------------------------------------------------------- */
/*  Background sampling                                                       */
/* -------------------------------------------------------------------------- */

// Loose object shape — keeps this module Fabric-free. We only read what we
// need (bbox, fill, stacking) via duck-typed access so that the dependency
// direction stays one-way: ContrastChecker → contrast.ts.
interface ObjectLike {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  fill?: unknown;
  getBoundingRect?: () => { left: number; top: number; width: number; height: number };
}

interface CanvasLike {
  backgroundColor?: unknown;
  getObjects?: () => ObjectLike[];
}

/**
 * Best-effort background sampling for a selected object.
 *
 * Strategy: walk every object below `obj` in stacking order, and return the
 * first one whose bounding box contains `obj`'s centre point AND whose
 * `fill` is a parseable colour string. If nothing matches we fall back to
 * the document background (`canvas.backgroundColor` if available, else the
 * caller-supplied `docBackground`).
 *
 * We deliberately *don't* rasterise the canvas — that would force a
 * full re-render every selection change and still couldn't see through
 * groups reliably. A bbox/center sample is good enough for a contrast
 * heuristic on a flat design layout.
 */
export function findBackgroundUnderObject(
  obj: ObjectLike | null | undefined,
  canvas: CanvasLike | null | undefined,
  docBackground: string,
): string {
  const canvasBg = typeof canvas?.backgroundColor === 'string' ? canvas.backgroundColor : docBackground;
  if (!obj || !canvas?.getObjects) return canvasBg || docBackground;

  const objects = canvas.getObjects();
  if (!objects || objects.length === 0) return canvasBg || docBackground;

  const objRect = obj.getBoundingRect?.();
  if (!objRect) return canvasBg || docBackground;
  const cx = objRect.left + objRect.width / 2;
  const cy = objRect.top + objRect.height / 2;

  // We want the topmost object *below* `obj` in stacking order that covers
  // the centre point. `getObjects` returns bottom-first, so we iterate from
  // the end downward until we hit `obj`, then any remaining candidates are
  // strictly below.
  const idx = objects.indexOf(obj);
  if (idx <= 0) return canvasBg || docBackground; // no object below

  for (let i = idx - 1; i >= 0; i--) {
    const cand = objects[i];
    const rect = cand.getBoundingRect?.();
    if (!rect) continue;
    if (cx < rect.left || cx > rect.left + rect.width) continue;
    if (cy < rect.top || cy > rect.top + rect.height) continue;
    const fill = cand.fill;
    if (typeof fill === 'string' && fill.trim()) {
      // Skip non-colour fills (gradients/patterns serialised as objects
      // would not be strings, so this naturally filters them out).
      const parsed = hexToRgb(fill);
      if (parsed) return fill;
    }
  }

  return canvasBg || docBackground;
}
