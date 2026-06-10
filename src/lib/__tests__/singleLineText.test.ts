import { describe, expect, it } from 'vitest';
import { buildSingleLineTextPath } from '../singleLineText';

describe('buildSingleLineTextPath', () => {
  it('builds curved single-stroke engineering glyphs instead of seven-segment outlines', () => {
    const result = buildSingleLineTextPath('ANCHOR 123', 70, 4);

    expect(result.d).toContain('Q');
    expect(result.d).toContain('M');
    expect(result.d).toContain('L');
    expect(result.width).toBeGreaterThan(400);
    expect(result.height).toBe(70);
  });

  it('uses spacing advances without drawing strokes for spaces', () => {
    const compact = buildSingleLineTextPath('AA', 14, 0);
    const spaced = buildSingleLineTextPath('A A', 14, 0);

    expect(spaced.width - compact.width).toBe(6);
    expect(spaced.d.split('M')).toHaveLength(compact.d.split('M').length);
  });

  it('falls back to a question-mark stroke for unsupported glyphs', () => {
    const fallback = buildSingleLineTextPath('~', 28, 0);

    expect(fallback.d).toContain('Q');
    expect(fallback.d).toContain('M10 26');
    expect(fallback.width).toBeGreaterThan(0);
  });
});
