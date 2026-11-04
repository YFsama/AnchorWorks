import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import {
  applyClipMask,
  releaseClipMask,
  makeCompoundPath,
  releaseCompoundPath,
  countClipPathsInObject,
} from '../masks';
import * as canvasEngine from '../canvasEngine';
import { getCanvas } from '../canvasEngine';

/**
 * masks.ts depends on a live Fabric canvas. jsdom can't render Fabric, but
 * geometry math runs headless — the no-canvas guards below pin the
 * early-returns, and the behavioural tests run REAL fabric objects against
 * a stub canvas (the booleanOps/grouping test pattern: vi.spyOn on
 * canvasEngine.getCanvas). Fabric v6+ clone()/Group construction are pure
 * math in jsdom, so applyClipMask's promise chain settles after a
 * setTimeout(0) drain.
 */
describe('masks — no-canvas guards', () => {
  it('test fixture starts without a canvas', () => {
    // Sanity: the canvas singleton is null in this test env because nothing
    // ever called initCanvas. If this assertion ever fails, the rest of the
    // no-canvas guards become meaningless.
    expect(getCanvas()).toBeNull();
  });

  it('applyClipMask returns false when there is no canvas', () => {
    expect(applyClipMask()).toBe(false);
  });

  it('releaseClipMask returns false when there is no canvas', () => {
    expect(releaseClipMask()).toBe(false);
  });

  it('makeCompoundPath returns false when there is no canvas', () => {
    expect(makeCompoundPath()).toBe(false);
  });

  it('releaseCompoundPath returns false when there is no canvas', () => {
    expect(releaseCompoundPath()).toBe(false);
  });

  it('all mask and compound exports are functions', () => {
    expect(typeof applyClipMask).toBe('function');
    expect(typeof releaseClipMask).toBe('function');
    expect(typeof makeCompoundPath).toBe('function');
    expect(typeof releaseCompoundPath).toBe('function');
  });

  it('counts clip paths recursively for clipping-mask expansion', () => {
    const leaf = { clipPath: {} };
    const group = { type: 'group', getObjects: () => [leaf, { clipPath: {} }] };

    expect(countClipPathsInObject(group as never)).toBe(2);
    expect(countClipPathsInObject({} as never)).toBe(0);
  });
});

/* ------------------------- behavioural tests ------------------------- */

type Cmd = [string, ...number[]];
type StubCanvas = ReturnType<typeof makeCanvas>;

function makeCanvas(objects: fabric.FabricObject[], active = objects) {
  return {
    getObjects: () => objects,
    getActiveObjects: () => active,
    remove: vi.fn((o: fabric.FabricObject) => {
      const i = objects.indexOf(o);
      if (i >= 0) objects.splice(i, 1);
    }),
    add: vi.fn((o: fabric.FabricObject) => {
      objects.push(o);
    }),
    setActiveObject: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
    // ActiveSelection / Group layout pokes at these during construction.
    fire: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

function mockCanvas(c: StubCanvas) {
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
}

/** Resolve after the microtask chains Fabric's promise-based clone() and
 *  masks.ts's Promise.all(...).then(...) commit handlers queue. */
const drainAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyClipMask — behavioural', () => {
  it('applyClipMask wraps clipped objects in a Group', async () => {
    const a = new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '#111111' });
    const b = new fabric.Rect({ left: 10, top: 10, width: 50, height: 50, fill: '#222222' });
    // Top-most (last in canvas z-order) becomes the mask.
    const mask = new fabric.Rect({ left: 5, top: 5, width: 80, height: 80, fill: '#333333' });
    const c = makeCanvas([a, b, mask]);
    mockCanvas(c);

    expect(applyClipMask()).toBe(true);
    await drainAsync();

    // The mask object itself is consumed: removed from the canvas…
    expect(c.remove).toHaveBeenCalledWith(mask);
    expect(c.getObjects()).not.toContain(mask);
    // …and every other selected object carries an absolute-positioned
    // clipPath clone of the mask's geometry.
    for (const clipped of [a, b]) {
      expect(clipped.clipPath).toBeTruthy();
      expect((clipped.clipPath as fabric.FabricObject).absolutePositioned).toBe(true);
    }
    // The clipped objects are re-parented into one new Group added to the
    // canvas — same leaf instances, no id churn.
    const added = c.add.mock.calls.map((call) => call[0] as fabric.FabricObject);
    const group = added.find((o) => o instanceof fabric.Group) as fabric.Group;
    expect(group).toBeInstanceOf(fabric.Group);
    expect(group.getObjects()).toEqual([a, b]);
    expect(c.setActiveObject).toHaveBeenCalledWith(group);
  });

  it('applyClipMask keeps a single clipped object un-grouped but masked', async () => {
    const a = new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '#111111' });
    const mask = new fabric.Rect({ left: 10, top: 10, width: 80, height: 80, fill: '#333333' });
    const c = makeCanvas([a, mask]);
    mockCanvas(c);

    expect(applyClipMask()).toBe(true);
    await drainAsync();

    expect(a.clipPath).toBeTruthy();
    const added = c.add.mock.calls.map((call) => call[0] as fabric.FabricObject);
    expect(added.some((o) => o instanceof fabric.Group)).toBe(false);
    expect(c.setActiveObject).toHaveBeenCalledWith(a);
  });
});

