import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type * as fabric from 'fabric';
import { History } from '../history';
import { useEditor } from '../../store/editor';

/**
 * Coalescing tests for the ops layer (historyOps.pushHistory), P1-2.
 *
 * historyPerf.test.ts pins the History-class hot path (direct capture()
 * calls stay synchronous and per-call); this file pins the layer ABOVE it:
 * pushes triggered within the same macrotask must coalesce into ONE
 * capture of the final state — one full-document serialisation and one
 * undo step per user gesture / programmatic burst (1,000 rhinestones =
 * ONE undo step), while bursts in later macrotasks each keep their own
 * step. It also pins the flush-on-demand contract: a pending capture lands
 * before undo/redo move the cursor.
 *
 * canvasEngine owns the live canvas + History instance (initCanvas), so the
 * two getters historyOps talks to are mocked here with lazily-read
 * bindings — the factory pattern from isolationMode.test.ts.
 */

let mockCanvas: fabric.Canvas | null = null;
let mockHistory: History | null = null;

vi.mock('../canvasEngine', () => ({
  getCanvas: () => mockCanvas,
  getHistory: () => mockHistory,
}));

const { pushHistory, undo, redo, flushPendingCapture } = await import('../historyOps');

function makeStubCanvas(initial = 'state-0') {
  const state = { value: initial };
  const stub = {
    toJSON: () => state.value,
    loadFromJSON: async (s: unknown) => {
      state.value = s as string;
    },
    renderAll: () => {},
  };
  return { stub: stub as unknown as fabric.Canvas, state };
}

/** Stub whose toJSON() returns a large document-shaped object, the way a
 *  real fabric canvas does (fresh object per call). Serialising it once per
 *  capture is the cost we're proving got collapsed. */
function makeBigDocCanvas(paths: number) {
  const state = { value: 'v0' };
  const stub = {
    toJSON: () => ({
      version: '6.0.0',
      objects: Array.from({ length: paths }, (_, i) => ({
        type: 'path',
        id: `${state.value}#${i}`,
        path: [[`M ${i}`, 0], ['L', i + 1, 0]],
      })),
    }),
    loadFromJSON: async (s: { version?: string }) => {
      state.value = (s.version as unknown as string) ?? state.value;
    },
    renderAll: () => {},
  };
  return { stub: stub as unknown as fabric.Canvas, state };
}

/** Resolve after every microtask queued BEFORE this call (FIFO) — i.e. after
 *  any flushPendingCapture that pushHistory scheduled. */
function drainMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function setup(initial = 'A') {
  const { stub, state } = makeStubCanvas(initial);
  mockCanvas = stub;
  mockHistory = new History({ limit: 50 });
  mockHistory.init(stub);
  return { stub, state };
}

