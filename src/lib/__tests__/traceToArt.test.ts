/**
 * Trace-to-Art tests.
 *
 * Geometry ground truth (makeSticker.test.ts idiom): real fabric.Path /
 * fabric.Group objects under jsdom need no 2D-context stub, and synthetic
 * ImageData buffers drive the same k-means + Moore-walk pipeline the dialog
 * uses (kmeansQuantize is deterministic — luminance-sorted seeding — so a
 * clean 2-colour fixture converges to the exact source colours).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as fabric from 'fabric';
import {
  ringsToPathData,
  traceToArtPieces,
  buildTracedArtGroup,
  type TraceToArtOptions,
} from '../traceToArt';

/**
 * jsdom doesn't ship a working ImageData constructor (same gap cutContour
 * tests shim around). The trace pipeline only reads `.data/.width/.height`.
 */
beforeAll(() => {
  if (typeof (globalThis as { ImageData?: unknown }).ImageData === 'undefined') {
    class ImageDataShim {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, w: number, h: number) {
        this.data = data;
        this.width = w;
        this.height = h;
      }
    }
    (globalThis as { ImageData?: unknown }).ImageData = ImageDataShim;
  }
});

type Painter = (x: number, y: number) => [number, number, number, number];

/** Synthetic ImageData painted by pixel callback. */
function paintImage(w: number, h: number, paint: Painter): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return new ImageData(data, w, h);
}

