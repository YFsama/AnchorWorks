import { parseColor, rgbToHsl } from './colorAdjust';

export type RecolorSortMode = 'hue' | 'luminance';

function colorMetric(color: string, mode: RecolorSortMode): number {
  const rgb = parseColor(color);
  if (!rgb) return Number.POSITIVE_INFINITY;
  if (mode === 'hue') return rgbToHsl(rgb).h;
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

export function sortColorsForRecolor(colors: string[], mode: RecolorSortMode): string[] {
  return [...colors].sort((a, b) => {
    const metric = colorMetric(a, mode) - colorMetric(b, mode);
    return metric || a.localeCompare(b);
  });
}

export function buildSortedRecolorTargets(sources: string[], mode: RecolorSortMode): Record<string, string> {
  const sorted = sortColorsForRecolor(sources, mode);
  return Object.fromEntries(sources.map((source, index) => [source, sorted[index] ?? source]));
}
