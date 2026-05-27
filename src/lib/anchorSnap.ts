/**
 * Anchor-point snapping.
 *
 * Builds a set of "anchor" target points from every candidate object on the
 * canvas and snaps the moving object's own anchor points (bbox corners +
 * midpoints + center) to the nearest match within a small tolerance.
 *
 * Candidate generation:
 *  - Path     : every command endpoint (transformed into canvas space).
 *  - others   : 4 bbox corners + 4 edge midpoints + bbox center.
 *
 * Used by `canvasEngine.onObjectMoving` as an additive snap layer that runs
 * after grid + smart-edge guides. When this fires, the engine renders a small
 * cross-hair marker at the snap target via the Guide channel (a zero-length
 * "point" guide).
 */

import * as fabric from 'fabric';

type FabricObject = fabric.FabricObject;

export interface Anchor {
  x: number;
  y: number;
}

// Hard cap on candidate-anchor count; if exceeded we bail out without snapping.
// Keeps the per-mousemove cost bounded on huge documents.
export const ANCHOR_CANDIDATE_LIMIT = 1000;

/**
 * Convert a path-local (raw) command point to absolute canvas coordinates,
 * mirroring `pathPointToCanvas` in pathEdit.ts but kept local so we don't
 * depend on the path-edit module (which manages stateful overlay handles).
 */
function pathPointToCanvas(path: fabric.Path, x: number, y: number): Anchor {
  const m = path.calcTransformMatrix();
  const px = x - path.pathOffset.x;
  const py = y - path.pathOffset.y;
  return {
    x: m[0] * px + m[2] * py + m[4],
    y: m[1] * px + m[3] * py + m[5],
  };
}

/**
 * Index into a path command of the (x,y) end-point. Mirrors
 * pathEdit.commandAnchor — duplicated rather than imported to keep modules
 * decoupled and to avoid pulling overlay-handle code in here.
 */
function commandEndPoint(cmd: (string | number)[]): { xi: number; yi: number } | null {
  const c = cmd[0] as string;
  switch (c) {
    case 'M':
    case 'L':
    case 'T':
      return { xi: 1, yi: 2 };
    case 'Q':
      return { xi: 3, yi: 4 };
    case 'C':
      return { xi: 5, yi: 6 };
    case 'S':
      return { xi: 3, yi: 4 };
    case 'A':
      return { xi: 6, yi: 7 };
    default:
      return null;
  }
}

/**
 * Collect all anchor points for a single object.
 *
 * For paths we walk every command's end-point; for other geometry we use the
 * axis-aligned bounding rect (4 corners + 4 edge midpoints + 1 center = 9 pts,
 * well under the 12-per-object budget stated in the spec).
 */
export function collectAnchorsFor(obj: FabricObject): Anchor[] {
  const out: Anchor[] = [];
  // Path-specific: walk every drawn command end-point. This catches polygon
  // vertices that have already been flattened to a Path, as well as authored
  // path data, where bbox corners would miss every interior anchor.
  if (obj.type === 'path') {
    const path = obj as fabric.Path;
    const cmds = path.path as unknown as (string | number)[][] | undefined;
    if (cmds) {
      for (const cmd of cmds) {
        const ep = commandEndPoint(cmd);
        if (!ep) continue;
        const x = cmd[ep.xi] as number;
        const y = cmd[ep.yi] as number;
        if (typeof x === 'number' && typeof y === 'number') {
          out.push(pathPointToCanvas(path, x, y));
        }
      }
    }
  }

  const b = obj.getBoundingRect();
  const l = b.left;
  const t = b.top;
  const r = b.left + b.width;
  const btm = b.top + b.height;
  const cx = l + b.width / 2;
  const cy = t + b.height / 2;
  // 4 corners
  out.push({ x: l, y: t });
  out.push({ x: r, y: t });
  out.push({ x: l, y: btm });
  out.push({ x: r, y: btm });
  // 4 edge midpoints
  out.push({ x: cx, y: t });
  out.push({ x: cx, y: btm });
  out.push({ x: l, y: cy });
  out.push({ x: r, y: cy });
  // bbox center
  out.push({ x: cx, y: cy });
  return out;
}

/**
 * Anchor points of the *moving* object that we're allowed to snap. We
 * intentionally use the bbox corner + midpoint + center set (no path interior
 * points) — snapping interior anchors of the moving object to other objects'
 * anchors makes the drag feel unpredictable.
 */
export function collectMovingAnchors(obj: FabricObject): Anchor[] {
  const out: Anchor[] = [];
  const b = obj.getBoundingRect();
  const l = b.left;
  const t = b.top;
  const r = b.left + b.width;
  const btm = b.top + b.height;
  const cx = l + b.width / 2;
  const cy = t + b.height / 2;
  out.push({ x: l, y: t });
  out.push({ x: r, y: t });
  out.push({ x: l, y: btm });
  out.push({ x: r, y: btm });
  out.push({ x: cx, y: t });
  out.push({ x: cx, y: btm });
  out.push({ x: l, y: cy });
  out.push({ x: r, y: cy });
  out.push({ x: cx, y: cy });
  return out;
}

export interface AnchorSnapResult {
  dx: number;
  dy: number;
  /** Snap target point in scene coords (for marker rendering). */
  hit: Anchor;
}

/**
 * Find the best snap (smallest displacement) that lands ANY moving anchor on
 * ANY candidate anchor within `tolerance` scene units. Returns null if no
 * pair is within tolerance.
 *
 * Tolerance is measured per-axis (Chebyshev-like): we accept a hit if both
 * |dx| ≤ tol AND |dy| ≤ tol. That matches the "small cross-hair" UX — the
 * snap fires when the moving anchor enters a square zone around the target.
 *
 * The displacement returned (dx, dy) is what to add to the moving object's
 * position so that the chosen moving anchor lands EXACTLY on the chosen
 * candidate anchor.
 */
export function findBestAnchorSnap(
  movingAnchors: Anchor[],
  candidateAnchors: Anchor[],
  tolerance: number,
): AnchorSnapResult | null {
  let best: AnchorSnapResult | null = null;
  let bestDist = Infinity;
  for (const ma of movingAnchors) {
    for (const ca of candidateAnchors) {
      const dx = ca.x - ma.x;
      const dy = ca.y - ma.y;
      if (Math.abs(dx) > tolerance || Math.abs(dy) > tolerance) continue;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = { dx, dy, hit: { x: ca.x, y: ca.y } };
      }
    }
  }
  return best;
}
