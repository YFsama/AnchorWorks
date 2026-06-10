import { describe, expect, it } from 'vitest';
import { splitPolylineAtHalfLength } from '../scissors';

describe('splitPolylineAtHalfLength', () => {
  it('splits a straight polyline at the geometric midpoint', () => {
    const split = splitPolylineAtHalfLength([[0, 0], [10, 0]]);

    expect(split).not.toBeNull();
    expect(split![0]).toEqual([[0, 0], [5, 0]]);
    expect(split![1]).toEqual([[5, 0], [10, 0]]);
  });

  it('splits at half travelled length across multiple segments', () => {
    const split = splitPolylineAtHalfLength([[0, 0], [6, 0], [6, 8]]);

    expect(split).not.toBeNull();
    expect(split![0]).toEqual([[0, 0], [6, 0], [6, 1]]);
    expect(split![1]).toEqual([[6, 1], [6, 8]]);
  });

  it('returns null for degenerate paths', () => {
    expect(splitPolylineAtHalfLength([[0, 0]])).toBeNull();
    expect(splitPolylineAtHalfLength([[0, 0], [0, 0]])).toBeNull();
  });
});
