import { describe, it, expect } from 'vitest';
import { SYSTEM_FONTS, GOOGLE_FONTS, ALL_FONTS } from '../fonts';

/**
 * Pure registry tests — no DOM side effects exercised. `ensureFontLoaded`
 * and `loadCustomFontFile` are stateful (they inject <link> tags and call
 * the FontFace API), so we skip them here.
 */
describe('SYSTEM_FONTS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SYSTEM_FONTS)).toBe(true);
    expect(SYSTEM_FONTS.length).toBeGreaterThan(0);
  });

  it('includes the expected baseline entries', () => {
    const names = SYSTEM_FONTS.map((f) => f.name);
    expect(names).toContain('Inter');
    expect(names).toContain('System UI');
    expect(names).toContain('Sans');
    expect(names).toContain('Serif');
    expect(names).toContain('Mono');
  });

  it('every entry has a name and family string', () => {
    for (const f of SYSTEM_FONTS) {
      expect(typeof f.name).toBe('string');
      expect(f.name.length).toBeGreaterThan(0);
      expect(typeof f.family).toBe('string');
      expect(f.family.length).toBeGreaterThan(0);
    }
  });

  it('system fonts are NOT marked google', () => {
    for (const f of SYSTEM_FONTS) {
      expect(f.google).not.toBe(true);
    }
  });
});

describe('GOOGLE_FONTS', () => {
  it('has 10+ entries', () => {
    expect(GOOGLE_FONTS.length).toBeGreaterThanOrEqual(10);
  });

  it('every entry is marked google: true', () => {
    for (const f of GOOGLE_FONTS) {
      expect(f.google).toBe(true);
    }
  });

  it('every entry has a weights array of one or more numbers', () => {
    for (const f of GOOGLE_FONTS) {
      expect(Array.isArray(f.weights)).toBe(true);
      expect((f.weights ?? []).length).toBeGreaterThan(0);
      for (const w of f.weights ?? []) {
        expect(typeof w).toBe('number');
      }
    }
  });

  it('includes Roboto and Montserrat', () => {
    const names = GOOGLE_FONTS.map((f) => f.name);
    expect(names).toContain('Roboto');
    expect(names).toContain('Montserrat');
  });
});

describe('ALL_FONTS', () => {
  it('equals SYSTEM_FONTS concatenated with GOOGLE_FONTS', () => {
    expect(ALL_FONTS.length).toBe(SYSTEM_FONTS.length + GOOGLE_FONTS.length);
    // Order: system first, google second.
    expect(ALL_FONTS.slice(0, SYSTEM_FONTS.length)).toEqual(SYSTEM_FONTS);
    expect(ALL_FONTS.slice(SYSTEM_FONTS.length)).toEqual(GOOGLE_FONTS);
  });

  it('every entry has a name and family', () => {
    for (const f of ALL_FONTS) {
      expect(typeof f.name).toBe('string');
      expect(typeof f.family).toBe('string');
    }
  });

  it('has all unique names', () => {
    const names = ALL_FONTS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
