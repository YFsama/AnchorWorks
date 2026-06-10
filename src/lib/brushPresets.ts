export type BrushPresetId = 'basic' | 'calligraphy' | 'marker' | 'inking';

export interface BrushPreset {
  id: BrushPresetId;
  label: string;
  widthMultiplier: number;
  minWidthRatio: number;
  speedSensitivity: number;
}

export const BRUSH_PRESETS: BrushPreset[] = [
  { id: 'basic', label: 'Basic Brush', widthMultiplier: 1, minWidthRatio: 0.85, speedSensitivity: 0.05 },
  { id: 'calligraphy', label: 'Calligraphy Brush', widthMultiplier: 3, minWidthRatio: 0.15, speedSensitivity: 0.75 },
  { id: 'marker', label: 'Marker Brush', widthMultiplier: 5, minWidthRatio: 0.55, speedSensitivity: 0.25 },
  { id: 'inking', label: 'Inking Brush', widthMultiplier: 2.5, minWidthRatio: 0.08, speedSensitivity: 0.9 },
];

export const DEFAULT_BRUSH_PRESET: BrushPresetId = 'calligraphy';

export function getBrushPreset(id: BrushPresetId | string): BrushPreset {
  return BRUSH_PRESETS.find((preset) => preset.id === id) ?? BRUSH_PRESETS.find((preset) => preset.id === DEFAULT_BRUSH_PRESET)!;
}

export function clampBrushWidth(width: number): number {
  return Math.max(1, Math.min(256, Number.isFinite(width) ? width : 1));
}

export function computeBrushBaseWidth(strokeWidth: number, presetId: BrushPresetId | string): number {
  const preset = getBrushPreset(presetId);
  return clampBrushWidth(strokeWidth) * preset.widthMultiplier;
}
