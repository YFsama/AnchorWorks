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

function overlaps(box: Box, artboard: Box): boolean {
  return !(box.left + box.width < artboard.left
    || box.left > artboard.left + artboard.width
    || box.top + box.height < artboard.top
    || box.top > artboard.top + artboard.height);
}

function activeArtboardId(): string | null {
  const canvas = getCanvas();
  const active = canvas?.getActiveObject();
  if (!active) return null;
  const activeBox = active.getBoundingRect();
  return getArtboards().find((artboard) => overlaps(activeBox, {
    left: artboard.x,
    top: artboard.y,
    width: artboard.width,
    height: artboard.height,
  }))?.id ?? null;
}

function objectsOnArtboard(objs: fabric.FabricObject[], artboardId: string): fabric.FabricObject[] {
  const artboard = getArtboards().find((item) => item.id === artboardId);
  if (!artboard) return [];
  const artboardBox = { left: artboard.x, top: artboard.y, width: artboard.width, height: artboard.height };
  return objs.filter((object) => overlaps(object.getBoundingRect(), artboardBox));
}

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

/** Fit the requested artboard to all artwork or just the selection. Returns true
 *  on success. `marginMm` pads the artboard around the content. */
export function fitArtboardToContent(scope: 'selection' | 'all', marginMm = 5, artboardId?: string): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const abs = getArtboards();
  const target = artboardId ?? abs[0]?.id;
  if (!target) return false;
  const objs = scope === 'selection' ? canvas.getActiveObjects() : canvas.getObjects();
  const bbox = unionBBox(objs);
  if (!bbox) return false;
  fitArtboard(target, bbox, marginMm * MM_TO_PX);
  return true;
}

/** Fit the active object's artboard to artwork intersecting that artboard or to the current selection. */
export function fitActiveArtboardToContent(scope: 'selection' | 'all', marginMm = 5): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const target = activeArtboardId();
  if (!target) return false;
  const objs = scope === 'selection' ? canvas.getActiveObjects() : objectsOnArtboard(canvas.getObjects(), target);
  const bbox = unionBBox(objs);
  if (!bbox) return false;
  fitArtboard(target, bbox, marginMm * MM_TO_PX);
  return true;
}
