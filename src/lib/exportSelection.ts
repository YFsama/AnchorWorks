/**
 * Export Selection — write just the selected objects to an SVG / PNG file,
 * tightly cropped to their bounding box. Mirrors the offscreen-StaticCanvas
 * approach used for per-artboard export: serialise the selection translated to a
 * (0,0) origin, enliven into a detached canvas, and serialise that.
 */
import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';
import { download, downloadDataURL } from './io';

interface Box { left: number; top: number; width: number; height: number; }

function selectionBox(objs: fabric.FabricObject[]): Box | null {
  if (objs.length === 0) return null;
  const r = objs.map((o) => o.getBoundingRect());
  const left = Math.min(...r.map((b) => b.left));
  const top = Math.min(...r.map((b) => b.top));
  const right = Math.max(...r.map((b) => b.left + b.width));
  const bottom = Math.max(...r.map((b) => b.top + b.height));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** Build an offscreen StaticCanvas holding the selection at a (0,0) origin. */
async function renderSelection(): Promise<{ off: fabric.StaticCanvas; box: Box } | null> {
  const canvas = getCanvas();
  if (!canvas) return null;
  const objs = canvas.getActiveObjects();
  const box = selectionBox(objs);
  if (!box) return null;

  const serialized = objs.map((o) => {
    const d = o.toObject() as Record<string, unknown>;
    if (typeof d.left === 'number') d.left = (d.left as number) - box.left;
    if (typeof d.top === 'number') d.top = (d.top as number) - box.top;
    return d;
  });

  const el = document.createElement('canvas');
  el.width = Math.max(1, Math.round(box.width));
  el.height = Math.max(1, Math.round(box.height));
  const off = new fabric.StaticCanvas(el, { width: box.width, height: box.height, renderOnAddRemove: false });
  const enlived = await fabric.util.enlivenObjects(serialized);
  for (const o of enlived) off.add(o as fabric.FabricObject);
  off.renderAll();
  return { off, box };
}

/** Export the current selection as a cropped SVG download. Returns false if
 *  nothing is selected. */
export async function exportSelectionSVG(): Promise<boolean> {
  const r = await renderSelection();
  if (!r) return false;
  try {
    const svg = r.off.toSVG({ viewBox: { x: 0, y: 0, width: r.box.width, height: r.box.height } });
    download('selection.svg', svg);
    return true;
  } finally {
    r.off.dispose();
  }
}

/** Export the current selection as a cropped PNG download. */
export async function exportSelectionPNG(multiplier = 2): Promise<boolean> {
  const r = await renderSelection();
  if (!r) return false;
  try {
    downloadDataURL('selection.png', r.off.toDataURL({ format: 'png', multiplier }));
    return true;
  } finally {
    r.off.dispose();
  }
}
