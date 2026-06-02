import { describe, it, expect } from 'vitest';
import { parseColor, toHex, invertRGB, grayRGB } from '../colorAdjust';

describe('parseColor', () => {
  it('parses #rgb, #rrggbb and rgb()', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('#FF8800')).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual({ r: 10, g: 20, b: 30 });
  });
  it('returns null for named / unparseable colours', () => {
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('red')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('invertRGB', () => {
  it('inverts each channel and round-trips through hex', () => {
    expect(toHex(invertRGB({ r: 0, g: 0, b: 0 }))).toBe('#ffffff');
    expect(toHex(invertRGB({ r: 255, g: 136, b: 0 }))).toBe('#0077ff');
  });
});

describe('grayRGB', () => {
  it('maps to a single luminance grey', () => {
    const g = grayRGB({ r: 255, g: 0, b: 0 });
    expect(g.r).toBe(g.g);
    expect(g.g).toBe(g.b);
    expect(toHex(g)).toBe('#4c4c4c'); // 0.299*255 ≈ 76 → 0x4c
  });
  it('keeps greys unchanged', () => {
    expect(toHex(grayRGB({ r: 128, g: 128, b: 128 }))).toBe('#808080');
  });
});
