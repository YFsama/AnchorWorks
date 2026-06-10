import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { useEditor } from '../../store/editor';
import * as canvasEngine from '../canvasEngine';
import { addPrintMarksToArtboard, clearPrintMarks, createPrintMarkObjects } from '../printMarks';

describe('print mark generation', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 12 }),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => null),
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates editable crop, registration, bleed, and page-info marks', () => {
    const marks = createPrintMarkObjects({ left: 0, top: 0, width: 100, height: 80 }, { bleedMm: 3 });
    const kinds = marks.map((mark) => (mark as { printMarkKind?: string }).printMarkKind);

    expect(marks).toHaveLength(26);
    expect(kinds.filter((kind) => kind === 'crop')).toHaveLength(8);
    expect(kinds.filter((kind) => kind === 'registration')).toHaveLength(16);
    expect(kinds.filter((kind) => kind === 'bleed')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'page-info')).toHaveLength(1);
    expect(marks.every((mark) => mark.selectable !== false && mark.excludeFromExport === false)).toBe(true);
  });

  it('adds generated print marks around the first artboard and selects them', () => {
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-test', name: 'Press Sheet', x: 10, y: 20, width: 200, height: 100 }]);
    const added: fabric.FabricObject[] = [];
    const canvas = {
      add: vi.fn((object: fabric.FabricObject) => { added.push(object); }),
      discardActiveObject: vi.fn(),
      setActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      _onObjectAdded: vi.fn(),
      _onObjectRemoved: vi.fn(),
      fire: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      expect(addPrintMarksToArtboard()).toBe(26);
      expect(added).toHaveLength(26);
      expect(canvas.setActiveObject).toHaveBeenCalledOnce();
      const selection = canvas.setActiveObject.mock.calls[0][0] as fabric.ActiveSelection;
      expect(selection.getObjects()).toEqual(added);
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
      expect(pushHistory).toHaveBeenCalledOnce();
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('clears existing print marks without removing normal artwork', () => {
    const crop = new fabric.Line([0, 0, 10, 0]);
    (crop as unknown as { printMarkKind: string }).printMarkKind = 'crop';
    const registration = new fabric.Circle({ radius: 3 });
    (registration as unknown as { printMarkKind: string }).printMarkKind = 'registration';
    const artwork = new fabric.Rect({ width: 10, height: 10 });
    const canvas = {
      getObjects: () => [crop, registration, artwork],
      remove: vi.fn(),
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    expect(clearPrintMarks()).toBe(2);
    expect(canvas.remove).toHaveBeenCalledWith(crop);
    expect(canvas.remove).toHaveBeenCalledWith(registration);
    expect(canvas.remove).not.toHaveBeenCalledWith(artwork);
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
  });
});
