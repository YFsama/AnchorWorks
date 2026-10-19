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

describe('vendor reg-mark and scale-check mark generation', () => {
  const MM_TO_PX = 3.7795;

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

  it('creates Graphtec ARMS L-brackets with 20mm inward arms and 0.7mm stroke', () => {
    const marks = createPrintMarkObjects(
      { left: 10, top: 20, width: 400, height: 300 },
      { cropMarks: false, registrationMarks: true, bleedIndicator: false, pageInfo: false, regMarkStyle: 'graphtec-arms' },
    );
    const lines = marks as fabric.Line[];
    expect(lines).toHaveLength(8);
    expect(marks.every((mark) => (mark as { printMarkKind?: string }).printMarkKind === 'registration')).toBe(true);
    // Top-left bracket vertex sits exactly on the artboard corner (mm-space
    // 0 maps to px-space 0 exactly), arms run inward along the edges.
    const horizontal = lines.find((l) => l.y1 === 20 && l.y2 === 20 && l.x1 === 10);
    const vertical = lines.find((l) => l.x1 === 10 && l.x2 === 10 && l.y1 === 20);
    expect(horizontal).toBeDefined();
    expect(horizontal!.x2! - horizontal!.x1!).toBeCloseTo(20 * MM_TO_PX, 4);
    expect(vertical).toBeDefined();
    expect(vertical!.y2! - vertical!.y1!).toBeCloseTo(20 * MM_TO_PX, 4);
    // Bottom-right bracket arms point left/up from the far corner.
    const bottomY = 20 + (300 / MM_TO_PX) * MM_TO_PX;
    const rightX = 10 + (400 / MM_TO_PX) * MM_TO_PX;
    const brHorizontal = lines.find((l) => Math.abs(l.y1! - bottomY) < 1e-6 && Math.abs(l.y2! - bottomY) < 1e-6 && Math.abs(l.x1! - rightX) < 1e-6);
    expect(brHorizontal).toBeDefined();
    expect(Math.abs(brHorizontal!.x2! - brHorizontal!.x1!)).toBeCloseTo(20 * MM_TO_PX, 4);
    expect(lines.every((l) => l.strokeWidth === 0.7 * MM_TO_PX)).toBe(true);
  });

  it('creates Silhouette L marks offset 3mm outward with 10mm arms', () => {
    const marks = createPrintMarkObjects(
      { left: 0, top: 0, width: 400, height: 300 },
      { cropMarks: false, registrationMarks: true, bleedIndicator: false, pageInfo: false, regMarkStyle: 'silhouette' },
    );
    const lines = marks as fabric.Line[];
    expect(lines).toHaveLength(8);
    // Top-left vertical arm sits on the left edge, starting 3mm above it.
    const topArm = lines.find((l) => l.x1 === 0 && l.x2 === 0 && (l.y2 ?? 0) < -1);
    expect(topArm).toBeDefined();
    expect(topArm!.y1).toBeCloseTo(-3 * MM_TO_PX, 4);
    expect(topArm!.y1! - topArm!.y2!).toBeCloseTo(10 * MM_TO_PX, 4);
    expect(lines.every((l) => l.strokeWidth === 0.25 * MM_TO_PX)).toBe(true);
  });

  it('creates the scale-check block as a solid 50 x 9 mm rectangle plus caption', () => {
    const marks = createPrintMarkObjects(
      { left: 0, top: 0, width: 400, height: 300 },
      { cropMarks: false, registrationMarks: false, bleedIndicator: false, pageInfo: false, scaleCheck: true },
    );
    expect(marks).toHaveLength(2);
    expect(marks.every((mark) => (mark as { printMarkKind?: string }).printMarkKind === 'scale-check')).toBe(true);
    const rect = marks[0] as fabric.Rect;
    expect(rect.fill).toBe('#000000');
    expect(rect.width).toBeCloseTo(50 * MM_TO_PX, 4);
    expect(rect.height).toBeCloseTo(9 * MM_TO_PX, 4);
    expect(rect.top).toBeCloseTo(300 + 8 * MM_TO_PX, 4);
    const caption = marks[1] as fabric.FabricText;
    expect(String(caption.text)).toContain('50 × 9 mm');
  });
});
