/**
 * Glyph-level Text→Outlines: place real font beziers using fabric's own layout.
 *
 * fabric 6.9.1 measures and renders text through per-instance caches that are
 * public on the object: after `text.initDimensions()` the grapheme boxes
 * (`__charBounds`, kerning + charSpacing included), the per-line impl heights
 * (`__lineHeights`) and `_getLineLeftOffset` describe EXACTLY where the canvas
 * paints each grapheme. This module replays that placement for fontkit glyph
 * outlines instead:
 *
 *   - pen X of grapheme j in line i  = `_getLineLeftOffset(i) + box.left`
 *     (the render loop's running `left` reproduces `box.left` verbatim);
 *   - baseline Y of line i           = -height/2 + Σ_{j<i} heightOfLine(j)
 *                                       + heightOfLineImpl(i)·(1 - _fontSizeFraction)
 *     (that is `_renderTextCommon` + `_renderChars`'s `top` adjustment);
 *   - font space is y-UP on baseline 0, so screen Y = baseline − y·s with
 *     s = fontSize / unitsPerEm.
 *
 * Quadratic TrueType segments are elevated to cubics (exact, barycentric), so
 * every font — CFF or glyf — emits the same M/L/C/Z grammar, curves included
 * (the raster-trace pipeline could only ever produce L).
 *
 * Pure module: no DOM, no fontkit import (the orchestrator owns lazy loading).
 * Returns the even-odd compound SVG path data in the TEXT OBJECT's local
 * coordinate space (origin at the layout box center, like fabric's own render),
 * or null when anything about the layout can't be replayed faithfully — the
 * caller then stays on the raster-trace pipeline.
 */
import type { Font, PathCommand } from 'fontkit';
import type { Text } from 'fabric';

/** fabric's default when a line has no explicit heights yet (`_fontSizeMult`). */
const FONT_SIZE_MULT_FALLBACK = 1.13;

/** Affine 6-tuple [a,b,c,d,e,f] — fabric's TMat2D layout. */
export type AffineMatrix = readonly [number, number, number, number, number, number];

const n = (v: number) => v.toFixed(2);

/**
 * Build the compound outline d-string for `text` using `font`'s glyph vectors,
 * in the text object's local (render) coordinate space.
 *
 * Preconditions the caller (textToOutline) normally guarantees — but this
 * function re-checks the layout-affecting ones and returns null rather than
 * emit misplaced ink: no justify, no path, ltr, no per-character styles, and
 * every grapheme must map to a real glyph in the font (a code point the font
 * doesn't cover would make the canvas paint tofu/fallback instead).
 *
 * KNOWN WINDOW — standard ligatures (fi, fl, …): at charSpacing 0 fabric
 * paints whole lines through one fillText call, so the canvas shaper may
 * merge character pairs into a ligature glyph while we place per-code-point
 * glyphs. Sign/cutting display fonts rarely carry liga tables, and the
 * per-pair deviation stays under the 1 css px equivalence budget on such
 * fonts; a fontkit `layout()` shaping pass is the upgrade path if a liga
 * font ever needs exact outlines.
 */
