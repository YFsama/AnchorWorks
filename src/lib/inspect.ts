/**
 * Document Inspector — derives at-a-glance statistics about the current
 * Fabric canvas. Pure read-only helpers; nothing here mutates the canvas
 * or pushes history, so it's safe to call as often as the panel renders.
 *
 * Two surfaces:
 *   - getDocStats(): snapshot of the document state right now
 *   - subscribeStats(): wire a callback to object:added/removed/modified
 *     so consumers re-render only when something visible changed.
 */
import * as fabric from 'fabric';
import { getCanvas } from './canvasEngine';

export interface DocStats {
  objectCount: number;
  byType: Record<string, number>;
  totalArea: number;
  totalPathLength: number;
  estimatedSvgBytes: number;
  uniqueColors: string[];
  boundingBox: { x: number; y: number; w: number; h: number } | null;
  deepestNesting: number;
}

// Fabric's `Path` command tuples vary by command letter — we only care about
// the trailing coordinate pair (the pen's destination), so this loose shape
// is enough. Anything we don't recognise gets ignored.
type PathCmd = (string | number)[];

/** Pull a usable color string out of a Fabric paint property. */
function colorOf(paint: unknown): string | null {
  if (!paint) return null;
  if (typeof paint !== 'string') return null;
  const trimmed = paint.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'transparent' || trimmed === 'none') return null;
  // rgba(...,0) is also effectively transparent.
  const m = trimmed.match(/^rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map(s => s.trim());
    if (parts.length === 4 && Number(parts[3]) === 0) return null;
  }
  return trimmed;
}

/** Approximate length of a Fabric Path by summing line segments between
 *  successive endpoints. Curves are treated as straight chords — fine for
 *  "ballpark size" stats and dirt cheap. */
