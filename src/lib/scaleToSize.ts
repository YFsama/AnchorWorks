/**
 * Resize to exact size (sign-shop "make this 300 mm wide"). Scales the active
 * selection — single object, group, or multi-selection — so its bounding box
 * matches a target width/height in mm, optionally keeping the aspect ratio.
 * Scaling is about the selection's centre so it stays put.
 */
import { getCanvas, pushHistory } from './canvasEngine';

const MM_TO_PX = 3.7795;

/** Current selection bounding size in mm, or null if nothing is selected. */
export function selectionSizeMm(): { w: number; h: number } | null {
  const a = getCanvas()?.getActiveObject();
  if (!a) return null;
  const b = a.getBoundingRect();
  return { w: b.width / MM_TO_PX, h: b.height / MM_TO_PX };
}

/**
 * Scale the selection to the given target width/height (mm). A null dimension is
 * left to follow from the other (when `lock`) or unchanged. Returns true if it
 * resized.
 */
export function scaleSelectionToSize(wMm: number | null, hMm: number | null, lock: boolean): boolean {
  const canvas = getCanvas();
  const a = canvas?.getActiveObject();
  if (!canvas || !a) return false;
  const b = a.getBoundingRect();
  if (b.width <= 0 || b.height <= 0) return false;

  const targetW = wMm != null && wMm > 0 ? wMm * MM_TO_PX : null;
  const targetH = hMm != null && hMm > 0 ? hMm * MM_TO_PX : null;
  if (targetW == null && targetH == null) return false;

  let fx: number, fy: number;
  if (lock) {
    const f = targetW != null ? targetW / b.width : targetH! / b.height;
    fx = fy = f;
  } else {
    fx = targetW != null ? targetW / b.width : 1;
    fy = targetH != null ? targetH / b.height : 1;
  }
  if (Math.abs(fx - 1) < 1e-6 && Math.abs(fy - 1) < 1e-6) return false;

  const centre = a.getCenterPoint();
  a.scaleX = (a.scaleX ?? 1) * fx;
  a.scaleY = (a.scaleY ?? 1) * fy;
  a.setPositionByOrigin(centre, 'center', 'center');
  a.setCoords();
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
