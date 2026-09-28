/**
 * Path direct-select editor tests.
 *
 * The mouse-driven interactions (drag anchors, alt-delete, double-click
 * smooth↔corner, click-on-path add-anchor) are canvas-event glue and are not
 * unit-tested here. What IS pinned:
 *
 *  - subdivideAllSegments: every drawable L/C/Q segment gains a midpoint
 *    anchor (De Casteljau split for cubics — the curve is preserved
 *    exactly; Q is promoted to two C's), M and Z are left alone, and the
 *    returned count matches the added anchors.
 *  - enterPathEdit / exitPathEdit lifecycle: handle overlay objects are
 *    added and later removed, one anchor circle per M/L anchor plus two
 *    tangent diamonds per C (one per Q), and the session state
 *    (isEditingPath / getEditingPath / selectedAnchorCount) tracks it.
 *  - averageSelectedAnchors is a guarded no-op (0) without a live session
 *    or a multi-anchor selection.
 */
import * as fabric from 'fabric';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  averageSelectedAnchors,
  enterPathEdit,
  exitPathEdit,
  getEditingPath,
  isEditingPath,
  selectedAnchorCount,
  subdivideAllSegments,
} from '../pathEdit';

type Cmd = [string, ...number[]];

const OPTS = { left: 0, top: 0, fill: '', stroke: '#000', strokeWidth: 0 } as const;

/** Fake canvas covering the surface pathEdit touches. */
function makeCanvas() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    bringObjectToFront: vi.fn(),
    sendObjectToBack: vi.fn(),
    requestRenderAll: vi.fn(),
    getScenePoint: vi.fn(() => ({ x: 0, y: 0 })),
    fire: vi.fn(),
  };
}

let lastCanvas: ReturnType<typeof makeCanvas> | null = null;

afterEach(() => {
  if (isEditingPath() && lastCanvas) exitPathEdit(lastCanvas as unknown as fabric.Canvas);
  lastCanvas = null;
  vi.restoreAllMocks();
});

function anchorsOf(p: fabric.Path): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (const seg of p.path as unknown as Cmd[]) {
    const c = String(seg[0]).toUpperCase();
    if (c === 'M' || c === 'L') pts.push([seg[1] ?? 0, seg[2] ?? 0]);
  }
  return pts;
}

/* --------------------------- subdivideAllSegments --------------------------- */

describe('subdivideAllSegments', () => {
  it('adds a midpoint anchor to every L segment of a square (M and Z untouched)', () => {
    const p = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', OPTS);
    const before = (p.path as unknown as Cmd[]).length;
    expect(subdivideAllSegments(p)).toBe(3);
    const cmds = p.path as unknown as Cmd[];
    expect(cmds).toHaveLength(before + 3);
    expect(cmds[0][0]).toBe('M');
    expect(cmds[cmds.length - 1][0]).toBe('Z');
    // New midpoints sit on the original edges. Note the Z closing edge
    // (0,100)→(0,0) is NOT subdivided — Z is not a drawable L/C/Q command.
    const pts = anchorsOf(p);
    expect(pts).toContainEqual([50, 0]);
    expect(pts).toContainEqual([100, 50]);
    expect(pts).toContainEqual([50, 100]);
  });

  it('splits a cubic exactly at its parametric midpoint (De Casteljau)', () => {
    // Arch: at t=0.5 the curve is at (50, 75).
    const p = new fabric.Path('M 0 0 C 0 100 100 100 100 0', OPTS);
    expect(subdivideAllSegments(p)).toBe(1);
    const cmds = p.path as unknown as Cmd[];
    expect(cmds).toHaveLength(3); // M + C + C
    expect(cmds[1][0]).toBe('C');
    expect(cmds[2][0]).toBe('C');
    // The joint between the two halves is the exact t=0.5 curve point.
    expect(cmds[1][5]).toBeCloseTo(50, 6);
    expect(cmds[1][6]).toBeCloseTo(75, 6);
    // And the second half ends where the original did.
    expect(cmds[2][5]).toBeCloseTo(100, 6);
    expect(cmds[2][6]).toBeCloseTo(0, 6);
  });

  it('promotes a Q segment to two C commands through the exact quad midpoint', () => {
    // Quadratic midpoint at t=0.5 = (50, 50).
    const p = new fabric.Path('M 0 0 Q 50 100 100 0', OPTS);
    expect(subdivideAllSegments(p)).toBe(1);
    const cmds = p.path as unknown as Cmd[];
    expect(cmds).toHaveLength(3);
    expect(cmds[1][0]).toBe('C');
    expect(cmds[2][0]).toBe('C');
    expect(cmds[1][5]).toBeCloseTo(50, 6);
    expect(cmds[1][6]).toBeCloseTo(50, 6);
  });

  it('is repeatable: a second pass subdivides the new halves again', () => {
    const p = new fabric.Path('M 0 0 L 100 0 L 100 100', OPTS);
    expect(subdivideAllSegments(p)).toBe(2); // 2 segments → 2 midpoints
    expect(subdivideAllSegments(p)).toBe(4); // now 4 segments → 4 midpoints
    expect((p.path as unknown as Cmd[])).toHaveLength(3 + 2 + 4);
  });

  it('leaves a bare M/Z shell untouched', () => {
    const p = new fabric.Path('M 0 0 Z', OPTS);
    expect(subdivideAllSegments(p)).toBe(0);
    expect((p.path as unknown as Cmd[]).map((c) => c[0])).toEqual(['M', 'Z']);
  });
});

