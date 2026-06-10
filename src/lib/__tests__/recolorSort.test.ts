import { describe, expect, it } from 'vitest';
import { buildSortedRecolorTargets, sortColorsForRecolor } from '../recolorSort';

describe('recolor sort helpers', () => {
  it('sorts colors by hue for predictable color-wheel mapping', () => {
    expect(sortColorsForRecolor(['#0000ff', '#ff0000', '#00ff00'], 'hue')).toEqual(['#ff0000', '#00ff00', '#0000ff']);
  });

  it('sorts colors by luminance for light-to-dark mapping', () => {
    expect(sortColorsForRecolor(['#ffffff', '#000000', '#777777'], 'luminance')).toEqual(['#000000', '#777777', '#ffffff']);
  });

  it('builds a source-preserving target map from sorted colors', () => {
    expect(buildSortedRecolorTargets(['#0000ff', '#ff0000', '#00ff00'], 'hue')).toEqual({
      '#0000ff': '#ff0000',
      '#ff0000': '#00ff00',
      '#00ff00': '#0000ff',
    });
  });
});
