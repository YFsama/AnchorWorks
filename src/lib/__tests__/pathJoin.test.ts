/**
 * Join Paths (Illustrator Ctrl+J) — nearest-endpoint join / single-close.
 *
 * joinSelection flattens the selected paths through the real outline
 * pipeline, then:
 *   - 2 open paths → concatenates them at whichever endpoint pair is
 *     nearest (all four start/end pairings are considered, so draw
 *     direction never matters)
 *   - 1 open path → closes it with a Z
 *   - 1 closed path / any other selection shape → no-op
 * and rebuilds one new fabric.Path in absolute space, styled from the
 * FIRST selected path.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canJoin, joinSelection } from '../pathJoin';
import * as canvasEngine from '../canvasEngine';

type Cmd = [string, number?, number?];

/** Pin the object to its d-coordinates (exact absolute-space round trip).
 *  NOTE: this only holds while the d-bbox starts at the origin — fabric
 *  honours left/top by moving the bbox min there. For non-origin d use
 *  default placement (fabric pins the d-bbox centre to the object centre,
 *  so scene == d exactly). */
const OPTS = { left: 0, top: 0, fill: '', stroke: '#000', strokeWidth: 0 } as const;

function anchors(p: fabric.Path): { pts: Array<[number, number]>; closed: boolean } {
  const pts: Array<[number, number]> = [];
  let closed = false;
  for (const seg of p.path as unknown as Cmd[]) {
    const c = String(seg[0]).toUpperCase();
    if (c === 'M' || c === 'L') pts.push([seg[1] ?? 0, seg[2] ?? 0]);
    if (c === 'Z') closed = true;
  }
  return { pts, closed };
}

function makeCanvas(objects: fabric.FabricObject[]) {
  return {
    getActiveObjects: () => objects,
    remove: vi.fn(),
    add: vi.fn(),
    setActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
  };
}

/** Two L-shaped open paths whose nearest endpoints meet at (100,100).
 *  Default placement (no left/top) pins scene == d for both — the shape the
 *  old {left:0,top:0} OPTS only achieved for origin-bbox d (P1-6). */
