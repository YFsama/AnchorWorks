import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeCanvasCutPreview, cutPathBBox, paperHeightToMm, previewGeometry, svgTransformsToCss, toCanvasCutPreview,
} from '../cutPreview';
import { useEditor, type CanvasCutPreview, type CutPath } from '../../store/editor';
import { History } from '../history';

/**
 * Canvas cut preview data layer. The rule under test is the Plotter dialog's
 * own (`previewPaths`): colour-active cut paths when the store has any,
 * otherwise the exported canvas SVG flattened by the plotter's own pipeline.
 * The canvas is a stub that only answers toSVG(); the flattener needs
 * DOMMatrix / DOMPoint, which jsdom lacks — they get the same identity shim
 * plotter.test.ts uses.
 */

const { canvasStub } = vi.hoisted(() => ({
  canvasStub: { toSVG: vi.fn<() => string>(() => '') },
}));

vi.mock('../canvasEngine', () => ({
  getCanvas: () => canvasStub,
}));

beforeAll(() => {
  const g = globalThis as { DOMPoint?: unknown; DOMMatrix?: unknown };
  if (!g.DOMPoint) {
    g.DOMPoint = class {
      x: number;
      y: number;
      constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
      }
    };
  }
  if (!g.DOMMatrix) {
    // Identity only: transform strings throw, which makes the flattener
    // fall back to the parent matrix.
    g.DOMMatrix = class {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      constructor(init?: string | number[]) {
        if (typeof init === 'string') throw new Error('string transforms not supported in the shim');
      }
      multiply(): unknown {
        return this;
      }
      transformPoint(p: { x: number; y: number }): { x: number; y: number } {
        return { x: p.x, y: p.y };
      }
    };
  }
});

const MM_PER_PX = 1 / 3.7795;

/** A 400 × 300 px canvas SVG holding one 100 px square (plus one unusable shape). */
const SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">',
  '<rect x="NaN" y="0" width="10" height="10" fill="#ffffff" />',
  '<path d="M 100 100 L 200 100 L 200 200 L 100 200 Z" fill="rgb(255,0,0)" />',
  '</svg>',
].join('');

const outline = (id: string, points: Array<[number, number]>, color?: string, kind: CutPath['kind'] = 'outline'): CutPath => ({
  id, points, closed: true, kind, ...(color ? { color } : {}),
});
const SQUARE = outline('sq', [[20, 30], [80, 30], [80, 70], [20, 70], [20, 30]]);
const MARK = outline('mark', [[5, 5], [5, 15], [15, 15]], '#000000', 'regmark');
const RED = outline('red', [[0, 0], [10, 0], [10, 10]], '#ff0000');

beforeEach(() => {
  canvasStub.toSVG.mockReset().mockReturnValue('');
  useEditor.setState({ cutPaths: [], canvasCutPreview: null });
});

describe('computeCanvasCutPreview — path selection', () => {
  it('uses the store cut paths verbatim when there are any, without reading the canvas', () => {
    useEditor.setState({ cutPaths: [SQUARE, MARK] });
    canvasStub.toSVG.mockReturnValue(SVG);
    const result = computeCanvasCutPreview();
    expect(result.paths).toEqual([SQUARE, MARK]);
    expect(result.source).toBe('cutPaths');
    expect(result.bboxMm).toEqual({ x0: 5, y0: 5, x1: 80, y1: 70 });
    expect(canvasStub.toSVG).not.toHaveBeenCalled();
  });

  it('drops paths whose colour is muted (cut-by-colour), keeping colourless reg marks', () => {
    useEditor.setState({ cutPaths: [SQUARE, MARK, RED] });
    const result = computeCanvasCutPreview({ mutedColors: ['#ff0000'] });
    expect(result.paths.map(p => p.id)).toEqual(['sq', 'mark']);
    expect(computeCanvasCutPreview().paths).toHaveLength(3);
  });

  it('falls back to flattening the exported canvas SVG (mm, top-left document space)', () => {
    canvasStub.toSVG.mockReturnValue(SVG);
    const result = computeCanvasCutPreview();
    expect(result.source).toBe('canvas');
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toMatchObject({ id: 'canvas-0', closed: true, kind: 'outline' });
    expect(result.paths[0].points).toHaveLength(5);
    expect(result.paths[0].points[0]).toEqual(result.paths[0].points[4]);
    const mm = (px: number): number => px * MM_PER_PX;
    expect(result.paths[0].points[0][0]).toBeCloseTo(mm(100), 9);
    expect(result.paths[0].points[0][1]).toBeCloseTo(mm(100), 9);
    expect(result.paths[0].points[2][0]).toBeCloseTo(mm(200), 9);
    expect(result.paths[0].points[2][1]).toBeCloseTo(mm(200), 9);
    expect(result.bboxMm!.x0).toBeCloseTo(mm(100), 9);
    expect(result.bboxMm!.y1).toBeCloseTo(mm(200), 9);
    // The shape with a non-finite coordinate (the canvas background case) is dropped.
    expect(result.paths.every(p => p.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)))).toBe(true);
  });

  it('returns an empty preview when there is no canvas, the canvas is empty or toSVG() fails', () => {
    const empty = { paths: [], bboxMm: null, source: 'canvas' };
    canvasStub.toSVG.mockReturnValue('');
    expect(computeCanvasCutPreview()).toEqual(empty);
    expect(computeCanvasCutPreview({ canvas: null })).toEqual(empty);
    expect(computeCanvasCutPreview({ canvas: { toSVG: () => { throw new Error('tainted'); } } })).toEqual(empty);
    expect(canvasStub.toSVG).toHaveBeenCalledTimes(1);
  });

  it('accepts an explicit canvas instead of the live one', () => {
    expect(computeCanvasCutPreview({ canvas: { toSVG: () => SVG } }).paths).toHaveLength(1);
    expect(canvasStub.toSVG).not.toHaveBeenCalled();
  });
});

