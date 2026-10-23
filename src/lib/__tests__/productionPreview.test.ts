import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fabric from 'fabric';
import type { CutPath } from '../../store/editor';
import { buildProductionPreview } from '../productionPreview';

const MM_TO_PX = 3.7795; // 96dpi convention shared across the cutter pipeline

/**
 * jsdom never fires `load` for data: URLs (no image decoder), so the stamp
 * loader's bounded wait would stall every build. A src setter that settles
 * on the next microtask keeps the pipeline synchronous-ish and asserts the
 * stamp actually consumes the bleed raster's element.
 */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 0;
  height = 0;
  set src(_url: string) { queueMicrotask(() => this.onload?.()); }
}

/** One ctx call in true global invocation order (pairs translate/rotate/draw). */
interface CtxCall { order: number; name: string; args: unknown[]; }

function orderedLog(mocks: Record<string, ReturnType<typeof vi.fn>>): CtxCall[] {
  const calls: CtxCall[] = [];
  for (const [name, m] of Object.entries(mocks)) {
    m.mock.calls.forEach((args, i) => calls.push({ order: m.mock.invocationCallOrder[i], name, args }));
  }
  return calls.sort((a, b) => a.order - b.order);
}

/**
 * Reconstruct every raster stamp's DEVICE-space rect from the shared ctx
 * mock log: a stamp is drawImage(FakeImage, 0, 0, w, h) after
 * translate(tx, ty) [+ rotate(π/2)]. Rotation maps local (u, v) →
 * (tx − v, ty + u), so the device rect is [tx−h, tx]×[ty, ty+w] turned vs
 * [tx, tx+w]×[ty, ty+h] upright.
 */
function stampRects(log: CtxCall[]): Array<{ x1: number; y1: number; x2: number; y2: number; rotated: boolean }> {
  const out: Array<{ x1: number; y1: number; x2: number; y2: number; rotated: boolean }> = [];
  let tx = 0;
  let ty = 0;
  let rotated = false;
  for (const call of log) {
    if (call.name === 'translate') {
      tx = call.args[0] as number;
      ty = call.args[1] as number;
      rotated = false;
    } else if (call.name === 'rotate') {
      rotated = true;
    } else if (call.name === 'drawImage' && call.args[0] instanceof FakeImage) {
      const w = call.args[3] as number;
      const h = call.args[4] as number;
      out.push(rotated
        ? { x1: tx - h, y1: ty, x2: tx, y2: ty + w, rotated: true }
        : { x1: tx, y1: ty, x2: tx + w, y2: ty + h, rotated: false });
    }
  }
  return out;
}

/** A closed-rectangle cut path in document mm-space. */
function rectCutPath(id: string, x: number, y: number, w: number, h: number, kind: CutPath['kind'], color?: string): CutPath {
  return {
    id,
    points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
    closed: true,
    kind,
    ...(color ? { color } : {}),
  };
}

/** A fabric rect whose px geometry matches a mm rectangle (art aligned with the cut). */
function mmRect(xMm: number, yMm: number, wMm: number, hMm: number, fill = '#e11d48'): fabric.Rect {
  return new fabric.Rect({
    left: xMm * MM_TO_PX,
    top: yMm * MM_TO_PX,
    width: wMm * MM_TO_PX,
    height: hMm * MM_TO_PX,
    strokeWidth: 0,
    fill,
  });
}

