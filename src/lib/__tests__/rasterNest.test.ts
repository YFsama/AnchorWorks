import { describe, expect, it } from 'vitest';
import { fillPolygonMask } from '../rasterEdt';
import { nestPolygons, type NestPolyItem } from '../nesting';
import { nestPolygonsRaster, type RasterNestItem, type RasterNestPlacement } from '../rasterNest';

/**
 * Raster occupancy-grid true-shape nesting (rasterNest.nestPolygonsRaster).
 *
 * The headline claim under test: for interleaving shapes the raster packer
 * beats the convex-hull skyline packer (nesting.ts nestPolygons) because it
 * can slide parts into concavities a hull AABB treats as solid. Everything
 * else is the packing hygiene contract — overlap-free with the kerf gap
 * honoured, unfit flagging, and bit-for-bit determinism.
 */

/** 30×30 mm L: bottom bar 30×10 + left bar 10×30 (a 20×20 notch top-right). */
function lPoly(ox = 0, oy = 0): Array<[number, number]> {
  return [
    [ox, oy], [ox + 30, oy], [ox + 30, oy + 10],
    [ox + 10, oy + 10], [ox + 10, oy + 30], [ox, oy + 30],
  ];
}

/** Rebuild a placement's final sheet-space polygon — the exact transform
 *  nestCutPathsRaster/nestCutPathsVinyl use: rotation 90 maps [x, y] to
 *  [-y, x], then the rotated cloud is translated so its AABB min lands at
 *  the placement's (x, y). */
function rebuiltPolygon(points: Array<[number, number]>, p: RasterNestPlacement): Array<[number, number]> {
  const rotated = points.map(([x, y]) => (p.rotation === 90 ? [-y, x] : [x, y]) as [number, number]);
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of rotated) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  return rotated.map(([x, y]) => [x - minX + p.x, y - minY + p.y] as [number, number]);
}

/** Occupied cell-centre coordinates (sheet frame, rounded to the integer px
 *  grid) of a polygon rasterized at 1 px/mm. */
function polygonCells(points: Array<[number, number]>): Array<[number, number]> {
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  const g = fillPolygonMask(points, 1, 0);
  const cells: Array<[number, number]> = [];
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      if (g.mask[j * g.w + i]) cells.push([Math.round(minX) + i, Math.round(minY) + j]);
    }
  }
  return cells;
}

