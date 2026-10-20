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

/** Axis-aligned rectangle ring between (x0, y0) and (x1, y1). */
function rectRing(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** Sheet-space occupied cells of a placed item's SOLID footprint — the outer
 *  ring's fill minus every hole fill, i.e. the walls a nested part must stay
 *  clear of (part-in-hole counterpart of the plain polygonCells helper).
 *  Holes ride the OUTER ring's transform: same rotation point map, translated
 *  by the outer ring's rotated-bbox min to the placement — NOT their own
 *  bbox, which would re-anchor the hole at the frame's origin. */
function itemCells(item: RasterNestItem, p: RasterNestPlacement): Array<[number, number]> {
  const rotate = (pts: Array<[number, number]>) =>
    pts.map(([x, y]) => (p.rotation === 90 ? [-y, x] : [x, y]) as [number, number]);
  const rotOuter = rotate(item.points);
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of rotOuter) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  const toSheet = (pts: Array<[number, number]>) =>
    rotate(pts).map(([x, y]) => [x - minX + p.x, y - minY + p.y] as [number, number]);
  const key = (c: [number, number]) => c[0] * 1_000_000 + c[1];
  const cells = new Set(polygonCells(toSheet(item.points)).map(key));
  for (const hole of item.holes ?? []) {
    for (const c of polygonCells(toSheet(hole))) cells.delete(key(c));
  }
  return [...cells].map(k => [Math.floor(k / 1_000_000), k % 1_000_000] as [number, number]);
}