describe('svgTransformsToCss', () => {
  it('rewrites SVG transform lists into the CSS grammar DOMMatrix accepts', () => {
    expect(svgTransformsToCss('<g transform="matrix(1 0 0 1 10 20)">')).toBe('<g transform="matrix(1, 0, 0, 1, 10, 20)">');
    expect(svgTransformsToCss('transform="translate(10 20)"')).toBe('transform="translate(10px, 20px)"');
    expect(svgTransformsToCss('transform="translate(10,20)"')).toBe('transform="translate(10px, 20px)"');
    expect(svgTransformsToCss('transform="rotate(45)"')).toBe('transform="rotate(45)"');
    expect(svgTransformsToCss('transform="scale(-1 1)"')).toBe('transform="scale(-1, 1)"');
  });

  it('leaves anything that is not a plain numeric list alone', () => {
    const untouched = '<g data-x="matrix(1 0 0 1 1 2)" transform="matrix(a b)" transform2="translate(1 2)">';
    expect(svgTransformsToCss(untouched)).toBe(untouched);
  });
});

describe('cutPathBBox / paperHeightToMm', () => {
  it('returns null for no points and the exact extent otherwise', () => {
    expect(cutPathBBox([])).toBeNull();
    expect(cutPathBBox([{ points: [] }])).toBeNull();
    expect(cutPathBBox([outline('a', [[10, -2], [4, 8]])])).toEqual({ x0: 4, y0: -2, x1: 10, y1: 8 });
  });

  it('converts the paper height to mm', () => {
    expect(paperHeightToMm(210, 'mm')).toBe(210);
    expect(paperHeightToMm(8.5, 'in')).toBeCloseTo(215.9, 9);
  });
});

