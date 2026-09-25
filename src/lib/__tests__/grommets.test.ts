/**
 * Banner grommets — evenly-spaced holes around an inset perimeter.
 *
 * grommetsFromObjects drops one closed-circle cut path per grommet: one at
 * each corner of the inset rectangle plus interior holes so the gap along
 * an edge never exceeds maxSpacing. These tests pin the placement math
 * (edge walking, corner non-doubling, spacing ceiling), the inset clamp on
 * small banners, unit conversion (px bbox → mm centres), the preset
 * parameter validation, and the multi-object union bbox.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { grommetsFromObjects, grommetsFromSelection } from '../grommets';
import * as canvasEngine from '../canvasEngine';
import type { CutPath } from '../../store/editor';

const MM_TO_PX = 3.7795;

/** A rect whose bounding box is exactly `wMm × hMm` at (xMm, yMm) in mm. */
function bannerRect(xMm: number, yMm: number, wMm: number, hMm: number): fabric.Rect {
  return new fabric.Rect({
    left: xMm * MM_TO_PX,
    top: yMm * MM_TO_PX,
    width: wMm * MM_TO_PX,
    height: hMm * MM_TO_PX,
    strokeWidth: 0, // no stroke padding → exact bbox
  });
}

/** Circle centre from a grommet's polygon (mean over unique samples). */
function centres(paths: CutPath[]): Array<[number, number]> {
  return paths.map(p => {
    // The ring repeats its first point at the end — drop it or the mean
    // skews toward the start sample by r/n.
    const uniq = p.points.slice(0, -1);
    let cx = 0, cy = 0;
    for (const [x, y] of uniq) { cx += x; cy += y; }
    return [cx / uniq.length, cy / uniq.length] as [number, number];
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('grommetsFromObjects — preset placement (1000×500mm banner, defaults)', () => {
  // Defaults: inset 20mm, maxSpacing 500mm, diameter 10mm.
  const banner = () => [bannerRect(0, 0, 1000, 500)];
  const GROMMETS = () => grommetsFromObjects(banner());

  it('emits exactly the preset grommet set: corners + one mid-top hole', () => {
    // Inset rect x∈[20,980], y∈[20,480]. Top edge 960mm → ceil(960/500)=2
    // holes; right/bottom/left edges 460/960/460mm → 1/2/1, but each edge
    // omits its terminal corner (the next edge emits it) → 6 centres:
    // (20,20),(500,20),(980,20),(980,480),(500,480)… wait: bottom runs
    // x1→x0 emitting (980,480),(500,480); left emits (20,480).
    const g = GROMMETS();
    expect(g).toHaveLength(6);
    const cs = centres(g);
    const near = (x: number, y: number) =>
      cs.some(([cx, cy]) => Math.abs(cx - x) < 0.01 && Math.abs(cy - y) < 0.01);
    expect(near(20, 20)).toBe(true);
    expect(near(500, 20)).toBe(true);
    expect(near(980, 20)).toBe(true);
    expect(near(980, 480)).toBe(true);
    expect(near(500, 480)).toBe(true);
    expect(near(20, 480)).toBe(true);
  });

  it('never doubles a corner — no two grommets share a centre', () => {
    const cs = centres(GROMMETS());
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        expect(Math.hypot(cs[i][0] - cs[j][0], cs[i][1] - cs[j][1])).toBeGreaterThan(0.01);
      }
    }
  });

  it('each grommet is a closed 10mm circle (21-sample polygon)', () => {
    for (const g of GROMMETS()) {
      expect(g.closed).toBe(true);
      expect(g.kind).toBe('manual');
      expect(g.passes).toBe(1);
      expect(g.points).toHaveLength(21);
      // Radius: every sample sits 5mm from the centre.
      const [cx, cy] = centres([g])[0];
      for (const [x, y] of g.points) {
        expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(5, 5);
      }
    }
  });

  it('ids are unique with the gr- prefix', () => {
    const ids = GROMMETS().map(g => g.id);
    expect(ids.every(id => id.startsWith('gr-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all gaps along an edge stay under maxSpacing', () => {
    const cs = centres(GROMMETS());
    // y=20 row: top edge's two holes plus the right edge's start corner.
    const top = cs.filter(([, y]) => Math.abs(y - 20) < 0.01).sort((a, b) => a[0] - b[0]);
    const bottom = cs.filter(([, y]) => Math.abs(y - 480) < 0.01).sort((a, b) => a[0] - b[0]);
    expect(top.map(([x]) => +x.toFixed(2))).toEqual([20, 500, 980]);
    expect(bottom.map(([x]) => +x.toFixed(2))).toEqual([20, 500, 980]);
    // Every gap is 480mm ≤ maxSpacing 500 (corner-to-corner would be 960).
    expect(top[1][0] - top[0][0]).toBeCloseTo(480, 5);
    expect(top[2][0] - top[1][0]).toBeCloseTo(480, 5);
  });
});

describe('grommetsFromObjects — parameter behaviour', () => {
  it('splits an edge into ceil(len/spacing) even gaps', () => {
    // 200×100mm banner, inset 10 → edges 180mm (h) and 80mm (v).
    // maxSpacing 40 → top/bottom n=ceil(180/40)=5, right/left n=2.
    const g = grommetsFromObjects([bannerRect(0, 0, 200, 100)], 10, 40, 10);
    // 5 per horizontal edge + 1 per vertical edge start corner.
    expect(g).toHaveLength(5 + 2 + 5 + 2);
    const cs = centres(g);
    // y=10 row: the top edge's 5 holes (36mm apart) + the right edge's
    // start corner at x=190.
    const top = cs.filter(([, y]) => Math.abs(y - 10) < 0.01).sort((a, b) => a[0] - b[0]);
    expect(top.map(([x]) => +x.toFixed(2))).toEqual([10, 46, 82, 118, 154, 190]);
  });

  it('clamps the inset to half the smallest banner dimension', () => {
    // 100×100mm banner with inset 200 → inset clamps to 50 → all four
    // edges degenerate; each still emits its start corner at (50,50).
    const g = grommetsFromObjects([bannerRect(0, 0, 100, 100)], 200, 500, 10);
    const cs = centres(g);
    expect(cs).toHaveLength(4);
    for (const [x, y] of cs) {
      expect(x).toBeCloseTo(50, 5);
      expect(y).toBeCloseTo(50, 5);
    }
  });

  it('uses the union bbox of multiple objects', () => {
    const two = [bannerRect(0, 0, 100, 100), bannerRect(300, 0, 100, 100)];
    // Union: 0..400 × 0..100 mm. Inset 20 → x∈[20,380], y∈[20,80].
    const g = grommetsFromObjects(two, 20, 500, 10);
    const cs = centres(g);
    for (const [x, y] of cs) {
      expect(x).toBeGreaterThanOrEqual(20 - 0.01);
      expect(x).toBeLessThanOrEqual(380 + 0.01);
      expect(y).toBeGreaterThanOrEqual(20 - 0.01);
      expect(y).toBeLessThanOrEqual(80 + 0.01);
    }
  });

  it('clamps the hole radius to a 0.5mm minimum', () => {
    // diameter 0.4mm → r = max(0.5, 0.2) = 0.5.
    const g = grommetsFromObjects([bannerRect(0, 0, 200, 100)], 10, 500, 0.4);
    const [cx, cy] = centres([g[0]])[0];
    for (const [x, y] of g[0].points) {
      expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(0.5, 6);
    }
  });

  it('rejects invalid parameter values with an empty result', () => {
    const objs = [bannerRect(0, 0, 500, 300)];
    expect(grommetsFromObjects(objs, -1, 500, 10)).toEqual([]);
    expect(grommetsFromObjects(objs, 20, 0, 10)).toEqual([]);
    expect(grommetsFromObjects(objs, 20, -100, 10)).toEqual([]);
    expect(grommetsFromObjects(objs, 20, 500, 0)).toEqual([]);
    expect(grommetsFromObjects(objs, Number.NaN, 500, 10)).toEqual([]);
    expect(grommetsFromObjects(objs, 20, Number.POSITIVE_INFINITY, 10)).toEqual([]);
    expect(grommetsFromObjects([], 20, 500, 10)).toEqual([]);
  });
});

describe('grommetsFromSelection', () => {
  it('reads the active selection off the canvas', () => {
    const rect = bannerRect(0, 0, 1000, 500);
    const c = { getActiveObjects: () => [rect] };
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(c as never);

    expect(grommetsFromSelection()).toHaveLength(6); // same preset set as above
  });

  it('returns [] without a live canvas', () => {
    vi.spyOn(canvasEngine, 'getCanvas').mockReturnValue(null as never);
    expect(grommetsFromSelection()).toEqual([]);
  });
});
