/**
 * Layered-vinyl trap (auto-trap) — cutPrepActions-style store action.
 *
 * Stacked vinyl layers never register perfectly: application tape lift,
 * hand pressure and carrier stretch land an upper layer ~1 mm off its
 * neighbour. The layered-vinyl TRAP convention (docs/research-sticker-
 * printcut-2026-10.md, "Layered-vinyl extras": auto-trap +0.5–1 mm overlap
 * on upper layers) is to grow every layer EXCEPT the bottom outward by
 * 0.5–1 mm, so the intentional overlap swallows the misregistration — a
 * ~1 mm registration error shows as a slightly thicker colour band, never
 * as a gap of uncut carrier between two colours.
 *
 * Follows the cutPrepActions conventions: read the store, mutate once, one
 * pushHistory for the whole action, toast, return the affected count.
 */
import { useEditor, type CutPath } from '../store/editor';
import { offsetPolyline } from './cutContour';
import { buildVinylLayers } from './layerJobs';
import { pushHistory } from './canvasEngine';
import { toast } from './toast';

type T = (key: string) => string;

/** applyLayerTrap options. */
export interface LayerTrapOptions {
  /** Compute the would-be-trapped count WITHOUT touching the store or
   *  history and without any toast — silent by design, because the caller
   *  (the PlotterDialog trap preview) renders the number itself. */
  dryRun?: boolean;
}

/**
 * Rebuild the job with every trappable path offset outward by `trapMm` —
 * the shared engine of the real action and the dry-run preview, so the
 * reported count can never drift from what a real run would do. Trappable =
 * closed, non-regmark, coloured, and above the bottom layer; a trappable
 * path whose offset collapses to nothing is kept as-is, and one that
 * self-intersection cleanup splits becomes one cut path per ring.
 */
function trapRebuild(
  cutPaths: CutPath[],
  trappedColors: Set<string>,
  trapMm: number,
): { rebuilt: CutPath[]; trapped: number } {
  const rebuilt: CutPath[] = [];
  let trapped = 0;
  for (const path of cutPaths) {
    // regmark kind excluded defensively (layerJobs' guard: marks are shared
    // geometry, never trapped, even if a stale blob somehow coloured one).
    const trappable = path.closed && path.kind !== 'regmark' && path.color !== undefined && trappedColors.has(path.color);
    // Outward offsets never vanish (the guard in offsetPolyline only fires
    // on inward offsets), but a degenerate ring can still come back empty —
    // skip it rather than deleting the shape.
    const rings = trappable ? offsetPolyline(path.points, trapMm, true, { join: 'round' }) : null;
    if (!rings || rings.length === 0) {
      rebuilt.push(path);
      continue;
    }
    // Self-intersection cleanup can split a pathological ring into several
    // pieces — each becomes its own cut path, in place.
    for (const ring of rings) {
      rebuilt.push({ ...path, points: ring });
      trapped += 1;
    }
  }
  return { rebuilt, trapped };
}

/**
 * Offset every upper vinyl layer's closed rings outward by `trapMm`
 * (round joins, so the extra millimetre hugs corners smoothly). The
 * bottom layer (order 1), open paths, regmarks and colourless geometry
 * (weed borders) are untouched — the bottom of the stack is the surface
 * everything else registers against, and shared marks must keep cutting
 * identically into every sheet. Document order is preserved: the original
 * cutPaths array is iterated and only non-bottom-colour closed paths are
 * replaced. One pushHistory for the whole trap. Returns the number of
 * trapped paths (rings that replaced a source path).
 *
 * With `opts.dryRun` the same trapRebuild runs but nothing is applied:
 * no store write, no history step, no toast — just the would-be count,
 * for the caller to preview.
 */
export function applyLayerTrap(t: T, trapMm = 0.5, opts?: LayerTrapOptions): number {
  const dryRun = opts?.dryRun === true;
  const editor = useEditor.getState();
  const layers = buildVinylLayers(editor.cutPaths);
  if (layers.length < 2) {
    if (!dryRun) toast.warn(t('Trap needs at least two colour layers.'), { title: t('Trap layers') });
    return 0;
  }
  // Everything above the bottom layer gets the intentional overlap.
  const trappedColors = new Set(layers.filter(layer => layer.order > 1).map(layer => layer.color));

  const { rebuilt, trapped } = trapRebuild(editor.cutPaths, trappedColors, trapMm);
  if (dryRun) return trapped;

  if (trapped === 0) {
    toast.warn(t('No closed paths above the bottom layer to trap.'), { title: t('Trap layers') });
    return 0;
  }

  editor.setCutPaths(rebuilt);
  pushHistory(); // one undo step for the whole trap
  toast.success(`${trapped} ${t('paths trapped')} · +${trapMm} mm`, { title: t('Trap layers') });
  return trapped;
}
