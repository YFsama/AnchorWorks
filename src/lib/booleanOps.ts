/**
 * Boolean operations on selected canvas objects.
 *
 * Converts each Fabric object's outline into a polygon (rings of [x,y] pairs)
 * by flattening any Bezier segments, runs the polygon-clipping library, then
 * adds the resulting fabric.Path back to the canvas. Operates on exactly the
 * top-most two objects in the active selection.
 */

import * as fabric from 'fabric';
import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
import { ringToBezierPathD } from './pathOps';
import { getCanvas, pushHistory } from './canvasEngine';
import { toast } from './toast';
import { t } from './i18n';
import { logger } from './debug';
// Vite-native Web Worker import — the `?worker` suffix produces a class that
// instantiates the bundled worker chunk. Boolean ops can take seconds on
// complex paths; running them off the main thread keeps the UI responsive.
// NOTE: `traceSelectedImage` in src/lib/io3.ts is similarly CPU-heavy and
// could be moved to its own worker on a future pass.
import ClippingWorker from './workers/clipping.worker.ts?worker';

type FabricObject = fabric.FabricObject;

export type BoolOp = 'union' | 'subtract' | 'intersect' | 'exclude';

const FLATTEN_TOLERANCE = 1; // ~1px sampling step

/* --------------------------------- helpers --------------------------------- */

/**
 * Sample a cubic Bezier from p0→p3 with control points p1,p2 into N segments.
 * N is chosen from total chord length so each step is roughly FLATTEN_TOLERANCE.
 */
function flattenCubic(
  p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number],
  out: [number, number][],
) {
  const chord = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  const ctrl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
               Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
               Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const est = (chord + ctrl) / 2;
  const steps = Math.max(4, Math.ceil(est / FLATTEN_TOLERANCE));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
    const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
    out.push([x, y]);
  }
}

function flattenQuad(
  p0: [number, number], p1: [number, number], p2: [number, number],
  out: [number, number][],
) {
  const est = Math.hypot(p1[0]-p0[0], p1[1]-p0[1]) + Math.hypot(p2[0]-p1[0], p2[1]-p1[1]);
  const steps = Math.max(4, Math.ceil(est / FLATTEN_TOLERANCE));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u*u*p0[0] + 2*u*t*p1[0] + t*t*p2[0];
    const y = u*u*p0[1] + 2*u*t*p1[1] + t*t*p2[1];
    out.push([x, y]);
  }
}

/**
 * Sample a simplified path (TSimplePathData) into one or more polygon rings.
 * A new ring is started on each 'M'; 'Z' closes the current ring.
 */
function pathToRings(simplePath: unknown[]): [number, number][][] {
  const rings: [number, number][][] = [];
  let cur: [number, number][] = [];
  let lastX = 0, lastY = 0;
  let startX = 0, startY = 0;

  const flush = (close: boolean) => {
    if (cur.length === 0) return;
    if (close && (cur[0][0] !== cur[cur.length-1][0] || cur[0][1] !== cur[cur.length-1][1])) {
      cur.push([cur[0][0], cur[0][1]]);
    }
    if (cur.length >= 3) rings.push(cur);
    cur = [];
  };

  for (const cmd of simplePath as Array<[string, ...number[]]>) {
    const c = cmd[0];
    switch (c) {
      case 'M': {
        flush(false);
        lastX = startX = cmd[1] as number;
        lastY = startY = cmd[2] as number;
        cur = [[lastX, lastY]];
        break;
      }
      case 'L': {
        lastX = cmd[1] as number;
        lastY = cmd[2] as number;
        cur.push([lastX, lastY]);
        break;
      }
      case 'Q': {
        const p0: [number, number] = [lastX, lastY];
        const p1: [number, number] = [cmd[1] as number, cmd[2] as number];
        const p2: [number, number] = [cmd[3] as number, cmd[4] as number];
        flattenQuad(p0, p1, p2, cur);
        lastX = p2[0]; lastY = p2[1];
        break;
      }
      case 'C': {
        const p0: [number, number] = [lastX, lastY];
        const p1: [number, number] = [cmd[1] as number, cmd[2] as number];
        const p2: [number, number] = [cmd[3] as number, cmd[4] as number];
        const p3: [number, number] = [cmd[5] as number, cmd[6] as number];
        flattenCubic(p0, p1, p2, p3, cur);
        lastX = p3[0]; lastY = p3[1];
        break;
      }
      case 'Z':
      case 'z': {
        if (cur.length && (cur[0][0] !== lastX || cur[0][1] !== lastY)) {
          cur.push([startX, startY]);
        }
        lastX = startX; lastY = startY;
        flush(true);
        break;
      }
      default:
        break;
    }
  }
  flush(true);
  return rings;
}

/**
 * Apply an arbitrary 2D matrix to a list of polygon rings (mutating a copy).
 */
