import { describe, expect, it } from 'vitest';
import * as fabric from 'fabric';
import { buildExpandedPatternTiles, clearPatternFillFromObject } from '../effects';

describe('pattern expansion helpers', () => {
  it('expands checker patterns into alternating editable tiles', () => {
    const tiles = buildExpandedPatternTiles({ left: 0, top: 0, width: 32, height: 32 }, { kind: 'checker', size: 16, color1: '#fff', color2: '#000' });

    expect(tiles).toHaveLength(4);
    expect(tiles.map((tile) => tile.fill)).toEqual(['#000', '#fff', '#fff', '#000']);
  });

  it('expands dot patterns into centered dot objects per tile', () => {
    const tiles = buildExpandedPatternTiles({ left: 10, top: 20, width: 16, height: 16 }, { kind: 'dots', size: 16, color1: '#fff', color2: '#f00' });

    expect(tiles).toEqual([{ left: 14, top: 24, width: 8, height: 8, fill: '#f00' }]);
  });


  it('clears live pattern fill metadata back to the pattern base color', () => {
    const rect = new fabric.Rect({ fill: '#000', stroke: '#111' }) as fabric.Rect & { patternSpec?: { kind: 'checker'; size: number; color1: string; color2: string } };
    rect.patternSpec = { kind: 'checker', size: 16, color1: '#ffffff', color2: '#000000' };

    expect(clearPatternFillFromObject(rect)).toBe(true);
    expect(rect.fill).toBe('#ffffff');
    expect(rect.patternSpec).toBeUndefined();
    expect(clearPatternFillFromObject(rect)).toBe(false);
  });

  it('creates two hatch strokes per crosshatch tile', () => {
    const tiles = buildExpandedPatternTiles({ left: 0, top: 0, width: 16, height: 16 }, { kind: 'crosshatch', size: 16, color1: '#fff', color2: '#111' });

    expect(tiles).toHaveLength(2);
    expect(tiles[0].height).toBeGreaterThan(0);
    expect(tiles[1].top).toBe(8);
  });
});
