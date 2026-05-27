/**
 * Web Worker for offloading raster image trace from main thread.
 *
 * Imported elsewhere via the Vite `?worker` suffix:
 *   import TraceWorker from './workers/trace.worker.ts?worker';
 *   const worker = new TraceWorker();
 *
 * Message protocol:
 *   Request:  { id: number; imageData: ImageData; threshold?: number }
 *   Response: { id: number; ok: true; polygon: Array<[number, number]> }
 *           | { id: number; ok: false; error: string }
 *
 * The algorithm mirrors `traceSelectedImage` in src/lib/io3.ts: threshold to
 * B/W (luminance < threshold = ink), collect edge pixels around the ink
 * region, order them by polar angle around the centroid, then down-sample to
 * ~96 points. Workers can't share state with the main thread, so the pixel
 * loop is duplicated here.
 */

interface TraceRequest {
  id: number;
  imageData: ImageData;
  threshold?: number;
}

type TraceResponse =
  | { id: number; ok: true; polygon: Array<[number, number]> }
  | { id: number; ok: false; error: string };

// The DOM lib doesn't include `DedicatedWorkerGlobalScope`, so we model the
// minimal surface we use (postMessage + onmessage). `self` inside a worker is
// the dedicated worker scope, but TypeScript types it as Window here — cast.
interface WorkerScope {
  onmessage: ((event: MessageEvent<TraceRequest>) => void) | null;
  postMessage(message: TraceResponse): void;
}
const ctx = self as unknown as WorkerScope;

const TARGET_POINTS = 96;

function tracePolygon(imageData: ImageData, threshold: number): Array<[number, number]> {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  const isInk = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = (y * w + x) * 4;
    const a = data[i + 3];
    if (a < 64) return false;
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return lum < threshold;
  };

  // Collect edge pixels (ink with at least one non-ink neighbour).
  const edges: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isInk(x, y)) continue;
      if (!isInk(x - 1, y) || !isInk(x + 1, y) || !isInk(x, y - 1) || !isInk(x, y + 1)) {
        edges.push({ x, y });
      }
    }
  }

  if (edges.length < 3) return [];

  // Order edge pixels by polar angle around the centroid.
  const cx = edges.reduce((s, p) => s + p.x, 0) / edges.length;
  const cy = edges.reduce((s, p) => s + p.y, 0) / edges.length;
  edges.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

  // Down-sample to ~TARGET_POINTS so the polygon stays usable.
  const target = Math.min(edges.length, TARGET_POINTS);
  const step = edges.length / target;
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < target; i++) {
    const p = edges[Math.floor(i * step)];
    sampled.push([p.x, p.y]);
  }
  return sampled;
}

ctx.onmessage = (event: MessageEvent<TraceRequest>): void => {
  const { id, imageData, threshold } = event.data;
  try {
    const polygon = tracePolygon(imageData, threshold ?? 128);
    const response: TraceResponse = { id, ok: true, polygon };
    ctx.postMessage(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const response: TraceResponse = { id, ok: false, error: message };
    ctx.postMessage(response);
  }
};

// Make this file a module under verbatimModuleSyntax.
export {};