describe('previewGeometry — document → machine mapping', () => {
  const preview = (over: Partial<CanvasCutPreview> = {}): CanvasCutPreview => ({
    paths: [SQUARE, MARK], originBottomLeft: true, paperHeightMm: 210, mirror: false, ...over,
  });

  it('bottom-left origin: the origin sits at the document bottom-left and Y is flipped', () => {
    const g = previewGeometry(preview());
    expect(g.originMm).toEqual({ x: 0, y: 210 });
    expect(g.xSign).toBe(1);
    expect(g.materialTopMm).toBe(0);
    expect(g.materialBottomMm).toBe(210);
    expect(g.machineBboxMm).toEqual({ x0: 5, y0: 210 - 70, x1: 80, y1: 210 - 5 });
    expect(g.ghostPaths).toBeNull();
    expect(g.outside).toEqual([false, false]);
  });

  it('top-left origin: the origin sits at the document top-left and Y is not flipped', () => {
    const g = previewGeometry(preview({ originBottomLeft: false }));
    expect(g.originMm).toEqual({ x: 0, y: 0 });
    expect(g.machineBboxMm).toEqual({ x0: 5, y0: 5, x1: 80, y1: 70 });
  });

  it('flags paths that run past the material band or left of the origin', () => {
    const tall = outline('tall', [[20, 150], [40, 150], [40, 230]]);
    const left = outline('left', [[-5, 20], [10, 20]]);
    const g = previewGeometry(preview({ paths: [SQUARE, tall, left] }));
    expect(g.outside).toEqual([false, true, true]);
    // The same paths fit when the material is tall enough.
    expect(previewGeometry(preview({ paths: [SQUARE, tall], paperHeightMm: 297 })).outside).toEqual([false, false]);
  });

  it('mirror: the blade path is the mirrored ghost, +X points left, the job keeps its size', () => {
    const g = previewGeometry(preview({ mirror: true }));
    expect(g.xSign).toBe(-1);
    expect(g.ghostPaths).toHaveLength(2);
    // mirrorPolys flips about the job's own centre (x0 + x1 = 85).
    expect(g.ghostPaths![0].points).toEqual([[65, 30], [5, 30], [5, 70], [65, 70], [65, 30]]);
    expect(g.ghostPaths![0].id).toBe('sq#mirror');
    expect(g.ghostPaths![0].kind).toBe('outline');
    expect(g.ghostPaths![1].kind).toBe('regmark');
    expect(cutPathBBox(g.ghostPaths!)).toEqual(g.bboxMm);
    expect([g.machineBboxMm!.x1 - g.machineBboxMm!.x0, g.machineBboxMm!.y1 - g.machineBboxMm!.y0]).toEqual([75, 65]);
    // Mirroring keeps the job's bounding box, so a job that starts left of
    // the origin still reaches negative machine X after the flip.
    const stray = previewGeometry({ paths: [outline('s', [[-5, 20], [10, 20]])], originBottomLeft: true, paperHeightMm: 210, mirror: true });
    expect(stray.outside).toEqual([true]);
    expect(stray.machineBboxMm!.x0).toBe(-5);
  });

  it('handles an empty preview', () => {
    const g = previewGeometry({ paths: [], originBottomLeft: false, paperHeightMm: 210, mirror: false });
    expect(g.bboxMm).toBeNull();
    expect(g.machineBboxMm).toBeNull();
    expect(g.outside).toEqual([]);
    expect(g.originMm).toEqual({ x: 0, y: 0 });
  });

  it('toCanvasCutPreview pairs a result with the Plotter settings as the store payload', () => {
    useEditor.setState({ cutPaths: [SQUARE, RED] });
    const result = computeCanvasCutPreview({ mutedColors: ['#ff0000'] });
    const payload = toCanvasCutPreview(result, { originBottomLeft: false, paperHeightMm: 148, mirror: true });
    expect(payload).toEqual({ paths: [SQUARE], originBottomLeft: false, paperHeightMm: 148, mirror: true });
    expect('source' in payload).toBe(false);
  });
});

describe('canvasCutPreview store slice', () => {
  /** In-memory canvas stub with just what History needs. */
  function makeStubCanvas() {
    const state = { value: 'state-0' };
    const stub = {
      toJSON: () => state.value,
      loadFromJSON: async (s: unknown) => { state.value = s as string; },
      renderAll: () => {},
    };
    return { stub: stub as unknown as Parameters<History['init']>[0], state };
  }

  it('starts null and the setter stores / clears it', () => {
    expect(useEditor.getState().canvasCutPreview).toBeNull();
    const value: CanvasCutPreview = { paths: [SQUARE], originBottomLeft: true, paperHeightMm: 210, mirror: false };
    useEditor.getState().setCanvasCutPreview(value);
    expect(useEditor.getState().canvasCutPreview).toBe(value);
    useEditor.getState().setCanvasCutPreview(null);
    expect(useEditor.getState().canvasCutPreview).toBeNull();
  });

  it('is not serialised into history snapshots and never pushes an undo entry', async () => {
    const history = new History({ limit: 20 });
    const { stub, state } = makeStubCanvas();
    history.init(stub);
    useEditor.getState().setCanvasCutPreview({ paths: [SQUARE], originBottomLeft: true, paperHeightMm: 100, mirror: true });
    // Changing only the preview must not create a history step…
    history.capture(stub);
    expect(history.canUndo()).toBe(false);
    // …and no snapshot may carry the slice.
    const stack = (history as unknown as { stack: Array<Record<string, unknown>> }).stack;
    expect(stack).toHaveLength(1);
    expect(Object.keys(stack[0]).sort()).toEqual(['canvas', 'cutPaths']);
    expect(JSON.stringify(stack)).not.toContain('canvasCutPreview');

    // A real edit, then undo: history restores cut paths only — the preview survives untouched.
    state.value = 'state-1';
    useEditor.getState().setCutPaths([SQUARE]);
    history.capture(stub);
    expect(history.canUndo()).toBe(true);
    await history.undo(stub);
    expect(state.value).toBe('state-0');
    expect(useEditor.getState().cutPaths).toEqual([]);
    expect(useEditor.getState().canvasCutPreview).toMatchObject({ paperHeightMm: 100, mirror: true });
  });
});
