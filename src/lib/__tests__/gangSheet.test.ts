import { describe, expect, it } from 'vitest';
import {
  buildGangSheet,
  composeGangSheetPng,
  gangSheetFrameMm,
  gangSheetHullMm,
  GANG_SHEET_ALPHA_THRESHOLD,
  GANG_SHEET_MAX_COMPOSE_PX,
  type GangSheetComposeCanvas,
  type GangSheetResult,
  type GangSheetSource,
} from '../gangSheet';

/**
 * Gang Sheet Builder (gangSheet.ts) — the DTF imposition adapter around the
 * nesting engines. Pure-logic contract under test:
 *
 *   • px→mm via dpi, qty expansion, roll-width containment, no overlaps;
 *   • gap clearance between neighbours;
 *   • engine routing: rect jobs (nestRects, no part cap), true-shape jobs
 *     (nestPolygonsRaster, 60-part cap), rotation-off true-shape jobs
 *     (nestPolygons — the only engine honouring allowRotate90=false);
 *   • utilization from the parts' own area (hull shoelace / w·h);
 *   • unfit reasons as stable keys ('too-wide' / 'too-tall' / 'engine-cap');
 *   • PNG composition math via injected fake canvas/ctx (jsdom has no 2D).
 *
 * dpi 254 everywhere → exactly 0.1 mm per pixel, so mm values are round.
 */

const DPI = 254; // 1 px = 0.1 mm
const mm = (px: number) => px / 10;

/** Rect source helper (px dims @DPI → mm dims). */
function rect(id: string, wPx: number, hPx: number, qty = 1, name = id): GangSheetSource {
  return { id, name: `${name}.png`, widthPx: wPx, heightPx: hPx, qty };
}

/** Fully-opaque mask over a wxh cell grid — the hull is the whole rect. */
function fullMask(w: number, h: number, value = 255): { w: number; h: number; data: Uint8Array } {
  return { w, h, data: new Uint8Array(w * h).fill(value) };
}

/** Mask from an ASCII map: '#' (≥ threshold), '.' (0). Rows = outer arrays. */
function maskFrom(rows: string[]): { w: number; h: number; data: Uint8Array } {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) data[y * w + x] = row[x] === '#' ? 255 : 0;
  });
  return { w, h, data };
}

/** True when two placed AABBs are disjoint or touch (no positive overlap). */
function disjoint(
  a: { x: number; y: number; widthMm: number; heightMm: number },
  b: { x: number; y: number; widthMm: number; heightMm: number },
): boolean {
  return a.x + a.widthMm <= b.x + 1e-6 || b.x + b.widthMm <= a.x + 1e-6
    || a.y + a.heightMm <= b.y + 1e-6 || b.y + b.heightMm <= a.y + 1e-6;
}

