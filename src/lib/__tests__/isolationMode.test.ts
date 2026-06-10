import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';

let mockCanvas: {
  active: fabric.FabricObject | null;
  objects: fabric.FabricObject[];
  added: fabric.FabricObject[];
  removed: fabric.FabricObject[];
  getActiveObject: () => fabric.FabricObject | null;
  setActiveObject: (object: fabric.FabricObject) => void;
  discardActiveObject: () => void;
  add: (...objects: fabric.FabricObject[]) => void;
  remove: (...objects: fabric.FabricObject[]) => void;
  getObjects: () => fabric.FabricObject[];
  requestRenderAll: ReturnType<typeof vi.fn>;
  fire: ReturnType<typeof vi.fn>;
};

vi.mock('../canvasEngine', () => ({
  getCanvas: () => mockCanvas,
}));

const {
  canEnterIsolationForTarget,
  enterIsolationMode,
  exitIsolationMode,
  isIsolationMode,
  resetIsolationModeForCanvasDisposal,
} = await import('../isolationMode');

function makeCanvas(active: fabric.FabricObject | null, objects: fabric.FabricObject[]) {
  mockCanvas = {
    active,
    objects: [...objects],
    added: [],
    removed: [],
    getActiveObject: () => mockCanvas.active,
    setActiveObject: (object) => { mockCanvas.active = object; },
    discardActiveObject: () => { mockCanvas.active = null; },
    add: (...added) => {
      mockCanvas.added.push(...added);
      mockCanvas.objects.push(...added);
    },
    remove: (...removed) => {
      mockCanvas.removed.push(...removed);
      mockCanvas.objects = mockCanvas.objects.filter(object => !removed.includes(object));
    },
    getObjects: () => mockCanvas.objects,
    requestRenderAll: vi.fn(),
    fire: vi.fn(),
  };
}

describe('isolationMode', () => {
  beforeEach(() => {
    resetIsolationModeForCanvasDisposal();
    window.dispatchEvent = vi.fn();
  });

  it('only allows entering isolation for a group when not already isolated', () => {
    const rect = new fabric.Rect();
    const group = new fabric.Group([new fabric.Rect()]);

    expect(canEnterIsolationForTarget(null)).toBe(false);
    expect(canEnterIsolationForTarget(rect)).toBe(false);
    expect(canEnterIsolationForTarget(group)).toBe(true);

    makeCanvas(group, [group]);
    expect(enterIsolationMode()).toBe(true);
    expect(canEnterIsolationForTarget(group)).toBe(false);
  });

  it('ungroups live children for editing and restores them as one group on exit', () => {
    const first = new fabric.Rect({ left: 10, top: 20 });
    const second = new fabric.Circle({ left: 40, top: 50, radius: 12 });
    const group = new fabric.Group([first, second]);
    makeCanvas(group, [group]);

    expect(enterIsolationMode()).toBe(true);
    expect(isIsolationMode()).toBe(true);
    expect(mockCanvas.removed).toContain(group);
    expect(mockCanvas.added).toEqual([first, second]);
    expect(mockCanvas.active?.type).toBe('activeselection');

    expect(exitIsolationMode()).toBe(true);
    expect(isIsolationMode()).toBe(false);
    expect(mockCanvas.objects).toHaveLength(1);
    expect(mockCanvas.active?.type).toBe('group');
    expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
  });
});