describe('part-in-hole nesting (RasterNestItem.holes)', () => {
  it('nests a 24×24 part inside a 60×60 frame’s 30×30 hole', () => {
    // A frame (sticker-sheet window) leaves only its walls occupied once the
    // hole ring is masked free, so on a 62 mm sheet the 24 mm part has no
    // place to go BUT the hole — beside the frame there are 2 spare mm.
    const frameItem: RasterNestItem = {
      id: 'frame',
      points: rectRing(0, 0, 60, 60),
      holes: [rectRing(15, 15, 45, 45)],
    };
    const part: RasterNestItem = { id: 'part', points: rectRing(0, 0, 24, 24) };
    const r = nestPolygonsRaster([frameItem, part], 62, 2);

    expect(r.unfit).toBe(0);
    const f = r.placements.find(p => p.id === 'frame')!;
    const q = r.placements.find(p => p.id === 'part')!;
    expect(f.placed).toBe(true);
    expect(q.placed).toBe(true);

    // Inside the frame’s AABB (0–60) …
    expect(q.x).toBeGreaterThanOrEqual(0);
    expect(q.y).toBeGreaterThanOrEqual(0);
    expect(q.x + 24).toBeLessThanOrEqual(60);
    expect(q.y + 24).toBeLessThanOrEqual(60);
    // … and inside the hole rect (15–45) ± 2 mm raster slack.
    expect(q.x).toBeGreaterThanOrEqual(15 - 2);
    expect(q.x).toBeLessThanOrEqual(45 - 24 + 2);
    expect(q.y).toBeGreaterThanOrEqual(15 - 2);
    expect(q.y).toBeLessThanOrEqual(45 - 24 + 2);

    // Nested in the hole the part adds NO height beyond the frame itself;
    // two parts NOT interleaved would burn ≥ 60 + 2 + 24 mm of sheet.
    expect(r.usedHeight).toBeLessThan(62);
    expect(r.usedHeight).toBeGreaterThan(0);

    // Overlap-free against the frame’s WALLS with the same ≥ gap − 1.5 px
    // pairwise clearance the plain overlap test demands between parts.
    const key = (c: [number, number]) => c[0] * 1_000_000 + c[1];
    const walls = itemCells(frameItem, f).map(key);
    const partCells = polygonCells(rebuiltPolygon(part.points, q));
    const wallSet = new Set(walls);
    expect(partCells.some(c => wallSet.has(key(c)))).toBe(false);
    let min = Infinity;
    for (const a of partCells) {
      for (const b of itemCells(frameItem, f)) {
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d < min) min = d;
      }
    }
    expect(min).toBeGreaterThanOrEqual(2 - 1.5);
  });

  it('keeps a holed frame at rotation 0 when the quarter-turn is wider than the sheet, and still nests in the hole', () => {
    // 60 wide × 70 tall: the quarter-turn needs 70 mm the 62 mm sheet doesn’t
    // have, so only rotation 0 can place — and the hole must survive that
    // decision for the small part to nest.
    const frameItem: RasterNestItem = {
      id: 'frame',
      points: rectRing(0, 0, 60, 70),
      holes: [rectRing(15, 20, 45, 50)],
    };
    const part: RasterNestItem = { id: 'part', points: rectRing(0, 0, 24, 24) };
    const r = nestPolygonsRaster([frameItem, part], 62, 2);

    const f = r.placements.find(p => p.id === 'frame')!;
    const q = r.placements.find(p => p.id === 'part')!;
    expect(f.placed).toBe(true);
    expect(f.rotation).toBe(0);
    expect(q.placed).toBe(true);
    // Part inside the hole rect (15–45) × (20–50) ± 2 mm slack.
    expect(q.x).toBeGreaterThanOrEqual(13);
    expect(q.x).toBeLessThanOrEqual(23);
    expect(q.y).toBeGreaterThanOrEqual(18);
    expect(q.y).toBeLessThanOrEqual(26);
    expect(r.usedHeight).toBeLessThan(72); // the 70 mm frame alone; no extra row
    expect(r.unfit).toBe(0);
  });

  it('is deterministic with holed items across runs (re-pin)', () => {
    const items: RasterNestItem[] = [
      { id: 'frameB', points: rectRing(9, 9, 69, 75), holes: [rectRing(20, 18, 52, 50)] },
      { id: 'chip2', points: rectRing(-40, 300, -16, 324) }, // 24×24
      { id: 'frameA', points: rectRing(0, 0, 60, 60), holes: [rectRing(15, 15, 45, 45)] },
      { id: 'l', points: lPoly() },
      { id: 'chip', points: rectRing(400, 800, 412, 824) }, // 12×24
    ];
    const a = nestPolygonsRaster(items, 62, 2);
    const b = nestPolygonsRaster(items, 62, 2);
    expect(a).toEqual(b);
    expect(a.unfit).toBe(0);
    expect(a.placements.every(p => p.placed)).toBe(true);

    // The hole actually hosts: frameB (placed first at (0,0)) has its 32×32
    // hole at sheet (11–43, 9–41) and the 24×24 chip2 nests inside it, while
    // the 12×24 chip nests in frameA’s hole — no chip below the pack.
    const frameB = a.placements.find(p => p.id === 'frameB')!;
    const chip2 = a.placements.find(p => p.id === 'chip2')!;
    expect(frameB.x).toBeCloseTo(0, 6);
    expect(frameB.y).toBeCloseTo(0, 6);
    expect(chip2.x).toBeGreaterThanOrEqual(11 - 2);
    expect(chip2.x).toBeLessThanOrEqual(43 - 24 + 2);
    expect(chip2.y).toBeGreaterThanOrEqual(9 - 2);
    expect(chip2.y).toBeLessThanOrEqual(41 - 24 + 2);
  });
});

describe('right-edge guard (wave-6 review regression)', () => {
  it('never places a part whose mask would cross the sheet\'s right edge', () => {
    // 60 mm frame on a 62 mm sheet leaves a 2 mm strip; the 29 mm part must
    // NOT "fit" there via the flat-index wraparound that existed at HEAD.
    const frame: Array<[number, number]> =
      [[0, 0], [60, 0], [60, 60], [0, 60], [0, 0]];
    const chip: Array<[number, number]> =
      [[0, 0], [29, 0], [29, 29], [0, 29], [0, 0]];
    const result = nestPolygonsRaster(
      [{ id: 'frame', points: frame }, { id: 'chip', points: chip }],
      62, 2, { pxPerMm: 1 },
    );
    for (const p of result.placements) {
      if (!p.placed) continue;
      const w = p.rotation === 90 ? 29 : (p.id === 'frame' ? 60 : 29);
      expect(p.x + w).toBeLessThanOrEqual(62 + 1e-9);
    }
    // The chip lands BELOW the frame (no wraparound spot), or is unfit.
    const chipP = result.placements.find(p => p.id === 'chip')!;
    const frameP = result.placements.find(p => p.id === 'frame')!;
    expect(chipP.placed ? chipP.y : Infinity).toBeGreaterThanOrEqual(frameP.y + 60 - 0.1);
  });
});