describe('buildProductionPreview', () => {
  let drawImage: ReturnType<typeof vi.fn>;
  let translate: ReturnType<typeof vi.fn>;
  let rotate: ReturnType<typeof vi.fn>;
  let mocks: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
    drawImage = vi.fn();
    translate = vi.fn();
    rotate = vi.fn();
    mocks = { translate, rotate, drawImage };
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,sheet-test');
    // Repo-standard 2D mock (printMarks.test.ts pattern) + the transform trio
    // the stamp path needs — shared by buildBleedImage's canvases and the
    // composed sheet canvas.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 12 }),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate,
      rotate,
      setTransform: vi.fn(),
      transform: vi.fn(),
      setLineDash: vi.fn(),
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
      drawImage,
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => null),
      canvas: document.createElement('canvas'),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('grid-sanity: packs ≥12 upright copies on A4, in-sheet, ≥gap−0.5 clear, deterministic', async () => {
    const objects = [mmRect(10, 10, 60, 40)];
    const cutPaths = [rectCutPath('outline-1', 10, 10, 60, 40, 'outline', '#ff0000')];
    const opts = { sheetWidthMm: 210, sheetHeightMm: 297, gapMm: 2, bleedMm: 0, allowRotation: false };

    const result = await buildProductionPreview(objects, cutPaths, opts);
    expect(result).not.toBeNull();
    // Fixed sheet cap = floor(210·297·0.9 / 2400) = 23; hull 60×40 + 2mm gap
    // → 3 per row × 7 rows within 297mm (row 8 crosses the bottom → dropped).
    expect(result!.copies).toBeGreaterThanOrEqual(12);
    expect(result!.copies).toBe(21);
    expect(result!.placements.every(p => p.rotation === 0)).toBe(true);
    // 300-DPI-class raster resolution: multiplier 3 × 96dpi mm→px.
    expect(result!.pxPerMm).toBeCloseTo(3 * MM_TO_PX, 6);
    expect(result!.bleedUsed).toBe(false);

    // Every hull AABB inside the sheet, with ≥ gap−0.5 pairwise clearance on
    // at least one axis.
    for (const p of result!.placements) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6);
      expect(p.y).toBeGreaterThanOrEqual(-1e-6);
      expect(p.x + 60).toBeLessThanOrEqual(210 + 1e-6);
      expect(p.y + 40).toBeLessThanOrEqual(297 + 1e-6);
    }
    const boxes = result!.placements.map(p => ({ x1: p.x, y1: p.y, x2: p.x + 60, y2: p.y + 40 }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const sep = Math.max(a.x1 - b.x2, b.x1 - a.x2, a.y1 - b.y2, b.y1 - a.y2);
        expect(sep).toBeGreaterThanOrEqual(2 - 0.5);
      }
    }

    // Deterministic: identical inputs → deep-equal placements + cut paths.
    const again = await buildProductionPreview(objects, cutPaths, opts);
    expect(again!.placements).toEqual(result!.placements);
    expect(again!.cutPaths).toEqual(result!.cutPaths);

    // Utilization is honest material coverage, 0 < u ≤ 0.95.
    expect(result!.utilization).toBeGreaterThan(0);
    expect(result!.utilization).toBeLessThanOrEqual(0.95);
    expect(result!.utilization).toBeCloseTo((21 * 60 * 40) / (210 * 297), 6);
  });

  it('rotation: turns copies 90° when that slots them lower, and never when disallowed', async () => {
    // 58×28 item, gap 2 → inflated 60×30 / rotated 30×60. On a 110 roll the
    // second copy slots into the 50mm right-hand remainder ONLY rotated
    // (upright 60 > 50, rotated 30 ≤ 50) — the classic lettering case.
    const objects = [mmRect(0, 0, 58, 28)];
    const cutPaths = [rectCutPath('outline-1', 0, 0, 58, 28, 'outline')];

    const rotated = await buildProductionPreview(objects, cutPaths, {
      sheetWidthMm: 110, gapMm: 2, copies: 4, bleedMm: 0,
    });
    expect(rotated).not.toBeNull();
    expect(rotated!.placements.some(p => p.rotation === 90)).toBe(true);

    // Every stamp — including the turned ones — draws inside the sheet's
    // raster bounds (the rotation-90 alignment regression guard).
    const k = rotated!.pxPerMm;
    const rects = stampRects(orderedLog(mocks));
    expect(rects).toHaveLength(rotated!.copies);
    const W = 110 * k;
    const H = rotated!.sheetH * k;
    for (const r of rects) {
      expect(r.x1).toBeGreaterThanOrEqual(-0.5);
      expect(r.y1).toBeGreaterThanOrEqual(-0.5);
      expect(r.x2).toBeLessThanOrEqual(W + 0.5);
      expect(r.y2).toBeLessThanOrEqual(H + 0.5);
    }
    expect(rects.some(r => r.rotated)).toBe(true);
    // The turned copy's raster lands exactly on the reported placement rect:
    // placement (60, 0) rotation 90 → device [60, 88]×[0, 58] mm.
    const turned = rects.find(r => r.rotated)!;
    expect(turned.x1 / k).toBeCloseTo(60, 3);
    expect(turned.x2 / k).toBeCloseTo(88, 3);
    expect(turned.y1 / k).toBeCloseTo(0, 3);
    expect(turned.y2 / k).toBeCloseTo(58, 3);

    // Rotation off: same sheet packs upright-only (no rotation anywhere).
    const upright = await buildProductionPreview(objects, cutPaths, {
      sheetWidthMm: 110, gapMm: 2, copies: 4, bleedMm: 0, allowRotation: false,
    });
    expect(upright).not.toBeNull();
    expect(upright!.placements.every(p => p.rotation === 0)).toBe(true);
  });

  it('proposes per-placement cut copies (kinds/colors preserved) + 4 regmarks', async () => {
    const objects = [mmRect(10, 10, 60, 40)];
    const outline = rectCutPath('outline-1', 10, 10, 60, 40, 'outline', '#ff0000');
    const kiss = rectCutPath('kiss-1', 20, 20, 40, 20, 'kiss', '#00ff00');
    const result = await buildProductionPreview(objects, [outline, kiss], {
      sheetWidthMm: 200, gapMm: 2, copies: 3, bleedMm: 0, showMarks: true,
    });
    expect(result).not.toBeNull();
    // 2 input paths × 3 copies + 4 Roland L corner marks.
    expect(result!.cutPaths).toHaveLength(2 * 3 + 4);
    const outlines = result!.cutPaths.filter(p => p.kind === 'outline');
    const kisses = result!.cutPaths.filter(p => p.kind === 'kiss');
    const marks = result!.cutPaths.filter(p => p.kind === 'regmark');
    expect(outlines).toHaveLength(3);
    expect(kisses).toHaveLength(3);
    expect(marks).toHaveLength(4);
    expect(outlines.every(p => p.color === '#ff0000' && p.closed === true)).toBe(true);
    expect(kisses.every(p => p.color === '#00ff00')).toBe(true);
    expect(marks.map(p => p.id).sort()).toEqual(['regmark-bl', 'regmark-br', 'regmark-tl', 'regmark-tr']);

    // First copy pinned: placement c0 is upright at the sheet origin, so its
    // points are the ORIGINAL translated by (placement − cut-bbox origin) =
    // (0,0) − (10,10).
    const first = outlines.find(p => p.id === 'outline-1-c0')!;
    expect(first.points).toEqual([[0, 0], [60, 0], [60, 40], [0, 40], [0, 0]]);
    const firstKiss = kisses.find(p => p.id === 'kiss-1-c0')!;
    expect(firstKiss.points).toEqual([[10, 10], [50, 10], [50, 30], [10, 30], [10, 10]]);
    // Distinct per-copy ids, `${orig.id}-c${n}`.
    expect(result!.cutPaths.filter(p => p.id.startsWith('outline-1-')).map(p => p.id).sort())
      .toEqual(['outline-1-c0', 'outline-1-c1', 'outline-1-c2']);
  });

  it('bleed 0 builds without a bleed; showCutLines is overlay-only (placements + cut paths unchanged)', async () => {
    const objects = [mmRect(10, 10, 60, 40)];
    const cutPaths = [rectCutPath('outline-1', 10, 10, 60, 40, 'outline')];
    const base = { sheetWidthMm: 200, gapMm: 2, copies: 2, bleedMm: 0 } as const;
    const withLines = await buildProductionPreview(objects, cutPaths, { ...base, showCutLines: true, showMarks: false });
    const noLines = await buildProductionPreview(objects, cutPaths, { ...base, showCutLines: false, showMarks: false });
    expect(withLines).not.toBeNull();
    expect(noLines).not.toBeNull();
    expect(withLines!.bleedUsed).toBe(false);
    // Same nesting, same proposed paths — the flag only strokes the preview.
    expect(noLines!.placements).toEqual(withLines!.placements);
    expect(noLines!.cutPaths).toEqual(withLines!.cutPaths);
  });

  it('returns null for an empty selection and when the HQ bleed mode has no pixel access', async () => {
    expect(await buildProductionPreview([], [], { sheetWidthMm: 210, gapMm: 2, bleedMm: 1 })).toBeNull();
    // 'nearest' needs getImageData — the headless ctx mock lacks it, so the
    // whole preview degrades to null (caller toasts, user falls back to Ring).
    const objects = [mmRect(0, 0, 60, 40)];
    const cutPaths = [rectCutPath('outline-1', 0, 0, 60, 40, 'outline')];
    expect(await buildProductionPreview(objects, cutPaths, {
      sheetWidthMm: 210, gapMm: 2, bleedMm: 1, bleedMode: 'nearest',
    })).toBeNull();
    // …while the ring default succeeds under the very same mock.
    expect(await buildProductionPreview(objects, cutPaths, {
      sheetWidthMm: 210, gapMm: 2, bleedMm: 1,
    })).not.toBeNull();
  });

  it('keeps the raster stamp and the cut copy on the same rect for hull-offset, rotated placements', async () => {
    // Asymmetric L contour whose hull AABB origin differs from the footprint
    // bbox origin (hullOff != 0) plus an open path reaching past the art —
    // the exact geometry where a sign error in the rotation branch would
    // slide cuts off their art.
    const objects = [mmRect(10, 10, 50, 20)];
    const l: CutPath = {
      id: 'l-outline',
      points: [[0, 0], [60, 0], [60, 10], [20, 10], [20, 30], [0, 30], [0, 0]],
      closed: true,
      kind: 'outline',
    };
    const openTail: CutPath = { id: 'tail', points: [[60, 5], [72, 5]], closed: false, kind: 'manual' };
    const result = await buildProductionPreview(objects, [l, openTail], {
      sheetWidthMm: 106, gapMm: 2, copies: 6, bleedMm: 0, allowRotation: true, showMarks: false,
    });
    expect(result).not.toBeNull();
    // pxPerMm = multiplier(3) x 3.7795 — undo it to compare in mm.
    const k = result!.pxPerMm;
    const stamps = stampRects(orderedLog(mocks)).map(r => ({
      x1: r.x1 / k, x2: r.x2 / k, y1: r.y1 / k, y2: r.y2 / k, rotated: r.rotated,
    }));
    expect(stamps.length).toBeGreaterThanOrEqual(result!.copies);
    // Marks are off, so every proposed path is a per-path copy (L contour
    // 60x30 + open tail → footprint 72x30). Group copies by their -cN suffix
    // (both paths of one copy share a placement): the UNION AABB must be the
    // full footprint (72x30 upright, 30x72 turned) and the raster stamp —
    // which covers only the 50x20 SELECTION — must sit INSIDE that AABB with
    // matching rotation and the selection's dimensions. A sign error in the
    // rotation transform would fling the stamp outside its cut contours.
    const byCopy = new Map<string, Array<[number, number]>>();
    for (const cp of result!.cutPaths) {
      const m = cp.id.match(/-c(\d+)$/)!;
      const arr = byCopy.get(m[1]) ?? [];
      arr.push(...cp.points);
      byCopy.set(m[1], arr);
    }
    expect(byCopy.size).toBe(result!.copies);
    let turned = 0;
    for (const pts of byCopy.values()) {
      const xs = pts.map(p => p[0]);
      const ys = pts.map(p => p[1]);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const w = Math.max(...xs) - minX;
      const h = Math.max(...ys) - minY;
      const rotated = w < h;
      if (rotated) turned++;
      expect(Math.abs(w - (rotated ? 30 : 72))).toBeLessThanOrEqual(0.02);
      expect(Math.abs(h - (rotated ? 72 : 30))).toBeLessThanOrEqual(0.02);
      const match = stamps.find(s => s.rotated === rotated
        && s.x1 >= minX - 0.1 && s.x2 <= minX + w + 0.1
        && s.y1 >= minY - 0.1 && s.y2 <= minY + h + 0.1
        && Math.abs((s.x2 - s.x1) - (rotated ? 20 : 50)) < 0.1
        && Math.abs((s.y2 - s.y1) - (rotated ? 50 : 20)) < 0.1);
      expect(match).toBeDefined();
    }
    expect(turned).toBeGreaterThan(0); // the rotation branch is exercised
  });

  it('cutPathsForSelection keeps only selection-derived geometry', async () => {
    const { cutPathsForSelection } = await import('../productionPreview');
    const selRect = mmRect(10, 10, 50, 30);
    (selRect as unknown as { _id?: string })._id = "sel-1";
    const sel = [selRect];
    const farAway: CutPath = {
      id: 'other-object', points: [[500, 500], [560, 500], [560, 540], [500, 540], [500, 500]],
      closed: true, kind: 'outline', sourceObjectId: 'someone-else',
    };
    const mine: CutPath = {
      id: 'mine', points: [[10, 10], [60, 10], [60, 40], [10, 40], [10, 10]],
      closed: true, kind: 'outline', sourceObjectId: 'sel-1',
    };
    const unstampedNearby: CutPath = {
      id: 'nearby', points: [[15, 15], [30, 15], [30, 25], [15, 25], [15, 15]],
      closed: true, kind: 'manual',
    };
    const unstampedFar: CutPath = {
      id: 'far', points: [[900, 900], [910, 900], [910, 910], [900, 910], [900, 900]],
      closed: true, kind: 'manual',
    };
    const reg: CutPath = { id: 'reg', points: [[0, 0], [10, 0]], closed: false, kind: 'regmark' };
    const kept = cutPathsForSelection([farAway, mine, unstampedNearby, unstampedFar, reg], sel);
    expect(kept.map(p => p.id).sort()).toEqual(['mine', 'nearby']);
  });

  it('cut-path-masked bleed: cut paths + bleed build fine and change no placements', async () => {
    // Selection bbox == cut bbox, so the nesting inputs are identical with
    // or without the cut paths — isolating the buildBleedImage cutPaths
    // pass-through (a raster refinement) from the layout.
    const objects = [mmRect(10, 10, 60, 40)];
    const cutPaths = [rectCutPath('outline-1', 10, 10, 60, 40, 'outline')];
    const opts = { sheetWidthMm: 200, gapMm: 2, copies: 3, bleedMm: 1, showMarks: false } as const;

    const withCuts = await buildProductionPreview(objects, cutPaths, opts);
    expect(withCuts).not.toBeNull();
    expect(withCuts!.bleedUsed).toBe(true);
    expect(withCuts!.copies).toBe(3);

    // Under the headless ctx the mask degrades gracefully (no pixel
    // access → unmasked smear kept), the build still succeeds, and the
    // placements match the cutPaths-undefined run to the last float digit
    // (deep-equal modulo 1e-9: the no-cut run rebuilds the hull from the
    // selection bbox, which round-trips mm→px→mm with ~1e-14 noise).
    const noCuts = await buildProductionPreview(objects, [], opts);
    expect(noCuts).not.toBeNull();
    expect(noCuts!.placements).toHaveLength(withCuts!.placements.length);
    for (let i = 0; i < noCuts!.placements.length; i++) {
      expect(noCuts!.placements[i].rotation).toBe(withCuts!.placements[i].rotation);
      expect(noCuts!.placements[i].x).toBeCloseTo(withCuts!.placements[i].x, 9);
      expect(noCuts!.placements[i].y).toBeCloseTo(withCuts!.placements[i].y, 9);
    }
    expect(noCuts!.copies).toBe(withCuts!.copies);
    expect(noCuts!.utilization).toBeCloseTo(withCuts!.utilization, 9);
  });

  it('multi-item: imposes each top-level object as its own item with per-item copies', async () => {
    // Two disjoint stickers — red 30×20 at (10,10), blue 20×40 at (100,10) —
    // each with its own source-stamped contour (fabric `_id` attribution).
    const red = mmRect(10, 10, 30, 20, '#e11d48');
    (red as unknown as { _id?: string })._id = 'obj-red';
    const blue = mmRect(100, 10, 20, 40, '#2563eb');
    (blue as unknown as { _id?: string })._id = 'obj-blue';
    const cutRed = { ...rectCutPath('cut-red', 10, 10, 30, 20, 'outline', '#ff0000'), sourceObjectId: 'obj-red' };
    const cutBlue = { ...rectCutPath('cut-blue', 100, 10, 20, 40, 'kiss', '#00ff00'), sourceObjectId: 'obj-blue' };
    const opts = { sheetWidthMm: 200, gapMm: 2, copies: 2, bleedMm: 0, showMarks: false } as const;

    const result = await buildProductionPreview([red, blue], [cutRed, cutBlue], opts);
    expect(result).not.toBeNull();
    // One item per object, `copies` PER ITEM (2 each → 4 placements total).
    expect(result!.items.map(i => i.objectId)).toEqual(['obj-red', 'obj-blue']);
    expect(result!.items.map(i => i.copies)).toEqual([2, 2]);
    expect(result!.copies).toBe(4);
    expect(result!.placements.map(p => p.itemIndex).sort()).toEqual([0, 0, 1, 1]);

    // Both items' stamps present (≥4), each drawn from its OWN raster (two
    // distinct FakeImage elements — buildBleedImage's own canvas drawImage
    // calls are excluded by the instanceof filter).
    const k = result!.pxPerMm;
    const stamps = stampRects(orderedLog(mocks));
    expect(stamps.length).toBeGreaterThanOrEqual(4);
    expect(new Set(drawImage.mock.calls.map(c => c[0]).filter(a => a instanceof FakeImage)).size).toBe(2);
    const W = 200 * k;
    const H = result!.sheetH * k;
    for (const s of stamps) {
      expect(s.x1).toBeGreaterThanOrEqual(-0.5);
      expect(s.y1).toBeGreaterThanOrEqual(-0.5);
      expect(s.x2).toBeLessThanOrEqual(W + 0.5);
      expect(s.y2).toBeLessThanOrEqual(H + 0.5);
    }

    // Per-item cut copies: `-i<itemIndex>-c<n>` suffixes, kinds/colors kept.
    const outlines = result!.cutPaths.filter(p => p.kind === 'outline');
    const kisses = result!.cutPaths.filter(p => p.kind === 'kiss');
    expect(outlines.map(p => p.id).sort()).toEqual(['cut-red-i0-c0', 'cut-red-i0-c1']);
    expect(kisses.map(p => p.id).sort()).toEqual(['cut-blue-i1-c0', 'cut-blue-i1-c1']);
    expect(outlines.every(p => p.color === '#ff0000')).toBe(true);
    expect(kisses.every(p => p.color === '#00ff00')).toBe(true);

    // Deterministic: identical inputs → deep-equal placements + cut paths.
    const again = await buildProductionPreview([red, blue], [cutRed, cutBlue], opts);
    expect(again!.placements).toEqual(result!.placements);
    expect(again!.cutPaths).toEqual(result!.cutPaths);
  });

  it('multi-item: unstamped contours force the union fallback (cuts are never dropped)', async () => {
    // An UNSTAMPED path (e.g. a multi-object welded Make Sticker ring, or a
    // contour from a source this selection doesn't own) belongs to no single
    // object — the per-item partition would silently drop it. The build must
    // fall back to ONE union item so the contour keeps imposing.
    const red = mmRect(10, 10, 30, 20);
    (red as unknown as { _id?: string })._id = 'obj-red';
    const plain = mmRect(100, 10, 20, 40);
    (plain as unknown as { _id?: string })._id = 'obj-plain';
    const unstamped = rectCutPath('weld-ring', 5, 5, 120, 50, 'outline');
    const result = await buildProductionPreview([red, plain], [unstamped], {
      sheetWidthMm: 200, gapMm: 2, copies: 1, bleedMm: 0, showMarks: false,
    });
    expect(result).not.toBeNull();
    // Union fallback: one item, copies of the UNION, historical -c${n} ids.
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0]!.objectId).toBe('obj-red');
    expect(result!.copies).toBe(1);
    expect(result!.cutPaths.map(p => p.id)).toEqual(['weld-ring-c0']);
    // One raster for the union (a single distinct FakeImage source).
    expect(new Set(drawImage.mock.calls.map(c => c[0]).filter(a => a instanceof FakeImage)).size).toBe(1);
  });

  it('single-object runs keep the historical `-c${n}` ids (no item token)', async () => {
    const objects = [mmRect(10, 10, 60, 40)];
    const cutPaths = [rectCutPath('outline-1', 10, 10, 60, 40, 'outline')];
    const result = await buildProductionPreview(objects, cutPaths, {
      sheetWidthMm: 200, gapMm: 2, copies: 3, bleedMm: 0, showMarks: false,
    });
    expect(result).not.toBeNull();
    // One item, one raster: the single-item path is the historical one.
    expect(result!.items).toHaveLength(1);
    expect(new Set(drawImage.mock.calls.map(c => c[0]).filter(a => a instanceof FakeImage)).size).toBe(1);
    expect(result!.placements.every(p => p.itemIndex === 0)).toBe(true);
    const copyIds = result!.cutPaths.filter(p => p.kind !== 'regmark').map(p => p.id);
    expect(copyIds.sort()).toEqual(['outline-1-c0', 'outline-1-c1', 'outline-1-c2']);
    for (const id of copyIds) {
      expect(id).toMatch(/-c\d+$/);
      expect(id.includes('-i')).toBe(false);
    }
  });

  it('beyond 12 objects the whole selection imposes as ONE item (fallback)', async () => {
    // 13 disjoint 20×10 rects with no cut paths — the multi-item path would
    // build 13 rasters; the fallback packs ONE union-footprint item instead.
    const objects = Array.from({ length: 13 }, (_, i) => mmRect(10 + i * 25, 10, 20, 10));
    const result = await buildProductionPreview(objects, [], {
      sheetWidthMm: 400, gapMm: 2, copies: 2, bleedMm: 0, showMarks: false,
    });
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect(result!.placements.every(p => p.itemIndex === 0)).toBe(true);
    // One raster stamps every placement (the union bbox raster — a
    // per-object build would have drawn 13 distinct image elements).
    expect(new Set(drawImage.mock.calls.map(c => c[0]).filter(a => a instanceof FakeImage)).size).toBe(1);
    expect(result!.copies).toBe(2);
  });

});
