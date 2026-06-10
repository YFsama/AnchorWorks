import * as fabric from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countSymbolInstanceMatches, detachSymbolMetadataFromObjects, selectAllSymbolInstances, getSymbols, SYMBOLS_STORAGE_KEY, writeSymbolsForTest } from '../symbols';
import type { SymbolEntry } from '../../types';
import * as canvasEngine from '../canvasEngine';

const dispatch = vi.fn();

function symbol(id: string, name = 'Symbol'): SymbolEntry {
  return { id, name, thumbnail: '', objectsJSON: [{ type: 'rect', left: 0, top: 0, width: 10, height: 10 }], addedAt: 1 };
}

describe('symbols storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    dispatch.mockClear();
    window.dispatchEvent = dispatch;
  });

  it('writes symbols to the shared symbol storage key and notifies listeners', () => {
    writeSymbolsForTest([symbol('sym-a', 'A')]);

    expect(localStorage.getItem(SYMBOLS_STORAGE_KEY)).toContain('sym-a');
    expect(getSymbols()[0].name).toBe('A');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'vector:symbols-changed' }));
  });

  it('returns an empty list for invalid persisted data', () => {
    localStorage.setItem(SYMBOLS_STORAGE_KEY, '{broken');

    expect(getSymbols()).toEqual([]);
  });
});


describe('symbol instance detach helpers', () => {
  it('removes symbol metadata from selected instances and nested children', () => {
    const parent = {
      symbolId: 'sym-a',
      _objects: [{ symbolId: 'sym-a' }, { fill: '#fff' }],
    };

    const count = detachSymbolMetadataFromObjects([parent as never]);

    expect(count).toBe(2);
    expect(parent.symbolId).toBeUndefined();
    expect(parent._objects[0].symbolId).toBeUndefined();
  });

  it('counts nested symbol instances for library selection', () => {
    const parent = {
      symbolId: 'sym-a',
      _objects: [
        { symbolId: 'sym-a' },
        { symbolId: 'sym-b' },
        { _objects: [{ symbolId: 'sym-a' }] },
      ],
    };

    expect(countSymbolInstanceMatches(parent as never, 'sym-a')).toBe(3);
    expect(countSymbolInstanceMatches(parent as never, 'sym-b')).toBe(1);
    expect(countSymbolInstanceMatches(parent as never, 'sym-missing')).toBe(0);
    expect(countSymbolInstanceMatches(parent as never, '')).toBe(0);
  });
});


describe('symbol instance selection helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('selects every exportable object containing symbol metadata', () => {
    const first = new fabric.Rect({ width: 10, height: 10 });
    const nested = new fabric.Group([new fabric.Rect({ width: 5, height: 5 })]);
    const plain = new fabric.Rect({ width: 10, height: 10 });
    const overlay = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    (first as unknown as { symbolId?: string }).symbolId = 'sym-a';
    ((nested as unknown as { _objects: fabric.FabricObject[] })._objects[0] as unknown as { symbolId?: string }).symbolId = 'sym-b';
    (overlay as unknown as { symbolId?: string }).symbolId = 'sym-c';
    let active: fabric.FabricObject | fabric.ActiveSelection | null = null;
    const canvas = {
      getObjects: () => [first, nested, plain, overlay],
      getActiveObjects: () => active instanceof fabric.ActiveSelection ? active.getObjects() : active ? [active] : [],
      getActiveObject: () => active,
      discardActiveObject: vi.fn(() => { active = null; }),
      setActiveObject: vi.fn((object: fabric.FabricObject | fabric.ActiveSelection) => { active = object; }),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAllSymbolInstances()).toBe(2);
    const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
    expect(selection.getObjects()).toEqual([first, nested]);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not alter selection when no symbol instances exist', () => {
    const canvas = {
      getObjects: () => [new fabric.Rect({ width: 10, height: 10 })],
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    expect(selectAllSymbolInstances()).toBe(0);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  });
});
