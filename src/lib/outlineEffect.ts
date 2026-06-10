/**
 * Multi-outline (SignMaster "Outline" / sign-text contour effect).
 *
 * Stacks N progressively larger silhouette copies of each selected object
 * BEHIND it — each a solid stroke-painted clone — so the original reads with
 * one or more coloured borders around it. Works for ANY object (text, path,
 * shapes) without vectorising glyphs: the trick is `paintFirst: 'stroke'` with
 * `fill === stroke`, so a clone with a fat stroke is a same-colour silhouette
 * grown outward by half the stroke width.
 *
 * `colors[0]` is the innermost (thinnest) border, `colors[N-1]` the outermost
 * (thickest). Width is uniform per ring (mm).
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

const MM_TO_PX = 3.7795; // 96dpi

export async function addOutlineEffectToCanvas(
  canvas: fabric.Canvas,
  objects: fabric.FabricObject[],
  colors: string[],
  widthMm: number,
  commitHistory = true,
): Promise<number> {
  if (objects.length === 0 || colors.length === 0 || widthMm <= 0) return 0;
  const wPx = widthMm * MM_TO_PX;
  let added = 0;

  for (const obj of objects) {
    const n = colors.length;
    // Outermost ring first so it lands lowest; inner rings, added after, paint
    // on top of it, leaving each outer colour visible as a band.
    for (let r = n - 1; r >= 0; r--) {
      const extentPx = (r + 1) * wPx; // outward growth of this ring's edge
      try {
        const clone = await obj.clone();
        clone.set({
          stroke: colors[r],
          fill: colors[r],
          strokeWidth: 2 * extentPx, // stroke straddles the edge → ½ grows outward
          paintFirst: 'stroke',
          strokeLineJoin: 'round',
          strokeLineCap: 'round',
          shadow: null,
          selectable: true,
          evented: true,
        });
        clone.setCoords();
        canvas.add(clone);
        added++;
      } catch {
        /* un-clonable object — skip this ring */
      }
    }
    // Keep the original art on top of its own outlines.
    canvas.bringObjectToFront(obj);
  }

  if (added > 0) {
    canvas.requestRenderAll();
    if (commitHistory) pushHistory();
  }
  return added;
}

export async function addOutlineEffect(
  objects: fabric.FabricObject[],
  colors: string[],
  widthMm: number,
): Promise<number> {
  const canvas = getCanvas();
  return canvas ? addOutlineEffectToCanvas(canvas, objects, colors, widthMm) : 0;
}