describe('buildGangSheet — rect jobs (nestRects)', () => {
  it('expands qty copies and nests every part inside the roll width, overlap-free', () => {
    const sources = [
      rect('a', 100, 50, 2), // 10×5 mm ×2
      rect('b', 200, 100, 3), // 20×10 mm ×3
    ];
    const r = buildGangSheet(sources, { rollWidthMm: 60, gapMm: 2, dpi: DPI, allowRotate90: true });
    expect(r.placements).toHaveLength(5);
    expect(r.unfit).toEqual([]);
    expect(r.sheetWidthMm).toBe(60);
    const qtyA = r.placements.filter(p => p.id === 'a').map(p => p.qtyIndex).sort();
    expect(qtyA).toEqual([0, 1]);
    for (const p of r.placements) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6);
      expect(p.x + p.widthMm).toBeLessThanOrEqual(r.sheetWidthMm + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(-1e-6);
    }
    for (let i = 0; i < r.placements.length; i++) {
      for (let j = i + 1; j < r.placements.length; j++) {
        expect(disjoint(r.placements[i], r.placements[j])).toBe(true);
      }
    }
    expect(r.sheetHeightMm).toBeGreaterThan(0);
  });

  it('converts px to mm via dpi (300×600 px @300 dpi → 25.4×50.8 mm)', () => {
    const r = buildGangSheet([rect('a', 300, 600)], { rollWidthMm: 60, gapMm: 1, dpi: 300, allowRotate90: false });
    expect(r.placements).toHaveLength(1);
    expect(r.placements[0].widthMm).toBeCloseTo(25.4, 6);
    expect(r.placements[0].heightMm).toBeCloseTo(50.8, 6);
    expect(r.placements[0].rotated).toBe(false);
  });

  it('keeps the requested gap between stacked neighbours', () => {
    const r = buildGangSheet([rect('a', 500, 500, 2)], { rollWidthMm: 60, gapMm: 5, dpi: DPI, allowRotate90: true });
    expect(r.unfit).toEqual([]);
    const [p1, p2] = [...r.placements].sort((a, b) => a.y - b.y);
    expect(p2.y).toBeCloseTo(p1.y + mm(500) + 5, 6); // 50 mm part + 5 mm gap
  });

  it('rotation-off keeps a portrait part upright even when rotating packs tighter', () => {
    const sources = [rect('tall', 300, 600)]; // 30×60 mm — rotated (60 wide) also fits roll 65
    const off = buildGangSheet(sources, { rollWidthMm: 65, gapMm: 2, dpi: DPI, allowRotate90: false });
    expect(off.placements[0].rotated).toBe(false);
    expect(off.placements[0].widthMm).toBeCloseTo(30, 6);
    expect(off.placements[0].heightMm).toBeCloseTo(60, 6);
  });

  it('marks a part wider than the roll in both orientations unfit (kept in placements)', () => {
    const r = buildGangSheet([rect('big', 2000, 3000)], { rollWidthMm: 100, gapMm: 2, dpi: DPI, allowRotate90: true });
    expect(r.placements).toHaveLength(1);
    expect(r.unfit).toEqual([{ id: 'big', reason: 'too-wide' }]);
    expect(r.utilization).toBe(0);
  });

  it('flags parts past maxSheetHeightMm as too-tall and clamps the sheet height', () => {
    // 40×60 mm parts on a 45 mm roll (rotation cannot help: 60 > 45), gap 0
    // → a vertical stack 0/60/120 mm with a 100 mm budget.
    const r = buildGangSheet([rect('a', 400, 600, 3)], { rollWidthMm: 45, gapMm: 0, dpi: DPI, allowRotate90: true, maxSheetHeightMm: 100 });
    expect(r.placements).toHaveLength(3);
    expect(r.sheetHeightMm).toBeCloseTo(100, 6);
    expect(r.unfit).toEqual([
      { id: 'a', reason: 'too-tall' },
      { id: 'a', reason: 'too-tall' },
    ]);
    // Only the first (in-budget) part counts toward utilization.
    expect(r.utilization).toBeCloseTo((40 * 60) / (45 * 100), 4);
  });

  it('utilization = placed part area ÷ sheet area (two flush squares = 1.0)', () => {
    const r = buildGangSheet([rect('a', 500, 500, 2)], { rollWidthMm: 50, gapMm: 0, dpi: DPI, allowRotate90: false });
    expect(r.sheetHeightMm).toBeCloseTo(100, 6);
    expect(r.utilization).toBeCloseTo(1, 6);
  });

  it('has no part cap on rect jobs (61 copies all place)', () => {
    const r = buildGangSheet([rect('a', 100, 100, 61)], { rollWidthMm: 600, gapMm: 2, dpi: DPI, allowRotate90: true });
    expect(r.placements).toHaveLength(61);
    expect(r.unfit).toEqual([]);
  });

  it('returns an empty sheet for no sources, zero width, or zero qty', () => {
    expect(buildGangSheet([], { rollWidthMm: 100, gapMm: 2, dpi: DPI, allowRotate90: true }).placements).toEqual([]);
    expect(buildGangSheet([rect('a', 100, 100)], { rollWidthMm: 0, gapMm: 2, dpi: DPI, allowRotate90: true }).placements).toEqual([]);
    const zeroQty = buildGangSheet([rect('a', 100, 100, 0)], { rollWidthMm: 100, gapMm: 2, dpi: DPI, allowRotate90: true });
    expect(zeroQty.placements).toEqual([]);
    expect(zeroQty.unfit).toEqual([]);
    expect(zeroQty.sheetHeightMm).toBe(0);
  });

  it('flags zero-dimension sources as invalid-size', () => {
    const r = buildGangSheet([{ id: 'bad', name: 'bad.png', widthPx: 0, heightPx: 100, qty: 1 }], { rollWidthMm: 100, gapMm: 2, dpi: DPI, allowRotate90: true });
    expect(r.placements).toEqual([]);
    expect(r.unfit).toEqual([{ id: 'bad', reason: 'invalid-size' }]);
  });
});

