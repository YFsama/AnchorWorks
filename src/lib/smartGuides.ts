/**
 * Smart guides + grid snap + anchor-point snap layer.
 *
 * The whole "moving an object pulls it into alignment with siblings" UX —
 * three independent layers stacked on the `fabric:object:moving` event:
 *   1. Grid snap (when snapEnabled && gridVisible) — round target's left/top
 *      to the nearest grid line.
 *   2. Edge-align smart guides — for every non-self candidate object,
 *      compare each of its three vertical edges (left, centerX, right) and
 *      three horizontal edges (top, centerY, bottom) against the target's
 *      same edges. When within `SMART_GUIDE_TOLERANCE` scene-pixels, snap
 *      and emit a visible blue guide line spanning both objects.
 *   3. Anchor-point snap — additionally, try landing any of the moving
 *      object's anchors (corners / midpoints / center / path-command
 *      end-points for Paths) onto any candidate's anchors. Tolerance is
 *      scene-pixel, divided by zoom so the user-visible snap zone stays
 *      ≤ 6 screen-pixels at any magnification.
 *
 * Extracted from canvasEngine.ts (task #20). canvasEngine wires the
 * `object:moving` event to `applySmartSnap` inside initCanvas; this module
 * owns the algorithm + its two tunable constants.
 */

import type * as fabric from 'fabric';
import {
  collectAnchorsFor,
  collectMovingAnchors,
  findBestAnchorSnap,
  ANCHOR_CANDIDATE_LIMIT,
  type Anchor,
} from './anchorSnap';
import { emitGuides, type Guide } from './canvasEvents';
import { useEditor } from '../store/editor';

type FabricObject = fabric.FabricObject;

/** Edge-align tolerance in scene coords. */
const SMART_GUIDE_TOLERANCE = 6;
/** Anchor-snap tolerance in scene coords. Divided by zoom in the algorithm
 *  so the user-visible snap zone stays roughly screen-constant. */
export const ANCHOR_SNAP_TOLERANCE = 6;

/**
 * Apply grid snap + smart guides + anchor-point snap to a moving target.
 * Called from the canvas `object:moving` event handler with the live canvas
 * and the target object. Mutates `target` (left/top) and emits guides for
 * the GridOverlay component to paint.
 */
