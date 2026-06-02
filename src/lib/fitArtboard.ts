/**
 * Fit Artboard to Artwork / Selection (Illustrator Object→Artboards→Fit to
 * Artwork Bounds / Fit to Selected Art) — resize the first artboard so it
 * tightly wraps the artwork (or just the selection) with a margin.
 */
import type * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { getArtboards, fitArtboard } from './artboards';

const MM_TO_PX = 3.7795;

interface Box { left: number; top: number; width: number; height: number; }

/** Union bounding box of `objs` in scene px, or null if none qualify. */
function unionBBox(objs: fabric.FabricObject[]): Box | null {
  const rects = objs
    .filter((o) => !(o as { excludeFromExport?: boolean }).excludeFromExport)
    .map((o) => o.getBoundingRect());
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** Fit the first artboard to all artwork or just the selection. Returns true on
 *  success. `marginMm` pads the artboard around the content. */
export function fitArtboardToContent(scope: 'selection' | 'all', marginMm = 5): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const abs = getArtboards();
  if (abs.length === 0) return false;
  const objs = scope === 'selection' ? canvas.getActiveObjects() : canvas.getObjects();
  const bbox = unionBBox(objs);
  if (!bbox) return false;
  fitArtboard(abs[0].id, bbox, marginMm * MM_TO_PX);
  return true;
}
