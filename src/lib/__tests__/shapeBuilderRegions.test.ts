/**
 * Shape Builder region math tests — pure functions from src/lib/shapeBuilder.ts.
 *
 * Covers the interactive tool's contract end to end at the geometry level:
 * the arrangement (two overlapping squares → 3 faces), stroke hit-testing,
 * merge semantics (Illustrator: sweeping the overlap unites BOTH shapes),
 * erase semantics (sweeping the overlap deletes it from every source), the
 * miss-everything no-op, and graceful degenerate-input handling. The canvas
 * state machine (tools/shapeBuilderTool.ts) needs a live fabric canvas; the
 * object flattening it relies on is exercised here via objectToRings.
 */
import { describe, expect, it } from 'vitest';
import * as fabric from 'fabric';
import type { MultiPolygon } from 'polygon-clipping';
import {
  buildRegions, hitRegions, mergeFaces, eraseFaces,
  multiPolygonArea, pointInMultiPolygon, densifyStroke,
  MAX_ARRANGEMENT_SHAPES, type BuilderFace,
} from '../shapeBuilder';
import { objectToRings } from '../booleanOps';

/** Closed square ring as a one-polygon MultiPolygon, polygon-clipping style. */
const square = (x1: number, y1: number, x2: number, y2: number): MultiPolygon =>
  [[[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]]];

// A = [0,10]×[0,10], B = [5,15]×[0,10] — overlap is [5,10]×[0,10], area 50.
const A = square(0, 0, 10, 10);
const B = square(5, 0, 15, 10);
const OVERLAP_AREA = 50;
const UNION_AREA = 150;

function ringArea(ring: ReadonlyArray<readonly [number, number]>): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

describe('buildRegions', () => {
  it('subdivides two overlapping squares into 3 faces (A-only, B-only, overlap)', () => {
    const faces = buildRegions([A, B]);
    expect(faces).toHaveLength(3);

    const bySources = new Set(faces.map(f => f.sources.join(',')));
    expect(bySources).toEqual(new Set(['0', '1', '0,1']));

    // Every face is 50 px², the anchors sit inside their own face, and the
    // faces together tile A∪B exactly.
    for (const f of faces) {
      expect(f.area).toBeCloseTo(OVERLAP_AREA, 5);
      expect(pointInMultiPolygon(f.anchor, f.geom)).toBe(true);
    }
    const total = faces.reduce((s, f) => s + f.area, 0);
    expect(total).toBeCloseTo(UNION_AREA, 5);

    const overlap = faces.find(f => f.sources.length === 2)!;
    expect(pointInMultiPolygon([7, 5], overlap.geom)).toBe(true);
    expect(pointInMultiPolygon([2, 5], overlap.geom)).toBe(false);
  });

  it('arranges three shapes, keeping far-apart shapes as their own faces', () => {
    // C doesn't touch A or B — it contributes one whole single-source face
    // while A/B still subdivide into three.
    const c = square(0, 20, 4, 24); // far away, no overlap at all
    const faces = buildRegions([A, B, c]);
    expect(faces).toHaveLength(4); // A-only, B-only, overlap, C-only
    expect(faces.filter(f => f.sources.length === 2)).toHaveLength(1);
  });

  it('returns no faces for empty input or beyond the arrangement cap', () => {
    expect(buildRegions([])).toEqual([]);
    const many = Array.from({ length: MAX_ARRANGEMENT_SHAPES + 1 }, (_, i) => square(i * 2, 0, i * 2 + 10, 10));
    expect(buildRegions(many)).toEqual([]);
  });

  it('skips degenerate / zero-area shapes gracefully, keeping original source indices', () => {
    const zeroWidth = square(0, 0, 0, 10); // valid ring shape, zero area
    const faces = buildRegions([A, zeroWidth, B]);
    expect(faces).toHaveLength(3);
    // Sources still reference the ORIGINAL array positions (0 and 2).
    expect(new Set(faces.map(f => f.sources.join(',')))).toEqual(new Set(['0', '2', '0,2']));
  });
});

describe('hitRegions', () => {
  const faces = buildRegions([A, B]);
  const overlap = faces.find(f => f.sources.length === 2)!;

  it('a stroke through the overlap hits only the overlap face', () => {
    const hits = hitRegions([[7, -5], [7, 15]], faces);
    expect(hits).toHaveLength(1);
    expect(hits[0].sources).toEqual([0, 1]);
    expect(hits[0].id).toBe(overlap.id);
  });

  it('a stroke crossing all three regions sweeps the whole union', () => {
    const hits = hitRegions([[1, 5], [14, 5]], faces);
    expect(hits).toHaveLength(3);
  });

  it('a stroke that misses everything is a no-op', () => {
    expect(hitRegions([[-50, -50], [-40, -40]], faces)).toEqual([]);
    expect(hitRegions([], faces)).toEqual([]);
  });

  it('a single point inside a region acts like a click on it', () => {
    const hits = hitRegions([[7, 5]], faces);
    expect(hits).toHaveLength(1);
    expect(hits[0].sources).toEqual([0, 1]);
  });
});

