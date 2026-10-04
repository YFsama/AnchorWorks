/**
 * Measure-tool interaction state — the synchronous pointer callbacks wired
 * into the tool registry (registerTools.ts). The registry dispatches these
 * via `getTool(activeTool)?.onMouseDown/...` synchronously, so they cannot
 * live behind a lazy import; keeping them in this tiny, dependency-light
 * module lets the ~36 kB annotation family in ./measureTool.ts load on
 * demand (dynamic imports from MenuBar / CommandPalette / App) instead of
 * being pinned into the entry chunk.
 *
 * Split (2026-10) from ./measureTool.ts; behaviour is identical — the
 * module-level drag state moved with the functions that own it.
 */
import { useEditor } from '../../store/editor';

let dragging = false;
let startX = 0;
let startY = 0;

export function measureBegin(x: number, y: number): void {
  dragging = true;
  startX = x; startY = y;
  useEditor.getState().setMeasure({ x1: x, y1: y, x2: x, y2: y });
}

export function measureUpdate(x: number, y: number): void {
  if (!dragging) return;
  useEditor.getState().setMeasure({ x1: startX, y1: startY, x2: x, y2: y });
}

export function measureEnd(): void {
  dragging = false; // keep the last segment visible until the tool changes
}

/** Tool deactivation — drop the segment so it doesn't linger under other tools. */
export function measureClear(): void {
  dragging = false;
  useEditor.getState().setMeasure(null);
}

/**
 * Drop the in-flight drag flag without clearing the visible segment — used by
 * measureTool's `commitDimension` after it pins the segment as an annotation
 * (the store's `measure` is nulled there separately).
 */
export function resetMeasureDragging(): void {
  dragging = false;
}
