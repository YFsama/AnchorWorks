import { describe, it, expect } from 'vitest';
import {
  PAPER_PRESETS, presetToPx, matchPreset, mmToPx, pxToMm,
} from '../paperSizes';

describe('paperSizes', () => {
  it('converts mm↔px consistently at a given DPI', () => {
    // A4 width = 210mm → 793.7px at 96 DPI (rounded 794).
    expect(mmToPx(210, 96)).toBe(794);
    // Round-trip stays within 1mm.
    expect(pxToMm(mmToPx(210, 96), 96)).toBeCloseTo(210, 0);
  });

  it('resolves a print preset to portrait px', () => {
    const a4 = PAPER_PRESETS.find(p => p.id === 'a4')!;
    const port = presetToPx(a4, 96, false);
    expect(port.width).toBeLessThan(port.height); // taller than wide
    const land = presetToPx(a4, 96, true);
    expect(land.width).toBeGreaterThan(land.height); // wider than tall
    expect(land.width).toBe(port.height); // landscape is a swap
  });

  it('keeps screen presets DPI-independent (px verbatim)', () => {
    const ig = PAPER_PRESETS.find(p => p.id === 'ig-post')!;
    const a = presetToPx(ig, 96, false);
    const b = presetToPx(ig, 300, false);
    expect(a).toEqual(b);
    expect(a.width).toBe(1080);
  });

  it('round-trips a preset through matchPreset', () => {
    const letter = PAPER_PRESETS.find(p => p.id === 'letter')!;
    const { width, height } = presetToPx(letter, 96, false);
    const m = matchPreset(width, height, 96);
    expect(m?.id).toBe('letter');
    expect(m?.landscape).toBe(false);
  });

  it('detects landscape orientation on match', () => {
    const a3 = PAPER_PRESETS.find(p => p.id === 'a3')!;
    const { width, height } = presetToPx(a3, 96, true);
    const m = matchPreset(width, height, 96);
    expect(m?.id).toBe('a3');
    expect(m?.landscape).toBe(true);
  });

  it('returns null for an arbitrary custom size', () => {
    expect(matchPreset(123, 457, 96)).toBeNull();
  });

  it('has unique preset ids', () => {
    const ids = PAPER_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