function pathLength(commands: PathCmd[] | undefined): number {
  if (!commands || !commands.length) return 0;
  let total = 0;
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;
  for (const cmd of commands) {
    if (!cmd || !cmd.length) continue;
    const op = cmd[0] as string;
    // Helper: read the (typically) trailing x,y pair.
    const lastPair = (): [number, number] | null => {
      // M/L/T take 2 nums; Q takes 4; C takes 6; A takes 7 (last two are x,y).
      const len = cmd.length;
      if (len < 3) return null;
      const x = Number(cmd[len - 2]);
      const y = Number(cmd[len - 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return [x, y];
    };
    switch (op) {
      case 'M': {
        const p = lastPair(); if (!p) break;
        cx = p[0]; cy = p[1];
        startX = cx; startY = cy;
        break;
      }
      case 'L':
      case 'T':
      case 'Q':
      case 'C':
      case 'S':
      case 'A': {
        const p = lastPair(); if (!p) break;
        total += Math.hypot(p[0] - cx, p[1] - cy);
        cx = p[0]; cy = p[1];
        break;
      }
      case 'H': {
        const x = Number(cmd[1]);
        if (Number.isFinite(x)) {
          total += Math.abs(x - cx);
          cx = x;
        }
        break;
      }
      case 'V': {
        const y = Number(cmd[1]);
        if (Number.isFinite(y)) {
          total += Math.abs(y - cy);
          cy = y;
        }
        break;
      }
      case 'Z':
      case 'z': {
        total += Math.hypot(startX - cx, startY - cy);
        cx = startX; cy = startY;
        break;
      }
      default:
        // Unknown command — skip.
        break;
    }
  }
  return total;
}

function polylinePoints(pts: { x: number; y: number }[] | undefined, closed: boolean): number {
  if (!pts || pts.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  if (closed) {
    total += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  }
  return total;
}

function lineLength(line: fabric.Line): number {
  const x1 = line.x1 ?? 0, y1 = line.y1 ?? 0;
  const x2 = line.x2 ?? 0, y2 = line.y2 ?? 0;
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Walk into Fabric groups to find the deepest nesting depth — a flat
 *  canvas reports depth 1. We count group-within-group nesting, not the
 *  canvas itself. */
function depthOf(obj: fabric.FabricObject, current: number): number {
  if (obj.type !== 'group') return current;
  const g = obj as fabric.Group;
  const kids = (g as unknown as { _objects?: fabric.FabricObject[] })._objects;
  if (!kids || !kids.length) return current;
  let max = current;
  for (const k of kids) {
    const d = depthOf(k, current + 1);
    if (d > max) max = d;
  }
  return max;
}

/** Recursively visit every leaf object inside groups so we can count
 *  colors used across the whole document, not just the top-level shapes. */
function visitAll(obj: fabric.FabricObject, fn: (o: fabric.FabricObject) => void) {
  fn(obj);
  if (obj.type === 'group') {
    const kids = (obj as unknown as { _objects?: fabric.FabricObject[] })._objects;
    if (kids) kids.forEach(k => visitAll(k, fn));
  }
}

export function getDocStats(): DocStats {
  const empty: DocStats = {
    objectCount: 0,
    byType: {},
    totalArea: 0,
    totalPathLength: 0,
    estimatedSvgBytes: 0,
    uniqueColors: [],
    boundingBox: null,
    deepestNesting: 0,
  };
  const c = getCanvas();
  if (!c) return empty;

  const top = c.getObjects().filter(o => !(o as { excludeFromExport?: boolean }).excludeFromExport);
  if (!top.length) {
    // Even with zero objects we still want a meaningful SVG size estimate
    // (the wrapping <svg> header alone is a few hundred bytes).
    try { empty.estimatedSvgBytes = c.toSVG().length; } catch { /* swallow */ }
    return empty;
  }

  const byType: Record<string, number> = {};
  let totalArea = 0;
  let totalPathLength = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let deepest = 1;
  // Tally each colour string so we can rank by frequency at the end.
  const colorCounts = new Map<string, number>();

  for (const o of top) {
    const t = o.type ?? 'object';
    byType[t] = (byType[t] ?? 0) + 1;

    const b = o.getBoundingRect();
    totalArea += b.width * b.height;
    if (b.left < minX) minX = b.left;
    if (b.top < minY) minY = b.top;
    if (b.left + b.width > maxX) maxX = b.left + b.width;
    if (b.top + b.height > maxY) maxY = b.top + b.height;

    const d = depthOf(o, 1);
    if (d > deepest) deepest = d;

    // Path-length contribution — only relevant for stroke-y types. Recurse
    // into groups so a group of paths still gets credit.
    visitAll(o, (leaf) => {
      const lt = leaf.type;
      if (lt === 'path') {
        const p = leaf as fabric.Path;
        totalPathLength += pathLength(p.path as unknown as PathCmd[]);
      } else if (lt === 'polyline') {
        const pl = leaf as fabric.Polyline;
        totalPathLength += polylinePoints(pl.points, false);
      } else if (lt === 'polygon') {
        const pg = leaf as fabric.Polygon;
        totalPathLength += polylinePoints(pg.points, true);
      } else if (lt === 'line') {
        totalPathLength += lineLength(leaf as fabric.Line);
      }
      // Colour tally — fill + stroke from this leaf.
      const fill = colorOf((leaf as { fill?: unknown }).fill);
      if (fill) colorCounts.set(fill, (colorCounts.get(fill) ?? 0) + 1);
      const stroke = colorOf((leaf as { stroke?: unknown }).stroke);
      if (stroke) colorCounts.set(stroke, (colorCounts.get(stroke) ?? 0) + 1);
    });
  }

  // Rank colors by frequency desc, cap at 24.
  const uniqueColors = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([c]) => c);

  let estimatedSvgBytes = 0;
  try { estimatedSvgBytes = c.toSVG().length; } catch { /* swallow */ }

  const boundingBox = Number.isFinite(minX)
    ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    : null;

  return {
    objectCount: top.length,
    byType,
    totalArea,
    totalPathLength,
    estimatedSvgBytes,
    uniqueColors,
    boundingBox,
    deepestNesting: deepest,
  };
}

/** Notify subscribers whenever the document content changes so the
 *  Inspector panel can refresh on its own. We listen to the same trio of
 *  Fabric events the Layers panel uses. Returns an unsubscribe function. */
export function subscribeStats(fn: () => void): () => void {
  const c = getCanvas();
  if (!c) return () => { /* no canvas yet — nothing to detach */ };
  const handler = () => fn();
  c.on('object:added', handler);
  c.on('object:removed', handler);
  c.on('object:modified', handler);
  return () => {
    c.off('object:added', handler);
    c.off('object:removed', handler);
    c.off('object:modified', handler);
  };
}
