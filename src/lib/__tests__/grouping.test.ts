/**
 * Group / ungroup tests.
 *
 * groupSelection / ungroupSelection / ungroupAll on a mocked canvas with
 * real fabric leaf objects and stub Group / ActiveSelection stand-ins that
 * mirror the fabric v6 `removeAll()` contract the libs rely on:
 *
 *  - groupSelection only fires for an ActiveSelection of 2+ members; the
 *    group is added, selected, and the leaves keep their object identity
 *    (same instances move into the group — no id churn).
 *  - ungroupSelection only fires for a Group; members are re-added
 *    individually, the group shell is removed, and a multi-selection is set.
 *  - ungroupAll flattens nested groups recursively, returns the number of
 *    groups broken, re-adds every leaf, and restores a selection; with no
 *    groups in the selection it returns 0 and re-selects the input as-is.
 *  - empty-selection guards return early without touching the canvas.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupSelection, ungroupAll, ungroupSelection } from '../grouping';
import * as canvasEngine from '../canvasEngine';

type FabricObject = fabric.FabricObject;

/** Stub matching the fabric v6 surface grouping.ts touches:
 *  type + removeAll() → member objects. */
function groupStub(members: FabricObject[], type: 'group' | 'activeselection') {
  return {
    type,
    removeAll: vi.fn(() => members),
  } as unknown as fabric.Group & fabric.ActiveSelection;
}

function makeCanvas(activeObjects: FabricObject[], active: FabricObject | null = null) {
  const objects = [...activeObjects];
  const c = {
    getObjects: () => objects,
    getActiveObjects: () => activeObjects,
    getActiveObject: () => active,
    add: vi.fn((o: FabricObject) => {
      objects.push(o);
    }),
    remove: vi.fn((o: FabricObject) => {
      const i = objects.indexOf(o);
      if (i >= 0) objects.splice(i, 1);
    }),
    setActiveObject: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
    fire: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  return c;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('groupSelection', () => {
  it('wraps an ActiveSelection into a new Group that owns the same leaf instances', () => {
    const a = new fabric.Rect({ width: 5, height: 5 });
    const b = new fabric.Circle({ radius: 5 });
    const sel = groupStub([a, b], 'activeselection');
    const c = makeCanvas([a, b], sel);

    groupSelection();

    expect(sel.removeAll).toHaveBeenCalledTimes(1);
    expect(c.add).toHaveBeenCalledTimes(1);
    const group = c.add.mock.calls[0][0] as fabric.Group;
    expect(group).toBeInstanceOf(fabric.Group);
    // Identity preservation: the exact same objects live on inside the group.
    const members = group.getObjects() as FabricObject[];
    expect(members).toEqual([a, b]);
    expect(c.setActiveObject).toHaveBeenCalledWith(group);
    expect(c.requestRenderAll).toHaveBeenCalled();
  });

  it('is a no-op for a single active object (not an ActiveSelection)', () => {
    const lone = new fabric.Rect({ width: 5, height: 5 });
    const c = makeCanvas([lone], lone);
    groupSelection();
    expect(c.add).not.toHaveBeenCalled();
    expect(c.setActiveObject).not.toHaveBeenCalled();
  });

  it('is a no-op for an active Group or without a canvas/active object', () => {
    const g = groupStub([new fabric.Rect({ width: 5, height: 5 })], 'group');
    const c = makeCanvas([g], g);
    groupSelection();
    expect(c.add).not.toHaveBeenCalled();

    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(() => groupSelection()).not.toThrow();
  });
});

describe('ungroupSelection', () => {
  it('breaks an active Group back into individually added members', () => {
    const a = new fabric.Rect({ width: 5, height: 5 });
    const b = new fabric.Circle({ radius: 5 });
    const g = groupStub([a, b], 'group');
    const c = makeCanvas([g as FabricObject], g);

    ungroupSelection();

    expect(g.removeAll).toHaveBeenCalledTimes(1);
    // Both members re-added at the canvas root, shell removed, then a
    // multi-selection (ActiveSelection) is set over them.
    expect(c.add).toHaveBeenCalledWith(a);
    expect(c.add).toHaveBeenCalledWith(b);
    expect(c.remove).toHaveBeenCalledWith(g);
    const sel = c.setActiveObject.mock.calls[0][0];
    expect(sel).toBeInstanceOf(fabric.ActiveSelection);
    expect((sel as fabric.ActiveSelection).getObjects()).toEqual([a, b]);
    expect(c.requestRenderAll).toHaveBeenCalled();
  });

  it('is a no-op when the active object is not a Group', () => {
    const rect = new fabric.Rect({ width: 5, height: 5 });
    const sel = groupStub([rect, new fabric.Circle({ radius: 5 })], 'activeselection');
    const c = makeCanvas([rect], sel);
    ungroupSelection();
    expect(c.add).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();

    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(() => ungroupSelection()).not.toThrow();
  });
});

describe('ungroupAll', () => {
  it('flattens a nested group tree, breaking every group and keeping leaves', () => {
    const leaf1 = new fabric.Rect({ width: 5, height: 5 });
    const leaf2 = new fabric.Circle({ radius: 5 });
    const leaf3 = new fabric.Ellipse({ rx: 5, ry: 3 });
    const inner = groupStub([leaf2, leaf3], 'group');
    const outer = groupStub([leaf1, inner as FabricObject], 'group');
    const c = makeCanvas([outer as FabricObject], outer);

    expect(ungroupAll()).toBe(2);
    // Outer then inner broken (BFS order), shells removed, leaves re-added.
    expect(outer.removeAll).toHaveBeenCalledTimes(1);
    expect(inner.removeAll).toHaveBeenCalledTimes(1);
    expect(c.remove).toHaveBeenCalledWith(outer);
    expect(c.remove).toHaveBeenCalledWith(inner);
    expect(c.add).toHaveBeenCalledWith(leaf1);
    expect(c.add).toHaveBeenCalledWith(leaf2);
    expect(c.add).toHaveBeenCalledWith(leaf3);
    // Final selection covers all three leaves.
    const sel = c.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(sel.getObjects().slice().sort()).toEqual([leaf1, leaf2, leaf3].sort());
  });

  it('returns 0 and re-selects the input when the selection has no groups', () => {
    const a = new fabric.Rect({ width: 5, height: 5 });
    const b = new fabric.Circle({ radius: 5 });
    const c = makeCanvas([a, b]);
    expect(ungroupAll()).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();
    // The discarded selection is restored as a fresh ActiveSelection.
    const sel = c.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(sel.getObjects()).toEqual([a, b]);
  });

  it('returns 0 for an empty selection or missing canvas', () => {
    const c = makeCanvas([]);
    expect(ungroupAll()).toBe(0);
    expect(c.setActiveObject).not.toHaveBeenCalled();

    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(ungroupAll()).toBe(0);
  });

  it('selects a lone leaf directly (no ActiveSelection wrapper)', () => {
    const leaf = new fabric.Rect({ width: 5, height: 5 });
    const g = groupStub([leaf], 'group');
    const c = makeCanvas([g as FabricObject], g);
    expect(ungroupAll()).toBe(1);
    expect(c.setActiveObject).toHaveBeenCalledWith(leaf);
  });
});
