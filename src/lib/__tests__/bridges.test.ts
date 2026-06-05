import { describe, it, expect } from 'vitest';
import { bridgePolyline, addBridges } from '../bridges';
import type { CutPath } from '../../store/editor';

type Pt = [number, number];
// A 100mm square (closed).
const square: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

describe('bridges', () => {
  it('splits a closed path into `count` open segments with gaps', () => {
    const segs = bridgePolyline(square, 4, 2);
    expect(segs.length).toBe(4);
    // Every segment is an open polyline of 2+ points.
    for (const s of segs) expect(s.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves the path intact when too small to bridge', () => {
    const tiny: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    const segs = bridgePolyline(tiny, 4, 2); // 4×2mm > ~4mm perimeter
    expect(segs).toEqual([tiny]);
  });

  it('leaves the path intact when bridge count is zero', () => {
    expect(bridgePolyline(square, 0, 1)).toEqual([square]);
  });

  it('addBridges replaces closed paths and keeps reg marks/open paths', () => {
    const paths: CutPath[] = [
      { id: 'a', points: square, closed: true, kind: 'outline' },
      { id: 'reg', points: [[0, 0], [10, 0], [10, 10]], closed: false, kind: 'regmark' },
    ];
    const out = addBridges(paths, 4, 2);
    // reg mark untouched, square replaced by its 4 open segments.
    expect(out.some(p => p.id === 'reg')).toBe(true);
    expect(out.filter(p => p.id.startsWith('a-b')).length).toBe(4);
    expect(out.every(p => p.kind !== 'outline' || !p.closed)).toBe(true);
  });

  it('stores original closed paths on bridged segments for restoration', () => {
    const original: CutPath = { id: 'logo', points: square, closed: true, kind: 'trace', color: '#ff00ff' };
    const out = addBridges([original], 2, 1);
    const segment = out.find(p => p.id === 'logo-b0');
    expect(segment?.bridgeSourceId).toBe('logo');
    expect(segment?.bridgeOriginal).toEqual(original);
    expect(segment?.color).toBe('#ff00ff');
  });
});
