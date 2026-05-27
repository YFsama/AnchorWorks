/**
 * Pure geometry helpers for the scissor-style eraser.
 *
 * Two-stage hit-test against an eraser circle (centre + radius, both in
 * canvas/document coords):
 *   1. Coarse — bbox vs circle, cheap rejection.
 *   2. Fine   — for path / polyline / polygon / line, sample points along the
 *               object's outline (subdividing Q/C Bezier curves) and check
 *               each sample against the circle.
 *   Groups recurse into children.
 *
 * Lives outside canvasEngine.ts because none of these functions touch the
 * canvas reference, the editor store, or the DOM — they're pure math on
 * Fabric Object structure (task #20 split). canvasEngine's `eraseAt` consumes
 * `eraserHitsObject` directly; the others are exported for completeness +
 * unit-test reach.
 */

import type * as fabric from 'fabric';

export type Pt = { x: number; y: number };

/** Stage 1: cheap rejection. True iff the object's axis-aligned bounding box
 *  intersects the eraser circle at all. */
export function bboxIntersectsCircle(o: fabric.Object, sp: Pt, r: number): boolean {
  const b = o.getBoundingRect();
  const cx = Math.max(b.left, Math.min(sp.x, b.left + b.width));
  const cy = Math.max(b.top, Math.min(sp.y, b.top + b.height));
  const dx = sp.x - cx;
  const dy = sp.y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Two-stage hit-test entry point. Composes bbox rejection with geometry
 * sampling for path-like shapes, and recursion for groups / active
 * selections.
 */
export function eraserHitsObject(o: fabric.Object, sp: Pt, r: number): boolean {
  // Stage 1 — bbox coarse filter. Anything that doesn't pass this can't
  // possibly intersect the eraser circle, regardless of internal geometry.
  if (!bboxIntersectsCircle(o, sp, r)) return false;

  // Stage 2 — geometry-aware test only for shape types where the bbox can
  // dramatically over-state "where ink actually is" (long curves through
  // empty space). Solid primitives (Rect / Circle / Ellipse / Image / Text)
  // fill or closely match their bbox, so the bbox test from stage 1 is
  // already correct.
  switch (o.type) {
    case 'path':
    case 'polyline':
    case 'polygon':
    case 'line':
      return geometryNearPoint(o, sp, r);
    case 'group':
    case 'activeselection': {
      // Recurse: a group is "hit" only if at least one child is hit. We
      // expand the child's coords to canvas space (Fabric stores children in
      // group-local coords until the group is broken apart).
      const grp = o as unknown as { _objects?: fabric.Object[] };
      const children = grp._objects ?? [];
      for (const c of children) {
        if (eraserHitsObject(c, sp, r)) return true;
      }
      // If no child hit detected (e.g. a primitive-only group), fall back to
      // the bbox result we already passed — better to be conservative on
      // exotic shapes than skip a legitimate hit.
      return children.length === 0;
    }
    default:
      return true;
  }
}

/**
 * True if any sampled point on the object's vector outline lies within `r`
 * of `sp`. Sampling density is fixed; sufficient for an interactive eraser
 * where the user can scrub the cursor.
 */
export function geometryNearPoint(o: fabric.Object, sp: Pt, r: number): boolean {
  const samples = sampleObjectPath(o);
  const r2 = r * r;
  for (const p of samples) {
    const dx = p.x - sp.x;
    const dy = p.y - sp.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

/** Sample points along the outline of a path-like object, transformed to
 *  canvas (document) coordinates. */
export function sampleObjectPath(o: fabric.Object): Pt[] {
  const m = o.calcTransformMatrix();
  // Object-local origin offset — Fabric stores `path` / `points` in local
  // coords relative to the object's own (-width/2, -height/2) corner when
  // originX/Y is 'center' (the Fabric default).
  const ox = -(o.width ?? 0) / 2;
  const oy = -(o.height ?? 0) / 2;
  const apply = (lx: number, ly: number): Pt => {
    // pathOffset is Fabric's internal correction to align the path's bounding
    // box origin with the object's origin. Subtract it so our sampled points
    // sit on the visible stroke.
    const po = (o as unknown as { pathOffset?: { x: number; y: number } }).pathOffset ?? { x: 0, y: 0 };
    const x = lx + ox - po.x;
    const y = ly + oy - po.y;
    return {
      x: m[0] * x + m[2] * y + m[4],
      y: m[1] * x + m[3] * y + m[5],
    };
  };
  const out: Pt[] = [];
  if (o.type === 'line') {
    const ln = o as unknown as { x1: number; y1: number; x2: number; y2: number };
    // Line stores absolute coords in object-local space; the bounding-box
    // origin walk in `apply` would double-count. Sample a fixed number of
    // points between endpoints and transform individually.
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const lx = ln.x1 + (ln.x2 - ln.x1) * t;
      const ly = ln.y1 + (ln.y2 - ln.y1) * t;
      // For Line we still pass through the object transform.
      out.push({
        x: m[0] * lx + m[2] * ly + m[4],
        y: m[1] * lx + m[3] * ly + m[5],
      });
    }
    return out;
  }
  if (o.type === 'polyline' || o.type === 'polygon') {
    const pts = (o as unknown as { points?: Array<{ x: number; y: number }> }).points ?? [];
    if (pts.length < 2) return [];
    const STEP_PER_SEG = 6;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      for (let k = 0; k < STEP_PER_SEG; k++) {
        const t = k / STEP_PER_SEG;
        out.push(apply(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
      }
    }
    out.push(apply(pts[pts.length - 1].x, pts[pts.length - 1].y));
    if (o.type === 'polygon' && pts.length > 2) {
      const a = pts[pts.length - 1], b = pts[0];
      for (let k = 0; k < STEP_PER_SEG; k++) {
        const t = k / STEP_PER_SEG;
        out.push(apply(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
      }
    }
    return out;
  }
  // type === 'path'
  const cmds = (o as unknown as { path?: Array<[string, ...number[]]> }).path ?? [];
  // Step granularity for curve subdivision. 8 samples per Q/C is enough to
  // catch a finger-thick eraser scrubbing across a typical stroke.
  const CURVE_STEPS = 8;
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;
  for (const cmd of cmds) {
    const op = cmd[0];
    if (op === 'M') {
      cx = cmd[1] as number;
      cy = cmd[2] as number;
      startX = cx;
      startY = cy;
      out.push(apply(cx, cy));
    } else if (op === 'L') {
      const x = cmd[1] as number, y = cmd[2] as number;
      // Interpolate to densify long straight segments.
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        out.push(apply(cx + (x - cx) * t, cy + (y - cy) * t));
      }
      cx = x; cy = y;
    } else if (op === 'Q') {
      // Quadratic Bezier: B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
      const c1x = cmd[1] as number, c1y = cmd[2] as number;
      const x = cmd[3] as number, y = cmd[4] as number;
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const mt = 1 - t;
        const bx = mt * mt * cx + 2 * mt * t * c1x + t * t * x;
        const by = mt * mt * cy + 2 * mt * t * c1y + t * t * y;
        out.push(apply(bx, by));
      }
      cx = x; cy = y;
    } else if (op === 'C') {
      // Cubic Bezier: B(t) = (1-t)³·P0 + 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³·P3
      const c1x = cmd[1] as number, c1y = cmd[2] as number;
      const c2x = cmd[3] as number, c2y = cmd[4] as number;
      const x = cmd[5] as number, y = cmd[6] as number;
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const mt = 1 - t;
        const bx = mt * mt * mt * cx + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * x;
        const by = mt * mt * mt * cy + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * y;
        out.push(apply(bx, by));
      }
      cx = x; cy = y;
    } else if (op === 'Z' || op === 'z') {
      // Close path — segment from current back to subpath start.
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        out.push(apply(cx + (startX - cx) * t, cy + (startY - cy) * t));
      }
      cx = startX; cy = startY;
    }
    // Other commands (H, V, S, T, A) are rarely emitted by Fabric — fall
    // through silently; the bbox stage 1 stays as a safety net.
  }
  return out;
}
