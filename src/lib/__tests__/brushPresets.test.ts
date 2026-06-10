import { describe, expect, it } from 'vitest';
import { BRUSH_PRESETS, clampBrushWidth, computeBrushBaseWidth, getBrushPreset } from '../brushPresets';

describe('brush presets', () => {
  it('exposes Illustrator-like drawing presets', () => {
    expect(BRUSH_PRESETS.map((preset) => preset.id)).toEqual(['basic', 'calligraphy', 'marker', 'inking']);
  });

  it('falls back to calligraphy for unknown presets', () => {
    expect(getBrushPreset('unknown').id).toBe('calligraphy');
  });

  it('clamps brush width and applies preset multipliers', () => {
    expect(clampBrushWidth(0)).toBe(1);
    expect(clampBrushWidth(999)).toBe(256);
    expect(computeBrushBaseWidth(2, 'marker')).toBe(10);
  });
});
