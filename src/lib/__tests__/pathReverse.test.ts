/**
 * Reverse Path Direction tests.
 *
 * reversePathObject runs the REAL outline pipeline (buildOutlineCutPaths →
 * px→mm→px round trip) on origin-pinned fabric paths (see offsetPath.test.ts
 * for why off-origin placement is avoided while the contour fix lands), then
 * rebuilds the path with the point order flipped:
 *
 *  - open path: start and end literally swap (first command = old last point)
 *  - closed path: geometry is byte-identical, but the winding (shoelace sign)
 *    flips — the actual cut-direction semantic
 *  - compound paths: every subpath is reversed and stays closed
 *  - degenerate single-anchor paths produce nothing → null
 *  - style (fill/stroke/strokeWidth/opacity) is inherited, original replaced
 *
 * canReversePathObject only accepts fabric paths. Selection helpers follow the
 * usual canvas-mock conventions: counts, guards, discard/render/history.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canReversePath, canReversePathObject, reversePathObject, reversePathSelection } from '../pathReverse';
import * as canvasEngine from '../canvasEngine';
import { buildOutlineCutPaths } from '../contourFromSelection';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCanvas(active: fabric.FabricObject[]) {
  const c = {
    getObjects: () => active,
    getActiveObjects: () => active,
    remove: vi.fn(),
    add: vi.fn(),
    setActiveObject: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
    fire: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
  return { c, history };
}

/** Commands of a rebuilt path as [kind, x, y] tuples (M/L + trailing Z). */
function cmds(p: fabric.Path): Array<[string, number, number]> {
  return p.path as unknown as Array<[string, number, number]>;
}

/** Shoelace ×2 over the M/L commands — sign encodes the winding direction. */
function shoelace2(p: fabric.Path): number {
  let a = 0;
  const cs = cmds(p).filter(([t]) => t === 'M' || t === 'L');
  for (let i = 0; i < cs.length; i++) {
    const [, x1, y1] = cs[i];
    const [, x2, y2] = cs[(i + 1) % cs.length];
    a += x1 * y2 - x2 * y1;
  }
  return a;
}

describe('canReversePathObject', () => {
  it('accepts only real fabric paths', () => {
    expect(canReversePathObject(new fabric.Path('M 0 0 L 10 0'))).toBe(true);
    expect(canReversePathObject(new fabric.Rect({ width: 10, height: 10 }))).toBe(false);
    expect(canReversePathObject(new fabric.Circle({ radius: 5 }))).toBe(false);
    expect(canReversePathObject({ type: 'textbox' } as fabric.FabricObject)).toBe(false);
  });
});

