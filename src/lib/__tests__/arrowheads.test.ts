import { describe, it, expect } from 'vitest';
import { arrowTriangle } from '../arrowheads';

describe('arrowTriangle', () => {
  it('apex sits at the tip, base set back along the direction', () => {
    const [apex, b1, b2] = arrowTriangle([10, 0], [1, 0], 4, 2);
    expect(apex).toEqual([10, 0]);
    // base centre is len=4 behind the tip along +x → x = 6
    expect((b1[0] + b2[0]) / 2).toBeCloseTo(6, 6);
    // base spans the perpendicular (y) by width=2 → ±1
    expect(Math.abs(b1[1] - b2[1])).toBeCloseTo(2, 6);
  });

  it('normalises a non-unit direction vector', () => {
    const [apex, b1, b2] = arrowTriangle([0, 0], [0, 5], 4, 2); // points +y
    expect(apex).toEqual([0, 0]);
    const baseCY = (b1[1] + b2[1]) / 2;
    expect(baseCY).toBeCloseTo(-4, 6); // 4 behind tip along +y
    expect(Math.abs(b1[0] - b2[0])).toBeCloseTo(2, 6); // spread along x
  });
});