function cornerPair(): [fabric.Path, fabric.Path] {
  return [
    new fabric.Path('M 0 0 L 100 0 L 100 60'),
    new fabric.Path('M 100 100 L 100 160 L 160 160'),
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('canJoin', () => {
  it('is true for exactly one or two selected paths', () => {
    const one = makeCanvas([new fabric.Path('M 0 0 L 10 0', OPTS)]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(one as never);
    expect(canJoin()).toBe(true);

    const [a, b] = cornerPair();
    const two = makeCanvas([a, b]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(two as never);
    expect(canJoin()).toBe(true);
  });

  it('is false for zero, three, or non-path selections', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(makeCanvas([]) as never);
    expect(canJoin()).toBe(false);

    const three = makeCanvas([
      new fabric.Path('M 0 0 L 10 0', OPTS),
      new fabric.Path('M 20 0 L 30 0', OPTS),
      new fabric.Path('M 40 0 L 50 0', OPTS),
    ]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(three as never);
    expect(canJoin()).toBe(false);

    // Non-path objects don't count toward the 1-or-2 path requirement.
    const mixed = makeCanvas([new fabric.Path('M 0 0 L 10 0', OPTS), new fabric.Rect({ width: 5, height: 5 })]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(mixed as never);
    expect(canJoin()).toBe(true);
  });

  it('is false without a live canvas', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(canJoin()).toBe(false);
  });
});

describe('joinSelection — two open paths', () => {
  it('connects the nearest endpoints into one continuous path', () => {
    const [a, b] = cornerPair();
    const c = makeCanvas([a, b]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(joinSelection()).toBe(true);
    expect(c.add).toHaveBeenCalledOnce();
    const joined = c.add.mock.calls[0][0] as fabric.Path;
    expect(joined).toBeInstanceOf(fabric.Path);
    // Both originals removed, result selected, canvas re-rendered, history pushed.
    expect(c.remove).toHaveBeenCalledWith(a);
    expect(c.remove).toHaveBeenCalledWith(b);
    expect(c.setActiveObject).toHaveBeenCalledWith(joined);
    expect(c.requestRenderAll).toHaveBeenCalledOnce();

    const { pts, closed } = anchors(joined);
    expect(closed).toBe(false);
    // Continuous chain: a runs (0,0)→(100,60), then b picks up at its
    // nearest endpoint (100,100) and runs to (160,160).
    expect(pts).toHaveLength(6);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[2]).toEqual([100, 60]);
    expect(pts[3][0]).toBeCloseTo(100, 1);
    expect(pts[3][1]).toBeCloseTo(100, 1);
    expect(pts[5][0]).toBeCloseTo(160, 1);
    expect(pts[5][1]).toBeCloseTo(160, 1);
  });

  it('reverses the second path when it was drawn from the far end', () => {
    // Same L-shape, but b drawn right-to-left — nearest pair is now a's
    // (100,60) to b's END (100,100), so b must be reversed before concat.
    // (Default placement keeps scene == d for the non-origin b — P1-6.)
    const a = new fabric.Path('M 0 0 L 100 0 L 100 60');
    const b = new fabric.Path('M 160 160 L 100 160 L 100 100');
    const c = makeCanvas([a, b]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(joinSelection()).toBe(true);
    const joined = c.add.mock.calls[0][0] as fabric.Path;
    const { pts } = anchors(joined);
    // Identical resulting chain regardless of b's draw direction.
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[5][0]).toBeCloseTo(160, 1);
    expect(pts[5][1]).toBeCloseTo(160, 1);
  });

  it('reverses the first path when its start is the nearest endpoint', () => {
    // a drawn end-to-start so its START (100,60) is nearest to b's start.
    // (Default placement keeps scene == d for the non-origin b — P1-6.)
    const a = new fabric.Path('M 100 60 L 100 0 L 0 0', OPTS);
    const b = new fabric.Path('M 100 100 L 100 160 L 160 160');
    const c = makeCanvas([a, b]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(joinSelection()).toBe(true);
    const { pts } = anchors(c.add.mock.calls[0][0] as fabric.Path);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[5][0]).toBeCloseTo(160, 1);
  });

  it('styles the joined path from the first selected path', () => {
    const a = new fabric.Path('M 0 0 L 100 0', { ...OPTS, stroke: '#123456', strokeWidth: 4, opacity: 0.7 });
    const b = new fabric.Path('M 100 0 L 100 100', { ...OPTS, stroke: '#ffffff', strokeWidth: 9 });
    const c = makeCanvas([a, b]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    joinSelection();
    const joined = c.add.mock.calls[0][0] as fabric.Path;
    expect(joined.stroke).toBe('#123456');
    expect(joined.strokeWidth).toBe(4);
    expect(joined.opacity).toBe(0.7);
  });

  it('defaults stroke to #111 / strokeWidth 1 for style-less sources', () => {
    // No explicit strokeWidth → fabric's default 1 flows through `?? 1`,
    // null stroke falls back to the join default #111.
    const a = new fabric.Path('M 0 0 L 100 0', { left: 0, top: 0 });
    const b = new fabric.Path('M 100 0 L 100 100', { left: 0, top: 0 });
    const c = makeCanvas([a, b]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    joinSelection();
    const joined = c.add.mock.calls[0][0] as fabric.Path;
    expect(joined.stroke).toBe('#111');
    expect(joined.strokeWidth).toBe(1);
  });
});

describe('joinSelection — single path', () => {
  it('closes one open path with a Z', () => {
    const open = new fabric.Path('M 0 0 L 100 0 L 100 100', OPTS);
    const c = makeCanvas([open]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(joinSelection()).toBe(true);
    const closed = c.add.mock.calls[0][0] as fabric.Path;
    const { pts, closed: hasZ } = anchors(closed);
    expect(hasZ).toBe(true);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[2]).toEqual([100, 100]);
    expect(c.remove).toHaveBeenCalledWith(open);
  });

  it('is a no-op for an already-closed single path', () => {
    const ring = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', OPTS);
    const c = makeCanvas([ring]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(joinSelection()).toBe(false);
    expect(c.add).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();
  });

  it('closes an off-origin path without shifting it (P1-6)', () => {
    // The d-bbox starts at (0,10) and the object uses fabric's default
    // placement (scene geometry = d geometry). Closing it must keep every
    // anchor on the input coordinates — historically the rebuild came back
    // shifted by the bbox minimum (y≈10 → y≈20).
    const open = new fabric.Path('M 0 10 L 100 10 L 100 60');
    const c = makeCanvas([open]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(joinSelection()).toBe(true);
    const closedPath = c.add.mock.calls[0][0] as fabric.Path;
    const { pts, closed } = anchors(closedPath);
    expect(closed).toBe(true);
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBeCloseTo(0, 1);
    expect(pts[0][1]).toBeCloseTo(10, 1);
    expect(pts[2][0]).toBeCloseTo(100, 1);
    expect(pts[2][1]).toBeCloseTo(60, 1);
  });
});

describe('joinSelection — guards', () => {
  it('returns false without a canvas, or with 0 / 3 paths', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(joinSelection()).toBe(false);

    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(makeCanvas([]) as never);
    expect(joinSelection()).toBe(false);

    const three = makeCanvas([
      new fabric.Path('M 0 0 L 10 0', OPTS),
      new fabric.Path('M 20 0 L 30 0', OPTS),
      new fabric.Path('M 40 0 L 50 0', OPTS),
    ]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(three as never);
    expect(joinSelection()).toBe(false);
  });

  it('ignores non-path objects mixed into the selection', () => {
    const a = new fabric.Path('M 0 0 L 100 0', OPTS);
    const b = new fabric.Path('M 100 0 L 100 100', OPTS);
    const c = makeCanvas([a, b, new fabric.Rect({ width: 5, height: 5 })]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    // The two paths still join; the rect is left untouched.
    expect(joinSelection()).toBe(true);
    expect(c.remove).toHaveBeenCalledTimes(2);
    expect(c.remove).not.toHaveBeenCalledWith(expect.any(fabric.Rect));
  });

  it('no-ops when a degenerate (<2 anchor) path is involved', () => {
    const lone = new fabric.Path('M 0 0', OPTS); // single anchor — nothing to join
    const other = new fabric.Path('M 50 0 L 100 0', OPTS);
    const c = makeCanvas([lone, other]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(joinSelection()).toBe(false);
    expect(c.add).not.toHaveBeenCalled();
  });
});