describe('buildGangSheet — true-shape jobs (masks)', () => {
  it('gangSheetHullMm builds a cell-corner hull of only the opaque cells', () => {
    const src: GangSheetSource = { id: 'a', name: 'a.png', widthPx: 400, heightPx: 400, qty: 1, mask: maskFrom(['##..', '##..', '##..', '##..']) };
    const hull = gangSheetHullMm(src, DPI);
    expect(hull).not.toBeNull();
    const frame = gangSheetFrameMm(src, DPI);
    // Left half opaque → hull spans 20×40 mm (not the full 40×40 rect).
    expect(frame.w).toBeCloseTo(20, 6);
    expect(frame.h).toBeCloseTo(40, 6);
    expect(frame.hull).toEqual(hull);
  });

  it('a fully transparent mask degenerates to rectangle nesting (no engine cap)', () => {
    const src: GangSheetSource = { id: 'a', name: 'a.png', widthPx: 100, heightPx: 100, qty: 61, mask: fullMask(2, 2, 0) };
    expect(gangSheetHullMm(src, DPI)).toBeNull();
    const r = buildGangSheet([src], { rollWidthMm: 600, gapMm: 2, dpi: DPI, allowRotate90: true });
    expect(r.placements).toHaveLength(61);
    expect(r.unfit).toEqual([]); // nestRects path — no RASTER_NEST_MAX_PARTS
  });

  it('nests an L artwork by its hull (utilization ≈ 0.72, well under rect ≈ 1)', () => {
    // L = left column + bottom row of a 4×4 mask over a 40×40 mm image. The
    // cell-corner hull is the pentagon (0,0),(10,0),(40,30),(40,40),(0,40) —
    // 1150 mm² — versus the 1600 mm² bounding rectangle.
    const src: GangSheetSource = { id: 'l', name: 'l.png', widthPx: 400, heightPx: 400, qty: 1, mask: maskFrom(['#...', '#...', '#...', '####']) };
    const r = buildGangSheet([src], { rollWidthMm: 40, gapMm: 0, dpi: DPI, allowRotate90: true });
    expect(r.unfit).toEqual([]);
    expect(r.placements[0].x + r.placements[0].widthMm).toBeLessThanOrEqual(40 + 1e-6);
    expect(r.sheetHeightMm).toBeGreaterThan(35);
    // 1150 / (40 × 40) = 0.719 — rect packing of a full-width part would be ≈ 1.
    expect(r.utilization).toBeGreaterThan(0.65);
    expect(r.utilization).toBeLessThan(0.8);
  });

  it('rotation allowed: a landscape part tucks beside a portrait one (raster engine)', () => {
    const a: GangSheetSource = { id: 'a', name: 'a.png', widthPx: 600, heightPx: 1000, qty: 1, mask: fullMask(6, 10) }; // 60×100
    const b: GangSheetSource = { id: 'b', name: 'b.png', widthPx: 500, heightPx: 400, qty: 1, mask: fullMask(5, 4) }; // 50×40
    const r = buildGangSheet([a, b], { rollWidthMm: 105, gapMm: 5, dpi: DPI, allowRotate90: true });
    expect(r.unfit).toEqual([]);
    expect(r.placements.some(p => p.rotated)).toBe(true);
    expect(r.sheetHeightMm).toBeLessThan(110); // 60 + 5 + 40 would stack to 105+
  });

  it('rotation off (true-shape job): nestPolygons keeps every part upright', () => {
    const a: GangSheetSource = { id: 'a', name: 'a.png', widthPx: 600, heightPx: 1000, qty: 1, mask: fullMask(6, 10) };
    const b: GangSheetSource = { id: 'b', name: 'b.png', widthPx: 500, heightPx: 400, qty: 1, mask: fullMask(5, 4) };
    const r = buildGangSheet([a, b], { rollWidthMm: 105, gapMm: 5, dpi: DPI, allowRotate90: false });
    expect(r.unfit).toEqual([]);
    expect(r.placements.every(p => !p.rotated)).toBe(true);
    expect(r.sheetHeightMm).toBeCloseTo(145, 0); // stacked: 100 + 5 gap + 40
  });

  it('mixed jobs send rect parts through the same engine as masked parts', () => {
    const masked: GangSheetSource = { id: 'm', name: 'm.png', widthPx: 300, heightPx: 300, qty: 1, mask: fullMask(3, 3) }; // 30×30
    const plain = rect('r', 200, 100, 1); // 20×10
    const r = buildGangSheet([masked, plain], { rollWidthMm: 100, gapMm: 2, dpi: DPI, allowRotate90: true });
    expect(r.unfit).toEqual([]);
    expect(r.placements).toHaveLength(2);
    for (let i = 0; i < r.placements.length; i++) {
      for (let j = i + 1; j < r.placements.length; j++) {
        expect(disjoint(r.placements[i], r.placements[j])).toBe(true);
      }
    }
  });

  it('reports parts past the raster engine 60-part cap as engine-cap unfit', () => {
    const src: GangSheetSource = { id: 'a', name: 'a.png', widthPx: 100, heightPx: 100, qty: 70, mask: fullMask(2, 2) }; // 10×10 mm ×70
    const r = buildGangSheet([src], { rollWidthMm: 200, gapMm: 2, dpi: DPI, allowRotate90: true });
    expect(r.placements).toHaveLength(70);
    expect(r.unfit).toHaveLength(10);
    expect(r.unfit.every(u => u.reason === 'engine-cap')).toBe(true);
    expect(r.utilization).toBeGreaterThan(0);
  });

  it('mixed 70-part job with one masked source shares the 60-part cap', () => {
    const masked: GangSheetSource = { id: 'm', name: 'm.png', widthPx: 100, heightPx: 100, qty: 1, mask: fullMask(2, 2) };
    const r = buildGangSheet([masked, rect('r', 100, 100, 69)], { rollWidthMm: 300, gapMm: 2, dpi: DPI, allowRotate90: true });
    expect(r.placements).toHaveLength(70);
    expect(r.unfit.filter(u => u.reason === 'engine-cap')).toHaveLength(10);
  });
});