/* ----------------------------- edit session state --------------------------- */

describe('enterPathEdit / exitPathEdit', () => {
  it('adds one anchor handle per M/L anchor and none for a poly-line-only path', () => {
    const canvas = makeCanvas();
    lastCanvas = canvas;
    const p = new fabric.Path('M 0 0 L 100 0 L 100 100 L 0 100 Z', OPTS);

    expect(isEditingPath()).toBe(false);
    enterPathEdit(canvas as unknown as fabric.Canvas, p);

    expect(isEditingPath()).toBe(true);
    expect(getEditingPath()).toBe(p);
    expect(selectedAnchorCount()).toBe(0);
    // 4 anchors (M + 3 L), no C/Q → no tangent diamonds.
    expect(canvas.add).toHaveBeenCalledTimes(4);
    const handles = canvas.add.mock.calls.map((call) => call[0] as fabric.FabricObject);
    for (const h of handles) expect(h).toBeInstanceOf(fabric.Circle);
    // Handles are overlay-only: never exported, not selectable.
    for (const h of handles) {
      expect(h.excludeFromExport).toBe(true);
      expect(h.selectable).toBe(false);
    }
  });

  it('adds two tangent diamonds per C command and one per Q command', () => {
    const canvas = makeCanvas();
    lastCanvas = canvas;
    const p = new fabric.Path('M 0 0 C 10 10 20 10 30 0 Q 40 10 50 0', OPTS);
    enterPathEdit(canvas as unknown as fabric.Canvas, p);
    // Anchors: M, C-end, Q-end = 3 circles. Tangents: 2 (C) + 1 (Q) = 3 rects.
    const handles = canvas.add.mock.calls.map((call) => call[0] as fabric.FabricObject);
    const circles = handles.filter((h) => h instanceof fabric.Circle);
    const rects = handles.filter((h) => h instanceof fabric.Rect);
    expect(circles).toHaveLength(3);
    expect(rects).toHaveLength(3);
    // The tangent diamonds are rotated 45° (diamond shape).
    for (const r of rects) expect(r.angle).toBe(45);
  });

  it('exitPathEdit removes every handle and clears the session', () => {
    const canvas = makeCanvas();
    lastCanvas = canvas;
    const p = new fabric.Path('M 0 0 L 50 0 L 50 50 Z', OPTS);
    enterPathEdit(canvas as unknown as fabric.Canvas, p);
    const added = canvas.add.mock.calls.length;
    expect(added).toBeGreaterThan(0);

    exitPathEdit(canvas as unknown as fabric.Canvas);
    expect(isEditingPath()).toBe(false);
    expect(getEditingPath()).toBeNull();
    const removed = canvas.remove.mock.calls.map((call) => call[0]);
    expect(removed).toHaveLength(added);
    // Re-entering after exit starts a fresh session without duplicates.
    enterPathEdit(canvas as unknown as fabric.Canvas, p);
    expect(isEditingPath()).toBe(true);
  });

  it('entering a second path exits the first session first', () => {
    const canvas = makeCanvas();
    lastCanvas = canvas;
    const p1 = new fabric.Path('M 0 0 L 10 0', OPTS);
    const p2 = new fabric.Path('M 0 0 L 10 0', OPTS);
    enterPathEdit(canvas as unknown as fabric.Canvas, p1);
    enterPathEdit(canvas as unknown as fabric.Canvas, p2);
    expect(getEditingPath()).toBe(p2);
    // p1's handles were removed when the session switched.
    const removedTargets = canvas.remove.mock.calls.map((c) => c[0]);
    expect(removedTargets.length).toBeGreaterThanOrEqual(2); // p1's two handles
  });
});

/* ------------------------------- guard rails -------------------------------- */

describe('averageSelectedAnchors guard', () => {
  it('returns 0 without an editing session', () => {
    expect(averageSelectedAnchors('x')).toBe(0);
    expect(averageSelectedAnchors('both')).toBe(0);
  });

  it('returns 0 with a session but fewer than two selected anchors', () => {
    const canvas = makeCanvas();
    lastCanvas = canvas;
    const p = new fabric.Path('M 0 0 L 100 0 L 100 100 Z', OPTS);
    enterPathEdit(canvas as unknown as fabric.Canvas, p);
    expect(selectedAnchorCount()).toBe(0);
    expect(averageSelectedAnchors('x')).toBe(0);
  });
});

/* NOTE: not covered here (interaction glue behind canvas mouse events):
 * handle dragging (single + multi-anchor), shift-click anchor selection,
 * alt-click anchor deletion, double-click smooth↔corner toggle, and the
 * click-on-path add-anchor gesture (installAddAnchorListener). */