/** 8×6 two-colour fixture: left 4 columns pure red, right 4 pure blue. */
function twoColourImage(): ImageData {
  return paintImage(8, 6, (x) => (x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
}

/**
 * 12×12 red square with an 8×8 blue hole at (2..9, 2..9).
 *
 * The hole must be large enough for kmeansQuantize's luminance-quantile
 * seeding to drop one seed inside each colour block (seeds sit at the 25th
 * and 75th percentile of the luminance-sorted samples): 64 blue vs 80 red
 * pixels lands seed0 in blue and seed1 in red, so the clusters converge to
 * the exact source colours. A small hole (e.g. 4×4 → 16 blue vs 128 red)
 * puts BOTH seeds in the red block and the blue detail folds into a muddy
 * red cluster — a real quantizer limitation, not a walk bug.
 */
function redSquareWithBlueHole(): ImageData {
  return paintImage(12, 12, (x, y) =>
    x >= 2 && x <= 9 && y >= 2 && y <= 9 ? [0, 0, 255, 255] : [255, 0, 0, 255]);
}

const OPTS: TraceToArtOptions = { colorCount: 2, simplifyTolerance: 1, minSizeMm: 1 };
const MM_TO_PX = 3.7795; // the pipeline's px↔mm convention

/** Parse every coordinate pair out of an M/L-only path data string. */
function pathPoints(d: string): Array<[number, number]> {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function bboxOf(pts: Array<[number, number]>) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

describe('ringsToPathData', () => {
  it('emits one closed M…Z subpath for a single ring, dropping the duplicated closing vertex', () => {
    const ring: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const d = ringsToPathData([ring]);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect((d.match(/M /g) ?? []).length).toBe(1);
    expect((d.match(/Z/g) ?? []).length).toBe(1);
    // Z re-closes the ring — no explicit L back to the start point.
    expect(d).not.toContain('L 0 0');
    const pts = pathPoints(d);
    expect(pts).toHaveLength(4);
  });

  it('emits one subpath per ring for multiple rings', () => {
    const a: Array<[number, number]> = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
    const b: Array<[number, number]> = [[8, 0], [12, 0], [12, 4], [8, 4], [8, 0]];
    const d = ringsToPathData([a, b]);
    expect((d.match(/M /g) ?? []).length).toBe(2);
    expect((d.match(/Z/g) ?? []).length).toBe(2);
    expect(pathPoints(d)).toHaveLength(8);
  });

  it('returns the empty string for no rings', () => {
    expect(ringsToPathData([])).toBe('');
  });

  it('skips degenerate rings with fewer than 3 distinct points', () => {
    const good: Array<[number, number]> = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
    const d = ringsToPathData([[[1, 1], [2, 2]], good]);
    expect((d.match(/M /g) ?? []).length).toBe(1);
    expect(pathPoints(d)).toHaveLength(4);
  });
});

describe('traceToArtPieces', () => {
  it('two-colour image → two pieces with correct hex colours and per-piece bounds', () => {
    const res = traceToArtPieces(twoColourImage(), 1, OPTS);
    expect(res.pieces).toHaveLength(2);
    expect(res.pieces.map((p) => p.color).sort()).toEqual(['#0000ff', '#ff0000']);

    // Moore walk visits pixel CENTRES: left colour spans x 0..3, right x 4..7.
    const red = res.pieces.find((p) => p.color === '#ff0000')!;
    const blue = res.pieces.find((p) => p.color === '#0000ff')!;
    const redBox = bboxOf(pathPoints(red.pathData));
    const blueBox = bboxOf(pathPoints(blue.pathData));
    expect(redBox.minX).toBeCloseTo(0, 5);
    expect(redBox.maxX).toBeCloseTo(3, 5);
    expect(blueBox.minX).toBeCloseTo(4, 5);
    expect(blueBox.maxX).toBeCloseTo(7, 5);
    expect(redBox.minY).toBeCloseTo(0, 5);
    expect(redBox.maxY).toBeCloseTo(5, 5);

    // Union bbox covers the whole traced area.
    expect(res.boundsMm).toEqual({ minX: 0, minY: 0, maxX: 7, maxY: 5 });
  });

  it('a hole inside one colour becomes a second ring of that colour (evenodd knock-out)', () => {
    const res = traceToArtPieces(redSquareWithBlueHole(), 1, OPTS);
    expect(res.pieces).toHaveLength(2);
    const red = res.pieces.find((p) => p.color === '#ff0000')!;
    const blue = res.pieces.find((p) => p.color === '#0000ff')!;
    // Outer ring + hole ring in the SAME path → evenodd renders the hole.
    expect(red.ringCount).toBe(2);
    expect((red.pathData.match(/M /g) ?? []).length).toBe(2);
    expect(blue.ringCount).toBe(1);
    // Bigger area first → bottom of the group (fabric draws children[0] last-painted under).
    expect(res.pieces[0].color).toBe('#ff0000');
  });

  it('fully transparent image → no pieces', () => {
    const img = paintImage(4, 4, () => [0, 0, 0, 0]);
    const res = traceToArtPieces(img, 1, OPTS);
    expect(res.pieces).toEqual([]);
    expect(res.boundsMm).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('fires the progress callback once per cluster, ending at (total, total)', () => {
    const calls: Array<[number, number]> = [];
    traceToArtPieces(twoColourImage(), 1, OPTS, (done, total) => calls.push([done, total]));
    expect(calls).toHaveLength(2);
    expect(calls[calls.length - 1]).toEqual([2, 2]);
  });
});

describe('buildTracedArtGroup', () => {
  it('builds a positioned Group of evenodd fill Paths named by colour', async () => {
    const img = twoColourImage();
    const origin = { x: 10, y: 20 };
    const { group, result } = await buildTracedArtGroup(img, 1, origin, OPTS);

    expect(group).toBeInstanceOf(fabric.Group);
    expect(String((group as fabric.Group & { name?: string }).name)).toMatch(/^Traced Art /);

    const objs = group.getObjects();
    expect(objs).toHaveLength(result.pieces.length);
    expect(objs.every((o) => o instanceof fabric.Path)).toBe(true);
    const fills = objs.map((o) => String(o.fill)).sort();
    expect(fills).toEqual(result.pieces.map((p) => p.color).sort());
    for (const o of objs) {
      const path = o as fabric.Path;
      expect(path.fillRule).toBe('evenodd');
      expect(path.strokeWidth).toBe(0);
    }
    // Layer-panel-readable member names = the cluster hex colour.
    expect(objs.map((o) => (o as fabric.Path & { name?: string }).name).sort())
      .toEqual(result.pieces.map((p) => p.color).sort());

    // Absolute-px placement: art bbox lands exactly at originMm (+ bounds min).
    expect(group.left).toBeCloseTo((origin.x + result.boundsMm.minX) * MM_TO_PX, 1);
    expect(group.top).toBeCloseTo((origin.y + result.boundsMm.minY) * MM_TO_PX, 1);
    const wMm = result.boundsMm.maxX - result.boundsMm.minX;
    expect(group.width).toBeCloseTo(wMm * MM_TO_PX, 1);
  });

  it('respects targetWidthMm scaling while keeping the origin anchored', async () => {
    const img = twoColourImage();
    const origin = { x: 0, y: 0 };
    const { group } = await buildTracedArtGroup(img, 1, origin, { ...OPTS, targetWidthMm: 14 });
    expect(group.width).toBeCloseTo(14 * MM_TO_PX, 1);
    expect(group.left).toBeCloseTo(origin.x * MM_TO_PX, 1);
    expect(group.top).toBeCloseTo(origin.y * MM_TO_PX, 1);
  });

  it('rejects when nothing is traceable', async () => {
    const img = paintImage(4, 4, () => [0, 0, 0, 0]);
    await expect(buildTracedArtGroup(img, 1, { x: 0, y: 0 }, OPTS)).rejects.toThrow(/nothing to trace/i);
  });
});
