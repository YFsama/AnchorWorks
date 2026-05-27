/**
 * Stroke alignment — Illustrator/Figma/Affinity-style "inside / center / outside"
 * stroke placement, implemented on top of Fabric.js v6.
 *
 * ------------------------------------------------------------------
 * IMPORTANT — visual approximation, not a spec-compliant feature.
 * ------------------------------------------------------------------
 * Fabric (and the underlying HTML5 2D canvas) ALWAYS draws strokes centered
 * on the geometry: half the stroke spills outside the path, half spills
 * inside. SVG/CSS specs allow `vector-effect`-style controls for inside /
 * outside / center placement, but Fabric does not expose this.
 *
 * To simulate the three modes we use the standard SVG hacks:
 *
 *   • center   — restore the original strokeWidth and undo any
 *                clipPath/sibling we previously attached. This is the
 *                native Fabric behaviour.
 *
 *   • inside   — double the stroke width AND attach a clipPath that is a
 *                clone of the object's own outline. The half of the (now
 *                doubled) stroke that would protrude outside the path is
 *                clipped away, leaving the appearance of an inside-only
 *                stroke of the original requested width.
 *                The clipPath clone is tagged with `__alignClip: true` so
 *                we can find and remove it when the user switches modes.
 *
 *   • outside  — pragmatic v1: just double the stroke width without
 *                clipping. Visually the stroke grows outward MORE than it
 *                grows inward (because the inner half is hidden behind
 *                the object's fill in normal compositing), giving an
 *                "outside-leaning" look. This is NOT pixel-perfect with
 *                Illustrator's outside-stroke — see follow-up cycle for
 *                the cleaner "duplicate-behind via destination-over"
 *                approach mentioned in the README.
 *
 * Known limitations / quirks:
 *   - The inside-stroke clipPath approach can produce faint AA seams at
 *     very low zoom levels. Acceptable for a v1.
 *   - Selection bounds, hit-testing and SVG export all respect clipPath,
 *     so the round-trip through save/load remains correct.
 *   - We stash the original strokeWidth on the object as
 *     `__originalStrokeWidth`. Any later edit to strokeWidth that goes
 *     through the existing canvasEngine helpers needs to be applied AS
 *     IF the user is editing the original (un-doubled) width. For v1 we
 *     simply require the user to flip back to `center` before adjusting
 *     stroke weight, then re-apply the alignment.
 *   - We tag added auxiliaries (`__alignClip`, `__alignShadow`) so we
 *     can safely strip them on a mode switch.
 */

import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { logger } from './debug';

export type StrokeAlign = 'center' | 'inside' | 'outside';

type FabricObject = fabric.FabricObject;

/**
 * Custom-prop carrier. Fabric objects are loose dictionaries at runtime,
 * but TypeScript's strict typing of `FabricObject` doesn't know about our
 * augmented fields. This helper narrows the type for assignments below.
 */
type AlignedObject = FabricObject & {
  __originalStrokeWidth?: number;
  __strokeAlign?: StrokeAlign;
  __alignClip?: boolean;
  __alignShadow?: boolean;
};

/** Read the alignment we previously stashed on the object (defaults to 'center'). */
export function getStrokeAlign(obj: FabricObject | null | undefined): StrokeAlign {
  if (!obj) return 'center';
  return (obj as AlignedObject).__strokeAlign ?? 'center';
}

/**
 * Strip any alignment-related auxiliary state from `obj` (clipPath added
 * by us, "stroke shadow" sibling, doubled width). After this call, the
 * object's stroke width is exactly `__originalStrokeWidth` (or the current
 * strokeWidth if no original was stashed yet).
 */
function resetAlignment(obj: AlignedObject): void {
  const canvas = getCanvas();

  // Restore original strokeWidth if we had stashed it.
  const orig = obj.__originalStrokeWidth;
  if (typeof orig === 'number') {
    obj.set('strokeWidth', orig);
  }

  // Remove our clipPath if we put one there.
  const cp = obj.clipPath as AlignedObject | undefined;
  if (cp && cp.__alignClip) {
    obj.set({ clipPath: undefined } as Partial<FabricObject>);
  }

  // Remove our sibling "shadow" stroke object, if any.
  if (canvas) {
    const shadows = canvas.getObjects().filter((o) => {
      const ao = o as AlignedObject & { __alignShadowFor?: FabricObject };
      return ao.__alignShadow === true && ao.__alignShadowFor === obj;
    });
    shadows.forEach((s) => canvas.remove(s));
  }
}

