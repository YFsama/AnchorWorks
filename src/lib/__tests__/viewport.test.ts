import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import * as canvasEngine from '../canvasEngine';
import { zoomToActiveArtboard, zoomToAdjacentArtboard, zoomToAllArtboards } from '../viewport';
import { useEditor } from '../../store/editor';

describe('viewport active artboard navigation', () => {
  const originalArtboards = useEditor.getState().artboards;
  const originalZoom = useEditor.getState().zoom;

  afterEach(() => {
    vi.restoreAllMocks();
    useEditor.getState().setArtboards(originalArtboards);
    useEditor.getState().setZoom(originalZoom);
  });

  it('zooms and pans to the artboard containing the active object', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 200, y: 50, width: 200, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 250, top: 80, width: 20, height: 20, strokeWidth: 0 });
    const viewportTransform = [1, 0, 0, 1, 0, 0];
    const setZoom = vi.fn((zoom: number) => { viewportTransform[0] = zoom; viewportTransform[3] = zoom; });
    const setViewportTransform = vi.fn((next: number[]) => {
      viewportTransform.splice(0, viewportTransform.length, ...next);
    });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getWidth: () => 1000,
      getHeight: () => 500,
      setZoom,
      viewportTransform,
      setViewportTransform,
    } as never);

    expect(zoomToActiveArtboard()).toBe(true);
    expect(setZoom).toHaveBeenCalledWith(4.5);
    expect(setViewportTransform).toHaveBeenCalledWith([4.5, 0, 0, 4.5, -850, -200]);
    expect(useEditor.getState().zoom).toBe(4.5);
  });

  it('does not change the viewport when the active object is outside artboards', () => {
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 }]);
    const active = new fabric.Rect({ left: 200, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const setZoom = vi.fn();
    const setViewportTransform = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getWidth: () => 1000,
      getHeight: () => 500,
      setZoom,
      viewportTransform: [1, 0, 0, 1, 0, 0],
      setViewportTransform,
    } as never);

    expect(zoomToActiveArtboard()).toBe(false);
    expect(setZoom).not.toHaveBeenCalled();
    expect(setViewportTransform).not.toHaveBeenCalled();
  });

  it('cycles to the next artboard from the active object artboard', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 200, y: 50, width: 200, height: 100 },
      { id: 'ab-3', name: 'Third', x: 500, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 250, top: 80, width: 20, height: 20, strokeWidth: 0 });
    const viewportTransform = [1, 0, 0, 1, 0, 0];
    const setZoom = vi.fn((zoom: number) => { viewportTransform[0] = zoom; viewportTransform[3] = zoom; });
    const setViewportTransform = vi.fn((next: number[]) => {
      viewportTransform.splice(0, viewportTransform.length, ...next);
    });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getWidth: () => 1000,
      getHeight: () => 500,
      getZoom: () => viewportTransform[0],
      setZoom,
      viewportTransform,
      setViewportTransform,
    } as never);

    expect(zoomToAdjacentArtboard(1)).toBe(true);
    expect(setZoom).toHaveBeenCalledWith(4.5);
    expect(setViewportTransform).toHaveBeenCalledWith([4.5, 0, 0, 4.5, -1975, 25]);
  });

  it('uses the viewport center when no object is active', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 200, y: 0, width: 100, height: 100 },
    ]);
    const viewportTransform = [1, 0, 0, 1, 250, 200];
    const setZoom = vi.fn((zoom: number) => { viewportTransform[0] = zoom; viewportTransform[3] = zoom; });
    const setViewportTransform = vi.fn((next: number[]) => {
      viewportTransform.splice(0, viewportTransform.length, ...next);
    });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => null,
      getWidth: () => 1000,
      getHeight: () => 500,
      getZoom: () => viewportTransform[0],
      setZoom,
      viewportTransform,
      setViewportTransform,
    } as never);

    expect(zoomToAdjacentArtboard(-1)).toBe(true);
    expect(setViewportTransform).toHaveBeenCalledWith([4.5, 0, 0, 4.5, 275, 25]);
  });


  it('fits all artboards into the viewport', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 200, y: 50, width: 200, height: 100 },
      { id: 'ab-3', name: 'Third', x: -100, y: 200, width: 50, height: 50 },
    ]);
    const viewportTransform = [1, 0, 0, 1, 0, 0];
    const setZoom = vi.fn((zoom: number) => { viewportTransform[0] = zoom; viewportTransform[3] = zoom; });
    const setViewportTransform = vi.fn((next: number[]) => {
      viewportTransform.splice(0, viewportTransform.length, ...next);
    });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => null,
      getWidth: () => 1000,
      getHeight: () => 500,
      setZoom,
      viewportTransform,
      setViewportTransform,
    } as never);

    expect(zoomToAllArtboards()).toBe(true);
    expect(setZoom).toHaveBeenCalledWith(1.8);
    expect(setViewportTransform).toHaveBeenCalledWith([1.8, 0, 0, 1.8, 230, 25]);
  });

  it('does not fit all artboards when none exist', () => {
    useEditor.getState().setArtboards([]);
    const getCanvas = vi.spyOn(canvasEngine, 'getCanvas');

    expect(zoomToAllArtboards()).toBe(false);
    expect(getCanvas).not.toHaveBeenCalled();
  });

});
