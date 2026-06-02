import { describe, it, expect } from 'vitest';
import {
  optimizeOrder, mirrorPolys, cutStats, estimateSeconds, formatDuration, bounds, applyOvercut, reversePolys, type PolyLite,
} from '../cutOptimize';

const seg = (a: [number, number], b: [number, number]): PolyLite => ({ points: [a, b], closed: false });

describe('cutOptimize', () => {
  it('computes bounds of a polyline set', () => {
    const b = bounds([seg([0, 0], [10, 5]), seg([-2, 3], [4, 20])]);
    expect(b).toEqual({ minX: -2, minY: 0, maxX: 10, maxY: 20 });
  });

  it('mirrors horizontally about the bounding-box centre', () => {
    const m = mirrorPolys([seg([0, 0], [10, 0])], 'h');
    // centre x = 5 → x' = 10 - x
    expect(m[0].points).toEqual([[10, 0], [0, 0]]);
  });

  it('mirror preserves total cut length', () => {
    const polys = [seg([0, 0], [10, 0]), seg([3, 2], [3, 9])];
    const before = cutStats(polys).cutLen;
    const after = cutStats(mirrorPolys(polys, 'h')).cutLen;
    expect(after).toBeCloseTo(before, 6);
  });

  it('orders paths to reduce pen-up travel', () => {
    // Three far-flung segments; naive order zig-zags, optimised should not.
    const a = seg([0, 0], [1, 0]);
    const b = seg([100, 0], [101, 0]);
    const c = seg([2, 0], [3, 0]);
    const naive = cutStats([a, b, c]).travelLen;
    const opt = cutStats(optimizeOrder([a, b, c])).travelLen;
    expect(opt).toBeLessThan(naive);
  });

  it('reverses an open polyline to start from the nearer end', () => {
    // Head parked at origin; segment runs far→near, so it should flip.
    const far = seg([50, 0], [5, 0]);
    const [out] = optimizeOrder([far], [0, 0]);
    expect(out.points[0]).toEqual([5, 0]); // nearer end first
  });

  it('rotates a closed ring to begin near the head', () => {
    const ring: PolyLite = { points: [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]], closed: true };
    const [out] = optimizeOrder([ring], [10, 20]);
    // Nearest vertex to (10,20) is index 3; ring should now start there.
    expect(out.points[0]).toEqual([10, 20]);
    expect(out.points[0]).toEqual(out.points[out.points.length - 1]); // still closed
  });

  it('estimates time from cut + travel + overhead', () => {
    const stats = cutStats([seg([0, 0], [60, 0])]); // 60mm cut, 0 travel
    // 60mm at 60mm/min = 1 min = 60s, + 1 path * 0.15 overhead.
    expect(estimateSeconds(stats, 60, 3000)).toBeCloseTo(60.15, 2);
  });

  it('formats durations as m:ss and h:mm:ss', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('overcut extends a closed path and leaves open paths alone', () => {
    const square: PolyLite = { points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], closed: true };
    const before = cutStats([square]).cutLen;
    const [oc] = applyOvercut([square], 2);
    const after = cutStats([oc]).cutLen;
    expect(after).toBeCloseTo(before + 2, 6); // exactly 2mm more cut
    expect(oc.points.length).toBeGreaterThan(square.points.length);

    const open = seg([0, 0], [10, 0]);
    expect(applyOvercut([open], 2)[0].points).toEqual(open.points); // untouched
  });

  it('reversePolys flips point order, preserves closed + length', () => {
    const polys: PolyLite[] = [{ points: [[0, 0], [1, 0], [2, 5]], closed: true }];
    const [r] = reversePolys(polys);
    expect(r.points).toEqual([[2, 5], [1, 0], [0, 0]]);
    expect(r.closed).toBe(true);
    expect(cutStats([r]).cutLen).toBeCloseTo(cutStats(polys).cutLen, 6);
  });

  it('overcut of 0 is a no-op', () => {
    const square: PolyLite = { points: [[0, 0], [10, 0], [10, 10], [0, 0]], closed: true };
    expect(applyOvercut([square], 0)[0].points).toEqual(square.points);
  });
});
