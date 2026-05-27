/**
 * Text on Path — best-effort.
 *
 * Fabric v6 has no built-in text-on-path primitive. We approximate it by:
 *   1. Reading the selected path's `d` attribute and rasterising the path
 *      into evenly spaced (x, y, angle) samples using an SVGPathElement +
 *      getPointAtLength.
 *   2. Placing each character of the text as a separate small IText rotated
 *      to the local tangent angle, then grouping them so the user can move
 *      / scale the whole label as a unit.
 *
 * Limitations: kerning is naive (we step a constant ~fontSize * 0.7 units
 * along the path between glyph centres). This is intentionally simple —
 * good enough for short labels, headlines, badges.
 */
import * as fabric from 'fabric';
import { getCanvas, pushHistory } from './canvasEngine';

type FabricObject = fabric.FabricObject;

interface Sample {
  x: number;
  y: number;
  angle: number; // radians
}

/** Return [textObj, pathObj] when the active selection is exactly one of each. */
function getTextAndPath(): { text: fabric.IText; path: fabric.Path } | null {
  const c = getCanvas();
  if (!c) return null;
  const objs = c.getActiveObjects();
  if (objs.length !== 2) return null;
  let text: fabric.IText | null = null;
  let path: fabric.Path | null = null;
  for (const o of objs) {
    if (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox') {
      text = o as fabric.IText;
    } else if (o.type === 'path') {
      path = o as fabric.Path;
    }
  }
  if (!text || !path) return null;
  return { text, path };
}

/** Cheap predicate the UI uses to enable/disable the button. */
export function canApplyTextOnPath(): boolean {
  return getTextAndPath() !== null;
}

/**
 * Convert a Fabric Path back to an SVG `d` string. Fabric stores the path
 * as a parsed array (e.g. [['M', x, y], ['L', x, y], ...]); joining each
 * sub-command with spaces produces a valid `d` attribute.
 */
function pathToD(path: fabric.Path): string {
  // Fabric exposes `.path` as the parsed command array on the Path instance.
  const segs = (path as unknown as { path?: Array<Array<string | number>> }).path;
  if (!segs || !Array.isArray(segs)) return '';
  return segs.map((seg) => seg.join(' ')).join(' ');
}

/**
 * Sample the path at intervals of `step` user units. Uses a hidden SVG
 * element in the DOM to leverage the browser's path math.
 */
function samplePath(d: string, step: number): Sample[] {
  if (!d) return [];
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  // Hidden but laid out so getTotalLength works in all browsers.
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.left = '-9999px';
  const pathEl = document.createElementNS(svgNS, 'path');
  pathEl.setAttribute('d', d);
  svg.appendChild(pathEl);
  document.body.appendChild(svg);

  const samples: Sample[] = [];
  try {
    const total = pathEl.getTotalLength();
    if (!Number.isFinite(total) || total <= 0) return samples;
    const safeStep = Math.max(0.5, step);
    for (let len = 0; len <= total; len += safeStep) {
      const p = pathEl.getPointAtLength(len);
      // Estimate the tangent by sampling slightly ahead (clamped to total).
      const ahead = pathEl.getPointAtLength(Math.min(total, len + 0.5));
      const angle = Math.atan2(ahead.y - p.y, ahead.x - p.x);
      samples.push({ x: p.x, y: p.y, angle });
    }
  } finally {
    svg.remove();
  }
  return samples;
}

/**
 * Place each character of the text along the path. We keep the original
 * path visible (Illustrator behaviour: the path becomes a guide) so the
 * curve remains editable. Removes only the original text object.
 */
export function applyTextOnPath(): boolean {
  const pair = getTextAndPath();
  if (!pair) return false;
  const c = getCanvas();
  if (!c) return false;
  const { text, path } = pair;
  const d = pathToD(path);
  if (!d) return false;

  const fontSize = (text as unknown as { fontSize?: number }).fontSize ?? 32;
  const fontFamily = (text as unknown as { fontFamily?: string }).fontFamily ?? 'Inter, sans-serif';
  const fill = (text.fill as string) ?? '#000000';
  const fontWeight = (text as unknown as { fontWeight?: string | number }).fontWeight ?? 'normal';
  const fontStyle = (text as unknown as { fontStyle?: string }).fontStyle ?? 'normal';
  const str = ((text as unknown as { text?: string }).text ?? '').replace(/\n/g, ' ');
  if (!str) return false;

  // Sample interval — wider for narrower glyphs would be ideal, but for a
  // best-effort approximation 70% of fontSize feels balanced.
  const step = Math.max(2, fontSize * 0.7);
  const samples = samplePath(d, step);
  if (samples.length === 0) return false;

  // Path is positioned at (path.left, path.top); samples are in the path's
  // local coordinate space, so offset them by the path origin.
  const pathLeft = path.left ?? 0;
  const pathTop = path.top ?? 0;
  // Subtract the path's pathOffset (Fabric centres complex paths around
  // their bounding box centre), so samples line up with what the user sees.
  const pathOffset = (path as unknown as { pathOffset?: { x: number; y: number } }).pathOffset ?? { x: 0, y: 0 };

  const glyphs: FabricObject[] = [];
  const count = Math.min(str.length, samples.length);
  for (let i = 0; i < count; i++) {
    const s = samples[i];
    const ch = str[i];
    const x = pathLeft + (s.x - pathOffset.x);
    const y = pathTop + (s.y - pathOffset.y);
    const glyph = new fabric.IText(ch, {
      left: x,
      top: y,
      fill,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      originX: 'center',
      originY: 'center',
      angle: (s.angle * 180) / Math.PI,
      selectable: true,
      evented: true,
    });
    glyphs.push(glyph);
  }
  if (glyphs.length === 0) return false;

  const group = new fabric.Group(glyphs, { subTargetCheck: false });
  c.add(group);

  // Remove the source text but keep the path as a visible guide curve.
  c.remove(text);
  c.discardActiveObject();
  c.setActiveObject(group);
  c.requestRenderAll();
  pushHistory();
  return true;
}