describe('releaseClipMask — behavioural', () => {
  it('releaseClipMask strips clipPath from descendants', async () => {
    // A masked composition is a Group whose leaves carry clipPaths.
    const leaf1 = new fabric.Rect({ width: 100, height: 100, fill: '#111111' });
    const leaf2 = new fabric.Rect({ width: 100, height: 100, fill: '#222222' });
    leaf1.set({ clipPath: await new fabric.Rect({ width: 50, height: 50 }).clone() } as Partial<fabric.FabricObject>);
    leaf2.set({ clipPath: await new fabric.Rect({ width: 50, height: 50 }).clone() } as Partial<fabric.FabricObject>);
    const group = new fabric.Group([leaf1, leaf2]);
    const c = makeCanvas([group]);
    mockCanvas(c);

    expect(releaseClipMask()).toBe(true);
    expect(leaf1.clipPath).toBeUndefined();
    expect(leaf2.clipPath).toBeUndefined();
    // The group shell itself stays intact — only the masks are stripped.
    expect(c.getObjects()).toEqual([group]);
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.requestRenderAll).toHaveBeenCalled();
  });

  it('releaseClipMask returns false when nothing carries a clipPath', () => {
    const lone = new fabric.Rect({ width: 10, height: 10 });
    const c = makeCanvas([lone]);
    mockCanvas(c);
    expect(releaseClipMask()).toBe(false);
    expect(c.requestRenderAll).not.toHaveBeenCalled();
  });
});

describe('makeCompoundPath — behavioural', () => {
  it('makeCompoundPath concatenates subpaths with evenodd fill', () => {
    const a = new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, fill: '#111111' });
    const b = new fabric.Rect({ left: 20, top: 20, width: 50, height: 50, fill: '#abcdef' });
    const c = makeCanvas([a, b]);
    mockCanvas(c);

    expect(makeCompoundPath()).toBe(true);
    const added = c.add.mock.calls.map((call) => call[0] as fabric.FabricObject);
    const path = added.find((o) => o instanceof fabric.Path) as fabric.Path;
    expect(path).toBeInstanceOf(fabric.Path);
    // One path, two subpaths — both closed so evenodd can punch holes.
    const cmds = path.path as unknown as Cmd[];
    expect(cmds.filter((cmd) => cmd[0] === 'M')).toHaveLength(2);
    expect(cmds.filter((cmd) => cmd[0] === 'Z')).toHaveLength(2);
    expect(path.fillRule).toBe('evenodd');
    // Style inherited from the top-most object.
    expect(path.fill).toBe('#abcdef');
    // The operands are consumed.
    expect(c.remove).toHaveBeenCalledWith(a);
    expect(c.remove).toHaveBeenCalledWith(b);
    expect(c.getObjects()).toEqual([path]);
  });

  it('makeCompoundPath returns false for fewer than two objects', () => {
    const c = makeCanvas([new fabric.Rect({ width: 10, height: 10 })]);
    mockCanvas(c);
    expect(makeCompoundPath()).toBe(false);
    expect(c.add).not.toHaveBeenCalled();
  });
});

describe('releaseCompoundPath — behavioural', () => {
  it('releaseCompoundPath splits multi-M paths into pieces', () => {
    // Fresh Path renders its d at face value (left/top == pathOffset), so
    // the released pieces must keep the exact same absolute subpath starts.
    const compound = new fabric.Path(
      'M 0 0 L 100 0 L 100 100 Z M 20 20 L 60 20 L 60 60 Z',
      { fill: '#111111', stroke: '#000000', strokeWidth: 0 },
    );
    const c = makeCanvas([compound]);
    mockCanvas(c);

    expect(releaseCompoundPath()).toBe(true);
    const pieces = c.add.mock.calls.map((call) => call[0] as fabric.Path);
    expect(pieces).toHaveLength(2);
    expect(c.remove).toHaveBeenCalledWith(compound);
    expect(c.getObjects()).not.toContain(compound);

    const starts = pieces.map((piece) => {
      const cmds = piece.path as unknown as Cmd[];
      const ms = cmds.filter((cmd) => cmd[0] === 'M');
      expect(ms).toHaveLength(1);      // one subpath per piece
      expect(cmds.some((cmd) => cmd[0] === 'Z')).toBe(true); // still closed
      return [ms[0][1], ms[0][2]];
    });
    expect(starts).toEqual([[0, 0], [20, 20]]);
    // Same scene location: the release wrapper wraps the pieces in an
    // ActiveSelection, which shifts member left/top into selection space —
    // fabric's group-aware getCenterPoint still reports the absolute centres
    // of the original subpaths (0..100 → 50,50 and 20..60 → 40,40).
    expect(pieces[0].getCenterPoint().x).toBeCloseTo(50, 6);
    expect(pieces[0].getCenterPoint().y).toBeCloseTo(50, 6);
    expect(pieces[1].getCenterPoint().x).toBeCloseTo(40, 6);
    expect(pieces[1].getCenterPoint().y).toBeCloseTo(40, 6);
  });

  it('releaseCompoundPath returns false for single-subpath paths', () => {
    const simple = new fabric.Path('M 0 0 L 100 0 L 100 100 Z');
    const c = makeCanvas([simple]);
    mockCanvas(c);
    expect(releaseCompoundPath()).toBe(false);
    expect(c.add).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();
  });
});