export function applySmartSnap(canvas: fabric.Canvas, target: FabricObject): void {
  const st = useEditor.getState();

  // Grid snap — round to nearest gridline. Cheapest layer; fires before any
  // candidate-object work.
  if (st.snapEnabled && st.gridVisible) {
    const g = st.gridSize || 1;
    const left = target.left ?? 0;
    const top = target.top ?? 0;
    target.set({ left: Math.round(left / g) * g, top: Math.round(top / g) * g });
  }

  // User guides — snap the nearest edge/centre of the target to a ruler-dragged
  // guide line (under the same Smart Guides toggle as object snapping).
  if (st.smartGuidesEnabled && st.userGuides.length > 0) {
    const tb = target.getBoundingRect();
    const xs = [tb.left, tb.left + tb.width / 2, tb.left + tb.width];
    const ys = [tb.top, tb.top + tb.height / 2, tb.top + tb.height];
    let bestX: number | null = null, bestXd = SMART_GUIDE_TOLERANCE;
    let bestY: number | null = null, bestYd = SMART_GUIDE_TOLERANCE;
    for (const g of st.userGuides) {
      if (g.axis === 'v') {
        for (const x of xs) { const d = g.pos - x; if (Math.abs(d) <= bestXd) { bestXd = Math.abs(d); bestX = d; } }
      } else {
        for (const y of ys) { const d = g.pos - y; if (Math.abs(d) <= bestYd) { bestYd = Math.abs(d); bestY = d; } }
      }
    }
    if (bestX !== null) target.set({ left: (target.left ?? 0) + bestX });
    if (bestY !== null) target.set({ top: (target.top ?? 0) + bestY });
  }

  // Artboard frame — snap the target's edges/centre to the first artboard's
  // left/centre/right + top/centre/bottom, so centring or edge-aligning to the
  // page snaps cleanly. Snapped lines are recorded for the visible overlay.
  const artGuides: Guide[] = [];
  if (st.smartGuidesEnabled && st.artboards.length > 0) {
    const a = st.artboards[0];
    const ab = target.getBoundingRect();
    const txs = [ab.left, ab.left + ab.width / 2, ab.left + ab.width];
    const tys = [ab.top, ab.top + ab.height / 2, ab.top + ab.height];
    const axs = [a.x, a.x + a.width / 2, a.x + a.width];
    const ays = [a.y, a.y + a.height / 2, a.y + a.height];
    let bx: number | null = null, bxd = SMART_GUIDE_TOLERANCE, bestAx = 0;
    let by: number | null = null, byd = SMART_GUIDE_TOLERANCE, bestAy = 0;
    for (const ax of axs) for (const tx of txs) { const d = ax - tx; if (Math.abs(d) <= bxd) { bxd = Math.abs(d); bx = d; bestAx = ax; } }
    for (const ay of ays) for (const ty of tys) { const d = ay - ty; if (Math.abs(d) <= byd) { byd = Math.abs(d); by = d; bestAy = ay; } }
    if (bx !== null) { target.set({ left: (target.left ?? 0) + bx }); artGuides.push({ x1: bestAx, y1: a.y, x2: bestAx, y2: a.y + a.height, kind: 'edge' }); }
    if (by !== null) { target.set({ top: (target.top ?? 0) + by }); artGuides.push({ x1: a.x, y1: bestAy, x2: a.x + a.width, y2: bestAy, kind: 'edge' }); }
  }

  if (!st.smartGuidesEnabled) {
    emitGuides([]);
    return;
  }

  // Build the candidate set: every non-overlay non-self object that isn't
  // part of the active multi-selection (we don't want a group dragging its
  // own children to "snap" to each of those children).
  const others = canvas.getObjects().filter(o => o !== target && !(o as { excludeFromExport?: boolean }).excludeFromExport);
  const active = canvas.getActiveObject();
  let activeMembers: FabricObject[] = [];
  if (active && active.type === 'activeselection') {
    activeMembers = (active as fabric.ActiveSelection).getObjects() as FabricObject[];
  }
  const candidates = others.filter(o => !activeMembers.includes(o));

  const tb = target.getBoundingRect();
  const tEdges = {
    left: tb.left,
    centerX: tb.left + tb.width / 2,
    right: tb.left + tb.width,
    top: tb.top,
    centerY: tb.top + tb.height / 2,
    bottom: tb.top + tb.height,
  };

  let bestDX: { delta: number; value: number; otherValue: number } | null = null;
  let bestDY: { delta: number; value: number; otherValue: number } | null = null;

  const guides: Guide[] = [...artGuides];

  for (const o of candidates) {
    const b = o.getBoundingRect();
    const xs = [b.left, b.left + b.width / 2, b.left + b.width];
    const ys = [b.top, b.top + b.height / 2, b.top + b.height];
    const txs = [tEdges.left, tEdges.centerX, tEdges.right];
    const tys = [tEdges.top, tEdges.centerY, tEdges.bottom];

    for (const ox of xs) {
      for (const tx of txs) {
        const d = ox - tx;
        if (Math.abs(d) <= SMART_GUIDE_TOLERANCE) {
          if (!bestDX || Math.abs(d) < Math.abs(bestDX.delta)) bestDX = { delta: d, value: tx, otherValue: ox };
        }
      }
    }
    for (const oy of ys) {
      for (const ty of tys) {
        const d = oy - ty;
        if (Math.abs(d) <= SMART_GUIDE_TOLERANCE) {
          if (!bestDY || Math.abs(d) < Math.abs(bestDY.delta)) bestDY = { delta: d, value: ty, otherValue: oy };
        }
      }
    }
  }

  // Apply edge-snap deltas.
  if (bestDX) target.set({ left: (target.left ?? 0) + bestDX.delta });
  if (bestDY) target.set({ top: (target.top ?? 0) + bestDY.delta });

  // Recompute bounding rect to gather guide lines for any aligned edge
  // after snap.
  target.setCoords();
  const tb2 = target.getBoundingRect();
  const aligned = {
    xs: [tb2.left, tb2.left + tb2.width / 2, tb2.left + tb2.width],
    ys: [tb2.top, tb2.top + tb2.height / 2, tb2.top + tb2.height],
  };

  for (const o of candidates) {
    const b = o.getBoundingRect();
    const oXs = [b.left, b.left + b.width / 2, b.left + b.width];
    const oYs = [b.top, b.top + b.height / 2, b.top + b.height];
    for (const ox of oXs) {
      if (aligned.xs.some(x => Math.abs(x - ox) < 0.5)) {
        const top = Math.min(b.top, tb2.top);
        const bot = Math.max(b.top + b.height, tb2.top + tb2.height);
        guides.push({ x1: ox, y1: top, x2: ox, y2: bot, kind: 'edge' });
      }
    }
    for (const oy of oYs) {
      if (aligned.ys.some(y => Math.abs(y - oy) < 0.5)) {
        const left = Math.min(b.left, tb2.left);
        const right = Math.max(b.left + b.width, tb2.left + tb2.width);
        guides.push({ x1: left, y1: oy, x2: right, y2: oy, kind: 'edge' });
      }
    }
  }

  // Anchor-point snap layer — after edge-aligning, also try to land any
  // bbox corner / midpoint / center of the moving object on any anchor
  // point of a candidate object (corners, midpoints, center, or — for
  // Paths — every command end-point).
  if (st.anchorSnapEnabled) {
    const zoom = canvas.getZoom() || 1;
    const tol = ANCHOR_SNAP_TOLERANCE / zoom;

    // Cheap pre-flight: total anchor count is bounded by ~10 per candidate
    // for non-Path objects; for Paths it's command count. Accumulate and
    // bail if we exceed the hard cap, keeping per-mousemove work bounded.
    const candidateAnchors: Anchor[] = [];
    let aborted = false;
    for (const o of candidates) {
      const anchors = collectAnchorsFor(o);
      candidateAnchors.push(...anchors);
      if (candidateAnchors.length > ANCHOR_CANDIDATE_LIMIT) {
        aborted = true;
        break;
      }
    }

    if (!aborted && candidateAnchors.length > 0) {
      const movingAnchors = collectMovingAnchors(target);
      const hit = findBestAnchorSnap(movingAnchors, candidateAnchors, tol);
      if (hit) {
        target.set({
          left: (target.left ?? 0) + hit.dx,
          top: (target.top ?? 0) + hit.dy,
        });
        target.setCoords();
        // Emit a zero-length "point" guide so the overlay renders a small
        // marker at the snap target. The GridOverlay renderer treats every
        // guide endpoint as a 3×3 fill mark, so a point-guide shows up as
        // a discreet dot without overlay changes.
        guides.push({
          x1: hit.hit.x,
          y1: hit.hit.y,
          x2: hit.hit.x,
          y2: hit.hit.y,
          kind: 'point',
        });
      }
    }
  }

  emitGuides(guides);
}
