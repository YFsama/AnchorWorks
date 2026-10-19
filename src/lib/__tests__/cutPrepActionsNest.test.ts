import { afterEach, describe, expect, it, vi } from 'vitest';
import * as canvasEngine from '../canvasEngine';
import { useEditor, type CutPath } from '../../store/editor';
import { nestCutPathsVinyl } from '../cutPrepActions';
import { toast } from '../toast';

/**
 * One-click vinyl nesting (cutPrepActions.nestCutPathsVinyl) against the
 * real editor store (io.test.ts pattern: set state, act, reset in
 * afterEach). `t` is the identity — the action's keys are English source
 * strings, asserted verbatim where the contract pins them.
 */
const t = (key: string) => key;

function rectCutPath(id: string, x: number, y: number, w: number, h: number): CutPath {
  return {
    id,
    closed: true,
    kind: 'outline',
    points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  useEditor.getState().setCutPaths([]);
});

describe('nestCutPathsVinyl', () => {
  it('packs three rect cut paths onto a 60 mm sheet, appends the regmark unchanged, and pushes history once', () => {
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const warn = vi.spyOn(toast, 'warn').mockImplementation(() => '');
    const success = vi.spyOn(toast, 'success').mockImplementation(() => '');

    const regmark: CutPath = {
      id: 'reg-1',
      closed: true,
      kind: 'regmark',
      points: [[90, 90], [95, 90], [95, 95], [90, 95]],
    };
    useEditor.getState().setCutPaths([
      rectCutPath('cut-1', 0, 0, 20, 10),
      rectCutPath('cut-2', 100, 50, 20, 10),
      rectCutPath('cut-3', 0, 100, 20, 10),
      regmark,
    ]);

    expect(nestCutPathsVinyl(t, { sheetWidthMm: 60, gapMm: 2 })).toBe(3);
    expect(warn).not.toHaveBeenCalled();
    // 3 × (20×10 hull) on 60 × 20 used = exactly 50 % material coverage.
    expect(success).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith('3 cut paths nested · 50% material used', {
      title: 'Vinyl nesting — cut geometry only',
    });

    const paths = useEditor.getState().cutPaths;
    expect(paths).toHaveLength(4);

    // Sheet reading order: cut-1 keeps its raw AABB at (0, 0); cut-2's AABB
    // min lands at x=22 (the first neighbour's inflated footprint is
    // 20+2 mm wide); cut-3 rotates 90° into the strip at x=44 — its rotated
    // points [x,y]→[-y,x] land at exactly [[54,0],[54,20],[44,20],[44,0]].
    expect(paths[0].points).toEqual([[0, 0], [20, 0], [20, 10], [0, 10]]);
    expect(paths[0].id).toBe('cut-1');
    expect(paths[1].points[0]).toEqual([22, 0]);
    expect(paths[1].id).toBe('cut-2');
    expect(paths[2].points).toEqual([[54, 0], [54, 20], [44, 20], [44, 0]]);
    expect(paths[2]).toMatchObject({ id: 'cut-3', kind: 'outline', closed: true });

    // Regmarks are excluded from the packing and appended unchanged.
    expect(paths[3]).toEqual(regmark);

    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('warns and returns 0 when there is nothing to nest, leaving the store untouched', () => {
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const warn = vi.spyOn(toast, 'warn').mockImplementation(() => '');

    useEditor.getState().setCutPaths([]);
    expect(nestCutPathsVinyl(t)).toBe(0);
    expect(useEditor.getState().cutPaths).toEqual([]);

    // A lone regmark is not packable either — it stays exactly as it was.
    const regmark: CutPath = {
      id: 'reg-1',
      closed: true,
      kind: 'regmark',
      points: [[0, 0], [4, 0], [4, 4], [0, 4]],
    };
    useEditor.getState().setCutPaths([regmark]);
    expect(nestCutPathsVinyl(t)).toBe(0);
    expect(useEditor.getState().cutPaths).toEqual([regmark]);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('Need at least two cut paths to nest.', {
      title: 'Vinyl nesting — cut geometry only',
    });
  });
});
