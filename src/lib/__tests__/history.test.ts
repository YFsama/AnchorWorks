import { describe, it, expect, beforeEach } from 'vitest';
import type * as fabric from 'fabric';
import { History } from '../history';

/**
 * Tiny in-memory Canvas stub. Records its current "scene" as a string so
 * we can verify undo/redo restore the previous snapshot.
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

describe('History', () => {
  let history: History;

  beforeEach(() => {
    history = new History({ limit: 50 });
  });

  it('starts with no undo/redo available before init', () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('captures initial state on init, undo/redo still false', () => {
    const { stub } = makeStubCanvas('A');
    history.init(stub);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('capture pushes a snapshot, enabling undo', () => {
    const { stub, state } = makeStubCanvas('A');
    history.init(stub);
    state.value = 'B';
    history.capture(stub);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('undo restores previous state', async () => {
    const { stub, state } = makeStubCanvas('A');
    history.init(stub);
    state.value = 'B';
    history.capture(stub);
    state.value = 'C';
    history.capture(stub);
    expect(history.canUndo()).toBe(true);

    await history.undo(stub);
    expect(state.value).toBe('B');
    await history.undo(stub);
    expect(state.value).toBe('A');
    expect(history.canUndo()).toBe(false);
  });

  it('redo restores a previously-undone state', async () => {
    const { stub, state } = makeStubCanvas('A');
    history.init(stub);
    state.value = 'B';
    history.capture(stub);
    state.value = 'C';
    history.capture(stub);

    await history.undo(stub);
    expect(state.value).toBe('B');
    expect(history.canRedo()).toBe(true);

    await history.redo(stub);
    expect(state.value).toBe('C');
    expect(history.canRedo()).toBe(false);
  });

  it('capture after undo truncates the redo stack', async () => {
    const { stub, state } = makeStubCanvas('A');
    history.init(stub);
    state.value = 'B';
    history.capture(stub);
    state.value = 'C';
    history.capture(stub);

    await history.undo(stub); // now at B
    expect(history.canRedo()).toBe(true);

    state.value = 'D';
    history.capture(stub); // diverges — C should be gone
    expect(history.canRedo()).toBe(false);
    expect(history.canUndo()).toBe(true);
  });

  it('does not push a duplicate snapshot when state has not changed', () => {
    const { stub } = makeStubCanvas('A');
    history.init(stub);
    history.capture(stub); // same state
    history.capture(stub);
    expect(history.canUndo()).toBe(false);
  });

  it('respects the history limit', () => {
    const small = new History({ limit: 3 });
    const { stub, state } = makeStubCanvas('A');
    small.init(stub);
    for (const v of ['B', 'C', 'D', 'E']) {
      state.value = v;
      small.capture(stub);
    }
    // Limit is 3, so only 3 snapshots remain — fewer undos than captures.
    expect(small.canUndo()).toBe(true);
  });

  it('suspend() prevents capture from recording', () => {
    const { stub, state } = makeStubCanvas('A');
    history.init(stub);
    history.suspend();
    state.value = 'B';
    history.capture(stub);
    expect(history.canUndo()).toBe(false);
    history.resume();
    state.value = 'C';
    history.capture(stub);
    expect(history.canUndo()).toBe(true);
  });
});
