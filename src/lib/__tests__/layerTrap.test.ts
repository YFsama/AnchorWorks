import { afterEach, describe, expect, it, vi } from 'vitest';
import * as canvasEngine from '../canvasEngine';
import { useEditor, type CutPath } from '../../store/editor';
import { applyLayerTrap } from '../layerTrap';
import { toast } from '../toast';

/**
 * applyLayerTrap against the real editor store (cutPrepActionsNest.test.ts
 * pattern: set state, act, reset in afterEach). `t` is the identity — the
 * action's keys are English source strings, asserted verbatim where the
 * contract pins them. Geometry assertions rely on offsetPolyline's round
 * joins: a 50 × 40 mm rect trapped by 0.5 mm moves every edge 0.5 mm
 * outward (min x 200 → 199.5) and tessellates each 90° corner into a
 * ~12-step arc, so the point count grows.
 */
const t = (key: string) => key;

/** Axis-aligned rectangle ring at (x, y), w × h mm, with closing vertex. */
function rectPath(id: string, color: string | undefined, x: number, y: number, w: number, h: number): CutPath {
  return {
    id,
    closed: true,
    kind: 'outline',
    color,
    points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
  };
}

/** Open two-point path (regmark geometry — must pass through untouched). */
function regmark(id: string): CutPath {
  return { id, points: [[0, 0], [5, 0]], closed: false, kind: 'regmark' };
}

function minX(points: Array<[number, number]>): number {
  return Math.min(...points.map(([x]) => x));
}

afterEach(() => {
  vi.restoreAllMocks();
  useEditor.getState().setCutPaths([]);
});

describe('applyLayerTrap', () => {
  it('traps the upper colour outward, leaving the bottom colour and regmark byte-identical, pushing history once', () => {
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const success = vi.spyOn(toast, 'success').mockImplementation(() => '');

    const red = rectPath('red', '#ff0000', 0, 0, 100, 100);    // 10 000 mm² → bottom
    const blue = rectPath('blue', '#0000ff', 200, 0, 50, 40);  // 2 000 mm² → upper
    const mark = regmark('mark');
    useEditor.getState().setCutPaths([red, blue, mark]);

    expect(applyLayerTrap(t, 0.5)).toBe(1);

    const paths = useEditor.getState().cutPaths;
    expect(paths).toHaveLength(3);
    // Order preserved; bottom colour + regmark untouched (same references).
    expect(paths[0]).toBe(red);
    expect(paths[2]).toBe(mark);

    // The upper ring expanded: min x moved outward by ≥ trap − 0.05 …
    expect(minX(paths[1].points)).toBeLessThanOrEqual(200 - 0.5 + 0.05);
    expect(minX(paths[1].points)).toBeLessThan(200);
    // … and round joins tessellated the corners (5 vertices → dozens).
    expect(paths[1].points.length).toBeGreaterThan(blue.points.length);
    // Same identity otherwise — colour, kind, closure all survive.
    expect(paths[1]).toMatchObject({ id: 'blue', color: '#0000ff', kind: 'outline', closed: true });

    expect(pushHistory).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith('1 paths trapped · +0.5 mm', { title: 'Trap layers' });
  });

  it('warns and returns 0 for a single-colour job, leaving the store untouched', () => {
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const warn = vi.spyOn(toast, 'warn').mockImplementation(() => '');

    const red = rectPath('red', '#ff0000', 0, 0, 100, 100);
    const mark = regmark('mark');
    useEditor.getState().setCutPaths([red, mark]);

    expect(applyLayerTrap(t, 0.5)).toBe(0);
    expect(useEditor.getState().cutPaths).toEqual([red, mark]);
    expect(pushHistory).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Trap needs at least two colour layers.', { title: 'Trap layers' });
  });

  it('dryRun returns the same count a real run would, touching neither store nor history', () => {
    const pushHistory = vi.spyOn(canvasEngine, 'pushHistory').mockImplementation(() => {});
    const success = vi.spyOn(toast, 'success').mockImplementation(() => '');
    const warn = vi.spyOn(toast, 'warn').mockImplementation(() => '');

    const red = rectPath('red', '#ff0000', 0, 0, 100, 100);    // 10 000 mm² → bottom
    const blue = rectPath('blue', '#0000ff', 200, 0, 50, 40);  // 2 000 mm² → upper
    const mark = regmark('mark');
    useEditor.getState().setCutPaths([red, blue, mark]);
    // Spy installed AFTER seeding so the setup write doesn't count.
    const setCutPaths = vi.spyOn(useEditor.getState(), 'setCutPaths');

    expect(applyLayerTrap(t, 0.5, { dryRun: true })).toBe(1);
    // Completely inert: no store write, no history step, no toast at all.
    expect(setCutPaths).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    // The store still holds the exact input objects.
    expect(useEditor.getState().cutPaths).toEqual([red, blue, mark]);

    // A real run on the same job still mutates (count matches the dry-run).
    expect(applyLayerTrap(t, 0.5)).toBe(1);
    expect(setCutPaths).toHaveBeenCalledOnce();
    expect(pushHistory).toHaveBeenCalledOnce();
    const paths = useEditor.getState().cutPaths;
    expect(paths[1]!.points.length).toBeGreaterThan(blue.points.length); // trapped
    expect(paths[0]).toBe(red);   // bottom untouched
    expect(paths[2]).toBe(mark);  // regmark untouched
  });

  it('dryRun is silent for jobs the real run would warn about (single colour, nothing trappable)', () => {
    const warn = vi.spyOn(toast, 'warn').mockImplementation(() => '');

    // Single colour: real run warns, dry run just reports 0.
    const red = rectPath('red', '#ff0000', 0, 0, 100, 100);
    useEditor.getState().setCutPaths([red, regmark('mark')]);
    expect(applyLayerTrap(t, 0.5, { dryRun: true })).toBe(0);
    expect(warn).not.toHaveBeenCalled();

    // Two colours but the upper layer holds only an OPEN path — nothing
    // trappable, so both the dry run and a real run report 0.
    const openBlue: CutPath = { id: 'blue-open', closed: false, kind: 'outline', color: '#0000ff', points: [[200, 0], [250, 0]] };
    const mark = regmark('mark');
    useEditor.getState().setCutPaths([red, openBlue, mark]);
    expect(applyLayerTrap(t, 0.5, { dryRun: true })).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    expect(useEditor.getState().cutPaths).toEqual([red, openBlue, mark]);
  });
});
