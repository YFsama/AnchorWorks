import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { fitActiveArtboardToContent, fitArtboardToContent } from '../fitArtboard';
import { useEditor } from '../../store/editor';
import * as canvasEngine from '../canvasEngine';

describe('fit artboard operations', () => {
  const originalArtboards = useEditor.getState().artboards;

  afterEach(() => {
    vi.restoreAllMocks();
    useEditor.getState().setArtboards(originalArtboards);
  });

  it('fits the first artboard to all artwork for the legacy command', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 200, y: 0, width: 100, height: 100 },
    ]);
    const first = new fabric.Rect({ left: 20, top: 30, width: 40, height: 20, strokeWidth: 0 });
    const second = new fabric.Rect({ left: 220, top: 40, width: 30, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => [first, second],
      getActiveObject: () => first,
      getActiveObjects: () => [first],
    } as never);

    expect(fitArtboardToContent('all', 0)).toBe(true);
    expect(useEditor.getState().artboards[0]).toMatchObject({ id: 'ab-1', x: 20, y: 30, width: 230, height: 30 });
    expect(useEditor.getState().artboards[1]).toMatchObject({ id: 'ab-2', x: 200, y: 0, width: 100, height: 100 });
  });

  it('fits only the active object artboard to artwork intersecting that artboard', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 120, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 200, y: 0, width: 120, height: 100 },
    ]);
    const firstBoardArtwork = new fabric.Rect({ left: 20, top: 20, width: 40, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 220, top: 30, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardArtwork = new fabric.Rect({ left: 260, top: 45, width: 30, height: 25, strokeWidth: 0 });
    const pasteboardArtwork = new fabric.Rect({ left: 380, top: 30, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getActiveObjects: () => [active],
      getObjects: () => [firstBoardArtwork, active, sameBoardArtwork, pasteboardArtwork],
    } as never);

    expect(fitActiveArtboardToContent('all', 0)).toBe(true);
    expect(useEditor.getState().artboards[0]).toMatchObject({ id: 'ab-1', x: 0, y: 0, width: 120, height: 100 });
    expect(useEditor.getState().artboards[1]).toMatchObject({ id: 'ab-2', x: 220, y: 30, width: 70, height: 40 });
  });

  it('fits the active object artboard to the current selection bounds', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 120, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 200, y: 0, width: 120, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 220, top: 30, width: 20, height: 20, strokeWidth: 0 });
    const selected = new fabric.Rect({ left: 250, top: 60, width: 30, height: 10, strokeWidth: 0 });
    const unselectedSameBoard = new fabric.Rect({ left: 290, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getActiveObjects: () => [active, selected],
      getObjects: () => [active, selected, unselectedSameBoard],
    } as never);

    expect(fitActiveArtboardToContent('selection', 0)).toBe(true);
    expect(useEditor.getState().artboards[1]).toMatchObject({ id: 'ab-2', x: 220, y: 30, width: 60, height: 40 });
  });

  it('does not fit when the active object is outside all artboards', () => {
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 120, height: 100 }]);
    const active = new fabric.Rect({ left: 200, top: 30, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getActiveObjects: () => [active],
      getObjects: () => [active],
    } as never);

    expect(fitActiveArtboardToContent('all', 0)).toBe(false);
    expect(useEditor.getState().artboards[0]).toMatchObject({ id: 'ab-1', x: 0, y: 0, width: 120, height: 100 });
  });
});
