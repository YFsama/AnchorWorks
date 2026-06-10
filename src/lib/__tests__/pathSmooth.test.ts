import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { smoothPathSelection, smoothPolyline } from '../pathSmooth';
import * as canvasEngine from '../canvasEngine';

describe('smoothPolyline', () => {
  it('keeps open endpoints fixed while inserting smoothed points', () => {
    const points: Array<[number, number]> = [[0, 0], [10, 10], [20, 0]];
    const smoothed = smoothPolyline(points, false, 1);
    expect(smoothed[0]).toEqual([0, 0]);
    expect(smoothed.at(-1)).toEqual([20, 0]);
    expect(smoothed.length).toBe(6);
    expect(smoothed[1]).toEqual([2.5, 2.5]);
  });

  it('smooths closed rings without duplicating a fixed endpoint', () => {
    const points: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const smoothed = smoothPolyline(points, true, 1);
    expect(smoothed).toHaveLength(8);
    expect(smoothed[0]).toEqual([2.5, 0]);
    expect(smoothed.at(-1)).toEqual([0, 2.5]);
  });
});

describe('smoothPathSelection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces selected shapes with smoothed editable paths', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 20, height: 10, fill: '#ffffff', stroke: '#000000', strokeWidth: 2 });
    const canvas = { getActiveObjects: () => [rect], remove: vi.fn(), add: vi.fn(), discardActiveObject: vi.fn(), requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(smoothPathSelection()).toBe(1);
    expect(canvas.remove).toHaveBeenCalledWith(rect);
    expect(canvas.add).toHaveBeenCalledOnce();
    expect(canvas.add.mock.calls[0][0]).toBeInstanceOf(fabric.Path);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does nothing without path-like selections', () => {
    const nonPath = { type: 'textbox' } as unknown as fabric.FabricObject;
    const canvas = { getActiveObjects: () => [nonPath], remove: vi.fn(), add: vi.fn(), requestRenderAll: vi.fn() };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(smoothPathSelection()).toBe(0);
    expect(canvas.add).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });
});
