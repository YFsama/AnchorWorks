import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';

let isolatedItems: fabric.FabricObject[] | null = null;

export function canEnterIsolationForTarget(target: fabric.FabricObject | null | undefined): target is fabric.Group {
  return !!target && target.type === 'group' && !isolatedItems;
}

export function enterIsolationMode(): boolean {
  const canvas = getCanvas();
  if (!canvas || isolatedItems) return false;
  const active = canvas.getActiveObject();
  if (!active || active.type !== 'group') return false;
  const group = active as fabric.Group;
  const items = group.removeAll() as fabric.FabricObject[];
  if (!items.length) return false;
  canvas.remove(group);
  items.forEach(item => canvas.add(item));
  isolatedItems = items;
  canvas.setActiveObject(items.length === 1 ? items[0] : new fabric.ActiveSelection(items, { canvas }));
  canvas.requestRenderAll();
  window.dispatchEvent(new CustomEvent('anchorworks:isolation', { detail: { active: true } }));
  return true;
}

export function exitIsolationMode(): boolean {
  const canvas = getCanvas();
  if (!canvas || !isolatedItems) return false;
  canvas.discardActiveObject();
  const live = isolatedItems.filter(item => canvas.getObjects().includes(item));
  if (!live.length) { isolatedItems = null; return false; }
  live.forEach(item => canvas.remove(item));
  const group = new fabric.Group(live);
  canvas.add(group);
  canvas.setActiveObject(group);
  isolatedItems = null;
  canvas.requestRenderAll();
  window.dispatchEvent(new CustomEvent('anchorworks:isolation', { detail: { active: false } }));
  return true;
}

export function isIsolationMode(): boolean { return !!isolatedItems; }
export function toggleIsolationMode(): boolean { return isIsolationMode() ? exitIsolationMode() : enterIsolationMode(); }

export function resetIsolationModeForCanvasDisposal(): void {
  isolatedItems = null;
}
