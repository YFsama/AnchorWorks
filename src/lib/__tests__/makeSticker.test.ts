/**
 * Make Sticker tests.
 *
 * Real fabric.Path squares (the outlineShift pattern — no 2D-context stub
 * needed for path-only objects) run through the same weld → round-join
 * offset pipeline the one-click action uses. Ground truth is derived
 * independently of the pipeline: the source union ring comes from
 * weldOutline at offset 0, and expected distances are measured against it
 * with a local point-to-ring distance helper.
 */
import * as fabric from 'fabric';
import { describe, expect, it } from 'vitest';
import { makeSticker, MAKE_STICKER_PRESETS } from '../makeSticker';
import { weldOutline } from '../contourFromSelection';

const MM_TO_PX = 3.7795; // the pipeline's px→mm divisor, inverted for asserts

/** Two 100×100 px squares overlapping in an L — union is one 8-vertex ring. */
function overlappingSquares(): fabric.FabricObject[] {
  const a = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', { left: 100, top: 100 });
  const b = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', { left: 160, top: 140 });
  return [a, b];
}

/** Minimum distance from a point to a closed ring's boundary. */
function pointRingDistance(
  p: readonly [number, number],
  ring: ReadonlyArray<readonly [number, number]>,
): number {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
    if (d < best) best = d;
  }
  return best;
}

/** The welded union ring (mm) the sticker border offsets around. */
function unionRing(objects: fabric.FabricObject[]): Array<[number, number]>[] {
  return weldOutline(objects)
    .filter(p => p.closed)
    .map(p => p.points);
}

describe('makeSticker', () => {
  it('cuts one closed round-joined contour around the welded union', () => {
    const objects = overlappingSquares();
    const res = makeSticker(objects, { borderMm: 2 });

    expect(res.cutPaths).toHaveLength(1);
    const cp = res.cutPaths[0];
    expect(cp.closed).toBe(true);
    expect(cp.kind).toBe('outline');
    expect(cp.passes).toBe(1);
    // Round joins tessellate every convex corner of the 8-vertex union —
    // a mitered square-ish union would stay near 9 points.
    expect(cp.points.length).toBeGreaterThan(4);
  });

  it('keeps every cut point at ≥ borderMm − 0.01 from the union ring', () => {
    const objects = overlappingSquares();
    const borderMm = 2;
    const res = makeSticker(objects, { borderMm });
    const rings = unionRing(objects);
    expect(rings).toHaveLength(1);

    for (const cp of res.cutPaths) {
      for (const p of cp.points) {
        const dist = Math.min(...rings.map(r => pointRingDistance(p, r)));
        expect(dist).toBeGreaterThanOrEqual(borderMm - 0.01);
      }
    }
  });

  it('defaults to the 2.54 mm Sticker Mule border', () => {
    const objects = overlappingSquares();
    const res = makeSticker(objects);
    const rings = unionRing(objects);
    for (const cp of res.cutPaths) {
      for (const p of cp.points) {
        const dist = Math.min(...rings.map(r => pointRingDistance(p, r)));
        expect(dist).toBeGreaterThanOrEqual(2.54 - 0.01);
      }
    }
  });

  it('emits a white underlay d in canvas px space that lands on the die line', () => {
    const res = makeSticker(overlappingSquares(), { borderMm: 2 });

    expect(res.underlayFill).toBe('white');
    expect(res.underlayD).not.toBeNull();
    expect(res.underlayD!.startsWith('M')).toBe(true);
    expect(res.underlayD).toContain('Z');

    // First underlay vertex == first cut-path vertex scaled mm → px.
    const m = res.underlayD!.match(/M (-?[\d.]+) (-?[\d.]+)/);
    expect(m).not.toBeNull();
    const [ux, uy] = res.cutPaths[0].points[0];
    expect(Number(m![1])).toBeCloseTo(ux * MM_TO_PX, 1);
    expect(Number(m![2])).toBeCloseTo(uy * MM_TO_PX, 1);
  });

  it('full-bleed (border 0, no underlay) traces the union with cut paths only', () => {
    const res = makeSticker(overlappingSquares(), { borderMm: 0, underlay: 'none' });

    expect(res.underlayD).toBeNull();
    expect(res.underlayFill).toBeNull();
    expect(res.cutPaths).toHaveLength(1);
    expect(res.cutPaths[0].closed).toBe(true);
  });

  it('passes kind, passes and custom underlay colour through', () => {
    const res = makeSticker(overlappingSquares(), {
      borderMm: 1.59,
      underlay: '#111',
      cutKind: 'manual',
      passes: 3,
    });
    expect(res.underlayFill).toBe('#111');
    expect(res.cutPaths[0].kind).toBe('manual');
    expect(res.cutPaths[0].passes).toBe(3);
  });

  it('returns empty geometry for an empty selection instead of crashing', () => {
    const res = makeSticker([]);
    expect(res.cutPaths).toEqual([]);
    expect(res.underlayD).toBeNull();
    expect(res.underlayFill).toBe('white');
  });

  it('falls back to per-object outlines when nothing welds closed', () => {
    // One open polyline — no closed ring to weld, so the un-welded outline
    // is offset directly.
    const line = new fabric.Path('M 10 10 L 110 10', { left: 50, top: 50 });
    const res = makeSticker([line], { borderMm: 1 });
    expect(res.cutPaths.length).toBeGreaterThanOrEqual(1);
    expect(res.cutPaths[0].points.length).toBeGreaterThanOrEqual(2);
  });
});

describe('MAKE_STICKER_PRESETS', () => {
  it('pins the Sticker Mule default border at 2.54 mm white', () => {
    const sm = MAKE_STICKER_PRESETS.find(p => p.id === 'stickermule');
    expect(sm).toBeDefined();
    expect(sm!.borderMm).toBe(2.54);
    expect(sm!.underlay).toBe('white');
  });

  it('keeps every preset border non-negative with a valid underlay', () => {
    expect(MAKE_STICKER_PRESETS.length).toBeGreaterThanOrEqual(5);
    for (const p of MAKE_STICKER_PRESETS) {
      expect(p.borderMm).toBeGreaterThanOrEqual(0);
      expect(typeof p.underlay).toBe('string');
      expect(p.underlay.length).toBeGreaterThan(0);
    }
  });

  it('full-bleed preset applies as border 0 with no underlay', () => {
    const fb = MAKE_STICKER_PRESETS.find(p => p.id === 'full-bleed')!;
    const res = makeSticker(overlappingSquares(), { borderMm: fb.borderMm, underlay: fb.underlay });
    expect(res.underlayD).toBeNull();
    expect(res.cutPaths).toHaveLength(1);
  });

  it('black preset resolves its CSS colour as the underlay fill', () => {
    const black = MAKE_STICKER_PRESETS.find(p => p.id === 'black')!;
    const res = makeSticker(overlappingSquares(), { borderMm: black.borderMm, underlay: black.underlay });
    expect(res.underlayFill).toBe('#111');
    expect(res.underlayD).not.toBeNull();
  });
});
