import { describe, it, expect } from 'vitest';
import { EDT_INF, fillPolygonMask, interiorEdt, labelledChamfer } from '../rasterEdt';

describe('interiorEdt', () => {
  it('measures exact axial distances from a solid block to its background', () => {
    // 13×13 grid, solid 5×5 block at rows/cols 3..7.
    const w = 13, h = 13;
    const mask = new Uint8Array(w * h);
    for (let y = 3; y <= 7; y++) {
      for (let x = 3; x <= 7; x++) mask[y * w + x] = 1;
    }
    const dist = interiorEdt(mask, w, h);
    const at = (x: number, y: number) => dist[y * w + x];
    expect(at(5, 5)).toBeCloseTo(3, 5); // 3 px straight to the nearest bg row/col
    expect(at(5, 3)).toBeCloseTo(1, 5); // edge pixel, bg directly above
    expect(at(3, 3)).toBeCloseTo(1, 5); // corner pixel, axial beats the diagonal
    expect(at(5, 7)).toBeCloseTo(1, 5);
    expect(at(0, 0)).toBeCloseTo(0, 5); // background pixels measure 0
    expect(at(12, 6)).toBeCloseTo(0, 5);
  });

  it('approximates diagonal distances within the 3-4 chamfer slack', () => {
    // Single background pixel at the centre of an all-inside 9×9 grid.
    const w = 9, h = 9;
    const mask = new Uint8Array(w * h).fill(1);
    mask[4 * w + 4] = 0;
    const dist = interiorEdt(mask, w, h);
    // (0,0)→(4,4): four diagonal hops = raw 16 → 16/3 ≈ 5.33 (true 4√2 ≈ 5.66).
    expect(dist[0]).toBeCloseTo(16 / 3, 3);
    // (4,0)→(4,4): four axial hops = raw 12 → exactly 4.
    expect(dist[4 * w]).toBeCloseTo(4, 5);
  });

  it('leaves EDT_INF on an all-inside mask (no background anywhere)', () => {
    const dist = interiorEdt(new Uint8Array(16).fill(1), 4, 4);
    for (const d of dist) expect(d).toBe(EDT_INF);
  });

  it('returns zeros for an all-background mask', () => {
    const dist = interiorEdt(new Uint8Array(16), 4, 4);
    for (const d of dist) expect(d).toBe(0);
  });
});

describe('labelledChamfer', () => {
  it('labels every pixel with its nearest seed and distances in pixels', () => {
    // 7×7 grid, seeds at (1,1) and (5,5).
    const w = 7, h = 7;
    const mask = new Uint8Array(w * h);
    mask[1 * w + 1] = 1;
    mask[5 * w + 5] = 1;
    const { dist, labels } = labelledChamfer(mask, w, h);
    // Seeds label themselves at distance 0.
    expect(labels[8]).toBe(8);
    expect(labels[40]).toBe(40);
    expect(dist[8]).toBeCloseTo(0, 6);
    expect(dist[40]).toBeCloseTo(0, 6);
    // (0,0) is one diagonal hop from seed (1,1): raw 4 → 4/3.
    expect(labels[0]).toBe(8);
    expect(dist[0]).toBeCloseTo(4 / 3, 3);
    // (6,6) likewise belongs to seed (5,5).
    expect(labels[6 * w + 6]).toBe(40);
    expect(dist[6 * w + 6]).toBeCloseTo(4 / 3, 3);
    // (3,3) sits between the seeds: two diagonal hops either way (raw 8).
    expect(dist[3 * w + 3]).toBeCloseTo(8 / 3, 3);
    expect([8, 40]).toContain(labels[3 * w + 3]);
    // Far corner (0,6): 1 diagonal + 4 axial toward the nearer seed.
    expect(dist[6]).toBeCloseTo(16 / 3, 3);
  });

  it('propagates the label of the strictly nearer seed across a midline', () => {
    // Seeds in the left and right columns of a 9×3 grid.
    const w = 9, h = 3;
    const mask = new Uint8Array(w * h);
    mask[1 * w + 0] = 1; // (0,1)
    mask[1 * w + 8] = 1; // (8,1)
    const { dist, labels } = labelledChamfer(mask, w, h);
    expect(labels[1 * w + 2]).toBe(9); // two axial hops from the left seed
    expect(dist[1 * w + 2]).toBeCloseTo(2, 5);
    expect(labels[1 * w + 6]).toBe(17); // two axial hops from the right seed
    expect(dist[1 * w + 6]).toBeCloseTo(2, 5);
    expect(dist[1 * w + 4]).toBeCloseTo(4, 5); // exact tie at the midline
    expect([9, 17]).toContain(labels[1 * w + 4]);
  });

  it('returns EDT_INF distances and −1 labels for an all-zero mask', () => {
    const { dist, labels } = labelledChamfer(new Uint8Array(12), 4, 3);
    for (const d of dist) expect(d).toBe(EDT_INF);
    for (const l of labels) expect(l).toBe(-1);
  });
});