/**
 * Apply `align` to the current Fabric active selection.
 * Pushes one history entry covering all affected objects.
 */
export function applyStrokeAlign(align: StrokeAlign): void {
  const canvas = getCanvas();
  if (!canvas) return;

  const objs = canvas.getActiveObjects() as AlignedObject[];
  if (!objs.length) return;

  // Track async work (clipPath cloning is promise-based in Fabric v6).
  const pending: Promise<unknown>[] = [];

  for (const obj of objs) {
    // Capture the "true" strokeWidth on first touch — i.e. the value the
    // user thinks they typed, before we doubled anything for inside/outside.
    if (typeof obj.__originalStrokeWidth !== 'number') {
      obj.__originalStrokeWidth = obj.strokeWidth ?? 0;
    }
    const original = obj.__originalStrokeWidth ?? 0;

    // Always reset before re-applying — keeps the implementation idempotent
    // and means we never double-double the stroke when toggling between
    // inside and outside.
    resetAlignment(obj);

    if (align === 'center') {
      obj.__strokeAlign = 'center';
      obj.setCoords();
      continue;
    }

    if (align === 'inside') {
      obj.__strokeAlign = 'inside';
      // Empty strokes — nothing to clip / nothing the user would see.
      if (!original || !obj.stroke) {
        obj.setCoords();
        continue;
      }
      obj.set('strokeWidth', original * 2);

      // Clone the object's shape and use it as a clipPath. The clone must
      // sit in the same local coord space as the object (so the clip moves
      // with the object), so we use `absolutePositioned: false`. Fill /
      // stroke on the clipPath itself are irrelevant — Fabric only uses
      // the path geometry.
      const p = (obj.clone() as unknown as Promise<FabricObject>).then((cloneObj) => {
        const clip = cloneObj as AlignedObject;
        clip.set({
          // Center the clip clone at (0,0) of the object's own bounding
          // box — Fabric's clipPath convention.
          left: -(obj.width ?? 0) / 2,
          top: -(obj.height ?? 0) / 2,
          originX: 'left',
          originY: 'top',
          // No transform on the clip — it inherits the parent's transform.
          angle: 0,
          scaleX: 1,
          scaleY: 1,
          skewX: 0,
          skewY: 0,
          fill: '#000',
          stroke: '',
          strokeWidth: 0,
          absolutePositioned: false,
        } as Partial<FabricObject>);
        clip.__alignClip = true;
        obj.set({ clipPath: clip } as Partial<FabricObject>);
        obj.setCoords();
        canvas.requestRenderAll();
      }).catch((err: unknown) => {
        // If cloning fails, fall back to plain double-stroke so the user
        // still sees something happen.
        logger.error('strokeAlign', `inside-clone failed: ${err instanceof Error ? err.message : String(err)}`);
      });
      pending.push(p);
      continue;
    }

    // align === 'outside'
    obj.__strokeAlign = 'outside';
    if (!original || !obj.stroke) {
      obj.setCoords();
      continue;
    }
    // Pragmatic v1: just widen the stroke. Half of the extra width spills
    // outside (which is what we want), half is hidden behind the fill
    // (which is what we don't want, but is invisible for opaque fills).
    // For transparent fills this approximation breaks down — note for the
    // follow-up cycle.
    obj.set('strokeWidth', original * 2);
    obj.setCoords();
  }

  // Commit + history. If we had async work, wait for it; otherwise commit
  // immediately to keep the sync path snappy.
  if (pending.length) {
    Promise.all(pending).then(() => {
      canvas.requestRenderAll();
      pushHistory();
    });
  } else {
    canvas.requestRenderAll();
    pushHistory();
  }
}
