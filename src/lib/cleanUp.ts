/**
 * Clean Up (Illustrator Object→Path→Clean Up) — delete junk that bloats a
 * document, especially after importing: empty text objects, stray single-anchor
 * paths, and zero-size objects. Returns the number removed.
 */
import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';

const isText = (t?: string) => t === 'i-text' || t === 'text' || t === 'textbox';

/** Decide whether an object is removable junk. */
export function isCleanupJunk(o: fabric.FabricObject): boolean {
  if ((o as { excludeFromExport?: boolean }).excludeFromExport) return false;

  // Empty text paths (no visible glyphs).
  if (isText(o.type)) return (((o as unknown as { text?: string }).text ?? '').trim() === '');

  // Zero-size objects (degenerate imports / leftover handles).
  const w = (o.width ?? 0) * Math.abs(o.scaleX ?? 1);
  const h = (o.height ?? 0) * Math.abs(o.scaleY ?? 1);
  if (w < 0.5 && h < 0.5) return true;

  // Stray points — a path with fewer than two drawable commands.
  if (o.type === 'path') {
    const cmds = ((o as fabric.Path).path ?? []) as unknown[];
    const drawable = cmds.filter((c) => Array.isArray(c) && ['M', 'L', 'C', 'Q'].includes(c[0] as string));
    return drawable.length < 2;
  }
  return false;
}

export function removeCleanupObjects(canvas: fabric.Canvas, objects: fabric.FabricObject[]): number {
  const junk = objects.filter(isCleanupJunk);
  if (junk.length === 0) return 0;
  canvas.discardActiveObject();
  junk.forEach((object) => canvas.remove(object));
  canvas.requestRenderAll();
  return junk.length;
}

/** Remove empty text, stray points and zero-size objects from the document. */
export function cleanUpDocument(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  return removeCleanupObjects(canvas as fabric.Canvas, canvas.getObjects());
}


/** Select cleanup candidates without deleting them, for audit before cleanup. */
export function selectCleanupObjects(): number {
  const canvas = getCanvas();
  if (!canvas) return 0;
  const junk = canvas.getObjects().filter(isCleanupJunk);
  if (junk.length === 0) return 0;
  canvas.discardActiveObject();
  if (junk.length === 1) canvas.setActiveObject(junk[0]);
  else canvas.setActiveObject(new fabric.ActiveSelection(junk, { canvas }));
  canvas.requestRenderAll();
  return junk.length;
}