describe('mergeFaces (Keep mode)', () => {
  const faces = buildRegions([A, B]);
  const overlap = faces.find(f => f.sources.length === 2)!;

  it('sweeping only the overlap unites BOTH sources — area = A∪B, one ring', () => {
    const { geom, sources } = mergeFaces([overlap], [A, B]);
    expect(sources).toEqual([0, 1]);
    // Single polygon, no holes — one ring covering the peanut [0,15]×[0,10].
    expect(geom).toHaveLength(1);
    expect(geom[0]).toHaveLength(1);
    expect(multiPolygonArea(geom)).toBeCloseTo(UNION_AREA, 5);
    expect(pointInMultiPolygon([1, 1], geom)).toBe(true);
    expect(pointInMultiPolygon([14, 9], geom)).toBe(true);
    expect(pointInMultiPolygon([-1, 5], geom)).toBe(false);
  });

  it('sweeping all three faces merges to the same union', () => {
    const { geom, sources } = mergeFaces(faces, [A, B]);
    expect(sources).toEqual([0, 1]);
    expect(multiPolygonArea(geom)).toBeCloseTo(UNION_AREA, 5);
  });

  it('a sweep confined to one source is a no-op (empty merge geometry)', () => {
    const aOnly = faces.find(f => f.sources.join(',') === '0')!;
    const { geom, sources } = mergeFaces([aOnly], [A, B]);
    expect(sources).toEqual([0]);
    expect(geom).toEqual([]);
  });

  it('untouched sources stay out of the merge', () => {
    const c = square(100, 100, 110, 110);
    const { sources } = mergeFaces([overlap], [A, B, c]);
    expect(sources).toEqual([0, 1]);
  });
});

describe('eraseFaces (Erase mode)', () => {
  const faces = buildRegions([A, B]);
  const overlap = faces.find(f => f.sources.length === 2)!;

  it('erasing the overlap leaves two disjoint remainders, one per source', () => {
    const remainders = eraseFaces([overlap], [A, B]);
    expect(remainders).toHaveLength(2);
    expect(multiPolygonArea(remainders[0])).toBeCloseTo(OVERLAP_AREA, 5);
    expect(multiPolygonArea(remainders[1])).toBeCloseTo(OVERLAP_AREA, 5);
    // Disjoint: A keeps x∈[0,5], B keeps x∈[5,15] — the erased band is gone
    // from both and neither remainder reaches into the other.
    expect(pointInMultiPolygon([7, 5], remainders[0])).toBe(false);
    expect(pointInMultiPolygon([7, 5], remainders[1])).toBe(false);
    expect(pointInMultiPolygon([2, 5], remainders[0])).toBe(true);
    expect(pointInMultiPolygon([12, 5], remainders[1])).toBe(true);
    // Each remainder is a single ring with no holes.
    expect(remainders[0]).toHaveLength(1);
    expect(remainders[0][0]).toHaveLength(1);
    expect(remainders[1]).toHaveLength(1);
  });

  it('erasing every face of a source removes it entirely', () => {
    const remainders = eraseFaces(faces, [A, B]);
    expect(remainders[0]).toEqual([]);
    expect(remainders[1]).toEqual([]);
  });

  it('sources untouched by the sweep keep their geometry', () => {
    const aOnly = faces.find(f => f.sources.join(',') === '1')!; // B-only face
    const remainders = eraseFaces([aOnly], [A, B]);
    expect(multiPolygonArea(remainders[0])).toBeCloseTo(100, 5); // A intact
    expect(multiPolygonArea(remainders[1])).toBeCloseTo(OVERLAP_AREA, 5); // B minus its exclusive part
  });
});

describe('geometry helpers', () => {
  it('multiPolygonArea subtracts holes from outer rings', () => {
    const donut: MultiPolygon = [[
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
    ]];
    expect(multiPolygonArea(donut)).toBeCloseTo(100 - 16, 5);
    expect(pointInMultiPolygon([5, 5], donut)).toBe(false); // in the hole
    expect(pointInMultiPolygon([1, 5], donut)).toBe(true);
  });

  it('densifyStroke subdivides long segments and keeps endpoints', () => {
    const out = densifyStroke([[0, 0], [10, 0]], 4);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([10, 0]);
    expect(out).toHaveLength(4); // 0, ~3.33, ~6.67, 10
    for (let i = 1; i < out.length; i++) {
      expect(Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1])).toBeLessThanOrEqual(4);
    }
    expect(densifyStroke([])).toEqual([]);
  });

  it('objectToRings flattens a rect into a closed ring (tool input path)', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 });
    const rings = objectToRings(rect);
    expect(rings).not.toBeNull();
    expect(rings!.length).toBeGreaterThanOrEqual(1);
    const outer = rings![0] as Array<[number, number]>;
    expect(ringArea(outer)).toBeCloseTo(100, 3);
    // A degenerate zero-size object is unusable for the arrangement.
    const zero = new fabric.Rect({ left: 0, top: 0, width: 0, height: 0 });
    const zeroRings = objectToRings(zero);
    if (zeroRings) {
      // Whatever flattening produced, buildRegions must drop it silently.
      const asGeom = [zeroRings as unknown as import('polygon-clipping').Ring[]] as MultiPolygon;
      expect(buildRegions([A, asGeom])).toHaveLength(1);
    }
  });

  it('faces carry ids that are unique within one arrangement', () => {
    const faces: BuilderFace[] = buildRegions([A, B, square(20, 20, 30, 30)]);
    expect(new Set(faces.map(f => f.id)).size).toBe(faces.length);
    expect(faces).toHaveLength(4); // A-only, B-only, overlap, far-square
  });
});
