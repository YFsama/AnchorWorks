import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import * as canvasEngine from '../canvasEngine';
import { download, downloadDataURL } from '../io';
import {
  collectDocumentColors,
  exportPlates,
  isolatePlate,
  restorePlateIsolation,
  plateSVG,
  platePNG,
  paintHex,
  type PlateInfo,
} from '../separations';

vi.mock('../io', () => ({
  download: vi.fn(),
  downloadDataURL: vi.fn(),
}));

const GRADIENT_PLATE_KEY = 'special:gradient';
const LINEAR_GRADIENT = {
  type: 'linear',
  coords: { x1: 0, y1: 0, x2: 10, y2: 10 },
  colorStops: [
    { offset: 0, color: '#ffffff' },
    { offset: 1, color: '#000000' },
  ],
};

function mockCanvas(objects: fabric.FabricObject[]): fabric.Canvas {
  return {
    getObjects: () => objects,
    requestRenderAll: vi.fn(),
    toSVG: vi.fn(() => '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),
    toDataURL: vi.fn(() => 'data:image/png;base64,cGxhdGU='),
  } as unknown as fabric.Canvas;
}

function setPaint(object: fabric.FabricObject, paints: { fill?: unknown; stroke?: unknown }): void {
  const record = object as unknown as { fill?: unknown; stroke?: unknown };
  if ('fill' in paints) record.fill = paints.fill;
  if ('stroke' in paints) record.stroke = paints.stroke;
}

function spotPantoneFill(): fabric.Rect {
  const rect = new fabric.Rect({ width: 10, height: 10 });
  setPaint(rect, { fill: { name: 'PANTONE 185 C', spot: true, c: 0, m: 91, y: 76, k: 0 } });
  return rect;
}

function plateByKey(plates: PlateInfo[], key: string): PlateInfo | undefined {
  return plates.find((plate) => plate.key === key);
}

afterEach(() => {
  restorePlateIsolation();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('collectDocumentColors', () => {
  it('inventories spot, process, gradient and none paints on a mixed document', () => {
    const spotFill = spotPantoneFill();
    const spotStroke = new fabric.Rect({ width: 10, height: 10, fill: 'transparent' });
    // Different casing must merge into the same plate (paintName lowercases).
    setPaint(spotStroke, { stroke: { name: 'Pantone 185 C', spot: true } });
    const hexFill = new fabric.Rect({ width: 10, height: 10, fill: '#336699' });
    const cmykFill = new fabric.Rect({ width: 10, height: 10 });
    setPaint(cmykFill, { fill: { c: 10, m: 20, y: 30, k: 40 } });
    const gradientFill = new fabric.Rect({ width: 10, height: 10 });
    setPaint(gradientFill, { fill: LINEAR_GRADIENT });
    const unpainted = new fabric.Rect({ width: 10, height: 10 });
    setPaint(unpainted, { fill: '', stroke: 'transparent' });
    const spotChild = new fabric.Rect({ width: 10, height: 10 });
    setPaint(spotChild, { fill: { swatchName: 'Spot Varnish' } });
    const processChild = new fabric.Rect({ width: 10, height: 10, fill: '#ff0000' });
    const group = new fabric.Group([spotChild, processChild]);
    const overlay = new fabric.Rect({ width: 10, height: 10, excludeFromExport: true });
    setPaint(overlay, { fill: { name: 'PANTONE 300 C', spot: true } });

    const plates = collectDocumentColors(mockCanvas([spotFill, spotStroke, hexFill, cmykFill, gradientFill, unpainted, group, overlay]));

    const spot = plateByKey(plates, 'spot:pantone 185 c');
    expect(spot).toBeDefined();
    expect(spot!.kind).toBe('spot');
    expect(spot!.objects).toBe(2);
    expect(spot!.exportable).toBe(true);
    expect(spot!.name).toBe('PANTONE 185 C');
    expect(spot!.hex).toMatch(/^#[0-9a-f]{6}$/);

    expect(plateByKey(plates, 'spot:spot varnish')?.objects).toBe(1);
    expect(plateByKey(plates, 'process:#336699')?.objects).toBe(1);
    expect(plateByKey(plates, 'process:cmyk:10,20,30,40')?.kind).toBe('process');
    expect(plateByKey(plates, 'process:#ff0000')?.objects).toBe(1);

    const gradient = plateByKey(plates, GRADIENT_PLATE_KEY);
    expect(gradient).toBeDefined();
    expect(gradient!.kind).toBe('gradient');
    expect(gradient!.exportable).toBe(false);

    // Overlay chrome is never document ink.
    expect(plateByKey(plates, 'spot:pantone 300 c')).toBeUndefined();
    // Spot plates lead the list.
    expect(plates[0]!.kind).toBe('spot');
    expect(plates[1]!.kind).toBe('spot');
  });

  it('counts a group once per plate regardless of member count', () => {
    const first = new fabric.Rect({ width: 10, height: 10 });
    setPaint(first, { fill: { name: 'PANTONE 185 C', spot: true } });
    // Explicit transparent fill: fabric's implicit "rgb(0,0,0)" default would
    // (correctly) add a real black process plate and muddy the count.
    const second = new fabric.Rect({ width: 10, height: 10, fill: 'transparent' });
    setPaint(second, { stroke: { name: 'PANTONE 185 C', spot: true } });
    const group = new fabric.Group([first, second]);
    const plates = collectDocumentColors(mockCanvas([group]));
    expect(plates).toHaveLength(1);
    expect(plates[0]!.objects).toBe(1);
  });

  it('returns an empty inventory for null or empty documents', () => {
    expect(collectDocumentColors(null)).toEqual([]);
    expect(collectDocumentColors(mockCanvas([]))).toEqual([]);
    const blank = new fabric.Rect({ width: 10, height: 10 });
    setPaint(blank, { fill: '' });
    expect(collectDocumentColors(mockCanvas([blank]))).toEqual([]);
  });
});

describe('isolatePlate', () => {
  it('hides non-plate objects at every depth and restores verbatim', () => {
    const spotObject = spotPantoneFill();
    const processObject = new fabric.Rect({ width: 10, height: 10, fill: '#336699' });
    const spotChild = spotPantoneFill();
    const processChild = new fabric.Rect({ width: 10, height: 10, fill: '#336699' });
    const group = new fabric.Group([spotChild, processChild]);
    const canvas = mockCanvas([spotObject, processObject, group]);

    const handle = isolatePlate(canvas, 'spot:pantone 185 c');
    expect(spotObject.visible).toBe(true);
    expect(processObject.visible).toBe(false);
    expect(group.visible).toBe(true);
    expect(spotChild.visible).toBe(true);
    expect(processChild.visible).toBe(false);
    expect(canvas.requestRenderAll).toHaveBeenCalled();

    handle.restore();
    expect(processObject.visible).toBe(true);
    expect(processChild.visible).toBe(true);
    expect(spotObject.visible).toBe(true);
  });

  it('restores the previous isolation when switching plates', () => {
    const spotObject = spotPantoneFill();
    const processObject = new fabric.Rect({ width: 10, height: 10, fill: '#336699' });
    const canvas = mockCanvas([spotObject, processObject]);

    isolatePlate(canvas, 'spot:pantone 185 c');
    expect(processObject.visible).toBe(false);

    isolatePlate(canvas, 'process:#336699');
    expect(processObject.visible).toBe(true);
    expect(spotObject.visible).toBe(false);

    restorePlateIsolation();
    expect(spotObject.visible).toBe(true);
    expect(processObject.visible).toBe(true);
  });

  it('tolerates a missing canvas and null key', () => {
    const handle = isolatePlate(null, 'spot:pantone 185 c');
    expect(handle.plateKey).toBe('spot:pantone 185 c');
    expect(() => handle.restore()).not.toThrow();
    const cleared = isolatePlate(mockCanvas([]), null);
    expect(cleared.plateKey).toBeNull();
    expect(() => restorePlateIsolation()).not.toThrow();
  });
});

describe('plate export plumbing', () => {
  it('produces non-empty SVG per plate through the shared download helper', () => {
    vi.useFakeTimers();
    const spotObject = spotPantoneFill();
    const processObject = new fabric.Rect({ width: 10, height: 10, fill: '#336699' });
    const canvas = mockCanvas([spotObject, processObject]);
    const spy = vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    const results = exportPlates(['spot:pantone 185 c', 'process:#336699'], 'svg');

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === 'exported')).toBe(true);
    expect(results[0]!.fileName).toBe('design-PANTONE 185 C.svg');
    expect(results[1]!.fileName).toBe('design-336699.svg');
    expect(canvas.toSVG).toHaveBeenCalledTimes(2);

    // First download is immediate; extras are staggered for the browser.
    expect(vi.mocked(download)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(download).mock.calls[0]![0]).toBe('design-PANTONE 185 C.svg');
    expect(String(vi.mocked(download).mock.calls[0]![1])).toContain('<svg');
    vi.advanceTimersByTime(700);
    expect(vi.mocked(download)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(download).mock.calls[1]![0]).toBe('design-336699.svg');

    // Export-scoped flags are restored after serialization.
    expect(processObject.excludeFromExport).toBeFalsy();
    expect(processObject.visible).toBe(true);
    expect(spotObject.visible).toBe(true);
    spy.mockRestore();
  });

  it('renders PNG plates from the isolated canvas and restores visibility', () => {
    const spotObject = spotPantoneFill();
    const processObject = new fabric.Rect({ width: 10, height: 10, fill: '#336699' });
    const canvas = mockCanvas([spotObject, processObject]);
    const spy = vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    const result = exportPlates(['spot:pantone 185 c'], 'png');

    expect(result[0]!.status).toBe('exported');
    expect(result[0]!.fileName).toBe('design-PANTONE 185 C.png');
    expect(canvas.toDataURL).toHaveBeenCalledWith({ format: 'png', multiplier: 2 });
    expect(vi.mocked(downloadDataURL)).toHaveBeenCalledWith('design-PANTONE 185 C.png', 'data:image/png;base64,cGxhdGU=');
    expect(processObject.visible).toBe(true);
    spy.mockRestore();
  });

  it('skips gradient, unknown and empty plates without downloading', () => {
    const spotObject = spotPantoneFill();
    const gradientObject = new fabric.Rect({ width: 10, height: 10 });
    setPaint(gradientObject, { fill: LINEAR_GRADIENT });
    const canvas = mockCanvas([spotObject, gradientObject]);
    const spy = vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);

    const results = exportPlates([GRADIENT_PLATE_KEY, 'spot:nope', 'process:#123456'], 'svg');

    // 'process:#123456' is not in the inventory → not-found (the defensive
    // 'empty' reason only fires when matching objects vanish mid-export).
    expect(results.map((result) => result.reason)).toEqual(['not-exportable', 'not-found', 'not-found']);
    expect(results.every((result) => result.status === 'skipped')).toBe(true);
    expect(vi.mocked(download)).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns empty markup for plates with no matching objects', () => {
    const spotObject = spotPantoneFill();
    const canvas = mockCanvas([spotObject]);
    expect(plateSVG(canvas, 'process:#123456')).toBe('');
    expect(platePNG(canvas, 'process:#123456')).toBe('');
    expect(canvas.toSVG).not.toHaveBeenCalled();
    expect(canvas.toDataURL).not.toHaveBeenCalled();
  });
});

describe('paintHex', () => {
  it('approximates paint colours for chips', () => {
    expect(paintHex('#ff0000')).toBe('#ff0000');
    expect(paintHex({ c: 0, m: 0, y: 0, k: 100 })).toBe('#000000');
    expect(paintHex({ name: 'PANTONE 185 C', spot: true, c: 0, m: 91, y: 76, k: 0 })).toBe('#ff173d');
    expect(paintHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
    expect(paintHex(null)).toBe('#9ca3af');
  });
});
