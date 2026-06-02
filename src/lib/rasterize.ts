/**
 * Rasterize selection (Illustrator Object→Rasterize) — replace the selected
 * vector art with a single embedded PNG image of the same on-screen size,
 * rendered at `multiplier`× for crispness. Handy for flattening heavy artwork or
 * locking down an appearance. The originals are removed.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

/** True when something is selected to rasterize. */
export function canRasterize(): boolean {
  const c = getCanvas();
  return !!c && c.getActiveObjects().length > 0;
}

export async function rasterizeSelection(multiplier = 2): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = canvas.getActiveObjects();
  if (objs.length === 0) return false;

  // Bounding box of the selection in scene px.
  const r = objs.map((o) => o.getBoundingRect());
  const left = Math.min(...r.map((b) => b.left));
  const top = Math.min(...r.map((b) => b.top));
  const width = Math.max(1, Math.max(...r.map((b) => b.left + b.width)) - left);
  const height = Math.max(1, Math.max(...r.map((b) => b.top + b.height)) - top);

  // Render the selection (translated to a 0,0 origin) into an offscreen canvas
  // scaled up by `multiplier` so the bitmap is sharp.
  const serialized = objs.map((o) => {
    const d = o.toObject() as Record<string, unknown>;
    if (typeof d.left === 'number') d.left = (d.left as number) - left;
    if (typeof d.top === 'number') d.top = (d.top as number) - top;
    return d;
  });
  const el = document.createElement('canvas');
  el.width = Math.max(1, Math.round(width * multiplier));
  el.height = Math.max(1, Math.round(height * multiplier));
  const off = new fabric.StaticCanvas(el, { width: el.width, height: el.height, renderOnAddRemove: false });
  off.setZoom(multiplier);
  let dataUrl: string;
  try {
    const enlived = await fabric.util.enlivenObjects(serialized);
    for (const o of enlived) off.add(o as fabric.FabricObject);
    off.renderAll();
    dataUrl = off.toDataURL({ format: 'png', multiplier: 1 });
  } finally {
    off.dispose();
  }

  // Place the bitmap at the selection's spot, scaled back down to its size.
  const img = await fabric.FabricImage.fromURL(dataUrl);
  img.set({ left, top, scaleX: 1 / multiplier, scaleY: 1 / multiplier });
  img.setCoords();

  objs.forEach((o) => canvas.remove(o));
  canvas.discardActiveObject();
  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
