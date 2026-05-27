import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

export async function importSVGFile(file: File) {
  const text = await file.text();
  await importSVGString(text);
}

export async function importSVGString(svg: string) {
  const canvas = getCanvas();
  if (!canvas) return;
  const result = await fabric.loadSVGFromString(svg);
  const objs = result.objects.filter(Boolean) as fabric.FabricObject[];
  // Fabric caches grouped objects to an internal bitmap by default. That
  // bitmap is rendered at the object's intrinsic size, so when the user
  // zooms in the canvas, the cache is scaled like a raster and looks
  // pixelated. Disabling `objectCaching` on the imported group and every
  // descendant makes Fabric re-paint vector paths each frame — slightly
  // more CPU per render but crisp at any zoom level.
  for (const o of objs) o.set({ objectCaching: false });
  const group = fabric.util.groupSVGElements(objs, result.options);
  group.set({ objectCaching: false });
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  pushHistory();
}

export function exportSVG(): string {
  const canvas = getCanvas();
  if (!canvas) return '';
  return canvas.toSVG();
}

export function exportPNG(multiplier = 2): string {
  const canvas = getCanvas();
  if (!canvas) return '';
  return canvas.toDataURL({ format: 'png', multiplier });
}

export function download(filename: string, content: string | Blob, type = 'image/svg+xml') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataURL(filename: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
