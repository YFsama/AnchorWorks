import { describe, it, expect, vi } from 'vitest';

// The dry run's last line of defence: whatever the rewrites did, a result the
// machine replay still finds a cut in must never reach the sender.

vi.mock('../hpglDebug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hpglDebug')>()),
  simulateMachineCode: vi.fn(),
}));

import { DryRunUnsafeError, buildDryRun } from '../plotterCalibration';
import { simulateMachineCode } from '../hpglDebug';

const PEN_DOWN_SOMEWHERE = { cuts: [[[0, 0], [1, 1]]] } as never;
const NOTHING_MARKS = { cuts: [] } as never;

describe('dry run — the guard', () => {
  const dry = { penUpZ: 5, travelRate: 3000, unit: 'mm' as const };

  it('refuses a result the replay still finds a cut in — in either language', () => {
    vi.mocked(simulateMachineCode).mockReturnValue(PEN_DOWN_SOMEWHERE);
    expect(() => buildDryRun('hpgl', 'PU400,400;PD1600,400;', dry)).toThrow(DryRunUnsafeError);
    expect(() => buildDryRun('gcode', 'G1 X1 Y1 Z-1', dry)).toThrow(DryRunUnsafeError);
    const refused = (() => { try { buildDryRun('hpgl', 'PU;', dry); return null; } catch (e) { return e as Error; } })();
    expect(refused?.name).toBe('DryRunUnsafeError');
  });

  it('returns the rewritten payload when nothing marks', () => {
    vi.mocked(simulateMachineCode).mockReturnValue(NOTHING_MARKS);
    const out = buildDryRun('hpgl', 'PU400,400;PD1600,400;', dry);
    expect(out).not.toMatch(/PD/);
    expect(out).toContain('PU1600,400;');
  });
});
