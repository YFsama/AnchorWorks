/**
 * P2-3 — Document-scale wall-time performance budgets.
 *
 * historyPerf.test.ts pins *call counts* (one canvas stringify per capture,
 * no cutPaths clones) against stub canvases, but nothing measures wall time.
 * This file fills that gap at a fixed document scale: 2,000 mixed fabric
 * objects (50% paths / 25% rects / 25% IText — close to a real job file)
 * plus 200 cut paths in the editor store.
 *
 * Measured operations:
 *  1. History.capture() — the hot path every fabric object:added/modified/
 *     removed event pays; one full-document serialisation per call.
 *  2. canvas loadFromJSON() — the enliven/restore entry History.undo() and
 *     project open both use. We time JSON.parse + per-record revival through
 *     fabric's real class registry, which is exactly what fabric's own
 *     enliven path does (variableWidthPersist.test.ts pattern).
 *  3. render — intentionally NOT measured, see the skipped test below.
 *
 * Anti-flake contract (this is a smoke alarm, not a benchmark):
 *  - budgets are ~10x the observed dev-machine median, so a slow CI box or
 *    noisy neighbour cannot false-fire; only an order-of-magnitude
 *    regression (e.g. an O(n^2) serializer sneaking back in, cf. P1-2)
 *    trips them;
 *  - each measurement does a full warm-up pass first (JIT + fabric caches),
 *    then takes the MEDIAN of several samples (median resists GC pauses);
 *  - the measured median is always console.log'd and repeated in the
 *    assertion message, so a red run shows the real number;
 *  - timeouts are generous (vi.setConfig at the top of this file).
 *
 * If a budget fires: do not bump the number blindly — diff the measured
 * median against the "healthy" medians recorded in the assertion messages
 * and look for a serializer/enliven regression first.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fabric from 'fabric';
import { History } from '../history';
import { useEditor, type CutPath } from '../../store/editor';

/* Generous wall-clock budgets (ms). Values are ~10x the medians observed on
 * the dev machine this file was written on — see assertion messages for the
 * healthy baselines. Only order-of-magnitude regressions should trip them. */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const OBJECT_COUNT = 2_000;
const CUT_PATH_COUNT = 200;
const SAMPLES = 5;

/** Capability needed to revive one serialized record (fabric's own dispatch). */
type RevivableClass = { fromObject: (record: Record<string, unknown>) => Promise<fabric.FabricObject> };

beforeEach(() => {
  // Repo-standard jsdom 2D-context stub (printMarks/splitText pattern) so
  // real fabric.IText construction and revival succeed — jsdom's own
  // getContext returns null and fabric's text measuring would die on it.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 12 }),
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    transform: vi.fn(), setTransform: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    bezierCurveTo: vi.fn(), quadraticCurveTo: vi.fn(), clearRect: vi.fn(),
    fillRect: vi.fn(), strokeRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    canvas: document.createElement('canvas'),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
  useEditor.getState().setCutPaths([]);
});

/* ----------------------- fixtures (existing patterns) ----------------------- */

