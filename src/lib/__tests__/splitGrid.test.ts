import { describe, it, expect } from 'vitest';
import { gridCells } from '../splitGrid';

const box = { left: 0, top: 0, width: 100, height: 100 };

describe('gridCells', () => {
  it('tiles into rows×cols with no gutter (row-major)', () => {
    const cells = gridCells(box, 2, 2, 0);
    expect(cells.length).toBe(4);
    expect(cells[0]).toEqual({ left: 0, top: 0, width: 50, height: 50 });
    expect(cells[1]).toEqual({ left: 50, top: 0, width: 50, height: 50 });
    expect(cells[2]).toEqual({ left: 0, top: 50, width: 50, height: 50 });
    expect(cells[3]).toEqual({ left: 50, top: 50, width: 50, height: 50 });
  });

  it('subtracts gutters from cell size and keeps the outer bounds', () => {
    const cells = gridCells(box, 1, 3, 10); // 2 gutters of 10 → cells (100-20)/3
    expect(cells.length).toBe(3);
    expect(cells[0].width).toBeCloseTo(80 / 3, 6);
    expect(cells[2].left + cells[2].width).toBeCloseTo(100, 6); // right edge flush
  });

  it('returns nothing when gutters exceed the box', () => {
    expect(gridCells(box, 1, 5, 30)).toEqual([]); // 4*30 = 120 > 100
  });
});
