import { describe, it, expect } from 'vitest';
import {
  buildSimTimeline, sampleSimTimeline, cutPrefixPoints, optimizeOrder, cutStats, estimateSeconds, type PolyLite,
} from '../cutOptimize';

const seg = (a: [number, number], b: [number, number]): PolyLite => ({ points: [a, b], closed: false });

describe('cut simulation timeline', () => {
  // Two 10mm segments starting at the origin: feed 600 mm/min = 10 mm/s,
  // travel 1200 mm/min = 20 mm/s, so each cut phase is 1s and both travels
  // are zero-length (0.15s overhead only). Total = 0.15 + 1 + 0.15 + 1 = 2.3s.
  const polys = [seg([0, 0], [10, 0]), seg([10, 0], [10, 10])];
  const feed = 600, travel = 1200;

  it('total replay time equals the job time estimate for the same job', () => {
    const timeline = buildSimTimeline(polys, feed, travel);
    const seconds = estimateSeconds(cutStats(polys), feed, travel);
    expect(timeline.totalSeconds).toBeCloseTo(seconds, 9);
    expect(timeline.totalSeconds).toBeCloseTo(2.3, 9);
  });

  it('agrees with the estimate for an optimised multi-path job', () => {
    const job = [seg([0, 0], [10, 0]), seg([80, 0], [81, 0]), seg([3, 2], [3, 9]), seg([40, 40], [40, 55])];
    const ordered = optimizeOrder(job);
    const timeline = buildSimTimeline(ordered, 300, 900);
    expect(timeline.totalSeconds).toBeCloseTo(estimateSeconds(cutStats(ordered), 300, 900), 9);
    // Travel time is real distance / speed, plus the per-path overhead.
    const t0 = timeline.paths[0];
    expect(t0.travelFrom).toEqual([0, 0]);
    expect(t0.travelSeconds).toBeCloseTo(0.15, 9); // zero-length first travel
  });

  it('samples the head at the start, mid-cut and end', () => {
    const timeline = buildSimTimeline(polys, feed, travel);
    const start = sampleSimTimeline(timeline, 0);
    expect(start.point).toEqual([0, 0]);
    expect(start.cutting).toBe(false);
    expect(start.pathIndex).toBe(0);

    // 0.15s overhead then half the first cut (5mm at 10mm/s).
    const mid = sampleSimTimeline(timeline, 0.15 + 0.5);
    expect(mid.cutting).toBe(true);
    expect(mid.point[0]).toBeCloseTo(5, 9);
    expect(mid.point[1]).toBeCloseTo(0, 9);

    // Exactly the boundary of path 1's cut lands in path 2's cut phase.
    const boundary = sampleSimTimeline(timeline, 0.15 + 1 + 0.15 + 0.5);
    expect(boundary.pathIndex).toBe(1);
    expect(boundary.cutting).toBe(true);
    expect(boundary.point[0]).toBeCloseTo(10, 9);
    expect(boundary.point[1]).toBeCloseTo(5, 9);

    const end = sampleSimTimeline(timeline, timeline.totalSeconds);
    expect(end.pathIndex).toBe(1);
    expect(end.cutting).toBe(false);
    expect(end.point).toEqual([10, 10]);

    // Past the end clamps to the final point.
    const past = sampleSimTimeline(timeline, timeline.totalSeconds + 60);
    expect(past.point).toEqual([10, 10]);
  });

  it('tracks the head along a pen-up travel', () => {
    const far = [seg([30, 0], [40, 0])];
    const timeline = buildSimTimeline(far, feed, travel);
    // 30mm hop at 20mm/s takes 1.5s (+0.15s overhead charged at the start).
    const half = sampleSimTimeline(timeline, 0.75);
    expect(half.cutting).toBe(false);
    expect(half.point[0]).toBeCloseTo(15, 9);
    expect(half.point[1]).toBeCloseTo(0, 9);
  });

  it('advances the path index monotonically over the whole replay', () => {
    const timeline = buildSimTimeline(polys, feed, travel);
    let lastIndex = -1;
    for (let t = 0; t <= timeline.totalSeconds; t += timeline.totalSeconds / 50) {
      const idx = sampleSimTimeline(timeline, t).pathIndex;
      expect(idx).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = idx;
    }
    expect(lastIndex).toBe(1);
  });

  it('handles an empty timeline', () => {
    const timeline = buildSimTimeline([], feed, travel);
    expect(timeline.totalSeconds).toBe(0);
    expect(sampleSimTimeline(timeline, 5).point).toEqual([0, 0]);
  });
});

describe('cutPrefixPoints', () => {
  const pts: Array<[number, number]> = [[0, 0], [10, 0], [10, 10]];

  it('returns the start point with no cutting time', () => {
    const out = cutPrefixPoints(pts, 0, 600);
    expect(out[0]).toEqual([0, 0]);
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it('cuts whole segments then interpolates mid-segment', () => {
    // feed 600 mm/min = 10 mm/s: 1s covers the first 10mm segment.
    const one = cutPrefixPoints(pts, 1, 600);
    expect(one[0]).toEqual([0, 0]);
    expect(one[one.length - 1][0]).toBeCloseTo(10, 9);
    expect(one[one.length - 1][1]).toBeCloseTo(0, 9);

    // 1.5s covers 15mm — full first segment + half of the second.
    const mid = cutPrefixPoints(pts, 1.5, 600);
    expect(mid[mid.length - 1][0]).toBeCloseTo(10, 9);
    expect(mid[mid.length - 1][1]).toBeCloseTo(5, 9);
  });

  it('returns every vertex once the budget covers the whole path', () => {
    const out = cutPrefixPoints(pts, 10, 600);
    expect(out).toEqual(pts);
  });
});
