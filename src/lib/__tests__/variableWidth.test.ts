import { describe, expect, it } from 'vitest';
import { buildVariableWidthOutline, widthScaleAt } from '../variableWidth';

describe('variable width profiles', () => {
  it('computes Illustrator-like profile scale curves', () => {
    expect(widthScaleAt(0, 'uniform')).toBe(1);
    expect(widthScaleAt(0, 'taper-start')).toBeCloseTo(0.08);
    expect(widthScaleAt(1, 'taper-start')).toBeCloseTo(1);
    expect(widthScaleAt(0, 'taper-end')).toBeCloseTo(1);
    expect(widthScaleAt(1, 'taper-end')).toBeCloseTo(0.08);
    expect(widthScaleAt(0.5, 'taper-both')).toBeCloseTo(1);
    expect(widthScaleAt(0.5, 'hourglass')).toBeCloseTo(0.35);
  });

  it('builds a closed outline around an open centerline', () => {
    const outline = buildVariableWidthOutline([[0, 0], [10, 0], [20, 0]], 4, 'uniform');

    expect(outline).toHaveLength(6);
    expect(outline[0]).toEqual([0, 2]);
    expect(outline[2]).toEqual([20, 2]);
    expect(outline[3]).toEqual([20, -2]);
    expect(outline[5]).toEqual([0, -2]);
  });

  it('tapers both ends while keeping the middle wide', () => {
    const outline = buildVariableWidthOutline([[0, 0], [10, 0], [20, 0]], 10, 'taper-both');

    expect(outline[0][1]).toBeCloseTo(0.4);
    expect(outline[1][1]).toBeCloseTo(5);
    expect(outline[2][1]).toBeCloseTo(0.4);
  });

  it('returns an empty outline for invalid input', () => {
    expect(buildVariableWidthOutline([[0, 0]], 4, 'bulge')).toEqual([]);
    expect(buildVariableWidthOutline([[0, 0], [1, 1]], 0, 'bulge')).toEqual([]);
  });
});
