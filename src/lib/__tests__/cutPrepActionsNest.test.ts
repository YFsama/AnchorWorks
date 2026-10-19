import { afterEach, describe, expect, it, vi } from 'vitest';
import * as canvasEngine from '../canvasEngine';
import { useEditor, type CutPath } from '../../store/editor';
import { nestCutPathsRaster, nestCutPathsVinyl } from '../cutPrepActions';
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

/** 30×30 mm L-shaped cut path: bottom bar 30×10 + left bar 10×30. */
function lCutPath(id: string, x: number, y: number): CutPath {
  return {
    id,
    closed: true,
    kind: 'outline',
    points: [[x, y], [x + 30, y], [x + 30, y + 10], [x + 10, y + 10], [x + 10, y + 30], [x, y + 30]],
  };
}

describe('nestCutPathsRaster', () => {
  it('packs three L cut paths by true shape, appends the regmark unchanged, and pushes history once', () => {
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
      lCutPath('cut-1', 0, 0),
      lCutPath('cut-2', 100, 50),
      lCutPath('cut-3', 0, 100),
      regmark,
    ]);

    expect(nestCutPathsRaster(t, { sheetWidthMm: 100, gapMm: 2 })).toBe(3);
    expect(warn).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledOnce();
    // 3 × 500 mm² of L fill over the 100 × 30 mm used band = exactly 50 %
    // pixel-area coverage.
    expect(success).toHaveBeenCalledWith('3 cut paths nested · 50% material used', {
      title: 'Raster true-shape nesting — cut geometry only',
    });

    const paths = useEditor.getState().cutPaths;
    expect(paths).toHaveLength(4);

    // Sheet reading order: cut-1 lands flush at the origin; cut-2 slots one
    // raster gap (2 mm, quantised to the 0.5 mm grid) right of it — NOT at
    // the 32 mm hull-AABB stride the vinyl packer would use.
    expect(paths[0].id).toBe('cut-1');
    expect(paths[0].points[0]).toEqual([0, 0]);
    expect(paths[1].id).toBe('cut-2');
    expect(paths[1].points[0]).toEqual([31.5, 0]);
    expect(paths[2].id).toBe('cut-3');

    // Regmarks are excluded from the packing and appended unchanged.
    expect(paths[3]).toEqual(regmark);

    expect(pushHistory).toHaveBeenCalledOnce();
  });

  it('warns and returns 0 when there is nothing to nest, leaving the store untouched', () => {
    vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const warn = vi.spyOn(toast, 'warn').mockImplementation(() => '');

    useEditor.getState().setCutPaths([]);
    expect(nestCutPathsRaster(t)).toBe(0);
    expect(useEditor.getState().cutPaths).toEqual([]);

    const single = lCutPath('only', 0, 0);
    useEditor.getState().setCutPaths([single]);
    expect(nestCutPathsRaster(t)).toBe(0);
    expect(useEditor.getState().cutPaths).toEqual([single]);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('Need at least two cut paths to nest.', {
      title: 'Raster true-shape nesting — cut geometry only',
    });
  });
});
