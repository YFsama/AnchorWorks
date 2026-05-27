import { describe, it, expect } from 'vitest';
import { generatePalette } from '../effects';

describe('generatePalette', () => {
  it('returns exactly 5 colours from a base hex', () => {
    const palette = generatePalette('#ff0000');
    expect(palette).toHaveLength(5);
  });

  it('every entry is a #RRGGBB hex string', () => {
    const palette = generatePalette('#ff0000');
    for (const c of palette) {
      expect(c.startsWith('#')).toBe(true);
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('returns 5 distinct colours', () => {
    const palette = generatePalette('#ff0000');
    expect(new Set(palette).size).toBe(5);
  });

  it('is deterministic for the same input', () => {
    const a = generatePalette('#3d9bff');
    const b = generatePalette('#3d9bff');
    expect(a).toEqual(b);
  });

  it('falls back gracefully when input is garbage', () => {
    const palette = generatePalette('not-a-hex');
    expect(palette).toHaveLength(5);
    for (const c of palette) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