export function glyphOutlinePath(
  font: Font,
  text: Text,
  transform?: AffineMatrix,
): string | null {
  if (text.textAlign.includes('justify')) return null;
  if (text.path) return null;
  if (text.direction !== 'ltr') return null;
  if (!text.isEmptyStyles()) return null;

  let lines: string[][];
  try {
    text.initDimensions(); // refresh __charBounds / __lineHeights / width / height
    lines = text._textLines;
  } catch {
    return null;
  }
  const bounds = text.__charBounds;
  if (!lines || !bounds || lines.length === 0) return null;

  const upem = font.unitsPerEm;
  if (!upem || upem <= 0) return null;
  const s = text.fontSize / upem; // font units → local px
  const fraction = text._fontSizeFraction;
  const totalHeight = text.height; // = calcTextHeight() after initDimensions

  let d = '';
  let lineTop = -totalHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    const graphemes = lines[i];
    // heightOfLineImpl = the font-size-part height fabric caches per line
    // (calcTextHeight populated __lineHeights for every line just now).
    const impl = text.__lineHeights[i] ?? text.fontSize * FONT_SIZE_MULT_FALLBACK;
    const baseline = lineTop + impl * (1 - fraction);
    const lineLeft = text._getLineLeftOffset(i);

    for (let j = 0; j < graphemes.length; j++) {
      const grapheme = graphemes[j];
      const cps = Array.from(grapheme);
      if (cps.length !== 1) return null; // combining sequences: can't replay faithfully
      const glyph = font.glyphForCodePoint(cps[0].codePointAt(0) ?? 0);
      if (!glyph || glyph.id === 0) return null; // canvas would paint tofu/fallback

      const box = bounds[i]?.[j];
      if (!box) return null;
      // Only PER-CHARACTER deltaY shifts the canvas paint (fabric's
      // _renderChar reads the raw per-char style); object-level deltaY does
      // NOT shift rendering, so bail rather than mis-place the glyph.
      if (box.deltaY) return null;
      const penX = lineLeft + box.left; // render-pen X, kerning + charSpacing included
      const baselineY = baseline; // _renderChar: top += per-char deltaY (bailed above)

      d += glyphContours(glyph.path.commands, s, penX, baselineY, transform);
    }
    lineTop += impl * text.lineHeight; // getHeightOfLine(i)
  }
  return d.length > 0 ? d : null;
}

/**
 * Transform one glyph's font-unit commands into placed local-space SVG path
 * data (y flipped onto the baseline, quadratic elevated to cubic). Whitespace
 * glyphs have no commands and simply contribute nothing.
 */
function glyphContours(
  commands: PathCommand[],
  s: number,
  penX: number,
  baselineY: number,
  transform?: AffineMatrix,
): string {
  // Font-space (x up on the right, y UP) → local px (y DOWN from baseline),
  // then through the optional output affine (e.g. the text object's own matrix
  // for page-space output — the same transform canvas rendering applies).
  const map = (lx: number, ly: number): [number, number] =>
    transform
      ? [transform[0] * lx + transform[2] * ly + transform[4], transform[1] * lx + transform[3] * ly + transform[5]]
      : [lx, ly];
  // Font unit (x, y-up) → transformed output point. Coordinates map as PAIRS
  // because a general affine (e.g. rotated text) mixes x into y.
  const tp = (x: number, y: number): [number, number] => map(penX + x * s, baselineY - y * s);

  let out = '';
  let cx = 0;
  let cy = 0; // current on-curve point, transformed space
  let open = false;
  for (const cmd of commands) {
    const a = cmd.args;
    switch (cmd.command) {
      case 'moveTo': {
        if (open) out += ' Z';
        [cx, cy] = tp(a[0], a[1]);
        out += ` M${n(cx)} ${n(cy)}`;
        open = true;
        break;
      }
      case 'lineTo': {
        [cx, cy] = tp(a[0], a[1]);
        out += ` L${n(cx)} ${n(cy)}`;
        open = true;
        break;
      }
      case 'quadraticCurveTo': {
        // Elevate Q(x1,y1 → x,y) to the exact cubic through the same curve:
        // controls at 2/3 of the way from each endpoint to the off-curve point.
        const [x1, y1] = tp(a[0], a[1]);
        const [x, y] = tp(a[2], a[3]);
        const c1x = cx + (2 / 3) * (x1 - cx);
        const c1y = cy + (2 / 3) * (y1 - cy);
        const c2x = x + (2 / 3) * (x1 - x);
        const c2y = y + (2 / 3) * (y1 - y);
        out += ` C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(x)} ${n(y)}`;
        cx = x;
        cy = y;
        open = true;
        break;
      }
      case 'bezierCurveTo': {
        const [x1, y1] = tp(a[0], a[1]);
        const [x2, y2] = tp(a[2], a[3]);
        [cx, cy] = tp(a[4], a[5]);
        out += ` C${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(cx)} ${n(cy)}`;
        open = true;
        break;
      }
      case 'closePath': {
        if (open) out += ' Z';
        open = false;
        break;
      }
    }
  }
  if (open) out += ' Z';
  return out;
}
