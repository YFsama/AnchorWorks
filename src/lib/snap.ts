/**
 * Grid + guide snap helper.
 *
 * Pure function used by every "start drawing a shape at the click point"
 * code path (rect / ellipse / line in canvasEngine, plus the upcoming
 * shape-draw tool extraction). Reads the editor store's snap settings and
 * rounds the input point to the nearest grid line when grid-snap is active,
 * then pulls the point onto nearby visible ruler guides when Smart Guides are
 * enabled. This gives newly drawn shapes the same Illustrator-like guide
 * magnetism as moved objects.
 *
 * Kept in its own tiny module so canvasEngine + tool modules consume one
 * canonical helper rather than each carrying a private copy.
 */

import { useEditor } from '../store/editor';

const GUIDE_SNAP_TOLERANCE = 6;

export function snapPointToUserGuides(p: { x: number; y: number }, tolerance = GUIDE_SNAP_TOLERANCE): { x: number; y: number } {
  const st = useEditor.getState();
  if (!st.smartGuidesEnabled || !st.guidesVisible || st.userGuides.length === 0) return p;
  let x = p.x;
  let y = p.y;
  let bestX = tolerance;
  let bestY = tolerance;
  for (const guide of st.userGuides) {
    if (guide.axis === 'v') {
      const distance = Math.abs(guide.pos - p.x);
      if (distance <= bestX) {
        bestX = distance;
        x = guide.pos;
      }
    } else {
      const distance = Math.abs(guide.pos - p.y);
      if (distance <= bestY) {
        bestY = distance;
        y = guide.pos;
      }
    }
  }
  return { x, y };
}

/** Round `p` to the nearest grid intersection if snap is enabled and the
 *  grid is currently visible, then snap to nearby visible ruler guides. */
export function maybeSnap(p: { x: number; y: number }): { x: number; y: number } {
  const st = useEditor.getState();
  let snapped = p;
  if (st.snapEnabled && st.gridVisible) {
    const g = st.gridSize || 1;
    snapped = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }
  return snapPointToUserGuides(snapped);
}
