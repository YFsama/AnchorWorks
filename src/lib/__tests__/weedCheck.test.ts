import { describe, it, expect } from 'vitest';
import { weedCheck, WEED_PROFILES } from '../weedCheck';
import type { CutPath } from '../../store/editor';

const rect = (id: string, x: number, y: number, w: number, h: number, kind: CutPath['kind'] = 'outline'): CutPath => ({
  id,
  kind,
  closed: true,
  points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
});

const line = (id: string, x: number, y: number): CutPath => ({
  id,
  kind: 'manual',
  closed: false,
  points: [[x, y], [x + 10, y]],
});

describe('weedCheck', () => {
  it('flags two closed paths ~1 mm apart as narrow-gap', () => {
    const report = weedCheck([rect('a', 0, 0, 10, 10), rect('b', 10.95, 0, 10, 10)]);
    expect(report.skipped).toBe(false);
    expect(report.issues).toHaveLength(1);
    const issue = report.issues[0];
    expect(issue.kind).toBe('narrow-gap');
    expect(Math.abs(issue.metricMm - 1)).toBeLessThan(0.15);
    expect(issue.pathIds).toEqual(['a', 'b']);
  });

  it('clears two closed paths 5 mm apart', () => {
    const report = weedCheck([rect('a', 0, 0, 10, 10), rect('b', 15, 0, 10, 10)]);
    expect(report.issues).toEqual([]);
    expect(report.checkedPaths).toBe(2);
  });

  it('flags a 20×1 mm closed ring as thin-feature (width < 1.5)', () => {
    const report = weedCheck([rect('t', 0, 0, 20, 1)]);
    expect(report.issues).toHaveLength(1);
    const issue = report.issues[0];
    expect(issue.kind).toBe('thin-feature');
    expect(issue.metricMm).toBeGreaterThan(0.9); // true width 1.0, bisection tol 0.05
    expect(issue.metricMm).toBeLessThan(1.5);
    expect(issue.pathIds).toEqual(['t']);
  });

  it('passes a 20×5 mm closed ring', () => {
    expect(weedCheck([rect('t', 0, 0, 20, 5)]).issues).toEqual([]);
  });

  it('skips thin-feature on open paths (no interior)', () => {
    const sliver: CutPath = { id: 's', kind: 'manual', closed: false, points: [[0, 0], [20, 0], [20, 0.2]] };
    expect(weedCheck([sliver]).issues).toEqual([]);
  });

  it('flags the 3 mm² counter of a letter O as small-island', () => {
    // Inner 2×1.9 ring: area 3.8 < vinyl minIslandArea 4, wide enough to
    // stay clear of the thin-feature check (1.9 ≥ 1.5).
    const report = weedCheck([rect('O', 0, 0, 20, 20), rect('i', 8.05, 9.05, 2, 1.9)]);
    expect(report.issues).toHaveLength(1);
    const issue = report.issues[0];
    expect(issue.kind).toBe('small-island');
    expect(issue.metricMm).toBeCloseTo(Math.sqrt(3.8), 3);
    expect(issue.pathIds).toEqual(['i']);
    expect(issue.at[0]).toBeCloseTo(9.05, 6);
    expect(issue.at[1]).toBeCloseTo(10, 6);
  });

  it('passes a 10 mm² counter (2×5, cap height exactly at the floor)', () => {
    const report = weedCheck([rect('O', 0, 0, 20, 20), rect('i', 9, 7.5, 2, 5)]);
    expect(report.issues).toEqual([]);
  });

  it('ignores regmark paths entirely', () => {
    // Regmark 0.2 mm from real geometry — would flag if checked.
    const report = weedCheck([rect('n', 0, 0, 10, 10), rect('r', 10.2, 0, 4, 4, 'regmark')]);
    expect(report.issues).toEqual([]);
    expect(report.checkedPaths).toBe(1);
    const allMarks = weedCheck([rect('r1', 0, 0, 4, 4, 'regmark'), rect('r2', 4.2, 0, 4, 4, 'regmark')]);
    expect(allMarks.issues).toEqual([]);
    expect(allMarks.checkedPaths).toBe(0);
  });

  it('skips past the default 400-path guard', () => {
    const paths = Array.from({ length: 401 }, (_, i) => line(`p${i}`, (i % 40) * 20, Math.floor(i / 40) * 20));
    const report = weedCheck(paths);
    expect(report.skipped).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.checkedPaths).toBe(0);
  });

  it('honors opts.maxPaths', () => {
    const paths = [line('a', 0, 0), line('b', 0, 20), line('c', 0, 40)];
    expect(weedCheck(paths, WEED_PROFILES.vinyl, { maxPaths: 2 }).skipped).toBe(true);
    expect(weedCheck(paths, WEED_PROFILES.vinyl, { maxPaths: 3 }).skipped).toBe(false);
  });

  it('degrades to AABB distances past the segment-comparison budget', () => {
    // Two 460-segment zigzags = 211,600 segment pairs > the 200k budget;
    // their AABBs overlap, so the coarse fallback reports a 0 mm gap even
    // though the true closest approach is ~2.2 mm.
    const zig = (id: string, ox: number, oy: number): CutPath => ({
      id,
      kind: 'manual',
      closed: false,
      points: Array.from({ length: 461 }, (_, i) => [i * 0.01 + ox, (i % 2) * 3 + oy] as [number, number]),
    });
    const report = weedCheck([zig('a', 0, 0), zig('b', 0.005, 2.2)]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].kind).toBe('narrow-gap');
    expect(report.issues[0].metricMm).toBeCloseTo(0, 6);
  });

  it('WEED_PROFILES: glitter thresholds dominate vinyl', () => {
    const g = WEED_PROFILES['glitter-htv'];
    const v = WEED_PROFILES.vinyl;
    expect(g.minStrokeMm).toBeGreaterThanOrEqual(v.minStrokeMm);
    expect(g.minGapMm).toBeGreaterThanOrEqual(v.minGapMm);
    expect(g.minIslandAreaMm2).toBeGreaterThanOrEqual(v.minIslandAreaMm2);
    expect(g.minCapHeightMm).toBeGreaterThanOrEqual(v.minCapHeightMm);
  });

  // Two 8×8 mm lobes joined by a neck of `neckMm` — the pinch shape the
  // wave-2 erosion bisection could not see (the inward offset of the whole
  // ring survives as the two separate lobe rings, so it always "survived").
  const dumbbell = (id: string, neckMm: number): CutPath => {
    const inset = (8 - neckMm) / 2;
    return {
      id,
      kind: 'outline',
      closed: true,
      points: [
        [0, 0], [8, 0], [8, inset], [12, inset], [12, 0], [20, 0],
        [20, 8], [12, 8], [12, 8 - inset], [8, 8 - inset], [8, 8], [0, 8],
      ],
    };
  };

  it('flags a 0.8 mm pinch neck between two wide lobes (EDT regression)', () => {
    const report = weedCheck([dumbbell('neck', 0.8)]);
    expect(report.issues).toHaveLength(1);
    const issue = report.issues[0];
    expect(issue.kind).toBe('thin-feature');
    // True neck width 0.8 mm, ±0.25 mm raster slack at 4 px/mm.
    expect(issue.metricMm).toBeGreaterThan(0.5);
    expect(issue.metricMm).toBeLessThan(1.5);
    expect(issue.pathIds).toEqual(['neck']);
    // Flag sits at the pinch, not the ring centroid: x within the neck
    // corridor (8–12 mm) ± corner rounding, y on the neck midline.
    expect(issue.at[0]).toBeGreaterThan(7);
    expect(issue.at[0]).toBeLessThan(13);
    expect(issue.at[1]).toBeGreaterThan(2.5);
    expect(issue.at[1]).toBeLessThan(5.5);
  });

  it('clears the same dumbbell with a 3 mm neck under the vinyl profile', () => {
    expect(weedCheck([dumbbell('neck', 3)]).issues).toEqual([]);
  });

  it('flags the 1.13–1.49 mm borderline band a quantized "exactly-floor" bar sits in (fail-closed regression)', () => {
    // A 1.3 mm bar measures ≈1.3–1.5 mm on the 4 px/mm raster; before the
    // fail-closed decision it could quantize to exactly the 1.5 mm floor and
    // be silently CLEARED — the blind band the wave-3 review mapped. The
    // half-pixel slack must flag the whole borderline band.
    const bar = (id: string): CutPath => ({
      id, closed: true,
      points: [[0, 0], [30, 0], [30, 1.3], [0, 1.3], [0, 0]],
      kind: 'outline',
    });
    const report = weedCheck([bar('bar')]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].kind).toBe('thin-feature');
    // A comfortably-wide 2 mm bar still clears (not everything flags).
    const wide = { ...bar('wide'), points: [[0, 0], [30, 0], [30, 2], [0, 2], [0, 0]] as Array<[number, number]> };
    expect(weedCheck([wide]).issues).toEqual([]);
  });

  it('falls back to the erosion bisection past the raster pixel budget', () => {
    // A 1.3 mm bar so long its mask (60,000 mm → 240,004 × 10 px ≈ 2.4M)
    // blows the 2M-px raster budget: the EDT probe is skipped and the
    // wave-2 offsetPolyline erosion bisection still flags simple thinness
    // (it is only neck-blind). Axis-aligned keeps the offset well-behaved.
    const bar: CutPath = {
      id: 'bar',
      kind: 'outline',
      closed: true,
      points: [[0, 0], [60000, 0], [60000, 1.3], [0, 1.3]],
    };
    const report = weedCheck([bar]);
    expect(report.issues).toHaveLength(1);
    const issue = report.issues[0];
    expect(issue.kind).toBe('thin-feature');
    expect(issue.metricMm).toBeGreaterThan(0.9);
    expect(issue.metricMm).toBeLessThan(1.5);
    expect(issue.pathIds).toEqual(['bar']);
  });
});

