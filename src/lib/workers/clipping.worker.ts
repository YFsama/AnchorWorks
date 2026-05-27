/**
 * Web Worker that runs polygon-clipping boolean operations off the main thread.
 *
 * Imported elsewhere via the Vite `?worker` suffix:
 *   import ClippingWorker from './workers/clipping.worker.ts?worker';
 *   const worker = new ClippingWorker();
 *
 * Message protocol:
 *   Request:  { id: number; op: 'union'|'intersection'|'difference'|'xor'; rings: Ring[][][] }
 *   Response: { id: number; ok: true; result: Ring[][][] }
 *           | { id: number; ok: false; error: string }
 *
 * NOTE: image trace (`traceSelectedImage` in src/lib/io3.ts) is similarly
 * CPU-heavy and could be moved to a dedicated worker on a future pass.
 */

import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping';

type ClipOp = 'union' | 'intersection' | 'difference' | 'xor';

interface ClipRequest {
  id: number;
  op: ClipOp;
  // rings[0] = subject MultiPolygon, rings[1] = clip MultiPolygon (Ring[][] each).
  rings: Ring[][][];
}

type ClipResponse =
  | { id: number; ok: true; result: Ring[][][] }
  | { id: number; ok: false; error: string };

// The DOM lib doesn't include `DedicatedWorkerGlobalScope`, so we model the
// minimal surface we use (postMessage + onmessage). `self` inside a worker is
// the dedicated worker scope, but TypeScript types it as Window here — cast.
interface WorkerScope {
  onmessage: ((event: MessageEvent<ClipRequest>) => void) | null;
  postMessage(message: ClipResponse): void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (event: MessageEvent<ClipRequest>): void => {
  const { id, op, rings } = event.data;
  try {
    const subject = (rings[0] ?? []) as MultiPolygon;
    const clip = (rings[1] ?? []) as MultiPolygon;
    let result: MultiPolygon;
    switch (op) {
      case 'union':
        result = polygonClipping.union(subject, clip);
        break;
      case 'intersection':
        result = polygonClipping.intersection(subject, clip);
        break;
      case 'difference':
        result = polygonClipping.difference(subject, clip);
        break;
      case 'xor':
        result = polygonClipping.xor(subject, clip);
        break;
      default: {
        const response: ClipResponse = { id, ok: false, error: `unknown op: ${String(op)}` };
        ctx.postMessage(response);
        return;
      }
    }
    const response: ClipResponse = { id, ok: true, result: result as unknown as Ring[][][] };
    ctx.postMessage(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const response: ClipResponse = { id, ok: false, error: message };
    ctx.postMessage(response);
  }
};

// Make this file a module under verbatimModuleSyntax.
export {};