function transformRings(rings: [number, number][][], m: fabric.TMat2D): [number, number][][] {
  return rings.map(ring => ring.map(([x, y]) => {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as [number, number];
  }));
}

/**
 * Build a Path object describing a basic rectangle (used as a fallback geometry).
 */
function rectRings(w: number, h: number): [number, number][][] {
  return [[[0,0],[w,0],[w,h],[0,h],[0,0]]];
}

function ellipseRings(rx: number, ry: number): [number, number][][] {
  // Sample with ~1px tolerance on the longer radius.
  const r = Math.max(rx, ry);
  const steps = Math.max(24, Math.ceil((2 * Math.PI * r) / FLATTEN_TOLERANCE));
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([rx + Math.cos(a) * rx, ry + Math.sin(a) * ry]);
  }
  ring.push([ring[0][0], ring[0][1]]);
  return [ring];
}

/**
 * Convert any supported Fabric object into polygon rings in canvas coordinates.
 * Returns null if the object can't be reduced to a closed polygon.
 */
function objectToRings(obj: FabricObject): [number, number][][] | null {
  let local: [number, number][][] | null = null;

  if (obj.type === 'path') {
    const p = obj as fabric.Path;
    const simple = fabric.util.makePathSimpler(
      p.path as unknown as Parameters<typeof fabric.util.makePathSimpler>[0]
    );
    const rings = pathToRings(simple as unknown as unknown[]);
    // Path stores commands centered around pathOffset. Subtract pathOffset
    // so we end up in the same local space as the object's transform matrix.
    local = rings.map(r => r.map(([x, y]) => [x - p.pathOffset.x, y - p.pathOffset.y] as [number, number]));
  } else if (obj.type === 'rect') {
    const r = obj as fabric.Rect;
    const w = r.width ?? 0, h = r.height ?? 0;
    // Rect's local origin is its top-left in untransformed space, but Fabric
    // anchors transforms to the object's center → subtract half W/H.
    local = rectRings(w, h).map(ring => ring.map(([x, y]) => [x - w/2, y - h/2] as [number, number]));
  } else if (obj.type === 'ellipse' || obj.type === 'circle') {
    const e = obj as fabric.Ellipse;
    const rx = e.rx ?? (obj as fabric.Circle).radius ?? 0;
    const ry = e.ry ?? (obj as fabric.Circle).radius ?? 0;
    local = ellipseRings(rx, ry).map(ring => ring.map(([x, y]) => [x - rx, y - ry] as [number, number]));
  } else if (obj.type === 'polygon' || obj.type === 'polyline') {
    const pl = obj as fabric.Polygon;
    const pts = pl.points ?? [];
    if (pts.length < 3) return null;
    const ring: [number, number][] = pts.map(p => [p.x - (pl.pathOffset?.x ?? 0), p.y - (pl.pathOffset?.y ?? 0)] as [number, number]);
    if (ring.length && (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1])) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    local = [ring];
  } else {
    // Fall back to bounding-box rectangle for unsupported types (text, images, ...).
    const w = (obj.width ?? 0), h = (obj.height ?? 0);
    if (w > 0 && h > 0) {
      local = rectRings(w, h).map(ring => ring.map(([x, y]) => [x - w/2, y - h/2] as [number, number]));
    }
  }

  if (!local) return null;
  const m = obj.calcTransformMatrix();
  return transformRings(local, m);
}

/* --------------------------- polygon → fabric path -------------------------- */

/**
 * Convert a polygon-clipping MultiPolygon into an SVG path "d" string.
 * Each polygon contributes its outer ring (CCW) then any holes (CW).
 *
 * Each ring is run through `ringToBezierPathD` first: the polygon-clipping
 * output is a many-vertex polygonal approximation of what may originally
 * have been curves on either side of the bool op. The refit detects
 * smooth-curve runs and emits real C segments for them, keeping sharp
 * corners as L. The visual result: round inputs stay round after union /
 * difference / intersection / xor.
 */
function multiPolygonToPathD(mp: MultiPolygon): string {
  const parts: string[] = [];
  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length < 2) continue;
      const d = ringToBezierPathD(ring as unknown as ReadonlyArray<readonly [number, number]>);
      if (d) parts.push(d);
    }
  }
  return parts.join(' ');
}

/* ------------------------------ worker plumbing ----------------------------- */

type WorkerOp = 'union' | 'intersection' | 'difference' | 'xor';

interface ClipResponseOk { id: number; ok: true; result: Ring[][][] }
interface ClipResponseErr { id: number; ok: false; error: string }
type ClipResponse = ClipResponseOk | ClipResponseErr;

interface Pending {
  resolve: (rings: Ring[][][]) => void;
  reject: (err: Error) => void;
}

