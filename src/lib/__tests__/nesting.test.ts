import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import { useEditor } from '../../store/editor';
import { nestRects, type NestItem } from '../nesting';
import { nestSelection } from '../alignDistribute';

/** Deterministic RNG so the random suites are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Effective rect of a placement (rotation swaps width/height). */
function effRect(items: NestItem[], i: number, p: { x: number; y: number; rotated: boolean }) {
  return { x: p.x, y: p.y, w: p.rotated ? items[i].h : items[i].w, h: p.rotated ? items[i].w : items[i].h };
}

/** True when two placements keep at least `gap` separation on some axis. */
function separated(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap: number, eps = 1e-6): boolean {
  const sepX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const sepY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  return sepX >= gap - eps || sepY >= gap - eps;
}

/** The shelf packer autoArrangeSelection uses — the baseline to beat. */
function shelfUsedHeight(items: NestItem[], sheetWidth: number, gap: number): number {
  const sorted = [...items].sort((a, b) => b.h - a.h);
  let x = 0, y = 0, rowH = 0, used = 0;
  for (const it of sorted) {
    const w = it.w + gap, h = it.h + gap;
    if (x > 0 && x + w > sheetWidth) { y += rowH; x = 0; rowH = 0; }
    x += w;
    rowH = Math.max(rowH, h);
    used = Math.max(used, y + it.h);
  }
  return used;
}

describe('nestRects', () => {
  it('returns an empty result for no items', () => {
    expect(nestRects([], 100)).toEqual({ placements: [], usedHeight: 0, utilization: 0, unfit: 0 });
  });

  it('packs two squares side by side on the floor', () => {
    const r = nestRects([{ w: 10, h: 10 }, { w: 10, h: 10 }], 30);
    expect(r.placements.every(p => p.placed && !p.rotated)).toBe(true);
    expect(r.usedHeight).toBeCloseTo(10, 6);
    expect(r.utilization).toBeCloseTo(200 / 300, 6);
  });

  it('keeps placements inside the sheet width with no overlaps on seeded random suites', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rand = mulberry32(seed * 7919);
      const items: NestItem[] = Array.from({ length: 30 }, () => ({
        w: 4 + Math.floor(rand() * 36),
        h: 4 + Math.floor(rand() * 36),
      }));
      const sheetWidth = 100, gap = 2;
      const r = nestRects(items, sheetWidth, gap);
      expect(r.unfit).toBe(0);

      const rects = r.placements.map((p, i) => effRect(items, i, p));
      for (const rect of rects) {
        expect(rect.x).toBeGreaterThanOrEqual(-1e-6);
        expect(rect.x + rect.w).toBeLessThanOrEqual(sheetWidth + 1e-6);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(separated(rects[i], rects[j], gap)).toBe(true);
        }
      }
    }
  });

  it('utilizes the sheet at least as well as the shelf packer on seeded random suites', () => {
    for (let seed = 11; seed <= 20; seed++) {
      const rand = mulberry32(seed * 104729);
      const items: NestItem[] = Array.from({ length: 24 }, () => ({
        w: 5 + Math.floor(rand() * 35),
        h: 5 + Math.floor(rand() * 35),
      }));
      const sheetWidth = 100, gap = 2;
      const r = nestRects(items, sheetWidth, gap);
      const shelfUsed = shelfUsedHeight(items, sheetWidth, gap);
      const area = items.reduce((s, it) => s + it.w * it.h, 0);
      const shelfUtil = area / (sheetWidth * shelfUsed);
      expect(r.usedHeight).toBeLessThanOrEqual(shelfUsed + 1e-6);
      expect(r.utilization).toBeGreaterThanOrEqual(shelfUtil - 1e-9);
    }
  });

  it('rotates items to slot into strips the upright orientation cannot fit', () => {
    // A 90-wide decal leaves a 10-wide strip; 12×10 chips only fit there on
    // their side (10 wide, 12 high).
    const items: NestItem[] = [{ w: 90, h: 40 }, ...Array.from({ length: 4 }, () => ({ w: 12, h: 10 }))];
    const r = nestRects(items, 100, 0);
    expect(r.placements[0]).toMatchObject({ x: 0, y: 0, rotated: false });
    const chips = r.placements.slice(1);
    expect(chips.every(p => p.rotated)).toBe(true);
    expect(chips.every(p => p.x === 90)).toBe(true);
    expect(r.usedHeight).toBeCloseTo(48, 6); // 4-chip stack tops out at 4×12
    // Without rotation the chips form a second row instead — strictly taller.
    const noRot = nestRects(items, 100, 0, false);
    expect(noRot.placements.every(p => !p.rotated)).toBe(true);
    expect(r.usedHeight).toBeLessThan(noRot.usedHeight);
  });

  it('uses rotation to save material on 50×10 chips over a 60-wide sheet', () => {
    const items: NestItem[] = Array.from({ length: 6 }, () => ({ w: 50, h: 10 }));
    const r = nestRects(items, 60, 0);
    expect(r.placements.some(p => p.rotated)).toBe(true);
    const noRot = nestRects(items, 60, 0, false);
    expect(noRot.usedHeight).toBeCloseTo(60, 6); // 6 upright rows of 10
    expect(r.usedHeight).toBeLessThanOrEqual(noRot.usedHeight);
  });

  it('keeps the requested kerf gap between neighbours', () => {
    const items: NestItem[] = [
      { w: 30, h: 20 }, { w: 30, h: 20 }, { w: 30, h: 20 },
    ];
    const r = nestRects(items, 100, 5);
    const rects = r.placements.map((p, i) => effRect(items, i, p));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(separated(rects[i], rects[j], 5)).toBe(true);
      }
    }
  });

  it('flags items wider than the sheet in both orientations as unfit overhangs', () => {
    // 120×110 overflows the 100-wide sheet rotated or not — it gets its own
    // row and overhangs, while a small chip still packs normally.
    const r = nestRects([{ w: 120, h: 110 }, { w: 10, h: 10 }], 100, 0);
    expect(r.placements[0].placed).toBe(false);
    expect(r.unfit).toBe(1);
    expect(r.placements[1].placed).toBe(true);
  });
});

