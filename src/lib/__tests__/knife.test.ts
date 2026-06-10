import { describe, expect, it } from 'vitest';
import { knifeSplitRingAtCenter } from '../knife';

const square: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

function areas(result: ReturnType<typeof knifeSplitRingAtCenter>): number[] {
  return result.map((polygon) => {
    const ring = polygon[0];
    let area = 0;
    for (let index = 0; index < ring.length - 1; index++) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[index + 1];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area / 2);
  }).sort((a, b) => a - b);
}

describe('knife split helpers', () => {
  it('splits a closed ring horizontally through its center', () => {
    const result = knifeSplitRingAtCenter(square, 'horizontal');

    expect(result).toHaveLength(2);
    expect(areas(result)).toEqual([50, 50]);
  });

  it('splits a closed ring vertically through its center', () => {
    const result = knifeSplitRingAtCenter(square, 'vertical');

    expect(result).toHaveLength(2);
    expect(areas(result)).toEqual([50, 50]);
  });

  it('ignores degenerate open rings', () => {
    expect(knifeSplitRingAtCenter([[0, 0], [10, 0], [0, 0]], 'horizontal')).toEqual([]);
  });
});