let workerInstance: Worker | null = null;
let workerFailed = false;
let nextReqId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (workerInstance) return workerInstance;
  try {
    const w = new ClippingWorker();
    w.onmessage = (ev: MessageEvent<ClipResponse>): void => {
      const data = ev.data;
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.ok) entry.resolve(data.result);
      else entry.reject(new Error(data.error));
    };
    w.onerror = (ev: ErrorEvent): void => {
      // A worker-level error breaks the RPC stream — reject everything pending.
      const err = new Error(ev.message || 'worker error');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    };
    workerInstance = w;
    return w;
  } catch (err) {
    // Routed through logger.warn so the fallback shows up in the DebugPanel's
    // in-app log buffer as well as the browser console — the trace someone
    // needs when diagnosing "why is my boolean op slow?".
    logger.warn('boolean', `clipping worker unavailable, falling back to main thread: ${err instanceof Error ? err.message : String(err)}`);
    workerFailed = true;
    return null;
  }
}

function clipOnWorker(op: WorkerOp, subject: Ring[][], clip: Ring[][]): Promise<Ring[][][]> {
  const w = getWorker();
  if (!w) {
    // Synchronous fallback for SSR / unsupported environments.
    try {
      let result: MultiPolygon;
      switch (op) {
        case 'union':       result = polygonClipping.union(subject as MultiPolygon, clip as MultiPolygon); break;
        case 'intersection':result = polygonClipping.intersection(subject as MultiPolygon, clip as MultiPolygon); break;
        case 'difference':  result = polygonClipping.difference(subject as MultiPolygon, clip as MultiPolygon); break;
        case 'xor':         result = polygonClipping.xor(subject as MultiPolygon, clip as MultiPolygon); break;
      }
      return Promise.resolve(result as unknown as Ring[][][]);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
  return new Promise<Ring[][][]>((resolve, reject) => {
    const id = nextReqId++;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, op, rings: [subject, clip] });
  });
}

/* --------------------------------- public ---------------------------------- */

/**
 * Run a boolean operation on the top-most + next-down objects in the active
 * selection. Returns the new fabric.Path (or null if it could not be performed).
 *
 * For 'subtract' the top-most object is subtracted FROM the next-down one
 * (top = clip, bottom = subject), which matches Illustrator's pathfinder.
 *
 * NOTE: as of this iteration `booleanOp` is **async** — the actual polygon
 * clipping runs in a Web Worker (see `./workers/clipping.worker.ts`). All
 * call sites (AlignPanel buttons, AI skill handler) must `await` it.
 */
export async function booleanOp(op: BoolOp): Promise<fabric.Path | null> {
  const canvas = getCanvas();
  if (!canvas) return null;
  const objs = canvas.getActiveObjects();
  if (objs.length < 2) return null;

  // Top-most = highest stacking index.
  const allObjs = canvas.getObjects();
  const sorted = [...objs].sort((a, b) => allObjs.indexOf(a) - allObjs.indexOf(b));
  const subject = sorted[sorted.length - 2];
  const clip = sorted[sorted.length - 1];

  const subjectRings = objectToRings(subject);
  const clipRings = objectToRings(clip);
  if (!subjectRings || !clipRings) return null;

  // polygon-clipping expects MultiPolygon-compatible (Polygon or MultiPolygon).
  // A single polygon is "Ring[]" — pass rings as the outer polygon's ring list.
  const subjGeom: Ring[][] = [subjectRings as Ring[]];
  const clipGeom: Ring[][] = [clipRings as Ring[]];

  const workerOp: WorkerOp =
    op === 'subtract' ? 'difference' :
    op === 'intersect' ? 'intersection' :
    op === 'exclude' ? 'xor' : 'union';

  // If the worker takes longer than ~200ms, surface a toast so the user knows
  // something is happening. Clear it on completion (success or failure).
  let toastId: string | null = null;
  const toastTimer = window.setTimeout(() => {
    toastId = toast.info(t('Computing boolean…'));
  }, 200);

  let result: MultiPolygon;
  try {
    const raw = await clipOnWorker(workerOp, subjGeom, clipGeom);
    result = raw as unknown as MultiPolygon;
  } catch (err) {
    logger.error('boolean', `op failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    window.clearTimeout(toastTimer);
    if (toastId) toast.dismiss(toastId);
  }

  if (!result || result.length === 0) {
    // Still remove the inputs (Illustrator behaviour: a trivial empty result
    // would just leave nothing — instead, keep the inputs so users can try again).
    return null;
  }

  const d = multiPolygonToPathD(result);
  if (!d) return null;

  // Inherit visual properties from the bottom (subject) object so the result
  // looks like a continuation of the larger shape.
  const path = new fabric.Path(d, {
    fill: (subject.fill as string) ?? '#3d9bff',
    stroke: (subject.stroke as string) ?? '',
    strokeWidth: subject.strokeWidth ?? 0,
    opacity: subject.opacity ?? 1,
  });

  // Remove the two operands and add the new path.
  canvas.remove(subject);
  canvas.remove(clip);
  canvas.add(path);
  canvas.setActiveObject(path);
  canvas.requestRenderAll();
  pushHistory();
  return path;
}
