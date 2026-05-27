import { describe, it, expect } from 'vitest';
import {
  collectAnchorsFor,
  collectMovingAnchors,
  findBestAnchorSnap,
  ANCHOR_CANDIDATE_LIMIT,
} from '../anchorSnap';

/**
 * Minimal stub object that satisfies the slice of fabric.FabricObject the
 * collector functions actually read. We only test the non-path branch here
 * (which uses getBoundingRect only); the path branch needs a real fabric.Path
 * to compute its transform matrix and is exercised via the engine-level
 * integration when running the app.
 */
function makeStub(left: number, top: number, width: number, height: number) {
  return {
    type: 'rect',
    getBoundingRect: () => ({ left, top, width, height }),
  } as unknown as Parameters<typeof collectAnchorsFor>[0];
}

describe('collectAnchorsFor (rect/non-path)', () => {
  it('produces 9 anchors: 4 corners + 4 midpoints + center', () => {
    const a = collectAnchorsFor(makeStub(10, 20, 100, 50));
    expect(a).toHaveLength(9);
  });

  it('includes the four corners', () => {
    const a = collectAnchorsFor(makeStub(0, 0, 10, 10));
    expect(a).toContainEqual({ x: 0, y: 0 });
    expect(a).toContainEqual({ x: 10, y: 0 });
    expect(a).toContainEqual({ x: 0, y: 10 });
    expect(a).toContainEqual({ x: 10, y: 10 });
  });

  it('includes the edge midpoints and bbox center', () => {
    const a = collectAnchorsFor(makeStub(0, 0, 10, 10));
    expect(a).toContainEqual({ x: 5, y: 0 }); // top midpoint
    expect(a).toContainEqual({ x: 5, y: 10 }); // bottom midpoint
    expect(a).toContainEqual({ x: 0, y: 5 }); // left midpoint
    expect(a).toContainEqual({ x: 10, y: 5 }); // right midpoint
    expect(a).toContainEqual({ x: 5, y: 5 }); // center
  });
});

describe('collectMovingAnchors', () => {
  it('returns 9 bbox-derived anchors regardless of object type', () => {
    const a = collectMovingAnchors(makeStub(0, 0, 20, 30));
    expect(a).toHaveLength(9);
  });
});

describe('findBestAnchorSnap', () => {
  it('returns null when no pair is within tolerance', () => {
    const r = findBestAnchorSnap(
      [{ x: 0, y: 0 }],
      [{ x: 20, y: 20 }],
      6,
    );
    expect(r).toBeNull();
  });

  it('snaps moving anchor exactly onto candidate when within tolerance', () => {
    const r = findBestAnchorSnap(
      [{ x: 100, y: 50 }],
      [{ x: 103, y: 52 }],
      6,
    );
    expect(r).not.toBeNull();
    expect(r!.dx).toBe(3);
    expect(r!.dy).toBe(2);
    expect(r!.hit).toEqual({ x: 103, y: 52 });
  });

  it('picks the closest pair when multiple are within tolerance', () => {
    const r = findBestAnchorSnap(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      [
        { x: 1, y: 1 }, // dist² = 2 from (0,0)
        { x: 11, y: 14 }, // dist² = 17 from (10,10)
      ],
      6,
    );
    expect(r).not.toBeNull();
    expect(r!.hit).toEqual({ x: 1, y: 1 });
  });

  it('respects per-axis tolerance (Chebyshev gate)', () => {
    // dx = 7 (>6) but dy = 0 — should NOT snap.
    const r = findBestAnchorSnap(
      [{ x: 0, y: 0 }],
      [{ x: 7, y: 0 }],
      6,
    );
    expect(r).toBeNull();
  });

  it('zero tolerance only matches exact overlap', () => {
    expect(findBestAnchorSnap([{ x: 5, y: 5 }], [{ x: 5, y: 5 }], 0)).not.toBeNull();
    expect(findBestAnchorSnap([{ x: 5, y: 5 }], [{ x: 6, y: 5 }], 0)).toBeNull();
  });
});

describe('ANCHOR_CANDIDATE_LIMIT', () => {
  it('is a sensible cap for the per-mousemove bail-out', () => {
    // Per spec: ~1000 points before we bail out cleanly. Keep this as a
    // regression guard so nobody silently lowers it into the "barely useful"
    // range or raises it past the perf envelope.
    expect(ANCHOR_CANDIDATE_LIMIT).toBeGreaterThanOrEqual(500);
    expect(ANCHOR_CANDIDATE_LIMIT).toBeLessThanOrEqual(5000);
  });
});
