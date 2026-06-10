import { describe, expect, it } from 'vitest';
import { hexToRgb, renderFreeformGradient, type FreeformGradientStop } from '../freeformGradient';

function rgbAt(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2]];
}

const cornerStops: FreeformGradientStop[] = [
  { x: 0, y: 0, color: '#ff0000', radius: 0.4 },
  { x: 1, y: 0, color: '#00ff00', radius: 0.4 },
  { x: 0, y: 1, color: '#0000ff', radius: 0.4 },
  { x: 1, y: 1, color: '#ffffff', radius: 0.4 },
];

describe('freeform gradient rendering', () => {
  it('parses short and long hex colors', () => {
    expect(hexToRgb('#0f8')).toEqual([0, 255, 136]);
    expect(hexToRgb('#336699')).toEqual([51, 102, 153]);
  });

  it('renders mesh mode as a corner-preserving bilinear surface', () => {
    const rendered = renderFreeformGradient(16, 16, cornerStops, 'mesh');

    expect(rendered).not.toBeNull();
    expect(rgbAt(rendered!.data, rendered!.width, 0, 0)).toEqual([255, 0, 0]);
    expect(rgbAt(rendered!.data, rendered!.width, 15, 0)).toEqual([0, 255, 0]);
    expect(rgbAt(rendered!.data, rendered!.width, 0, 15)).toEqual([0, 0, 255]);
    expect(rgbAt(rendered!.data, rendered!.width, 15, 15)).toEqual([255, 255, 255]);
  });

  it('lets interior mesh stops pull the interpolated surface', () => {
    const withoutCenter = renderFreeformGradient(16, 16, cornerStops, 'mesh')!;
    const withCenter = renderFreeformGradient(16, 16, [
      ...cornerStops,
      { x: 0.5, y: 0.5, color: '#000000', radius: 0.35 },
    ], 'mesh')!;

    const plainCenter = rgbAt(withoutCenter.data, withoutCenter.width, 8, 8).reduce((sum, value) => sum + value, 0);
    const pulledCenter = rgbAt(withCenter.data, withCenter.width, 8, 8).reduce((sum, value) => sum + value, 0);
    expect(pulledCenter).toBeLessThan(plainCenter);
  });

  it('keeps freeform mode available for soft radial stop blending', () => {
    const rendered = renderFreeformGradient(24, 24, cornerStops.slice(0, 2), 'freeform');

    expect(rendered).not.toBeNull();
    expect(rendered!.width).toBe(24);
    expect(rendered!.height).toBe(24);
    expect(rgbAt(rendered!.data, rendered!.width, 2, 2)[0]).toBeGreaterThan(rgbAt(rendered!.data, rendered!.width, 22, 2)[0]);
  });

  it('rejects gradients with fewer than two color stops', () => {
    expect(renderFreeformGradient(16, 16, cornerStops.slice(0, 1), 'mesh')).toBeNull();
  });
});