describe('pushHistory capture coalescing (ops layer)', () => {
  beforeEach(() => {
    useEditor.getState().setCutPaths([]);
  });

  afterEach(() => {
    // Drop the engine bindings first so a leaked pending capture flushes to
    // nothing, then clear the flag itself. A still-queued microtask from a
    // test that never drained becomes a no-op (flag already false).
    mockCanvas = null;
    mockHistory = null;
    flushPendingCapture();
    vi.restoreAllMocks();
    useEditor.getState().setCutPaths([]);
  });

  it('a burst of 1,000 synchronous pushHistory calls pays exactly one canvas serialisation', async () => {
    const { stub, state } = makeBigDocCanvas(2000);
    mockCanvas = stub;
    mockHistory = new History({ limit: 50 });
    mockHistory.init(stub);

    const captureSpy = vi.spyOn(mockHistory, 'capture');
    const stringify = vi.spyOn(JSON, 'stringify');

    state.value = 'v1'; // the burst changes the document
    for (let i = 0; i < 1000; i++) pushHistory();

    // Nothing has landed yet — the capture (and the flag refresh) are deferred.
    expect(captureSpy).not.toHaveBeenCalled();
    expect(useEditor.getState().canUndo).toBe(false);

    await drainMicrotasks();

    // ONE capture of the final state: exactly one serialisation of the
    // 2,000-path document for 1,000 pushes (was: 1,000 serialisations).
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalledWith(stub);
    const docSerialisations = stringify.mock.calls.filter(
      (args) => (args[0] as { objects?: unknown[] })?.objects?.length === 2000,
    ).length;
    expect(docSerialisations).toBe(1);
    expect(useEditor.getState().canUndo).toBe(true);
  });

  it('undo collapses a 1,000-push burst into a single step', async () => {
    const { state } = setup('A');
    state.value = 'B';
    for (let i = 0; i < 1000; i++) pushHistory();
    await drainMicrotasks();
    expect(mockHistory!.canUndo()).toBe(true);

    await undo(); // ONE undo returns to the pre-burst state
    expect(state.value).toBe('A');
    expect(mockHistory!.canUndo()).toBe(false);
    expect(useEditor.getState().canUndo).toBe(false);

    await redo(); // and redo replays the whole burst at once
    expect(state.value).toBe('B');
  });

  it('a burst in a later macrotask gets its own undo step', async () => {
    const { state } = setup('A');
    const captureSpy = vi.spyOn(mockHistory!, 'capture');

    state.value = 'B';
    for (let i = 0; i < 20; i++) pushHistory();
    await drainMicrotasks(); // burst 1 flushed

    state.value = 'C';
    for (let i = 0; i < 20; i++) pushHistory();
    await drainMicrotasks(); // burst 2 flushed separately

    expect(captureSpy).toHaveBeenCalledTimes(2);

    await undo();
    expect(state.value).toBe('B'); // only burst 2 undone
    await undo();
    expect(state.value).toBe('A');
    expect(mockHistory!.canUndo()).toBe(false);
  });

  it('flushes a pending capture before undo advances the cursor (same-tick edit + undo)', async () => {
    const { state } = setup('A');
    state.value = 'B';
    for (let i = 0; i < 500; i++) pushHistory(); // pending, not drained

    await undo(); // seam must land 'B' first, then step back over it

    expect(state.value).toBe('A');
    expect(mockHistory!.canUndo()).toBe(false);
    expect(mockHistory!.canRedo()).toBe(true); // the flushed burst is redoable
    expect(useEditor.getState().canRedo).toBe(true);
  });

  it('flushes a pending capture before redo — the edit truncates the redo stack', async () => {
    const { state } = setup('A');
    state.value = 'B';
    pushHistory();
    await drainMicrotasks();
    await undo(); // back at A, 'B' redoable
    expect(mockHistory!.canRedo()).toBe(true);

    state.value = 'C';
    for (let i = 0; i < 10; i++) pushHistory(); // new edit pending

    await redo(); // pending edit lands first → redo correctly refused
    expect(state.value).toBe('C');
    expect(mockHistory!.canRedo()).toBe(false);
    expect(mockHistory!.canUndo()).toBe(true);
  });

  it('suspend/resume bypasses coalesced captures exactly as before', async () => {
    const { state } = setup('A');
    mockHistory!.suspend();
    state.value = 'B';
    for (let i = 0; i < 5; i++) pushHistory();
    await drainMicrotasks();
    expect(mockHistory!.canUndo()).toBe(false); // capture was suspended

    mockHistory!.resume();
    state.value = 'C';
    pushHistory();
    await drainMicrotasks();
    expect(mockHistory!.canUndo()).toBe(true);
  });

  it('a pending capture never lands on a torn-down engine and a fresh session boots cleanly', async () => {
    const { state } = setup('A');
    state.value = 'B';
    pushHistory(); // scheduled against the old session

    mockCanvas = null; // session disposed before the microtask drains
    mockHistory = null;
    await drainMicrotasks(); // flush finds no engine — silently skipped

    const fresh = makeStubCanvas('X');
    mockCanvas = fresh.stub;
    mockHistory = new History({ limit: 50 });
    mockHistory.init(fresh.stub);
    fresh.state.value = 'Y';
    pushHistory();
    await drainMicrotasks();
    expect(mockHistory.canUndo()).toBe(true);
    await undo();
    expect(fresh.state.value).toBe('X');
  });

  it('flushPendingCapture without a pending capture is a no-op', () => {
    const { state } = setup('A');
    const captureSpy = vi.spyOn(mockHistory!, 'capture');
    flushPendingCapture();
    flushPendingCapture();
    expect(captureSpy).not.toHaveBeenCalled();
    expect(state.value).toBe('A');
  });

  it('pushHistory with no live engine schedules nothing', async () => {
    mockCanvas = null;
    mockHistory = null;
    pushHistory(); // must return early, leaving nothing scheduled
    const { state } = setup('A'); // engine comes back in the same tick
    state.value = 'B';
    pushHistory();
    await drainMicrotasks();
    expect(mockHistory!.canUndo()).toBe(true); // only the second push captured
  });
});