describe('composeGangSheetPng (injected fake canvas)', () => {
  /** Recording fake 2D context — the structural slice compose draws with. */
  type Op = { op: string; args: unknown[] };
  function fakeCanvas() {
    const ops: Op[] = [];
    const ctx = {
      save: () => ops.push({ op: 'save', args: [] }),
      restore: () => ops.push({ op: 'restore', args: [] }),
      translate: (x: number, y: number) => ops.push({ op: 'translate', args: [x, y] }),
      rotate: (a: number) => ops.push({ op: 'rotate', args: [a] }),
      drawImage: (...args: unknown[]) => ops.push({ op: 'drawImage', args }),
    };
    let canvas: GangSheetComposeCanvas;
    const create = (width: number, height: number): GangSheetComposeCanvas => {
      canvas = { width, height, ctx };
      return canvas;
    };
    const toBlob = async () => new Blob(['png'], { type: 'image/png' });
    return {
      create,
      toBlob,
      ops: () => ops,
      size: () => ({ w: canvas!.width, h: canvas!.height }),
    };
  }

  it('draws each placement at its exact mm position, rotating quarter-turn CCW', async () => {
    const srcA = rect('a', 100, 50); // 10×5 mm @DPI
    const srcB = rect('b', 40, 40);
    const result: GangSheetResult = {
      placements: [
        { id: 'a', x: 0, y: 0, widthMm: 10, heightMm: 5, rotated: false, qtyIndex: 0 },
        { id: 'a', x: 10, y: 0, widthMm: 5, heightMm: 10, rotated: true, qtyIndex: 1 },
        { id: 'b', x: 15, y: 0, widthMm: 4, heightMm: 4, rotated: false, qtyIndex: 0 }, // no bitmap → skipped
      ],
      sheetWidthMm: 20,
      sheetHeightMm: 10,
      utilization: 1,
      unfit: [],
    };
    const bmpA = {} as CanvasImageSource;
    const host = fakeCanvas();
    const blob = await composeGangSheetPng(result, [srcA, srcB], new Map([['a', bmpA]]), {
      dpi: DPI,
      deps: { createCanvas: host.create, toBlob: host.toBlob },
    });
    expect(blob).toBeInstanceOf(Blob);
    // 20×10 mm at 10 px/mm → 200×100 canvas.
    expect(host.size()).toEqual({ w: 200, h: 100 });
    const draws = host.ops().filter(o => o.op === 'drawImage');
    expect(draws).toHaveLength(2); // 'b' skipped — no bitmap in the map
    // Upright: translate to (0,0), source rect 100×50 px drawn at 100×50 px.
    expect(host.ops()[0]).toEqual({ op: 'save', args: [] });
    expect(host.ops()[1]).toEqual({ op: 'translate', args: [0, 0] });
    expect(draws[0].args).toEqual([bmpA, 0, 0, 100, 50, 0, 0, 100, 50]);
    expect(host.ops()[3]).toEqual({ op: 'restore', args: [] });
    // Rotated: Tx = (x + y0 + h)·f = (10 + 0 + 5)·10 = 150, Ty = (y − x0)·f = 0.
    expect(host.ops()[5]).toEqual({ op: 'translate', args: [150, 0] });
    expect(host.ops()[6]).toEqual({ op: 'rotate', args: [Math.PI / 2] });
    expect(draws[1].args).toEqual([bmpA, 0, 0, 100, 50, 0, 0, 100, 50]);
  });

  it('offsets by the hull origin so true-shape art lands on its placement', async () => {
    // Artwork occupying the RIGHT half of the image → hull x0 = 5 mm.
    const src: GangSheetSource = { id: 'a', name: 'a.png', widthPx: 100, heightPx: 50, qty: 1, mask: maskFrom(['..##']) };
    const result: GangSheetResult = {
      placements: [{ id: 'a', x: 10, y: 20, widthMm: 5, heightMm: 5, rotated: false, qtyIndex: 0 }],
      sheetWidthMm: 30,
      sheetHeightMm: 30,
      utilization: 1,
      unfit: [],
    };
    const host = fakeCanvas();
    await composeGangSheetPng(result, [src], new Map([['a', {} as CanvasImageSource]]), {
      dpi: DPI,
      deps: { createCanvas: host.create, toBlob: host.toBlob },
    });
    // The image's left 5 mm are transparent padding: the bitmap starts at
    // placement.x − x0 = 5 mm → 50 px.
    expect(host.ops()[1]).toEqual({ op: 'translate', args: [50, 200] });
  });

  it('lowers the export resolution proportionally past the pixel budget', async () => {
    const result: GangSheetResult = {
      placements: [],
      sheetWidthMm: 1000,
      sheetHeightMm: 2000,
      utilization: 0,
      unfit: [],
    };
    const host = fakeCanvas();
    await composeGangSheetPng(result, [], new Map(), {
      dpi: DPI, // native 10000×20000 px = 200 Mpx — 3.1× over budget
      deps: { createCanvas: host.create, toBlob: host.toBlob },
    });
    const { w, h } = host.size();
    expect(w * h).toBeLessThanOrEqual(GANG_SHEET_MAX_COMPOSE_PX * 1.001);
    expect(w).toBeGreaterThan(1000); // still far above thumbnail territory
    expect(h / w).toBeCloseTo(2, 1); // aspect preserved
  });
});

describe('constants', () => {
  it('exposes the documented thresholds', () => {
    expect(GANG_SHEET_ALPHA_THRESHOLD).toBe(128);
    // A mask cell exactly at the threshold counts as artwork.
    const src: GangSheetSource = { id: 'a', name: 'a.png', widthPx: 100, heightPx: 100, qty: 1, mask: fullMask(2, 2, 128) };
    expect(gangSheetHullMm(src, DPI)).not.toBeNull();
  });
});