describe('nestSelection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('packs the selection against the artboard, rotating 90° when planned, with one history push', async () => {
    const canvasEngine = await import('../canvasEngine');
    const previousArtboards = useEditor.getState().artboards;
    useEditor.getState().setArtboards([{ id: 'ab-nest', name: 'Sheet', x: 0, y: 0, width: 300, height: 400 }]);

    const big = new fabric.Rect({ left: 0, top: 0, width: 270, height: 120, strokeWidth: 0 });
    const chip = new fabric.Rect({ left: 500, top: 200, width: 36, height: 30, strokeWidth: 0 });
    const canvas = {
      getActiveObjects: () => [big, chip],
      getObjects: () => [big, chip],
      requestRenderAll: vi.fn(),
    };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(canvas as never);
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});

    try {
      const result = nestSelection(0);
      expect(result).not.toBeNull();
      expect(result?.arranged).toBe(2);
      expect(result?.rotated).toBe(1); // the 36-wide chip turns sideways into the strip
      expect(pushHistory).toHaveBeenCalledOnce();
      expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

      const bigRect = big.getBoundingRect();
      expect(bigRect.left).toBeCloseTo(0, 3);
      expect(bigRect.top).toBeCloseTo(0, 3);
      expect(bigRect.width).toBeCloseTo(270, 3);

      // Rotated +90°: bounding box swaps to 30 wide × 36 high at the strip.
      expect(Math.abs(chip.angle - 90)).toBeLessThan(1e-6);
      const chipRect = chip.getBoundingRect();
      expect(chipRect.left).toBeCloseTo(270, 3);
      expect(chipRect.top).toBeCloseTo(0, 3);
      expect(chipRect.width).toBeCloseTo(30, 3);
      expect(chipRect.height).toBeCloseTo(36, 3);
      expect(result?.usedHeightMm).toBeCloseTo(120 / 3.7795, 1);
    } finally {
      useEditor.getState().setArtboards(previousArtboards);
    }
  });

  it('needs a canvas and 2+ selected objects', async () => {
    const canvasEngine = await import('../canvasEngine');
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(nestSelection()).toBeNull();

    const only = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 });
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue({
      getActiveObjects: () => [only],
      requestRenderAll: vi.fn(),
    } as never);
    expect(nestSelection()).toBeNull();
  });
});