describe('pinch localization for ≥3 lobes', () => {
  it('flags a 3-lobe E bar and pins the pinch on the spine, not on an outer lobe', () => {
    // Three 20×4 horizontal bars stacked with 4 mm gaps, joined by one
    // centred 0.8 mm vertical spine (x 9.6–10.4): eroding at the vinyl floor
    // kills the spine and leaves three near-equal bar lobes. Only the
    // all-pairs centroid scan reliably walks a line that crosses the spine;
    // the historic two-largest-only line (and the ring-centroid fallback)
    // would mis-localize onto a bar — an outer lobe.
    const e: CutPath = {
      id: 'e',
      kind: 'outline',
      closed: true,
      points: [
        [0, 0], [20, 0], [20, 4], [10.4, 4], [10.4, 8], [20, 8],
        [20, 12], [10.4, 12], [10.4, 16], [20, 16], [20, 20], [0, 20],
        [0, 16], [9.6, 16], [9.6, 12], [0, 12], [0, 8], [9.6, 8], [9.6, 4], [0, 4],
      ],
    };
    const report = weedCheck([e]);
    expect(report.issues).toHaveLength(1);
    const issue = report.issues[0];
    expect(issue.kind).toBe('thin-feature');
    expect(issue.pathIds).toEqual(['e']);
    // True bottleneck 0.8 mm, ±0.25 mm raster slack at 4 px/mm.
    expect(issue.metricMm).toBeGreaterThan(0.5);
    expect(issue.metricMm).toBeLessThan(1.5);
    // On the spine: x within 9.6–10.4 ± raster slack …
    expect(issue.at[0]).toBeGreaterThan(9);
    expect(issue.at[0]).toBeLessThan(11);
    // … and in a BETWEEN-BAR band (4–8 / 12–16) — on the spine corridor, not
    // on a bar (outer lobe, y < 4 / 8–12 / > 16) or the ring centroid (10,10).
    const inGapBand = (y: number) => (y > 3.5 && y < 8.5) || (y > 11.5 && y < 16.5);
    expect(inGapBand(issue.at[1])).toBe(true);
  });
});
