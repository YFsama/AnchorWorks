/**
 * Canvas event broadcasts — viewport and smart-guide updates.
 *
 * Two independent pub/sub channels that the canvas engine emits onto and
 * various overlay components subscribe to (rulers, grid, artboard rects,
 * outline view, etc.). Lives in its own file because the logic is pure
 * pub/sub — no Fabric reference, no DOM access, no store coupling — so it's
 * the cleanest first slice off the 1100-line canvasEngine.ts (task #20).
 *
 * Re-exported from canvasEngine.ts for back-compat: every existing consumer
 * imports from `./canvasEngine`, so no call-site has to change.
 */

// A guide is a line (kind:'edge') or zero-length marker (kind:'point') drawn
// over the canvas in scene coordinates. Cleared on every frame; consumers
// re-paint when the listener fires.
export type Guide = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind?: 'edge' | 'point';
};

type GuideListener = (guides: Guide[]) => void;
type ViewportListener = () => void;

const guideListeners = new Set<GuideListener>();
const viewportListeners = new Set<ViewportListener>();

/** Subscribe to smart-guide updates. Returns an unsubscribe function. */
export function subscribeGuides(fn: GuideListener): () => void {
  guideListeners.add(fn);
  return () => { guideListeners.delete(fn); };
}

/** Broadcast the current set of smart-guides to all listeners. Pass an empty
 *  array to clear the overlay. */
export function emitGuides(guides: Guide[]): void {
  guideListeners.forEach(fn => fn(guides));
}

/** Subscribe to viewport (zoom / pan) changes. Returns an unsubscribe. */
export function subscribeViewport(fn: ViewportListener): () => void {
  viewportListeners.add(fn);
  return () => { viewportListeners.delete(fn); };
}

/** Broadcast that the viewport changed (zoom or pan). */
export function emitViewport(): void {
  viewportListeners.forEach(fn => fn());
}