describe('fillPolygonMask', () => {
  it('fills a 20×1 mm rectangle at 4 px/mm with a 2 px pad exactly', () => {
    const rect = [[0, 0], [20, 0], [20, 1], [0, 1]] as Array<[number, number]>;
    const { mask, w, h } = fillPolygonMask(rect, 4, 2);
    expect(w).toBe(84); // ceil(20·4) + 2·2
    expect(h).toBe(8); // ceil(1·4) + 2·2
    // Four inside rows (centres 0.125..0.875 mm), each 80 px wide.
    let count = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) count += mask[j * w + i];
    }
    expect(count).toBe(320);
    for (const j of [2, 3, 4, 5]) {
      expect(mask[j * w + 2]).toBe(1);
      expect(mask[j * w + 81]).toBe(1);
      expect(mask[j * w + 1]).toBe(0);
      expect(mask[j * w + 82]).toBe(0);
    }
    for (const j of [0, 1, 6, 7]) {
      expect(mask[j * w + 42]).toBe(0);
    }
  });

  it('rasterizes the dumbbell outline: notch empty, neck row full width', () => {
    // Two 8×8 lobes joined by a 0.8 mm neck — the wave-2 erosion blind spot.
    const pts = [
      [0, 0], [8, 0], [8, 3.6], [12, 3.6], [12, 0], [20, 0],
      [20, 8], [12, 8], [12, 4.4], [8, 4.4], [8, 8], [0, 8],
    ] as Array<[number, number]>;
    const { mask, w } = fillPolygonMask(pts, 4, 2);
    expect(w).toBe(84);
    // Row y ≈ 2.125 mm (j=10) is inside the lobes but inside the top notch
    // between them: two spans of 32 px, a 16 px (4 mm) gap.
    expect(mask[10 * w + 10]).toBe(1); // left lobe
    expect(mask[10 * w + 40]).toBe(0); // notch (x = 10 mm)
    expect(mask[10 * w + 70]).toBe(1); // right lobe
    let span = 0;
    for (let i = 0; i < w; i++) span += mask[10 * w + i];
    expect(span).toBe(64);
    // Row y ≈ 4.125 mm (j=18) runs through the neck: full width filled.
    expect(mask[18 * w + 40]).toBe(1);
    let full = 0;
    for (let i = 0; i < w; i++) full += mask[18 * w + i];
    expect(full).toBe(80);
  });

  it('is translation-invariant (grid maps to the polygon bbox origin)', () => {
    const tri = [[0, 0], [6, 0], [0, 6]] as Array<[number, number]>;
    const near = fillPolygonMask(tri, 4, 1);
    const far = fillPolygonMask(tri.map(([x, y]) => [x + 1000, y + 500] as [number, number]), 4, 1);
    expect(far.w).toBe(near.w);
    expect(far.h).toBe(near.h);
    expect(Array.from(far.mask)).toEqual(Array.from(near.mask));
  });

  it('returns an all-zero mask for degenerate (collinear) input', () => {
    const { mask, w, h } = fillPolygonMask([[0, 0], [5, 5], [10, 10]], 4, 1);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    let count = 0;
    for (const m of mask) count += m;
    expect(count).toBe(0);
  });

  it('feeds interiorEdt the half-width of a 1 mm band at 4 px/mm', () => {
    const rect = [[0, 0], [20, 0], [20, 1], [0, 1]] as Array<[number, number]>;
    const { mask, w } = fillPolygonMask(rect, 4, 2);
    const edt = interiorEdt(mask, w, 8);
    // A centre-row pixel sits 2 px from the background rows → 2·EDT = 4 px = 1 mm.
    expect(edt[3 * w + 42]).toBeCloseTo(2, 5);
  });
});
