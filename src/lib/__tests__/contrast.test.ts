import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  wcagGrade,
} from '../contrast';

describe('hexToRgb', () => {
  it('parses 3-digit hex', () => {
    expect(hexToRgb('#abc')).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it('parses 6-digit hex', () => {
    expect(hexToRgb('#aabbcc')).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it('parses 6-digit hex (uppercase)', () => {
    expect(hexToRgb('#FF0000')).toEqual([255, 0, 0]);
  });

  it('parses rgb()', () => {
    expect(hexToRgb('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
  });

  it('parses rgba()', () => {
    expect(hexToRgb('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
  });

  it('returns null for garbage strings', () => {
    expect(hexToRgb('not-a-color')).toBeNull();
    expect(hexToRgb('#')).toBeNull();
    expect(hexToRgb('#xyz')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(hexToRgb(null as any)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(hexToRgb(undefined as any)).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('returns 0 for pure black', () => {
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
  });

  it('returns 1 for pure white', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });

  it('returns ~0.21 for mid-grey (128,128,128)', () => {
    const lum = relativeLuminance([128, 128, 128]);
    expect(lum).toBeGreaterThan(0.18);
    expect(lum).toBeLessThan(0.25);
  });
});

describe('contrastRatio', () => {
  it('returns ~21 for white-on-black', () => {
    const r = contrastRatio('#ffffff', '#000000');
    expect(r).toBeCloseTo(21, 0);
  });

  it('returns ~1 for the same colour against itself', () => {
    expect(contrastRatio('#888888', '#888888')).toBeCloseTo(1, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric (fg/bg order does not matter)', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(
      contrastRatio('#fff', '#000'),
      5,
    );
  });

  it('returns NaN for unparseable input', () => {
    expect(contrastRatio('garbage', '#000')).toBeNaN();
    expect(contrastRatio('#000', 'garbage')).toBeNaN();
  });
});

describe('wcagGrade', () => {
  it('maps ratio >= 7 to Excellent', () => {
    expect(wcagGrade(7).label).toBe('Excellent');
    expect(wcagGrade(21).label).toBe('Excellent');
    expect(wcagGrade(9.5).label).toBe('Excellent');
  });

  it('maps 4.5 <= ratio < 7 to Good', () => {
    expect(wcagGrade(4.5).label).toBe('Good');
    expect(wcagGrade(5).label).toBe('Good');
    expect(wcagGrade(6.99).label).toBe('Good');
  });

  it('maps 3 <= ratio < 4.5 to Fair', () => {
    expect(wcagGrade(3).label).toBe('Fair');
    expect(wcagGrade(3.5).label).toBe('Fair');
    expect(wcagGrade(4.49).label).toBe('Fair');
  });

  it('maps ratio < 3 to Fail', () => {
    expect(wcagGrade(2.99).label).toBe('Fail');
    expect(wcagGrade(1).label).toBe('Fail');
    expect(wcagGrade(0).label).toBe('Fail');
  });

  it('treats NaN as Fail with all pass flags false', () => {
    const g = wcagGrade(NaN);
    expect(g.label).toBe('Fail');
    expect(g.passAA).toBe(false);
    expect(g.passAAA).toBe(false);
    expect(g.passAALarge).toBe(false);
    expect(g.passAAALarge).toBe(false);
  });

  it('sets correct pass flags at the AA threshold', () => {
    const g = wcagGrade(4.5);
    expect(g.passAA).toBe(true);
    expect(g.passAAA).toBe(false);
    expect(g.passAALarge).toBe(true);
    expect(g.passAAALarge).toBe(true);
  });

  it('sets correct pass flags at the AAA threshold', () => {
    const g = wcagGrade(7);
    expect(g.passAA).toBe(true);
    expect(g.passAAA).toBe(true);
    expect(g.passAALarge).toBe(true);
    expect(g.passAAALarge).toBe(true);
  });
});