/** Same shape as historyPerf.test.ts's makeCutPaths — store-side cut paths. */
function makeCutPaths(n: number, kind: CutPath['kind'] = 'outline'): CutPath[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cp-${kind}-${i}`,
    points: [[i, 0], [i, 1], [i + 1, 1], [i + 1, 0]] as Array<[number, number]>,
    closed: true,
    kind,
    passes: 2,
  }));
}

/** A realistic multi-segment contour path (lines + beziers), varied transform. */
function makePath(i: number): fabric.Path {
  const x = (i % 40) * 30;
  const y = Math.floor(i / 40) * 30;
  return new fabric.Path(
    `M ${x} ${y} L ${x + 40} ${y} L ${x + 40} ${y + 25} C ${x + 30} ${y + 40}, ${x + 10} ${y + 40}, ${x} ${y + 25} Z`,
    { left: x, top: y, angle: (i % 4) * 90, fill: '#102030', stroke: '#405060', strokeWidth: 0.5 },
  );
}

/** The 2,000-object mixed document: half paths, a quarter rects, a quarter text. */
function makeDocumentObjects(n: number): fabric.FabricObject[] {
  const objects: fabric.FabricObject[] = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 4;
    if (kind < 2) {
      objects.push(makePath(i));
    } else if (kind === 2) {
      objects.push(new fabric.Rect({
        left: (i % 40) * 30, top: Math.floor(i / 40) * 30,
        width: 20 + (i % 7) * 3, height: 10 + (i % 5) * 4,
        angle: i % 90, fill: '#abcdef', stroke: '#123456', strokeWidth: 1,
      }));
    } else {
      objects.push(new fabric.IText(`LABEL ${String(i % 100).padStart(3, '0')}`, {
        left: (i % 40) * 30, top: Math.floor(i / 40) * 30,
        fontSize: 10 + (i % 14), fill: '#333333', angle: i % 180,
      }));
    }
  }
  return objects;
}

/**
 * Stand-in canvas (variableWidthPersist.test.ts pattern): toJSON() calls each
 * live object's REAL toObject(), loadFromJSON() dispatches every record
 * through fabric's REAL class registry — the same revival path fabric's own
 * enliven uses. A real fabric.Canvas is impossible here: jsdom has no 2D
 * rasteriser, so fidelity is kept exactly at the two seams being measured.
 */
function makePerfCanvas(initial: fabric.FabricObject[]) {
  const objects: fabric.FabricObject[] = [...initial];
  const canvas = {
    add: (o: fabric.FabricObject) => { objects.push(o); return canvas; },
    getObjects: () => objects,
    toJSON: () => ({ version: '6.9.1', objects: objects.map((o) => o.toObject()) }),
    loadFromJSON: async (json: unknown) => {
      const rec = json as { objects?: Array<Record<string, unknown>> };
      objects.length = 0;
      for (const o of rec.objects ?? []) {
        const cls = fabric.classRegistry.getClass<RevivableClass>(String(o.type));
        objects.push(await cls.fromObject(o));
      }
    },
    renderAll: () => {},
    requestRenderAll: () => {},
  };
  return canvas as unknown as fabric.Canvas;
}

/* ------------------------------ measurement ------------------------------ */

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const fmt = (x: number) => `${x.toFixed(1)} ms`;

/* ------------------------------- the budgets ------------------------------- */

describe('document-scale performance budgets (2,000 mixed objects)', () => {
  it('History.capture() serialises the full document within budget', () => {
    const objects = makeDocumentObjects(OBJECT_COUNT);
    const canvas = makePerfCanvas(objects);
    useEditor.getState().setCutPaths(makeCutPaths(CUT_PATH_COUNT));

    const history = new History({ limit: 50 });
    history.init(canvas); // snapshot 0

    // Warm-up: two full serialisations before any timing (JIT + caches).
    for (let w = 0; w < 2; w++) {
      objects[w].set('left', (objects[w].left ?? 0) + 1);
      history.capture(canvas);
    }

    // Timed samples: mutate one object per capture so every call is a real
    // push (canvas changed, cutPaths untouched — the per-edit hot path).
    const samples: number[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      const victim = objects[2 + s];
      victim.set('angle', ((victim.angle ?? 0) + 15) % 360);
      const t0 = performance.now();
      history.capture(canvas);
      samples.push(performance.now() - t0);
    }

    const med = median(samples);
    // Always log: CI runs show drift long before the budget fires.
    console.log(`[perfBudget] History.capture() @ ${OBJECT_COUNT} objects: median ${fmt(med)} (samples: ${samples.map(fmt).join(', ')})`);
    // Healthy baseline when this budget was calibrated: ~47 ms median.
    // Budget = 10x headroom for slow CI machines.
    const BUDGET_CAPTURE_MS = 500;
    expect(
      med,
      `History.capture() at ${OBJECT_COUNT} objects measured median ${fmt(med)} ` +
      `(samples: ${samples.map(fmt).join(', ')}) — budget ${BUDGET_CAPTURE_MS} ms ` +
      `(healthy baseline ~47 ms; 10x headroom). An order-of-magnitude blow-up ` +
      `here usually means a serializer regression (e.g. an O(n^2) clone per ` +
      `event, cf. P1-2) — check takeSnapshot() before bumping the budget.`,
    ).toBeLessThan(BUDGET_CAPTURE_MS);

    // Sanity: the timed captures really recorded undo steps.
    expect(history.canUndo()).toBe(true);
  });

  it('loadFromJSON revives the full document within budget', async () => {
    const canvas = makePerfCanvas(makeDocumentObjects(OBJECT_COUNT));
    const serialized = JSON.stringify(canvas.toJSON()); // the exact payload shape History.restore parses

    // Warm-up: one full parse + enliven pass before timing.
    await canvas.loadFromJSON(JSON.parse(serialized));

    // Timed samples: JSON.parse + per-record classRegistry revival — the
    // same work History.undo()'s restore() pays (it parses, then calls
    // loadFromJSON with the parsed object; the fake enlivens from that).
    const samples: number[] = [];
    for (let s = 0; s < SAMPLES; s++) {
      const t0 = performance.now();
      await canvas.loadFromJSON(JSON.parse(serialized));
      samples.push(performance.now() - t0);
    }

    const med = median(samples);
    console.log(`[perfBudget] loadFromJSON @ ${OBJECT_COUNT} objects: median ${fmt(med)} (samples: ${samples.map(fmt).join(', ')})`);
    // Healthy baseline when this budget was calibrated: ~120 ms median.
    // Budget = 10x headroom; IText/Path revival dominates (real fromObject).
    const BUDGET_LOAD_MS = 1200;
    expect(
      med,
      `loadFromJSON at ${OBJECT_COUNT} objects measured median ${fmt(med)} ` +
      `(samples: ${samples.map(fmt).join(', ')}) — budget ${BUDGET_LOAD_MS} ms ` +
      `(healthy baseline ~120 ms; 10x headroom). A blow-up here usually means ` +
      `the revival path regressed (extra clones in fromObject dispatch, or ` +
      `per-record re-registration) — check classRegistry usage before bumping.`,
    ).toBeLessThan(BUDGET_LOAD_MS);

    // Sanity: the last load really revived the whole document.
    expect(canvas.getObjects()).toHaveLength(OBJECT_COUNT);
  });

  it.skip('renderAll wall-time is not measurable in jsdom (no rasteriser)', () => {
    // Deliberately not implemented. fabric's renderAll needs a real 2D
    // context; jsdom's getContext returns null, and the repo-standard ctx
    // mock used elsewhere stubs every draw call as vi.fn() — timing that
    // measures the mock, not the renderer. A meaningful render budget
    // needs a real-browser harness (e.g. Playwright) and belongs there,
    // not in this file. Serialisation (capture) and revival (loadFromJSON)
    // above cover the serializer regressions this budget test exists for.
  });
});
