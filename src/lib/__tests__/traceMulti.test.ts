/**
 * Trace preset + multi-colour trace tests — pure functions from
 * src/lib/cutContour.ts (k-means quantization is deterministic/seeded, so
 * the same fixture always yields the same clusters).
 *
 * ImageData is shimmed the same way cutContour.test.ts does it — the trace
 * pipeline only reads `.data`, `.width`, `.height`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  TRACE_PRESETS,
  tracePresetOptions,
  kmeansQuantize,
  nearestClusterIndex,
  traceMultiColor,
} from '../cutContour';

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

/** Build an ImageData-like fixture: a painter fn maps (x, y) → rgba. */
function makeImage(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]): ImageData {
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

describe('trace presets', () => {
  it('maps each preset id to its full parameter tuple', () => {
    expect(tracePresetOptions('bw-logo')).toEqual({
      threshold: 128, useAlpha: false, simplifyTolerance: 1, minSizeMm: 1,
    });
    expect(tracePresetOptions('line-art')).toEqual({
      threshold: 200, useAlpha: false, simplifyTolerance: 0.5, minSizeMm: 0.5,
    });
    expect(tracePresetOptions('photo-cut')).toEqual({
      threshold: 160, useAlpha: false, simplifyTolerance: 2, minSizeMm: 2,
    });
  });

  it('exposes the three named recipes with the multi-pass one carrying a colour count', () => {
    expect(TRACE_PRESETS.map((p) => p.id)).toEqual(['bw-logo', 'line-art', 'photo-cut']);
    expect(TRACE_PRESETS[2].colorCount).toBeGreaterThanOrEqual(2);
    expect(TRACE_PRESETS[0].colorCount).toBeUndefined();
  });

  it('returns undefined for unknown ids', () => {
    expect(tracePresetOptions('nope')).toBeUndefined();
  });
});

describe('kmeansQuantize', () => {
  // Built lazily — the ImageData shim is installed in beforeAll, which runs
  // AFTER describe bodies are collected.
  const twoTone = () => makeImage(32, 32, (x) => (x < 16 ? [220, 30, 30, 255] : [30, 30, 220, 255]));

  it('is deterministic — identical clusters across runs', () => {
    const a = kmeansQuantize(twoTone(), 2);
    const b = kmeansQuantize(twoTone(), 2);
    expect(a).toEqual(b);
  });

  it('recovers the two dominant colours of a hard 2-colour image', () => {
    const clusters = kmeansQuantize(twoTone(), 2);
    expect(clusters).toHaveLength(2);
    const colors = clusters.map((c) => c.color).sort((p, q) => p[0] - q[0]);
    // Blue-dominant center has low R, red-dominant high R.
    expect(colors[0][0]).toBeLessThan(80);
    expect(colors[1][0]).toBeGreaterThan(180);
    // Even split — each cluster owns roughly half the pixels.
    for (const c of clusters) expect(c.pixels).toBeGreaterThan(400);
  });

  it('ignores fully transparent pixels', () => {
    const img = makeImage(16, 16, (x) => (x < 8 ? [255, 0, 0, 255] : [255, 0, 0, 0]));
    const clusters = kmeansQuantize(img, 2);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].color[0]).toBeGreaterThan(200);
  });

  it('caps k and survives degenerate inputs', () => {
    expect(kmeansQuantize(makeImage(4, 4, () => [10, 10, 10, 255]), 99)).toHaveLength(1);
    expect(kmeansQuantize(makeImage(4, 4, () => [0, 0, 0, 0]), 4)).toEqual([]);
  });
});

describe('nearestClusterIndex', () => {
  it('picks the closest center by RGB distance', () => {
    expect(nearestClusterIndex([0, 0, 0], [[10, 10, 10], [200, 200, 200]])).toBe(0);
    expect(nearestClusterIndex([190, 190, 190], [[10, 10, 10], [200, 200, 200]])).toBe(1);
  });
});

describe('traceMultiColor — cluster mask boundary tracing', () => {
  it('traces a synthetic 2-colour image into one contour per colour with the right bboxes', () => {
    // 16×16 px, pixel size 1 mm: left half red, right half blue.
    const img = makeImage(16, 16, (x) => (x < 8 ? [200, 20, 20, 255] : [20, 20, 200, 255]));
    const clusters = traceMultiColor(img, {
      colorCount: 2,
      simplifyTolerance: 0,
      pixelSizeMm: 1,
      minSizeMm: 1,
    });
    expect(clusters).toHaveLength(2);

    const byRed = clusters.find((c) => c.color[0] > 120)!;
    const byBlue = clusters.find((c) => c.color[2] > 120)!;
    expect(byRed).toBeDefined();
    expect(byBlue).toBeDefined();

    const bbox = (contour: Array<[number, number]>) => {
      const xs = contour.map(([x]) => x);
      const ys = contour.map(([, y]) => y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    // Each colour yields exactly one region contour.
    expect(byRed.contours).toHaveLength(1);
    expect(byBlue.contours).toHaveLength(1);
    const red = bbox(byRed.contours[0]);
    const blue = bbox(byBlue.contours[0]);
    // Red occupies columns 0..7, blue columns 8..15 (in mm == px here).
    expect(red.x0).toBeCloseTo(0, 0);
    expect(red.x1).toBeCloseTo(7, 0);
    expect(blue.x0).toBeCloseTo(8, 0);
    expect(blue.x1).toBeCloseTo(15, 0);
    // Both span the full height.
    expect(red.y1 - red.y0).toBeGreaterThanOrEqual(15);
    expect(blue.y1 - blue.y0).toBeGreaterThanOrEqual(15);
  });

  it('converts pixel geometry through pixelSizeMm to mm-space output', () => {
    const img = makeImage(16, 16, () => [200, 20, 20, 255]);
    const clusters = traceMultiColor(img, {
      colorCount: 2,
      simplifyTolerance: 0,
      pixelSizeMm: 0.5,
      minSizeMm: 1,
    });
    expect(clusters).toHaveLength(1);
    const xs = clusters[0].contours[0].map(([x]) => x);
    // 16 px × 0.5 mm/px = 8 mm wide region.
    expect(Math.max(...xs)).toBeCloseTo(7.5, 0);
  });

  it('fires per-cluster progress and drops empty clusters', () => {
    const img = makeImage(8, 8, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const seen: Array<[number, number]> = [];
    const clusters = traceMultiColor(img, {
      colorCount: 4,
      simplifyTolerance: 0,
      pixelSizeMm: 1,
      minSizeMm: 1,
    }, (done, total) => seen.push([done, total]));
    // Progress fires once per cluster, counting 1..total.
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0][0]).toBe(1);
    expect(seen[seen.length - 1][0]).toBe(seen[seen.length - 1][1]);
    // A checkerboard quantizes to 2 colours (not the requested 4) — empty
    // clusters are dropped rather than emitted as empty regions.
    expect(clusters.length).toBeLessThanOrEqual(4);
    for (const c of clusters) expect(c.contours.length).toBeGreaterThan(0);
  });
});