describe('reversePathObject', () => {
  it('returns null for non-paths without touching the canvas', () => {
    const { c } = makeCanvas([]);
    expect(reversePathObject(c as unknown as fabric.Canvas, new fabric.Rect({ width: 5, height: 5 }))).toBeNull();
    expect(reversePathObject(c as unknown as fabric.Canvas, { type: 'textbox' } as fabric.FabricObject)).toBeNull();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.add).not.toHaveBeenCalled();
  });

  it('returns null for a degenerate single-anchor path (nothing to reverse)', () => {
    const { c } = makeCanvas([]);
    expect(reversePathObject(c as unknown as fabric.Canvas, new fabric.Path('M 5 5'))).toBeNull();
    expect(c.remove).not.toHaveBeenCalled();
  });

  it('swaps start and end of an open path (first command = old last point)', () => {
    const { c } = makeCanvas([]);
    const src = new fabric.Path('M 0 0 L 100 0');
    const out = reversePathObject(c as unknown as fabric.Canvas, src);
    expect(out).toBeInstanceOf(fabric.Path);
    // Source outline: (0,0) → (100,0). Reversed path starts at the far end.
    expect(cmds(out!)[0][0]).toBe('M');
    expect(cmds(out!)[0][1]).toBeCloseTo(100, 1);
    expect(cmds(out!)[0][2]).toBeCloseTo(0, 1);
    expect(cmds(out!)[1][0]).toBe('L');
    expect(cmds(out!)[1][1]).toBeCloseTo(0, 1);
    expect(cmds(out!)[1][2]).toBeCloseTo(0, 1);
    // Open stays open — no Z command.
    expect(cmds(out!).some(([t]) => t === 'Z')).toBe(false);
  });

  it('flips the winding of a closed square while keeping its geometry', () => {
    const { c } = makeCanvas([]);
    const src = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', {
      fill: '#111111', stroke: '#abcdef', strokeWidth: 0, opacity: 0.6,
    });
    const out = reversePathObject(c as unknown as fabric.Canvas, src);
    expect(out).toBeInstanceOf(fabric.Path);

    // Reversed against the source's own outline winding (same pipeline, same space).
    const srcPoints = buildOutlineCutPaths([src], 0, 1)[0].points;
    let srcA = 0;
    for (let i = 0; i < srcPoints.length; i++) {
      const [x1, y1] = srcPoints[i];
      const [x2, y2] = srcPoints[(i + 1) % srcPoints.length];
      srcA += x1 * y2 - x2 * y1;
    }
    // Same magnitude (mm vs px scale differs, but the SIGN relationship holds).
    expect(Math.sign(shoelace2(out!))).toBe(-Math.sign(srcA));

    // Geometry preserved: identical bbox, loop still closed with a Z.
    const b = out!.getBoundingRect();
    expect(b.left).toBeCloseTo(0, 0);
    expect(b.top).toBeCloseTo(0, 0);
    expect(b.width).toBeCloseTo(100, 0);
    expect(b.height).toBeCloseTo(100, 0);
    expect(cmds(out!).some(([t]) => t === 'Z')).toBe(true);

    // Style inherited; original replaced by the reversed copy.
    expect(out!.fill).toBe('#111111');
    expect(out!.stroke).toBe('#abcdef');
    expect(out!.opacity).toBeCloseTo(0.6, 6);
    expect(c.remove).toHaveBeenCalledWith(src);
    expect(c.add).toHaveBeenCalledWith(out);
  });

  it('reverses every subpath of a compound path, all kept closed', () => {
    const { c } = makeCanvas([]);
    const src = new fabric.Path(
      'M 0 0 L 100 0 L 100 100 L 0 100 Z M 250 0 L 300 0 L 300 50 L 250 50 Z',
      { strokeWidth: 0 },
    );
    const out = reversePathObject(c as unknown as fabric.Canvas, src);
    expect(out).toBeInstanceOf(fabric.Path);
    const zCount = cmds(out!).filter(([t]) => t === 'Z').length;
    expect(zCount).toBe(2);
    // Both loops survived: bbox spans both source squares.
    const b = out!.getBoundingRect();
    expect(b.width).toBeCloseTo(300, 0);
    expect(b.height).toBeCloseTo(100, 0);
  });
});

describe('canReversePath / reversePathSelection', () => {
  it('canReversePath is false without a canvas or without a path selection', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(canReversePath()).toBe(false);
    const { c } = makeCanvas([new fabric.Rect({ width: 5, height: 5 })]);
    expect(canReversePath()).toBe(false);
    void c;
  });

  it('returns 0 without a canvas, or when the selection has no paths', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(reversePathSelection()).toBe(0);
    const { c, history } = makeCanvas([new fabric.Rect({ width: 5, height: 5 })]);
    expect(reversePathSelection()).toBe(0);
    expect(c.add).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('reverses each selected path once, discards selection, pushes one history entry', () => {
    const { c, history } = makeCanvas([
      new fabric.Path('M 0 0 L 10 0'),
      new fabric.Path('M 0 0 L 10 0 L 10 10 Z'),
      new fabric.Rect({ width: 5, height: 5 }), // ignored — not a path
    ]);
    expect(reversePathSelection()).toBe(2);
    expect(c.add).toHaveBeenCalledTimes(2);
    expect(c.discardActiveObject).toHaveBeenCalled();
    expect(c.requestRenderAll).toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(1);
  });
});
