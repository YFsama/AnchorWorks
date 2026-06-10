import { describe, expect, it } from 'vitest';
import { extractExpandedShadowSpec } from '../effects';

describe('expand appearance helpers', () => {
  it('extracts usable drop shadow values for editable expansion', () => {
    expect(extractExpandedShadowSpec({ color: 'rgba(0,0,0,0.4)', blur: 12, offsetX: 4, offsetY: -2 })).toEqual({
      color: 'rgba(0,0,0,0.4)',
      blur: 12,
      offsetX: 4,
      offsetY: -2,
      opacity: 0.45,
    });
  });

  it('clamps invalid shadow numbers to safe defaults', () => {
    expect(extractExpandedShadowSpec({ color: '#000000', blur: Number.NaN, offsetX: Number.POSITIVE_INFINITY, offsetY: Number.NaN })).toEqual({
      color: '#000000',
      blur: 0,
      offsetX: 0,
      offsetY: 0,
      opacity: 0.45,
    });
  });

  it('ignores missing shadows', () => {
    expect(extractExpandedShadowSpec(null)).toBeNull();
    expect(extractExpandedShadowSpec({ blur: 4 })).toBeNull();
  });
});
