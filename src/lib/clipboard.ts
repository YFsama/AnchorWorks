/**
 * Internal clipboard for canvas objects — extracted from `CanvasContextMenu`
 * so that file can be a pure component for Fast Refresh.
 *
 * We keep a single module-level reference rather than reaching for the OS
 * clipboard so:
 *   1) we can serialize/deserialize Fabric objects faithfully (system
 *      clipboard only carries text/HTML reliably);
 *   2) cross-document and cross-tab paste isn't expected here — Vector
 *      Studio runs as a single-window app.
 *
 * `clipboard` holds an array of plain-JSON snapshots produced by
 * `toObject()`, or null when nothing has been copied yet.
 */

import * as fabric from 'fabric';
import { getCanvas, deleteSelection, pushHistory } from './canvasEngine';

let clipboard: object | null = null;

/**
 * Snapshot the active selection into the internal clipboard. No-op when the
 * canvas is missing or there's nothing selected.
 */
export function copySelection(): boolean {
  const c = getCanvas();
  if (!c) return false;
  const active = c.getActiveObjects();
  if (!active.length) return false;
  clipboard = active.map((o) => o.toObject() as object) as unknown as object;
  return true;
}

/** Copy then delete — the common Cut idiom. */
export function cutSelection(): boolean {
  if (!copySelection()) return false;
  deleteSelection();
  return true;
}

/**
 * Revive the clipboard contents back into Fabric objects and drop them on the
 * canvas centered at the current viewport center. Each pasted object becomes
 * a brand new id (Fabric generates one via `assignId` in canvasEngine via the
 * `object:added` listener). Returns false if the clipboard is empty.
 */
export async function pasteFromClipboard(): Promise<boolean> {
  const c = getCanvas();
  if (!c || !clipboard) return false;
  const raw = Array.isArray(clipboard) ? clipboard : [clipboard];
  if (!raw.length) return false;
  const enlived = (await fabric.util.enlivenObjects(raw as object[])) as fabric.FabricObject[];
  if (!enlived.length) return false;

  // Compute viewport center in scene coords so paste lands wherever the user
  // is currently looking, not where the originals were.
  const vt = c.viewportTransform!;
  const zoom = c.getZoom();
  const cw = c.getWidth();
  const ch = c.getHeight();
  const centerX = (cw / 2 - vt[4]) / zoom;
  const centerY = (ch / 2 - vt[5]) / zoom;

  // Bounding center of the pasted group → translate to viewport center
  // rather than dumping every object at the same anchor.
  const lefts = enlived.map((o) => o.left ?? 0);
  const tops = enlived.map((o) => o.top ?? 0);
  const rights = enlived.map((o) => (o.left ?? 0) + (o.width ?? 0) * (o.scaleX ?? 1));
  const bottoms = enlived.map((o) => (o.top ?? 0) + (o.height ?? 0) * (o.scaleY ?? 1));
  const minX = Math.min(...lefts);
  const minY = Math.min(...tops);
  const maxX = Math.max(...rights);
  const maxY = Math.max(...bottoms);
  const groupCx = (minX + maxX) / 2;
  const groupCy = (minY + maxY) / 2;
  const dx = centerX - groupCx;
  const dy = centerY - groupCy;

  c.discardActiveObject();
  for (const o of enlived) {
    o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
    o.setCoords();
    c.add(o);
  }

  if (enlived.length === 1) {
    c.setActiveObject(enlived[0]);
  } else {
    const sel = new fabric.ActiveSelection(enlived, { canvas: c });
    c.setActiveObject(sel);
  }
  c.requestRenderAll();
  pushHistory();
  return true;
}

export function hasClipboard(): boolean {
  if (!clipboard) return false;
  if (Array.isArray(clipboard)) return (clipboard as object[]).length > 0;
  return true;
}
