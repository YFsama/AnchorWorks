import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { deleteActiveArtboard, duplicateActiveArtboard, duplicateActiveArtboardFrame, exportActiveArtboardAsPNG, exportActiveArtboardAsSVG, exportArtboardRangeAsPNG, exportArtboardsByIdAsPNG, getActiveArtboard, getActiveArtboardName, parseArtboardRange, promptExportArtboardRangeAsPNG, promptRearrangeArtboards, rearrangeArtboards, renameActiveArtboard, renumberArtboardsByPosition, reorderActiveArtboard, sortArtboardsByPosition } from '../artboards';
import { download, downloadDataURL } from '../io';
import { useEditor } from '../../store/editor';
import * as canvasEngine from '../canvasEngine';

vi.mock('../io', () => ({
  download: vi.fn(),
  downloadDataURL: vi.fn(),
}));

describe('artboard operations', () => {
  const originalArtboards = useEditor.getState().artboards;

  afterEach(() => {
    vi.restoreAllMocks();
    useEditor.getState().setArtboards(originalArtboards);
  });

  it('duplicates the artboard containing the active object with its page artwork', async () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const firstBoardObject = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const sameBoardObject = new fabric.Rect({ left: 220, top: 20, width: 20, height: 20, strokeWidth: 0 });
    const overlay = new fabric.Rect({ left: 180, top: 50, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const added: fabric.FabricObject[] = [];
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getObjects: () => [firstBoardObject, active, sameBoardObject, overlay],
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      requestRenderAll: vi.fn(),
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    const duplicated = await duplicateActiveArtboard();

    expect(duplicated).toMatchObject({ name: 'Second copy', x: 290, y: 0, width: 100, height: 100 });
    expect(useEditor.getState().artboards).toHaveLength(3);
    expect(added).toHaveLength(2);
    expect(added.map((object) => object.left)).toEqual([300, 350]);
    expect(added.map((object) => object.top)).toEqual([10, 20]);
    expect(pushHistory).toHaveBeenCalledOnce();
  });


  it('duplicates only the active artboard frame without copying artwork', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const add = vi.fn();
    const getObjects = vi.fn(() => [active]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getObjects,
      add,
      requestRenderAll: vi.fn(),
    } as never);

    const duplicated = duplicateActiveArtboardFrame();

    expect(duplicated).toMatchObject({ name: 'Second copy', x: 290, y: 0, width: 100, height: 100 });
    expect(useEditor.getState().artboards).toHaveLength(3);
    expect(getObjects).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('does not duplicate an active artboard frame when the active object is outside all artboards', () => {
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 }]);
    const active = new fabric.Rect({ left: 200, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getObjects: vi.fn(),
      add: vi.fn(),
    } as never);

    expect(duplicateActiveArtboardFrame()).toBeNull();
    expect(useEditor.getState().artboards).toHaveLength(1);
  });

  it('does not duplicate when the active object is outside all artboards', async () => {
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 }]);
    const active = new fabric.Rect({ left: 200, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const add = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      getObjects: () => [active],
      add,
      requestRenderAll: vi.fn(),
    } as never);

    await expect(duplicateActiveArtboard()).resolves.toBeNull();
    expect(useEditor.getState().artboards).toHaveLength(1);
    expect(add).not.toHaveBeenCalled();
  });

  it('moves the active artboard earlier and later in export order', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 160, y: 0, width: 100, height: 100 },
      { id: 'ab-3', name: 'Third', x: 320, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
    } as never);

    expect(reorderActiveArtboard('previous')).toBe(true);
    expect(useEditor.getState().artboards.map((artboard) => artboard.id)).toEqual(['ab-2', 'ab-1', 'ab-3']);
    expect(reorderActiveArtboard('next')).toBe(true);
    expect(useEditor.getState().artboards.map((artboard) => artboard.id)).toEqual(['ab-1', 'ab-2', 'ab-3']);
  });

  it('moves the active artboard to first and last positions', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 160, y: 0, width: 100, height: 100 },
      { id: 'ab-3', name: 'Third', x: 320, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
    } as never);

    expect(reorderActiveArtboard('last')).toBe(true);
    expect(useEditor.getState().artboards.map((artboard) => artboard.id)).toEqual(['ab-1', 'ab-3', 'ab-2']);
    expect(reorderActiveArtboard('first')).toBe(true);
    expect(useEditor.getState().artboards.map((artboard) => artboard.id)).toEqual(['ab-2', 'ab-1', 'ab-3']);
  });

  it('does not move the active artboard past order boundaries', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
    } as never);

    expect(reorderActiveArtboard('previous')).toBe(false);
    expect(reorderActiveArtboard('first')).toBe(false);
    expect(useEditor.getState().artboards.map((artboard) => artboard.id)).toEqual(['ab-1', 'ab-2']);
  });


  it('sorts artboards by top-to-bottom then left-to-right position', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-3', name: 'Bottom Left', x: 0, y: 200, width: 100, height: 100 },
      { id: 'ab-2', name: 'Top Right', x: 220, y: 5, width: 100, height: 100 },
      { id: 'ab-1', name: 'Top Left', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-4', name: 'Bottom Right', x: 220, y: 210, width: 100, height: 100 },
    ]);

    expect(sortArtboardsByPosition()).toBe(true);
    expect(useEditor.getState().artboards.map((artboard) => artboard.id)).toEqual(['ab-1', 'ab-2', 'ab-3', 'ab-4']);
  });

  it('does not sort artboards when order already matches position', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Top Left', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Top Right', x: 220, y: 5, width: 100, height: 100 },
    ]);

    expect(sortArtboardsByPosition()).toBe(false);
    expect(useEditor.getState().artboards.map((artboard) => artboard.id)).toEqual(['ab-1', 'ab-2']);
  });


  it('renumbers artboards by visual position and updates order', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-3', name: 'Back', x: 0, y: 200, width: 100, height: 100 },
      { id: 'ab-2', name: 'Cover', x: 220, y: 5, width: 100, height: 100 },
      { id: 'ab-1', name: 'Intro', x: 0, y: 0, width: 100, height: 100 },
    ]);

    expect(renumberArtboardsByPosition('Page')).toBe(true);
    expect(useEditor.getState().artboards.map((artboard) => [artboard.id, artboard.name])).toEqual([
      ['ab-1', 'Page 1'],
      ['ab-2', 'Page 2'],
      ['ab-3', 'Page 3'],
    ]);
  });

  it('does not renumber when artboards already match visual numbering', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Artboard 1', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Artboard 2', x: 220, y: 5, width: 100, height: 100 },
    ]);

    expect(renumberArtboardsByPosition()).toBe(false);
    expect(useEditor.getState().artboards.map((artboard) => artboard.name)).toEqual(['Artboard 1', 'Artboard 2']);
  });

  it('deletes the artboard containing the active object', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
    } as never);

    expect(deleteActiveArtboard()).toBe(true);
    expect(useEditor.getState().artboards).toEqual([{ id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 }]);
  });

  it('does not delete when the active object is outside all artboards', () => {
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 }]);
    const active = new fabric.Rect({ left: 200, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
    } as never);

    expect(deleteActiveArtboard()).toBe(false);
    expect(useEditor.getState().artboards).toHaveLength(1);
  });

  it('renames the artboard containing the active object', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Second', x: 160, y: 0, width: 100, height: 100 },
    ]);
    const active = new fabric.Rect({ left: 170, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
    } as never);

    expect(getActiveArtboard()?.id).toBe('ab-2');
    expect(getActiveArtboardName()).toBe('Second');
    expect(renameActiveArtboard(' Press Sheet ')).toBe(true);
    expect(useEditor.getState().artboards[0]).toMatchObject({ id: 'ab-1', name: 'First' });
    expect(useEditor.getState().artboards[1]).toMatchObject({ id: 'ab-2', name: 'Press Sheet' });
  });

  it('does not rename when the active object is outside all artboards', () => {
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 }]);
    const active = new fabric.Rect({ left: 200, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
    } as never);

    expect(getActiveArtboardName()).toBeNull();
    expect(renameActiveArtboard('Press Sheet')).toBe(false);
    expect(useEditor.getState().artboards[0]).toMatchObject({ id: 'ab-1', name: 'First' });
  });


  it('exports the active artboard as a cropped PNG download', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First Sheet', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Press/Sheet 02', x: 160, y: 20, width: 200, height: 120 },
    ]);
    const active = new fabric.Rect({ left: 180, top: 40, width: 20, height: 20, strokeWidth: 0 });
    const toDataURL = vi.fn(() => 'data:image/png;base64,active');
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      toDataURL,
    } as never);

    expect(exportActiveArtboardAsPNG()).toBe(true);
    expect(toDataURL).toHaveBeenCalledWith({
      format: 'png',
      multiplier: 2,
      left: 160,
      top: 20,
      width: 200,
      height: 120,
    });
    expect(downloadDataURL).toHaveBeenCalledWith('Press_Sheet_02.png', 'data:image/png;base64,active');
  });
  it('does not export an active artboard when the active object is outside all artboards', async () => {
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 100 }]);
    const active = new fabric.Rect({ left: 200, top: 10, width: 20, height: 20, strokeWidth: 0 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObject: () => active,
      toDataURL: vi.fn(),
    } as never);

    expect(exportActiveArtboardAsPNG()).toBe(false);
    await expect(exportActiveArtboardAsSVG()).resolves.toBe(false);
    expect(downloadDataURL).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('parses Illustrator-style artboard ranges', () => {
    expect(parseArtboardRange('1, 3-5, 2, 3', 5)).toEqual([0, 2, 3, 4, 1]);
    expect(parseArtboardRange('2-2', 3)).toEqual([1]);
    expect(parseArtboardRange('', 3)).toBeNull();
    expect(parseArtboardRange('0', 3)).toBeNull();
    expect(parseArtboardRange('3-1', 3)).toBeNull();
    expect(parseArtboardRange('4', 3)).toBeNull();
  });

  it('exports a PNG artboard range in requested order', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Cover', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Press/Sheet 02', x: 160, y: 20, width: 200, height: 120 },
      { id: 'ab-3', name: 'Back', x: 400, y: 50, width: 80, height: 90 },
    ]);
    const toDataURL = vi.fn(({ left }: { left: number }) => `data:image/png;base64,${left}`);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({ toDataURL } as never);

    expect(exportArtboardRangeAsPNG('2-3,1')).toBe(3);
    expect(toDataURL).toHaveBeenNthCalledWith(1, { format: 'png', multiplier: 2, left: 160, top: 20, width: 200, height: 120 });
    expect(toDataURL).toHaveBeenNthCalledWith(2, { format: 'png', multiplier: 2, left: 400, top: 50, width: 80, height: 90 });
    expect(toDataURL).toHaveBeenNthCalledWith(3, { format: 'png', multiplier: 2, left: 0, top: 0, width: 100, height: 100 });
    expect(downloadDataURL).toHaveBeenNthCalledWith(1, 'Press_Sheet_02.png', 'data:image/png;base64,160');
    expect(downloadDataURL).toHaveBeenNthCalledWith(2, 'Back.png', 'data:image/png;base64,400');
    expect(downloadDataURL).toHaveBeenNthCalledWith(3, 'Cover.png', 'data:image/png;base64,0');
  });

  it('exports selected artboard ids once in panel selection order', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'Cover', x: 0, y: 0, width: 100, height: 100 },
      { id: 'ab-2', name: 'Press/Sheet 02', x: 160, y: 20, width: 200, height: 120 },
      { id: 'ab-3', name: 'Back', x: 400, y: 50, width: 80, height: 90 },
    ]);
    const toDataURL = vi.fn(({ left }: { left: number }) => `data:image/png;base64,${left}`);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({ toDataURL } as never);

    expect(exportArtboardsByIdAsPNG(['ab-3', 'missing', 'ab-1', 'ab-3'])).toBe(2);
    expect(downloadDataURL).toHaveBeenNthCalledWith(1, 'Back.png', 'data:image/png;base64,400');
    expect(downloadDataURL).toHaveBeenNthCalledWith(2, 'Cover.png', 'data:image/png;base64,0');
  });

  it('returns null for invalid or cancelled prompted artboard range export', () => {
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'Cover', x: 0, y: 0, width: 100, height: 100 }]);
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({ toDataURL: vi.fn() } as never);
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('2')
      .mockReturnValueOnce(null);

    expect(promptExportArtboardRangeAsPNG()).toBeNull();
    expect(promptExportArtboardRangeAsPNG()).toBeNull();
    expect(downloadDataURL).not.toHaveBeenCalled();
  });


  it('rearranges artboards into a grid and moves contained artwork', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 80 },
      { id: 'ab-2', name: 'Second', x: 300, y: 40, width: 120, height: 60 },
      { id: 'ab-3', name: 'Third', x: 50, y: 300, width: 90, height: 110 },
    ]);
    const firstObject = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const secondObject = new fabric.Rect({ left: 320, top: 50, width: 20, height: 20, strokeWidth: 0 });
    const thirdObject = new fabric.Rect({ left: 70, top: 320, width: 20, height: 20, strokeWidth: 0 });
    const outsideObject = new fabric.Rect({ left: 600, top: 600, width: 20, height: 20, strokeWidth: 0 });
    const overlay = new fabric.Rect({ left: 320, top: 50, width: 20, height: 20, strokeWidth: 0, excludeFromExport: true });
    const requestRenderAll = vi.fn();
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => [firstObject, secondObject, thirdObject, outsideObject, overlay],
      requestRenderAll,
    } as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => undefined);

    expect(rearrangeArtboards({ columns: 2, spacing: 20, startX: 0, startY: 0 })).toBe(3);
    expect(useEditor.getState().artboards).toEqual([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 80 },
      { id: 'ab-2', name: 'Second', x: 120, y: 0, width: 120, height: 60 },
      { id: 'ab-3', name: 'Third', x: 0, y: 100, width: 90, height: 110 },
    ]);
    expect(firstObject.left).toBe(10);
    expect(firstObject.top).toBe(10);
    expect(secondObject.left).toBe(140);
    expect(secondObject.top).toBe(10);
    expect(thirdObject.left).toBe(20);
    expect(thirdObject.top).toBe(120);
    expect(outsideObject.left).toBe(600);
    expect(overlay.left).toBe(320);
    expect(requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('does not rearrange a single artboard', () => {
    useEditor.getState().setArtboards([{ id: 'ab-1', name: 'First', x: 10, y: 20, width: 100, height: 80 }]);
    const getCanvas = vi.spyOn(canvasEngine, 'getCanvas');

    expect(rearrangeArtboards()).toBe(0);
    expect(useEditor.getState().artboards[0]).toMatchObject({ x: 10, y: 20 });
    expect(getCanvas).not.toHaveBeenCalled();
  });

  it('prompts for rearrange options and keeps artwork in place when requested', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 80 },
      { id: 'ab-2', name: 'Second', x: 300, y: 40, width: 120, height: 60 },
      { id: 'ab-3', name: 'Third', x: 50, y: 300, width: 90, height: 110 },
    ]);
    const firstObject = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, strokeWidth: 0 });
    const getCanvas = vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getObjects: () => [firstObject],
      requestRenderAll: vi.fn(),
    } as never);
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('2')
      .mockReturnValueOnce('20')
      .mockReturnValueOnce('no');

    expect(promptRearrangeArtboards()).toBe(3);
    expect(useEditor.getState().artboards.map((artboard) => [artboard.id, artboard.x, artboard.y])).toEqual([
      ['ab-1', 0, 0],
      ['ab-2', 120, 0],
      ['ab-3', 0, 100],
    ]);
    expect(firstObject.left).toBe(10);
    expect(firstObject.top).toBe(10);
    expect(getCanvas).not.toHaveBeenCalled();
  });

  it('cancels prompted artboard rearrange without changing layout', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 80 },
      { id: 'ab-2', name: 'Second', x: 300, y: 40, width: 120, height: 60 },
    ]);
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null);

    expect(promptRearrangeArtboards()).toBeNull();
    expect(useEditor.getState().artboards.map((artboard) => [artboard.id, artboard.x, artboard.y])).toEqual([
      ['ab-1', 0, 0],
      ['ab-2', 300, 40],
    ]);
  });

  it('rejects invalid prompted artboard rearrange options', () => {
    useEditor.getState().setArtboards([
      { id: 'ab-1', name: 'First', x: 0, y: 0, width: 100, height: 80 },
      { id: 'ab-2', name: 'Second', x: 300, y: 40, width: 120, height: 60 },
    ]);
    vi.spyOn(window, 'prompt').mockReturnValueOnce('0');

    expect(promptRearrangeArtboards()).toBe(-1);
    expect(useEditor.getState().artboards.map((artboard) => [artboard.id, artboard.x, artboard.y])).toEqual([
      ['ab-1', 0, 0],
      ['ab-2', 300, 40],
    ]);
  });

});