describe('nestPolygonsRaster', () => {
  it('packs two same-chirality L parts in strictly less height than hull packing on a 62 mm sheet', () => {
    const items: RasterNestItem[] = [
      { id: 'L1', points: lPoly() },
      { id: 'L2', points: lPoly(400, 800) }, // same chirality, arbitrary original position
    ];
    const r = nestPolygonsRaster(items, 62, 2);

    // Hull baseline: two 30×30 AABBs inflated by the 2 mm gap are 32+32 = 64
    // wide — too wide for the 62 mm sheet, so hull packing needs two rows.
    const hull = nestPolygons(items.map(it => ({ id: it.id, points: it.points }) as NestPolyItem), 62, 2);
    expect(hull.usedHeight).toBeCloseTo(62, 6);

    expect(r.unfit).toBe(0);
    expect(r.placements.every(p => p.placed)).toBe(true);
    // The raster packer interleaves the Ls side by side in ONE 30 mm row —
    // the true-shape gap between the bottom bars is 2 mm, not the 32 mm hull
    // footprint the AABB skyline is forced to consume.
    expect(r.usedHeight).toBeLessThan(hull.usedHeight);
    expect(r.usedHeight).toBeCloseTo(30, 1);
    expect(r.utilization).toBeGreaterThan(0);
  });

  it('keeps four L placements overlap-free with ≥ gap − 1.5 px pairwise clearance', () => {
    const items: RasterNestItem[] = [
      { id: 'A', points: lPoly() },
      { id: 'B', points: lPoly(100, 20) },
      { id: 'C', points: lPoly(-40, 300) },
      { id: 'D', points: lPoly(7, -9) },
    ];
    const sheetWidth = 124; // room for two Ls per row
    const gap = 2;
    const r = nestPolygonsRaster(items, sheetWidth, gap);
    expect(r.unfit).toBe(0);
    expect(r.placements.every(p => p.placed)).toBe(true);

    const polys = items.map((it, i) => rebuiltPolygon(it.points, r.placements[i]));
    const grids = polys.map(polygonCells);

    for (let i = 0; i < grids.length; i++) {
      for (let j = i + 1; j < grids.length; j++) {
        // No shared occupied cell at 1 px/mm …
        const key = (c: [number, number]) => c[0] * 1_000_000 + c[1];
        const own = new Set(grids[i].map(key));
        expect(grids[j].some(c => own.has(key(c)))).toBe(false);
        // … and pairwise clearance ≥ gap − 1.5 px, measured as the min cell
        // distance — the interlock-safe generalisation of AABB clearance
        // (interleaved parts legitimately have overlapping AABBs, which is
        // precisely the concavity saving this packer exists for).
        let min = Infinity;
        for (const a of grids[i]) {
          for (const b of grids[j]) {
            const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
            if (d < min) min = d;
          }
        }
        expect(min).toBeGreaterThanOrEqual(gap - 1.5);
      }
    }
  });

  it('flags a part wider than the sheet in both rotations as unfit', () => {
    const r = nestPolygonsRaster([
      { id: 'huge', points: [[0, 0], [80, 0], [80, 60], [0, 60]] },
      { id: 'chip', points: [[0, 0], [10, 0], [10, 10], [0, 10]] },
    ], 50, 2);
    expect(r.placements.find(p => p.id === 'huge')!.placed).toBe(false);
    expect(r.placements.find(p => p.id === 'chip')!.placed).toBe(true);
    expect(r.unfit).toBe(1);
  });

  it('is deterministic across runs (deep-equal results)', () => {
    const items: RasterNestItem[] = [
      { id: 'A', points: lPoly() },
      { id: 'B', points: lPoly(9, 9) },
      { id: 'C', points: [[0, 0], [24, 0], [24, 12], [0, 12]] },
      { id: 'D', points: lPoly(-5, 40) },
      { id: 'E', points: [[0, 0], [12, 0], [12, 26], [0, 26]] },
      { id: 'F', points: lPoly(60, -3) },
    ];
    const a = nestPolygonsRaster(items, 90, 2);
    const b = nestPolygonsRaster(items, 90, 2);
    expect(a).toEqual(b);
    expect(a.unfit).toBe(0);
  });
});

describe('RASTER_NEST_MAX_PARTS cap', () => {
  it('cap-excluded parts overhang below the pack instead of piling at (0,0)', () => {
    // 63 small parts → 60 placed, 3 excluded. The excluded ones must sit at
    // their own overhang row (y > 0, below the packed content), never at
    // (0,0) where the rebuild would stack them on the first placed part.
    const part = (): Array<[number, number]> =>
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const items = Array.from({ length: 63 }, (_, i) => ({ id: `p${i}`, points: part() }));
    const result = nestPolygonsRaster(items, 120, 2, { pxPerMm: 1 });
    const placed = result.placements.filter(p => p.placed);
    const excluded = result.placements.filter(p => !p.placed);
    expect(placed).toHaveLength(60);
    expect(excluded).toHaveLength(3);
    const packedBottom = Math.max(...placed.map(p => p.y));
    for (const p of excluded) {
      expect(p.y).toBeGreaterThan(packedBottom);
      expect(p.y).toBeGreaterThanOrEqual(packedBottom + 2 - 1.5); // gap minus cell slack
    }
    // And they are not all collapsed onto one spot overlapping the pack.
    expect(excluded.every(p => p.y > 0)).toBe(true);
  });
});
