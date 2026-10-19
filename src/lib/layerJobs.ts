/**
 * Layered-vinyl job splitting — one cut job per colour of vinyl.
 *
 * A multi-colour vinyl design is cut one sheet at a time and stacked: every
 * colour becomes its own plotter job, and the layers are registered against
 * each other afterwards. Two conventions make that work here:
 *
 *   • Shared geometry rides every layer. Colourless paths (registration
 *     marks, weed borders — anything without a `color`) plus regmarks are
 *     appended to EVERY layer's `paths`: the marks cut identically into each
 *     sheet, so aligning the stack is just matching marks. This is the
 *     layered-vinyl alignment convention (same trick separations use for
 *     plate registration).
 *   • Largest layer first. Layers are ordered by their own colour's total
 *     ring area, descending — the biggest shapes go on the bottom of the
 *     stack, `order` 1 = bottom.
 *
 * Pure and synchronous over mm-space CutPaths; no canvas/DOM.
 */
import { polyArea } from './cutOptimize';
import type { CutPath } from '../store/editor';

export interface VinylLayer {
  /** Source swatch colour this layer cuts (hex). */
  color: string;
  /** Geometry that ships with this layer's job: this colour's cut paths +
   *  every shared colourless path (regmarks, weed borders). */
  paths: CutPath[];
  /** This colour's own path count — shared colourless paths excluded. */
  cutCount: number;
  /** Total shoelace area of this colour's closed rings (mm²); shared
   *  geometry is excluded so it can't skew the bottom-layer ranking. */
  areaMm2: number;
  /** 1-based stacking order; 1 = bottom (largest area first). */
  order: number;
}

/** Colourless paths and regmarks cut into every layer (see module doc). */
function isShared(path: CutPath): boolean {
  return !path.color || path.kind === 'regmark';
}

/**
 * Split a job's cut paths into one layer per colour. Non-regmark paths
 * without a colour (e.g. a manually added weed border) have no vinyl to
 * belong to, so they never form a layer of their own — they join the shared
 * set and cut with every layer instead. Regmarks are always shared even if
 * a stale blob somehow coloured one.
 *
 * Returns [] for empty input, one layer for a single-colour job; two or
 * more layers is what makes the PlotterDialog "Layers" section appear.
 */
export function buildVinylLayers(cutPaths: CutPath[]): VinylLayer[] {
  const shared = cutPaths.filter(isShared);
  const byColor = new Map<string, CutPath[]>();
  for (const p of cutPaths) {
    const color = p.color;
    // Local narrowing — isShared()'s checks don't flow through to p.color.
    if (color === undefined || p.kind === 'regmark') continue;
    const list = byColor.get(color);
    if (list) list.push(p);
    else byColor.set(color, [p]);
  }
  const layers = Array.from(byColor, ([color, own]) => ({
    color,
    cutCount: own.length,
    areaMm2: own.reduce((sum, p) => sum + (p.closed ? polyArea(p.points) : 0), 0),
    // This colour's geometry first, then the shared marks — the per-colour
    // paths keep document order, shared marks always cut.
    paths: [...own, ...shared],
  }));
  // Largest area = bottom of the stack = order 1. Ties keep insertion
  // (first-seen colour) order — Array#sort is stable.
  layers.sort((a, b) => b.areaMm2 - a.areaMm2);
  return layers.map((layer, i) => ({ ...layer, order: i + 1 }));
}
