/**
 * Create Outlines (Illustrator Type→Create Outlines), trace flavour.
 *
 * Browsers can't hand back the glyph beziers of an arbitrary loaded font
 * (system fonts have no fetchable bytes; Google fonts ship woff2 that the JS
 * parsers can't decode), so instead of a font-vectoriser dependency we
 * rasterise the text to a supersampled offscreen canvas and trace it with the
 * cutter suite's marching-squares `traceBitmap`. The result is a real,
 * editable, font-independent fabric.Path that exports to SVG/PLT and can be
 * contour-cut — exactly what "outlines" are for here. (Raster-traced, so curves
 * are dense polylines rather than glyph beziers; Simplify can thin them.)
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';
import { traceBitmap } from './cutContour';

const MM_TO_PX = 3.7795;
type Pt = [number, number];

const isTextType = (t?: string) => ['i-text', 'text', 'textbox'].includes(t ?? '');

/** True when the selection contains at least one text object. */
export function canCreateOutlines(): boolean {
  const c = getCanvas();
  if (!c) return false;
  return c.getActiveObjects().some((o) => isTextType(o.type));
}

function toD(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + ' Z';
}

/** Trace one text object into an even-odd compound fabric.Path (keeping its
 *  fill/position), or null if nothing traceable. */
async function traceTextToPath(text: fabric.FabricObject): Promise<fabric.Path | null> {
  const r = text.getBoundingRect();
  if (r.width < 1 || r.height < 1) return null;

  // Supersample the text onto a transparent offscreen canvas so the trace edges
  // stay smooth, capped so a huge headline can't blow out memory.
  const SS = 4;
  const W = Math.min(4096, Math.max(8, Math.ceil(r.width * SS)));
  const H = Math.min(4096, Math.max(8, Math.ceil(r.height * SS)));
  const el = document.createElement('canvas');
  el.width = W; el.height = H;
  const sc = new fabric.StaticCanvas(el, { width: W, height: H, renderOnAddRemove: false, enableRetinaScaling: false });

  let paths: Pt[][];
  try {
    const clone = await text.clone();
    clone.set({
      left: 0, top: 0, originX: 'left', originY: 'top', angle: 0,
      scaleX: (text.scaleX ?? 1) * SS, scaleY: (text.scaleY ?? 1) * SS,
      fill: '#000000', stroke: '', shadow: null,
    });
    clone.setCoords();
    sc.add(clone);
    sc.renderAll();
    const ctx = el.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, W, H);
    const pixelSizeMm = (r.width / MM_TO_PX) / W; // mm per raster pixel
    paths = traceBitmap(img, { useAlpha: true, threshold: 64, simplifyTolerance: 1.2, pixelSizeMm });
  } finally {
    sc.dispose();
  }
  if (paths.length === 0) return null;

  // Trace coords are mm relative to the text's top-left; offset to the page and
  // convert to px so the rebuilt path lands where the text was.
  const offX = r.left / MM_TO_PX;
  const offY = r.top / MM_TO_PX;
  const d = paths
    .map(c => toD(c.map(([x, y]) => [(x + offX) * MM_TO_PX, (y + offY) * MM_TO_PX] as Pt)))
    .join(' ');

  return new fabric.Path(d, {
    fill: (text.fill as string) ?? '#000000',
    fillRule: 'evenodd',
    stroke: '',
    strokeWidth: 0,
    opacity: text.opacity ?? 1,
  });
}

/**
 * Replace every selected text object with traced outline paths (one even-odd
 * compound fabric.Path each, keeping the text's fill). Returns true if any were
 * converted.
 */
export async function createOutlinesFromText(): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  const texts = canvas.getActiveObjects().filter((o) => isTextType(o.type));
  if (texts.length === 0) return false;

  const made: fabric.FabricObject[] = [];
  for (const text of texts) {
    const outline = await traceTextToPath(text);
    if (outline) { canvas.remove(text); canvas.add(outline); made.push(outline); }
  }
  if (made.length === 0) return false;
  canvas.discardActiveObject();
  canvas.setActiveObject(made.length === 1 ? made[0] : new fabric.ActiveSelection(made, { canvas }));
  canvas.requestRenderAll();
  pushHistory();
  return true;
}
