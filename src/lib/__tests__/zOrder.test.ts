/**
 * Z-order operations tests.
 *
 * The four wrappers must (a) delegate to the matching Fabric stacking method
 * with the ACTIVE object, (b) request a render, (c) push history exactly
 * once — and do nothing at all without a live canvas or active object.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bringForward, bringToFront, sendBackward, sendToBack } from '../zOrder';
import * as canvasEngine from '../canvasEngine';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCanvas(active: fabric.FabricObject | null) {
  const c = {
    getActiveObject: () => active,
    bringObjectForward: vi.fn(),
    sendObjectBackwards: vi.fn(),
    bringObjectToFront: vi.fn(),
    sendObjectToBack: vi.fn(),
    requestRenderAll: vi.fn(),
  };
  vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);
  const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
  return { c, history };
}

describe('z-order wrappers', () => {
  it.each([
    ['bringForward', 'bringObjectForward'],
    ['sendBackward', 'sendObjectBackwards'],
    ['bringToFront', 'bringObjectToFront'],
    ['sendToBack', 'sendObjectToBack'],
  ] as const)('%s calls canvas.%s with the active object, renders, pushes history once', (op, method) => {
    const active = new fabric.Rect({ width: 5, height: 5 });
    const { c, history } = makeCanvas(active);
    const fn = { bringForward, sendBackward, bringToFront, sendToBack }[op];
    fn();
    expect(c[method]).toHaveBeenCalledTimes(1);
    expect(c[method]).toHaveBeenCalledWith(active);
    expect(c.requestRenderAll).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['bringForward'],
    ['sendBackward'],
    ['bringToFront'],
    ['sendToBack'],
  ] as const)('%s is a no-op without an active object (no render, no history)', (op) => {
    const { c, history } = makeCanvas(null);
    const fn = { bringForward, sendBackward, bringToFront, sendToBack }[op];
    fn();
    expect(c.bringObjectForward).not.toHaveBeenCalled();
    expect(c.sendObjectBackwards).not.toHaveBeenCalled();
    expect(c.bringObjectToFront).not.toHaveBeenCalled();
    expect(c.sendObjectToBack).not.toHaveBeenCalled();
    expect(c.requestRenderAll).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('is a no-op without a live canvas', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    const history = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    expect(() => {
      bringForward();
      sendBackward();
      bringToFront();
      sendToBack();
    }).not.toThrow();
    expect(history).not.toHaveBeenCalled();
  });
});
