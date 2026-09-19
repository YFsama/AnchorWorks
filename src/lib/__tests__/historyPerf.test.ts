import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type * as fabric from 'fabric';
import { History } from '../history';
import { useEditor, type CutPath } from '../../store/editor';

/**
 * Perf-focused tests for the History hot path. Every fabric
 * object:added / modified / removed event routes through capture(), so any
 * redundant JSON work there is paid on every edit of a large document.
 * These tests pin the optimisations (single snapshot per capture, cheap
 * cutPaths reference+length guard, shared immutable snapshot array) without
 * touching the behavioural coverage in history.test.ts.
 */

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

function makeCutPaths(n: number, kind: CutPath['kind'] = 'outline'): CutPath[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cp-${kind}-${i}`,
    points: [[i, 0], [i, 1], [i + 1, 1], [i + 1, 0]] as Array<[number, number]>,
    closed: true,
    kind,
    passes: 2,
  }));
}

describe('History hot-path performance guards', () => {
  let history: History;

  beforeEach(() => {
    history = new History({ limit: 50 });
    useEditor.getState().setCutPaths([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useEditor.getState().setCutPaths([]);
  });

  it('skips the cutPaths JSON round-trip when the live array reference is unchanged', () => {
    const { stub, state } = makeStubCanvas('A');
    const live = makeCutPaths(500);
    useEditor.getState().setCutPaths(live);
    history.init(stub);

    // Spy on JSON.stringify and count calls that serialise the live cutPaths
    // array (the old code cloned + compared it on every capture).
    const spy = vi.spyOn(JSON, 'stringify');
    state.value = 'B';
    history.capture(stub); // canvas changed, cutPaths untouched
    expect(history.canUndo()).toBe(true);

    const cloned = spy.mock.calls.filter((args) => args[0] === live).length;
    expect(cloned).toBe(0); // no round-trip clone, no stringified compare
    expect(spy).toHaveBeenCalled(); // canvas JSON is still serialised once
  });

  it('falls back to a deep compare when the array reference changes but content is identical', () => {
    const { stub, state } = makeStubCanvas('A');
    history.init(stub);
    state.value = 'B';
    history.capture(stub);
    expect(history.canUndo()).toBe(true);

    // New array reference with identical content — must be recognised as a
    // duplicate (no new undo step), via the stringified fallback compare.
    useEditor.getState().setCutPaths([]);
    const arr = makeCutPaths(3);
    useEditor.getState().setCutPaths(arr);
    history.capture(stub); // canvas unchanged, cutPaths content-identical
    useEditor.getState().setCutPaths([...arr]);
    history.capture(stub); // ref changed again, still identical content
    expect(history.canRedo()).toBe(false); // nothing was pushed
    expect(history.canUndo()).toBe(true); // exactly the pre-existing step
  });

  it('records a snapshot when only the cut paths change (canvas identical)', () => {
    const { stub } = makeStubCanvas('A');
    history.init(stub);
    useEditor.getState().setCutPaths(makeCutPaths(2, 'regmark'));
    history.capture(stub); // canvas JSON identical, cut paths differ
    expect(history.canUndo()).toBe(true);
  });

  it('undo restores the cut-path slice taken at snapshot time', async () => {
    const { stub, state } = makeStubCanvas('A');
    const cuts = makeCutPaths(4, 'trace');
    history.init(stub);                      // snap0: canvas A, no cut paths
    useEditor.getState().setCutPaths(cuts);
    state.value = 'B';
    history.capture(stub);                   // snap1: canvas B, cut paths present
    useEditor.getState().setCutPaths([]);    // user deletes the cut paths
    state.value = 'C';
    history.capture(stub);                   // snap2: canvas C, cut paths gone

    expect(useEditor.getState().cutPaths).toEqual([]);
    await history.undo(stub);                // back to snap1
    expect(state.value).toBe('B');
    expect(useEditor.getState().cutPaths).toEqual(cuts);
    await history.undo(stub);                // back to snap0
    expect(useEditor.getState().cutPaths).toEqual([]);
  });

  it('recognises the restored snapshot array after undo (no clone on next capture)', async () => {
    const { stub, state } = makeStubCanvas('A');
    const cuts = makeCutPaths(10);
    useEditor.getState().setCutPaths([]);
    history.init(stub);
    useEditor.getState().setCutPaths(cuts);
    state.value = 'B';
    history.capture(stub);
    useEditor.getState().setCutPaths(makeCutPaths(1, 'manual'));
    state.value = 'C';
    history.capture(stub);

    await history.undo(stub);
    // The store now holds the snapshot's own array — a capture with only the
    // canvas changing must take the cheap guard (no round-trip of `cuts`).
    const spy = vi.spyOn(JSON, 'stringify');
    state.value = 'D';
    history.capture(stub);
    expect(history.canUndo()).toBe(true);
    expect(spy.mock.calls.filter((args) => args[0] === useEditor.getState().cutPaths).length).toBe(0);
  });

  it('treats an in-place length change as a mutation even with a recycled reference', () => {
    const { stub, state } = makeStubCanvas('A');
    const shared: CutPath[] = [];
    useEditor.getState().setCutPaths(shared);
    history.init(stub);
    state.value = 'B';
    history.capture(stub);

    // Defensive: even if some future caller pushed into the live array
    // without replacing it, the length guard must force the deep path.
    shared.push({ id: 'stray', points: [[0, 0]], closed: false, kind: 'manual' });
    history.capture(stub); // canvas unchanged — cut paths must be detected
    expect(history.canUndo()).toBe(true); // snapshot recorded, not skipped
  });

  it('burst of identical captures collapses to one undo step', () => {
    const { stub } = makeStubCanvas('A');
    history.init(stub);
    for (let i = 0; i < 25; i++) history.capture(stub);
    expect(history.canUndo()).toBe(false);
  });

  it('large-document capture cost is one canvas stringify per event', () => {
    const { stub, state } = makeStubCanvas('A');
    useEditor.getState().setCutPaths(makeCutPaths(2000));
    history.init(stub);

    const spy = vi.spyOn(JSON, 'stringify');
    for (let i = 0; i < 10; i++) {
      state.value = `B${i}`;
      history.capture(stub);
    }
    // 10 captures → exactly 10 canvas serialisations, no cutPaths clones.
    expect(spy.mock.calls.filter((args) => typeof args[0] === 'string').length).toBe(10);
    expect(spy.mock.calls.filter((args) => Array.isArray(args[0])).length).toBe(0);
    expect(history.canUndo()).toBe(true);
  });
});
