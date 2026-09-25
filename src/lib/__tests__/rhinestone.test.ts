/**
 * Rhinestone templates — evenly-spaced stone circles along object outlines.
 *
 * rhinestoneFromSelection walks each object's outline (real outline
 * pipeline, absolute mm space) and stamps one closed circle every
 * `spacingMm` of arc length. These tests pin:
 *
 *  - spacing along an open outline: stones land every N mm starting at the
 *    outline's first point, never past the final endpoint
 *  - stone size: diameter → radius (SS sizing is the caller's mapping into
 *    diameterMm) with the 0.1mm floor
 *  - closed outlines resample around the full ring
 *  - degenerate inputs (empty, single-anchor paths) produce nothing
 */
import * as fabric from 'fabric';
import { describe, expect, it } from 'vitest';
import { rhinestoneFromSelection } from '../rhinestone';

/** Pin the object to its d-coordinates (exact absolute-space round trip). */
const OPTS = { left: 0, top: 0, fill: '', stroke: '#000', strokeWidth: 0 } as const;

/** Circle centre = mean of the uniformly-sampled ring (dup closing point dropped). */
function centreOf(stone: { points: Array<[number, number]> }): [number, number] {
  const uniq = stone.points.slice(0, -1);
  let cx = 0, cy = 0;
  for (const [x, y] of uniq) { cx += x; cy += y; }
  return [cx / uniq.length, cy / uniq.length];
}

function centres(stones: ReturnType<typeof rhinestoneFromSelection>): Array<[number, number]> {
  return stones.map(centreOf);
}

describe('rhinestoneFromSelection — open outline', () => {
  // 'M 0 0 L 100 0' flattens to exactly 26.4585mm of outline in mm space.
  const line = () => [new fabric.Path('M 0 0 L 100 0', OPTS)];

  it('drops a stone every spacing mm starting at the outline start', () => {
    const stones = rhinestoneFromSelection(line(), 5, 4);
    // floor(26.4585 / 5) = 5 intervals → 6 stones at 0,5,10,15,20,25mm.
    expect(stones).toHaveLength(6);
    const cs = centres(stones);
    for (let i = 0; i < cs.length; i++) {
      expect(cs[i][0]).toBeCloseTo(i * 5, 3);
      expect(cs[i][1]).toBeCloseTo(0, 3);
    }
  });

  it('never places a stone beyond the outline end', () => {
    const stones = rhinestoneFromSelection(line(), 5, 4);
    const cs = centres(stones);
    const last = cs[cs.length - 1][0];
    expect(last).toBeLessThan(26.4585);
    expect(26.4585 - last).toBeLessThan(5); // …but within one spacing of it
  });

  it('emits a single stone when the spacing exceeds the outline length', () => {
    expect(rhinestoneFromSelection(line(), 100, 4)).toHaveLength(1);
    const [c] = centres(rhinestoneFromSelection(line(), 100, 4));
    expect(c[0]).toBeCloseTo(0, 3);
  });

  it('each stone is a closed 17-sample circle of the requested diameter', () => {
    const stones = rhinestoneFromSelection(line(), 10, 6);
    expect(stones).toHaveLength(3);
    for (const s of stones) {
      expect(s.closed).toBe(true);
      expect(s.kind).toBe('manual');
      expect(s.passes).toBe(1);
      expect(s.points).toHaveLength(17); // 16 segments + closing repeat
      const [cx, cy] = centreOf(s);
      for (const [x, y] of s.points) {
        expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(3, 6); // Ø6 → r3
      }
    }
  });

  it('stone ids are unique with the rs- prefix', () => {
    const ids = rhinestoneFromSelection(line(), 10, 6).map(s => s.id);
    expect(ids.every(id => id.startsWith('rs-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('rhinestoneFromSelection — closed outline', () => {
  it('walks the full ring perimeter (square ≈ 105.83mm → 11 stones at 10mm)', () => {
    const square = () => [new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', OPTS)];
    const stones = rhinestoneFromSelection(square(), 10, 4);
    expect(stones).toHaveLength(11);
    // First stone sits on the outline start (0,0); all stones lie ON the
    // square's outline (within the 2mm stone radius of a 0/100 coordinate).
    const cs = centres(stones);
    expect(cs[0][0]).toBeCloseTo(0, 2);
    expect(cs[0][1]).toBeCloseTo(0, 2);
    for (const [x, y] of cs) {
      const onOutline =
        Math.abs(x) < 0.01 || Math.abs(x - 26.4585) < 0.01 ||
        Math.abs(y) < 0.01 || Math.abs(y - 26.4585) < 0.01;
      expect(onOutline).toBe(true);
    }
  });

  it('consecutive stones along the ring are one spacing apart', () => {
    const square = () => [new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', OPTS)];
    const cs = centres(rhinestoneFromSelection(square(), 10, 4));
    // Consecutive stones are ~10mm apart in emission order (stone k sits at
    // k×10mm of arc length around the ring; corners only bend the path).
    for (let i = 1; i < cs.length; i++) {
      const d = Math.hypot(cs[i][0] - cs[i - 1][0], cs[i][1] - cs[i - 1][1]);
      expect(d).toBeGreaterThan(5);
      expect(d).toBeLessThanOrEqual(10.001);
    }
  });
});

describe('rhinestoneFromSelection — sizing + degenerate inputs', () => {
  const line = () => [new fabric.Path('M 0 0 L 100 0', OPTS)];

  it('clamps the stone radius to a 0.1mm floor (tiny SS sizes)', () => {
    const stones = rhinestoneFromSelection(line(), 20, 0.05);
    const [cx, cy] = centreOf(stones[0]);
    for (const [x, y] of stones[0].points) {
      expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(0.1, 8);
    }
  });

  it('handles multi-contour paths by stoning every subpath', () => {
    const two = () => [new fabric.Path('M 0 0 L 100 0 M 200 0 L 300 0', OPTS)];
    // Two 26.4585mm outlines → 2×6 stones at 5mm spacing.
    const stones = rhinestoneFromSelection(two(), 5, 4);
    expect(stones).toHaveLength(12);
    const cs = centres(stones);
    // First contour spans 0–26.5mm, second 52.9–79.4mm (200–300px).
    const onFirst = cs.filter(([x]) => x < 40);
    const onSecond = cs.filter(([x]) => x >= 40);
    expect(onFirst).toHaveLength(6);
    expect(onSecond).toHaveLength(6);
    // Second contour starts at 200px = 52.92mm in outline space.
    expect(onSecond[0][0]).toBeCloseTo(52.92, 2);
  });

  it('returns [] for empty input or anchorless paths', () => {
    expect(rhinestoneFromSelection([], 5, 4)).toEqual([]);
    expect(rhinestoneFromSelection([new fabric.Path('M 5 5', OPTS)], 5, 4)).toEqual([]);
  });

  it('converts a rect object through its bounding-box outline', () => {
    // Primitives without a d-attribute fall back to their bbox rectangle.
    const rect = new fabric.Rect({ left: 0, top: 0, width: 100, height: 100, strokeWidth: 0 });
    const stones = rhinestoneFromSelection([rect], 10, 4);
    // Same 100px square perimeter as the path case.
    expect(stones).toHaveLength(11);
  });
});
