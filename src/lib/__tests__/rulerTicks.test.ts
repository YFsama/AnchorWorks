import { describe, it, expect } from 'vitest';
import { niceMajor, formatTick, MM_TO_PX } from '../rulerTicks';

describe('niceMajor', () => {
  it('keeps the classic px ruler at 100 when zoom=1, unit=px', () => {
    // pxPerUnit = zoom(1) * unitPx(1) = 1 → ~80px target → next 1-2-5-10 step is 100
    expect(niceMajor(1)).toBe(100);
  });

  it('falls to a finer step as the view zooms in', () => {
    expect(niceMajor(2)).toBe(50); // 80/2 = 40 → 50
    expect(niceMajor(8)).toBe(10); // 80/8 = 10 → 10
  });

  it('grows the step when zoomed far out', () => {
    expect(niceMajor(0.1)).toBe(1000); // 80/0.1 = 800 → 1000
  });

  it('picks a sane mm major at zoom=1 (unit=mm)', () => {
    // pxPerUnit = 1 * 3.7795 ≈ 3.78 → 80/3.78 ≈ 21.2 → next step 50mm
    expect(niceMajor(MM_TO_PX)).toBe(50);
  });

  it('always returns a positive 1-2-5-10 multiple', () => {
    for (const ppu of [0.03, 0.5, 3, 17, 240]) {
      const m = niceMajor(ppu);
      expect(m).toBeGreaterThan(0);
      const mantissa = m / Math.pow(10, Math.floor(Math.log10(m)));
      expect([1, 2, 5, 10]).toContain(Math.round(mantissa));
    }
  });
});

describe('formatTick', () => {
  it('renders whole numbers without decimals', () => {
    expect(formatTick(50)).toBe('50');
    expect(formatTick(0)).toBe('0');
    expect(formatTick(-120)).toBe('-120');
  });

  it('trims float noise from sub-unit steps', () => {
    expect(formatTick(0.5)).toBe('0.5');
    expect(formatTick(0.1 + 0.2)).toBe('0.3');
  });
});
