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
 *
 * Alongside those, this module also owns the *object caching escape valve*
 * (P2-4): the preference read/write, the zoom threshold policy, and the
 * regime-sync state machine that canvasEngine wires into its viewport
 * pipeline. See "Escape valve" below.
 */

import * as fabric from 'fabric';

// ---------------------------------------------------------------------------
// 1) objectCaching global default — and why it is off (P2-4 documentation)
// ---------------------------------------------------------------------------
//
// Fabric defaults `objectCaching: true` — every group/shape is pre-painted
// onto an internal bitmap. That bitmap is rendered at the object's intrinsic
// scene resolution (fabric sizes the cache from `getTotalObjectScaling`,
// i.e. object scaleX/scaleY and the retina ratio — NOT the viewport zoom),
// so when the user zooms the viewport the cached bitmap is blit-scaled like
// a raster image and shapes look soft/pixelated. Flipping the default to
// `false` makes Fabric re-paint vector paths each render — slightly more CPU
// per frame but crisp at any zoom level, which is the expected behaviour for
// a vector editor. This also matters for cut-path precision work, where the
// user zooms in to inspect anchor-level detail.
//
// THE TRADE-OFF (why this file also hosts an escape valve):
//
//   * With caching OFF, every rendered frame is O(total path complexity):
//     each of the document's paths — on-screen or not — is re-tessellated
//     and re-painted on every repaint. At hundreds/thousands of complex
//     paths, low-end machines drop frames during drags and pans.
//   * With caching ON, steady-state frames are O(n) cheap bitmap blits, but
//     any zoom ≠ 100% resamples those bitmaps (magnification visibly softens
//     thin strokes and text).
//
// There is no free lunch; the shipped default picks correctness (crisp
// vectors) because that is what a vector editor promises. The escape valve
// below lets users on slow hardware opt into caching *only above a zoom
// threshold*, keeping the default path byte-identical for everyone else.
fabric.FabricObject.ownDefaults.objectCaching = false;

// ---------------------------------------------------------------------------
// Escape valve (P2-4): zoom-gated object caching
// ---------------------------------------------------------------------------
//
// Preference 'Object caching' (PreferencesDialog → Editor tab):
//   'off'  — default, ships exactly the behaviour above. GUARANTEE: with
//            this value the sync below never touches a single object, the
//            prototype default, or a repaint. Zero behavioural delta.
//   'zoom' — per-object caches are enabled only while viewport zoom ≥
//            OBJECT_CACHING_ZOOM_THRESHOLD, disabled below it.
//
// Threshold rationale (4×): picked as a deliberately conservative product
// call from the P2-4 backlog. Caching buys frame rate exactly where this
// pref is meant to help — deep inspection of a heavy document at high zoom,
// where every frame re-rasterises the whole document for a tiny visible
// region and drags stutter worst on low-end machines. Risk statement: a
// cached bitmap magnified ≥4× IS resampled, so thin strokes / small text can
// look slightly softer than their vector render while zoomed in; zooming
// back below the threshold restores crisp vectors immediately. This env has
// no pixel-level visual regression harness — the softness at ≥4× needs
// eyeballing on real hardware. If it bothers users, raise the threshold or
// flip the preference off; nothing else shares state with this path.
//
// Persistence follows the `preferences.ts` pattern (typed accessor +
// sanitize + try/catch) but under its own localStorage key: `vector.prefs`
// is round-tripped through `AppPreferences`/`sanitize`, which silently drops
// unknown fields, and this module owns the objectCaching knob end-to-end.

/** 'off' = never cache (shipped default). 'zoom' = cache at/above the threshold. */
export type ObjectCachingMode = 'off' | 'zoom';

/** Zoom (×) at and above which 'zoom' mode enables per-object caches. */
export const OBJECT_CACHING_ZOOM_THRESHOLD = 4;

const OBJECT_CACHING_PREF_KEY = 'vector.objectCaching';

/** Pure threshold predicate — the single source of the 4× policy. NaN or
 *  missing zoom resolves to "no caching" (the crisp, shipped behaviour). */
export function shouldUseCachingAtZoom(zoom: number): boolean {
  return zoom >= OBJECT_CACHING_ZOOM_THRESHOLD;
}

/** Live preference read (mirrors `getWheelMode`'s read-per-event pattern —
 *  a tiny JSON.parse, safe on the viewport-change path). Defaults to 'off'
 *  and tolerates absent/corrupt storage. */
export function getObjectCachingMode(): ObjectCachingMode {
  if (typeof window === 'undefined') return 'off';
  try {
    const raw = window.localStorage.getItem(OBJECT_CACHING_PREF_KEY);
    if (!raw) return 'off';
    const parsed = JSON.parse(raw) as { mode?: unknown };
    return parsed?.mode === 'zoom' ? 'zoom' : 'off';
  } catch {
    return 'off';
  }
}

