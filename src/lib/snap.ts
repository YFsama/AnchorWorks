/**
 * Grid snap helper.
 *
 * Pure function used by every "start drawing a shape at the click point"
 * code path (rect / ellipse / line in canvasEngine, plus the upcoming
 * shape-draw tool extraction). Reads the editor store's snap settings and
 * rounds the input point to the nearest grid line when grid-snap is active.
 *
 * Kept in its own tiny module so canvasEngine + tool modules consume one
 * canonical helper rather than each carrying a private copy.
 */

import { useEditor } from '../store/editor';

/** Round `p` to the nearest grid intersection if snap is enabled and the
 *  grid is currently visible; otherwise return `p` unchanged. */
export function maybeSnap(p: { x: number; y: number }): { x: number; y: number } {
  const st = useEditor.getState();
  if (!st.snapEnabled || !st.gridVisible) return p;
  const g = st.gridSize || 1;
  return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
}
