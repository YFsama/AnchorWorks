/**
 * Layered-vinyl splitting tests — grouping, the shared-marks rule, and the
 * area-descending stacking order. Pure CutPath fixtures (mm space), same
 * convention as weedCheck.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { buildVinylLayers } from '../layerJobs';
import type { CutPath } from '../../store/editor';

/** Axis-aligned rectangle ring at (x, y), w × h mm. */
function rect(id: string, x: number, y: number, w: number, h: number, extra: Partial<CutPath> = {}): CutPath {
  return {
    id,
    points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
    closed: true,
    kind: 'outline',
    ...extra,
  };
}

function regmark(id: string): CutPath {
  return {
    id,
    points: [[0, 0], [5, 0]],
    closed: false,
    kind: 'regmark',
  };
}

describe('buildVinylLayers', () => {
  it('splits two colours + a shared regmark into 2 layers that both carry the regmark, ordered by area', () => {
    const red = rect('red', 0, 0, 100, 100, { color: '#ff0000' });   // 10 000 mm²
    const blue = rect('blue', 200, 0, 50, 40, { color: '#0000ff' }); // 2 000 mm²
    const mark = regmark('mark');
    const layers = buildVinylLayers([red, blue, mark]);

    expect(layers).toHaveLength(2);
    // Largest area = bottom = order 1.
    expect(layers[0].color).toBe('#ff0000');
    expect(layers[0].order).toBe(1);
    expect(layers[0].areaMm2).toBeCloseTo(10000, 6);
    expect(layers[1].color).toBe('#0000ff');
    expect(layers[1].order).toBe(2);
    expect(layers[1].areaMm2).toBeCloseTo(2000, 6);
    // Both layers ship the shared regmark (alignment convention)…
    expect(layers[0].paths.some(p => p.id === 'mark')).toBe(true);
    expect(layers[1].paths.some(p => p.id === 'mark')).toBe(true);
    // …but only their own colour's geometry counts toward cutCount/area.
    expect(layers[0].cutCount).toBe(1);
    expect(layers[1].cutCount).toBe(1);
    expect(layers[0].paths.some(p => p.id === 'blue')).toBe(false);
    expect(layers[1].paths.some(p => p.id === 'red')).toBe(false);
  });

  it('single colour yields exactly one layer (order 1)', () => {
    const layers = buildVinylLayers([
      rect('a', 0, 0, 30, 20, { color: '#00ff00' }),
      rect('b', 100, 0, 10, 10, { color: '#00ff00' }),
    ]);
    expect(layers).toHaveLength(1);
    expect(layers[0].color).toBe('#00ff00');
    expect(layers[0].order).toBe(1);
    expect(layers[0].cutCount).toBe(2);
    expect(layers[0].areaMm2).toBeCloseTo(700, 6);
  });

  it('empty input yields no layers', () => {
    expect(buildVinylLayers([])).toEqual([]);
  });

  it('colourless non-regmark paths are shared into every layer but never form one', () => {
    // A weed border: colourless, non-regmark — no vinyl of its own.
    const border = rect('border', -5, -5, 300, 200);
    const layers = buildVinylLayers([
      rect('red', 0, 0, 100, 100, { color: '#ff0000' }),
      rect('blue', 200, 0, 50, 50, { color: '#0000ff' }),
      border,
    ]);
    expect(layers).toHaveLength(2);
    for (const layer of layers) {
      expect(layer.paths.some(p => p.id === 'border')).toBe(true);
      expect(layer.paths.some(p => p.id === border.id && p.color === undefined)).toBe(true);
      expect(layer.cutCount).toBe(1);
    }
    // The border's area must not inflate either layer's ranking area.
    expect(layers[0].areaMm2).toBeCloseTo(10000, 6);
    expect(layers[1].areaMm2).toBeCloseTo(2500, 6);
  });
});