/** Persist the preference. Reconciliation with the live canvas is NOT done
 *  here (this module has no canvas dependency by design) — the caller
 *  (PreferencesDialog apply) follows up with canvasEngine's
 *  `refreshObjectCaching()`. */
export function setObjectCachingMode(mode: ObjectCachingMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OBJECT_CACHING_PREF_KEY, JSON.stringify({ mode }));
  } catch {
    /* quota exceeded or storage disabled — silently keep the default */
  }
}

/** The subset of fabric.Canvas the sync needs. Structural on purpose: this
 *  module stays free of canvas-instance dependencies (and of any import
 *  cycle with canvasEngine), and tests pass stand-ins. */
export interface ObjectCachingCanvasLike {
  getObjects(): fabric.FabricObject[];
  requestRenderAll(): void;
}

/** Outcome of one sync call. `applied` is the memo to remember (null = no
 *  regime applied / pref off); `changed` is true iff the regime transitioned
 *  — i.e. the O(n) walk ran. Callers treat `changed` as the throttle: while
 *  the zoom stays on one side of the threshold, sync is a no-op. */
export interface ObjectCachingSyncResult {
  applied: boolean | null;
  changed: boolean;
}

/**
 * Reconcile per-object caching with the preference at the given zoom.
 *
 * Cheap when nothing changed: one pref read + one memo comparison. The O(n)
 * object walk runs only when the regime actually transitions — crossing the
 * threshold, flipping the preference, or first call under 'zoom'.
 *
 * Zero-side-effect contract for 'off': from a clean state (lastApplied
 * null) nothing is read off the canvas, the prototype default is never
 * written and no repaint is requested — the shipped code path is
 * byte-identical. When 'zoom' had previously applied a regime, the off path
 * undoes exactly that (prototype default back to false, every flag back to
 * false) and drops the memo.
 */
export function syncObjectCaching(
  canvas: ObjectCachingCanvasLike | null,
  zoom: number,
  lastApplied: boolean | null,
): ObjectCachingSyncResult {
  const mode = getObjectCachingMode();
  if (mode !== 'zoom') {
    if (lastApplied === null) return { applied: null, changed: false };
    applyPrototypeDefault(false);
    if (canvas) {
      const flipped = applyObjectCachingToObjects(canvas.getObjects(), false);
      if (flipped > 0) canvas.requestRenderAll();
    }
    return { applied: null, changed: true };
  }
  const want = shouldUseCachingAtZoom(zoom);
  if (want === lastApplied) return { applied: lastApplied, changed: false };
  applyPrototypeDefault(want);
  if (canvas) {
    const flipped = applyObjectCachingToObjects(canvas.getObjects(), want);
    if (flipped > 0) canvas.requestRenderAll();
  }
  return { applied: want, changed: true };
}

/**
 * Flip the prototype-level default so objects constructed from now on are
 * born inside the current regime (fabric copies ownDefaults onto every new
 * instance; existing instances keep their own copies). Only ever called
 * from the 'zoom'-mode paths above and their undo — never while the pref is
 * 'off', so the shipped default stays `false`. Skip-if-equal so clean-state
 * runs perform no write at all.
 */
function applyPrototypeDefault(enabled: boolean): void {
  if (fabric.FabricObject.ownDefaults.objectCaching === enabled) return;
  fabric.FabricObject.ownDefaults.objectCaching = enabled;
}

/**
 * Walk the given objects, flipping the per-instance `objectCaching` flag.
 * Returns how many objects actually flipped (0 → caller skips the repaint).
 * Direct property assignment rather than `.set()`: this walk is O(n) over
 * potentially thousands of objects and must stay allocation- and event-free
 * (no fabric events → no history entries; `objectCaching` is a runtime flag
 * and is not serialised, so undo/redo and project files are unaffected).
 *
 * Top-level objects only, by design: a Group caches its whole subtree as one
 * unit, so child flags are irrelevant while the group cache is valid, and
 * when it invalidates (an edit) uncached children simply paint vector INTO
 * the group's cache — still correct, and crisper.
 *
 * The walk is deliberately blind to per-object explicit choices (io.ts /
 * pathEdit.ts pin `objectCaching: false` on imports; pressureBrush pins
 * `true` on its live stroke preview): the preference is a global regime
 * switch. The only explicit opt-in today is the transient pressure-brush
 * preview; the worst case below threshold is a marginally slower preview
 * stroke, never a visual artefact.
 */
export function applyObjectCachingToObjects(objects: fabric.FabricObject[], enabled: boolean): number {
  let flipped = 0;
  for (const o of objects) {
    if (o.objectCaching === enabled) continue;
    o.objectCaching = enabled;
    // Enabling while a stale cache bitmap lingers (possible when the object
    // was offscreen — fabric culls offscreen objects from render — while
    // caching was off) would blit the stale pixels; dirty forces a fresh
    // cache paint on the next frame. Disabling needs no equivalent: fabric's
    // render() calls _removeCacheCanvas() on the uncached path.
    if (enabled) o.dirty = true;
    flipped++;
  }
  return flipped;
}

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
