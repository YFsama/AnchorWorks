/**
 * One-time global Fabric.js configuration applied before any canvas exists.
 *
 * Two pieces live here — both are pure module-bootstrap concerns with no
 * dependency on a particular canvas instance, the editor store, or the DOM
 * (beyond a probe `<canvas>` for WebGL detection). Pulling them out of
 * canvasEngine.ts keeps that file focused on actual canvas + tool wiring
 * (task #20).
 *
 *   1) `objectCaching = false` global default
 *   2) `WebGLFilterBackend` enabled lazily on first call to `ensureWebGLFilterBackend`
 *
 * canvasEngine.ts imports + calls `ensureWebGLFilterBackend()` at the top of
 * `initCanvas`; the `objectCaching` flip happens as a module-side-effect on
 * import, which is what we want — it must be set before any FabricObject is
 * constructed (and our test suite already imports this transitively via
 * canvasEngine before any test creates objects).
 */

import * as fabric from 'fabric';

// Fabric defaults `objectCaching: true` — every group/shape is pre-painted
// onto an internal bitmap. That bitmap is rendered at the object's intrinsic
// size, so when the user zooms in the viewport (Ctrl+Wheel), the cached
// bitmap is scaled like a raster image and shapes look pixelated. Flipping
// the default to `false` makes Fabric re-paint vector paths each render —
// slightly more CPU per frame but crisp at any zoom level, which is the
// expected behaviour for a vector editor.
fabric.FabricObject.ownDefaults.objectCaching = false;

// Enable GPU-accelerated image filters when WebGL is available. Falls back
// to the Canvas2D backend silently in environments without WebGL (e.g.
// headless CI). Set once before the first canvas is created; subsequent
// calls are safe but redundant.
let filterBackendInitialized = false;
export function ensureWebGLFilterBackend(): void {
  if (filterBackendInitialized) return;
  filterBackendInitialized = true;
  try {
    const test = document.createElement('canvas');
    const hasWebGL = !!(test.getContext('webgl2') || test.getContext('webgl'));
    if (!hasWebGL) return;
    fabric.setFilterBackend(new fabric.WebGLFilterBackend({ tileSize: 2048 }));
  } catch {
    /* WebGL probe / backend construction failed — keep the default Canvas2D
     * backend. Image filters still work, just on the CPU. */
  }
}
