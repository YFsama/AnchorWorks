/**
 * Freehand-knife geometry tests — pure functions from src/lib/knife.ts.
 *
 * The canvas-level helpers (knifeCutAlongPolyline / knifeSplitObject-*
 * AlongPolyline) need a live fabric canvas; the corridor + ring-split math
 * is exercised here directly, matching how knife.test.ts drives the axis
 * variant.
 */
import { describe, expect, it } from 'vitest';
import { buildCutCorridor, knifeSplitRingByCorridor, KNIFE_HALF_WIDTH } from '../knife';

const square: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

function ringArea(ring: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

function polygonAreas(result: ReturnType<typeof knifeSplitRingByCorridor>): number[] {
  return result.map((polygon) => ringArea(polygon[0] as Array<[number, number]>)).sort((a, b) => a - b);
}

describe('buildCutCorridor', () => {
  it('thickens a straight segment into one convex band of the right size', () => {
    const corridor = buildCutCorridor([[10, 50], [90, 50]], 1);
    expect(corridor).toHaveLength(1);
    const ring = corridor[0][0] as Array<[number, number]>;
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    // Length spans the segment (plus round caps), width is ±halfWidth.
    expect(Math.min(...xs)).toBeGreaterThan(8);
    expect(Math.max(...xs)).toBeLessThan(92);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 0);
    // The corridor is a real polygon with area ≈ length × width.
    expect(ringArea(ring)).toBeGreaterThan(100);
  });

  it('unions self-crossing strokes into a single coherent region', () => {
    // A V that folds back on itself — union must clean the overlap.
    const corridor = buildCutCorridor([[0, 0], [40, 40], [0, 40], [40, 0]], 2);
    expect(corridor.length).toBeGreaterThanOrEqual(1);
    for (const polygon of corridor) {
      expect(ringArea(polygon[0] as Array<[number, number]>)).toBeGreaterThan(0);
    }
  });

  it('returns empty for an empty stroke', () => {
    expect(buildCutCorridor([], 1)).toEqual([]);
  });
});

describe('knifeSplitRingByCorridor', () => {
  it('splits a square with a straight corridor into 2 pieces preserving area ± kerf', () => {
    const corridor = buildCutCorridor([[-20, 50], [120, 50]], KNIFE_HALF_WIDTH);
    const areas = polygonAreas(knifeSplitRingByCorridor(square, corridor));
    expect(areas).toHaveLength(2);
    // Kerf = corridor ∩ square ≈ 140 × 1 px² — assert generously but well
    // below "lost half the shape".
    const total = areas[0] + areas[1];
    expect(total).toBeGreaterThan(9800);
    expect(total).toBeLessThan(10000);
    // Both halves are substantial (the kerf sliver was dropped, not kept).
    expect(areas[0]).toBeGreaterThan(4000);
    expect(areas[1]).toBeGreaterThan(4000);
  });

  it('splits along a bent polyline', () => {
    const corridor = buildCutCorridor([[50, -20], [50, 30], [80, 70], [80, 120]], KNIFE_HALF_WIDTH);
    const areas = polygonAreas(knifeSplitRingByCorridor(square, corridor));
    expect(areas).toHaveLength(2);
    const total = areas[0] + areas[1];
    expect(total).toBeGreaterThan(9700);
    expect(total).toBeLessThan(10000);
  });

  it('returns the ring untouched when the corridor misses it entirely', () => {
    const corridor = buildCutCorridor([[-50, -50], [-50, 150]], 1);
    const areas = polygonAreas(knifeSplitRingByCorridor(square, corridor));
    expect(areas).toHaveLength(1);
    expect(areas[0]).toBeCloseTo(10000, 5);
  });

  it('ignores degenerate / open rings', () => {
    const corridor = buildCutCorridor([[-20, 5], [120, 5]], 1);
    expect(knifeSplitRingByCorridor([[0, 0], [100, 0], [0, 0]], corridor)).toEqual([]);
    expect(knifeSplitRingByCorridor([], corridor)).toEqual([]);
  });

  it('ignores an empty corridor', () => {
    expect(knifeSplitRingByCorridor(square, [])).toEqual([]);
  });

  it('drops pieces below the kerf-sliver threshold (corner graze)', () => {
    // A corridor that just clips the very top edge shaves a sliver smaller
    // than MIN_PIECE_AREA — it must vanish rather than become a piece.
    const corridor = buildCutCorridor([[-20, 0.1], [120, 0.1]], 0.25);
    const areas = polygonAreas(knifeSplitRingByCorridor(square, corridor));
    expect(areas).toHaveLength(1);
    expect(areas[0]).toBeGreaterThan(9900);
  });
});
