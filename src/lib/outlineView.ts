// Illustrator-style "Outline View" preview mode.
//
// When enabled, every Fabric object on the canvas is rendered as a thin
// wireframe — no fills, no shadows, a single accent-coloured 1px stroke.
// This is great for spotting overlapping geometry, debugging hidden masks,
// hunting stray paths, and exporting clean line drawings.
//
// Implementation notes:
// - The original {fill, stroke, strokeWidth, shadow, opacity} of each object
//   is stashed on a hidden `__originalStyle` property so we can restore it
//   verbatim when outline mode is turned off.
// - `strokeWidth` is set in scene-px but normalised against the current zoom
//   so it stays visually ~1px on screen.
// - We subscribe to the canvas `object:added` event so newly added objects
//   automatically pick up the outline treatment while the mode is on.
// - State lives in module scope; this is session-only and intentionally
//   persists nothing.

import type * as fabric from 'fabric';
import { getCanvas, subscribeViewport } from './canvasEngine';
import { useEditor } from '../store/editor';
import { readToken } from './tokens';

// Read the live `--color-accent2` token instead of hardcoding so the wireframe
// stays readable in both dark (cyan) and light (dark-teal) themes.
const outlineStroke = () => readToken('--color-accent2', '#5ac8d8');
const TEXT_OUTLINE_OPACITY = 0.85; // text stays readable but de-emphasised

type Stashable = {
  fill?: unknown;
  stroke?: unknown;
  strokeWidth?: number;
  shadow?: unknown;
  opacity?: number;
};

type WithStash = fabric.FabricObject & {
  __originalStyle?: Stashable;
  excludeFromExport?: boolean;
};

let outlineOn = false;
let unsubAdded: (() => void) | null = null;
let unsubViewport: (() => void) | null = null;

type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();

export function isOutlineMode(): boolean {
  return outlineOn;
}

export function subscribeOutlineMode(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit() {
  listeners.forEach(fn => fn(outlineOn));
}

/**
 * Compute the scene-px stroke width that renders at ~1 device-px on screen,
 * given the current canvas zoom. Clamped so we never produce 0.
 */
function onePxStroke(canvas: fabric.Canvas): number {
  const z = canvas.getZoom() || 1;
  return Math.max(1 / z, 0.001);
}

/**
 * Stash + apply outline styling to a single object. Skips overlay objects
 * (excludeFromExport) so things like path-edit handles keep their own paint.
 */
function applyOutlineTo(o: WithStash, canvas: fabric.Canvas) {
  if (o.excludeFromExport) return;
  // Don't double-stash. If we already have an __originalStyle, the object was
  // already converted; just refresh the strokeWidth in case zoom changed.
  if (!o.__originalStyle) {
    o.__originalStyle = {
      fill: o.fill,
      stroke: o.stroke,
      strokeWidth: o.strokeWidth,
      shadow: o.shadow,
      opacity: o.opacity,
    };
  }
  const sw = onePxStroke(canvas);
  // Text objects: keep a faint fill so glyphs remain legible (a true outline
  // of text glyphs would require per-character path conversion). Other shapes
  // get a true wireframe with transparent fill.
  const isText = o.type === 'i-text' || o.type === 'text' || o.type === 'textbox';
  const stroke = outlineStroke();
  if (isText) {
    o.set({
      fill: stroke,
      stroke,
      strokeWidth: sw,
      shadow: null,
      opacity: TEXT_OUTLINE_OPACITY,
    });
  } else {
    o.set({
      fill: 'transparent',
      stroke,
      strokeWidth: sw,
      shadow: null,
      opacity: 1,
    });
  }
}

/**
 * Restore the previously stashed style and clear the stash.
 */
function restoreOutlineFrom(o: WithStash) {
  if (!o.__originalStyle) return;
  const s = o.__originalStyle;
  o.set({
    fill: s.fill as fabric.TFiller | string | null | undefined,
    stroke: s.stroke as fabric.TFiller | string | null | undefined,
    strokeWidth: s.strokeWidth,
    shadow: s.shadow as fabric.Shadow | null | undefined,
    opacity: s.opacity,
  });
  delete o.__originalStyle;
}

/**
 * Walk every object and re-apply the scene-px stroke width. Used when the
 * viewport zoom changes so the outline stays a constant 1px on screen.
 */
function refreshStrokeWidths() {
  const canvas = getCanvas();
  if (!canvas || !outlineOn) return;
  const sw = onePxStroke(canvas);
  let dirty = false;
  canvas.getObjects().forEach((raw) => {
    const o = raw as WithStash;
    if (o.excludeFromExport || !o.__originalStyle) return;
    if (o.strokeWidth !== sw) {
      o.set({ strokeWidth: sw });
      dirty = true;
    }
  });
  if (dirty) canvas.requestRenderAll();
}

export function setOutlineMode(on: boolean): void {
  const canvas = getCanvas();
  if (!canvas) {
    // Still flip the flag + store so a future canvas init can pick it up.
    outlineOn = on;
    useEditor.getState().setOutlineMode(on);
    emit();
    return;
  }

  if (on === outlineOn) return;
  outlineOn = on;

  if (on) {
    canvas.getObjects().forEach((o) => applyOutlineTo(o as WithStash, canvas));
    // Wire up auto-style for any newly added object while mode is on.
    if (!unsubAdded) {
      const handler = (e: { target?: fabric.FabricObject }) => {
        if (!e.target) return;
        const c = getCanvas();
        if (!c) return;
        applyOutlineTo(e.target as WithStash, c);
        c.requestRenderAll();
      };
      canvas.on('object:added', handler);
      unsubAdded = () => { canvas.off('object:added', handler); };
    }
    // Keep stroke at ~1px on screen as the user zooms.
    if (!unsubViewport) {
      unsubViewport = subscribeViewport(() => refreshStrokeWidths());
    }
  } else {
    canvas.getObjects().forEach((o) => restoreOutlineFrom(o as WithStash));
    unsubAdded?.();
    unsubAdded = null;
    unsubViewport?.();
    unsubViewport = null;
  }

  canvas.requestRenderAll();
  useEditor.getState().setOutlineMode(on);
  emit();
}
