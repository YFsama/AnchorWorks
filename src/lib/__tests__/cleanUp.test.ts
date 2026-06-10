import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCleanupJunk, selectCleanupObjects } from '../cleanUp';
import * as canvasEngine from '../canvasEngine';

const textObject = (text: string) => ({ type: 'textbox', text, width: 50, height: 20, scaleX: 1, scaleY: 1 }) as unknown as fabric.FabricObject;
const zeroObject = (extra: Record<string, unknown> = {}) => ({ type: 'rect', width: 0, height: 0, scaleX: 1, scaleY: 1, ...extra }) as unknown as fabric.FabricObject;

describe('cleanup candidate detection', () => {
  it('identifies empty text, stray paths, and zero-size objects', () => {
    const emptyText = textObject('   ');
    const text = textObject('Label');
    const strayPath = new fabric.Path('M 0 0');
    const path = new fabric.Path('M 0 0 L 10 10');
    const zeroSize = zeroObject();
    const overlay = zeroObject({ excludeFromExport: true });

    expect(isCleanupJunk(emptyText)).toBe(true);
    expect(isCleanupJunk(text)).toBe(false);
    expect(isCleanupJunk(strayPath)).toBe(true);
    expect(isCleanupJunk(path)).toBe(false);
    expect(isCleanupJunk(zeroSize)).toBe(true);
    expect(isCleanupJunk(overlay)).toBe(false);
  });
});

describe('selectCleanupObjects', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects cleanup candidates without removing them', () => {
    const zeroSize = new fabric.Rect({ width: 0, height: 0 });
    const keepText = textObject('Keep');
    const strayPath = new fabric.Path('M 0 0');
    const objects = [zeroSize, keepText, strayPath];
    const canvas = {
      getObjects: () => objects,
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      remove: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCleanupObjects()).toBe(2);
    expect(canvas.remove).not.toHaveBeenCalled();
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([zeroSize, strayPath]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when there are no cleanup candidates', () => {
    const canvas = {
      getObjects: () => [textObject('Keep'), new fabric.Path('M 0 0 L 10 10')],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectCleanupObjects()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });
});
