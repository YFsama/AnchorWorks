/**
 * P2-4 — Object caching escape valve.
 *
 * fabricBootstrap.ts ships `objectCaching = false` globally (crisp vectors
 * at any zoom; cost: every frame is O(total path complexity)). On top of
 * that default it now exposes an opt-in 'zoom' mode that enables per-object
 * caches only at/above a 4× zoom threshold, plus the state machine that
 * canvasEngine wires into its after:render viewport gate and that
 * PreferencesDialog drives on Apply.
 *
 * This file pins the contract the backlog demands:
 *  1. the 4× threshold predicate (boundary-exact: <4 disables, ≥4 enables);
 *  2. throttling — the O(n) object walk runs exactly once per threshold
 *     crossing (memo-gated), never per zoom tick;
 *  3. zero side effects while the preference is 'off' (the shipped default):
 *     objects, the FabricObject prototype default and repaints are never
 *     touched, so the default behaviour is byte-identical;
 *  4. preference read/write round-trip + garbage tolerance;
 *  5. the PreferencesDialog Editor-tab control (aria-pressed pair, mirroring
 *     the Mouse-wheel e2e contract from dialogMigratePreferences.test.tsx).
 *
 * Not coverable here (jsdom has no rasteriser, cf. perfBudget.test.ts's
 * skipped render test): the visual result of blit-scaled caches at ≥4×, and
 * the real-canvas after:render wiring in canvasEngine (three lines that
 * delegate to the state machine below).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as fabric from 'fabric';
import {
  OBJECT_CACHING_ZOOM_THRESHOLD,
  shouldUseCachingAtZoom,
  getObjectCachingMode,
  setObjectCachingMode,
  applyObjectCachingToObjects,
  syncObjectCaching,
  type ObjectCachingCanvasLike,
  type ObjectCachingSyncResult,
} from '../fabricBootstrap';
import { PreferencesDialog } from '../../components/PreferencesDialog';
import { useEditor } from '../../store/editor';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  // Tests may flip the prototype default via the 'zoom' regime — restore the
  // shipped bootstrap state so later tests (in this file and, under
  // isolation reuse, elsewhere) start from the real default.
  fabric.FabricObject.ownDefaults.objectCaching = false;
  localStorage.clear();
});

/* ------------------------------- helpers ------------------------------- */

/** Real fabric objects (no 2D-context stub needed — Path/Rect/Group only
 *  touch the canvas at render time, which these tests never reach). */
function makeObjects(): fabric.FabricObject[] {
  const child = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 });
  return [
    new fabric.Path('M 0 0 L 30 0 L 30 20 C 20 35, 10 35, 0 20 Z'),
    new fabric.Rect({ left: 50, top: 0, width: 20, height: 12 }),
    new fabric.Group([child]), // groups cache as a unit — top-level walk only
  ];
}

/** Structural stand-in for fabric.Canvas (perfBudget's fake-canvas pattern):
 *  exactly the ObjectCachingCanvasLike surface syncObjectCaching consumes,
 *  plus direct handles the assertions poke at. */
type FakeCanvas = ObjectCachingCanvasLike & {
  objects: fabric.FabricObject[];
  requestRenderAll: ReturnType<typeof vi.fn>;
};

function makeFakeCanvas(objects: fabric.FabricObject[]): FakeCanvas {
  const requestRenderAll = vi.fn();
  return { objects, requestRenderAll, getObjects: () => objects };
}

/** Drives syncObjectCaching the way canvasEngine does: threading the
 *  returned memo into the next call. */
function makeEngine(canvas: ObjectCachingCanvasLike | null) {
  let applied: boolean | null = null;
  return {
    sync: (zoom: number): ObjectCachingSyncResult => {
      const r = syncObjectCaching(canvas, zoom, applied);
      applied = r.applied;
      return r;
    },
    applied: () => applied,
  };
}

/* ------------------------ threshold predicate ------------------------- */

describe('shouldUseCachingAtZoom — 4× threshold', () => {
  it('threshold constant is 4', () => {
    expect(OBJECT_CACHING_ZOOM_THRESHOLD).toBe(4);
  });

  it('below the threshold caching stays disabled (crisp vectors)', () => {
    for (const zoom of [0.05, 0.5, 1, 2, 3, 3.5, 3.99, 3.999]) {
      expect(shouldUseCachingAtZoom(zoom), `zoom ${zoom}`).toBe(false);
    }
  });

  it('at and above the threshold caching is enabled (boundary is >=)', () => {
    for (const zoom of [4, 4.001, 8, 16, 32]) {
      expect(shouldUseCachingAtZoom(zoom), `zoom ${zoom}`).toBe(true);
    }
  });

  it('a missing/NaN zoom resolves to no caching (vector-safe default)', () => {
    expect(shouldUseCachingAtZoom(NaN)).toBe(false);
  });
});

/* --------------------- preference persistence ------------------------- */

describe('Object caching preference round-trip', () => {
  it('defaults to off with nothing in storage', () => {
    expect(getObjectCachingMode()).toBe('off');
    expect(localStorage.getItem('vector.objectCaching')).toBeNull();
  });

  it('round-trips zoom and back to off', () => {
    setObjectCachingMode('zoom');
    expect(getObjectCachingMode()).toBe('zoom');
    expect(JSON.parse(localStorage.getItem('vector.objectCaching')!)).toEqual({ mode: 'zoom' });
    setObjectCachingMode('off');
    expect(getObjectCachingMode()).toBe('off');
    expect(JSON.parse(localStorage.getItem('vector.objectCaching')!)).toEqual({ mode: 'off' });
  });

  it('tolerates absent / corrupt / unknown storage (falls back to off)', () => {
    for (const garbage of ['', 'nope', '[1,2]', '{"mode":"bogus"}', '{"mode":42}', 'null']) {
      localStorage.setItem('vector.objectCaching', garbage);
      expect(getObjectCachingMode(), `storage "${garbage}"`).toBe('off');
    }
  });
});

/* --------------------------- the O(n) walk ---------------------------- */

describe('applyObjectCachingToObjects — per-object walk', () => {
  it('flips matching objects, reports the count, skips already-matching ones', () => {
    const objects = makeObjects();
    expect(applyObjectCachingToObjects(objects, true)).toBe(3);
    expect(objects.map((o) => o.objectCaching)).toEqual([true, true, true]);
    // Idempotent: nothing left to flip.
    expect(applyObjectCachingToObjects(objects, true)).toBe(0);
    expect(applyObjectCachingToObjects(objects, false)).toBe(3);
    expect(objects.map((o) => o.objectCaching)).toEqual([false, false, false]);
  });

  it('enabling marks flipped objects dirty (fresh cache on next frame)', () => {
    const objects = makeObjects();
    applyObjectCachingToObjects(objects, true);
    expect(objects.every((o) => o.dirty)).toBe(true);
  });

  it('touches top-level objects only — group children keep their own flags', () => {
    const child = new fabric.Rect({ left: 0, top: 0, width: 5, height: 5 });
    const group = new fabric.Group([child]);
    applyObjectCachingToObjects([group], true);
    expect(group.objectCaching).toBe(true);
    // The child is NOT part of the walk: the group caches its subtree as one
    // unit, so the child's flag is irrelevant while that cache is valid.
    expect(child.objectCaching).toBe(false);
  });

  it('empty object list is a no-op walk', () => {
    expect(applyObjectCachingToObjects([], true)).toBe(0);
  });
});

/* ---------------------- the regime state machine ----------------------- */

describe('syncObjectCaching — regime state machine', () => {
  it("pref 'off' (default): zero side effects across any zoom churn", () => {
    const objects = makeObjects();
    for (const o of objects) o.objectCaching = false; // explicit, spy-able baseline
    const c = makeFakeCanvas(objects);
    const engine = makeEngine(c);

    // Zoom churn well past the threshold and back — nothing may happen.
    for (const zoom of [1, 3, 3.99, 4, 8, 32, 8, 4, 3.99, 1, 0.05]) {
      const r = engine.sync(zoom);
      expect(r.applied).toBeNull();
      expect(r.changed).toBe(false);
    }
    // Objects untouched, prototype default untouched, no repaint requested.
    expect(objects.every((o) => o.objectCaching === false)).toBe(true);
    expect(fabric.FabricObject.ownDefaults.objectCaching).toBe(false);
    expect(c.requestRenderAll).not.toHaveBeenCalled();
  });

  it("pref 'zoom': the O(n) walk runs exactly once per threshold crossing", () => {
    setObjectCachingMode('zoom');
    const objects = makeObjects();
    const c = makeFakeCanvas(objects);
    const engine = makeEngine(c);

    // Below threshold: first call initialises the memo (empty canvas would
    // flip nothing) but with objects present it "walks" them to false —
    // which they already are, so no repaint.
    expect(engine.sync(1)).toEqual({ applied: false, changed: true });
    expect(c.requestRenderAll).not.toHaveBeenCalled();
    // More below-threshold ticks: inert (this is the throttle that keeps the
    // walk off the per-wheel-tick path).
    for (const zoom of [1.5, 2, 3, 3.5, 3.99]) {
      expect(engine.sync(zoom).changed).toBe(false);
    }
    expect(objects.every((o) => o.objectCaching === false)).toBe(true);

    // Cross UP at exactly 4×: one walk, one repaint, all cached.
    expect(engine.sync(4)).toEqual({ applied: true, changed: true });
    expect(objects.every((o) => o.objectCaching === true)).toBe(true);
    expect(c.requestRenderAll).toHaveBeenCalledTimes(1);
    // Further zoom-in ticks above the threshold: inert again.
    for (const zoom of [5, 8, 16, 32, 32]) {
      expect(engine.sync(zoom).changed).toBe(false);
    }
    expect(c.requestRenderAll).toHaveBeenCalledTimes(1);

    // Cross DOWN below 4×: one walk back, one repaint, all uncached.
    expect(engine.sync(3.99)).toEqual({ applied: false, changed: true });
    expect(objects.every((o) => o.objectCaching === false)).toBe(true);
    expect(c.requestRenderAll).toHaveBeenCalledTimes(2);
    expect(engine.sync(1).changed).toBe(false);
    expect(c.requestRenderAll).toHaveBeenCalledTimes(2);
  });

  it("pref 'zoom': no repaint when the crossing flips zero objects", () => {
    setObjectCachingMode('zoom');
    const c = makeFakeCanvas([]); // e.g. a freshly initialised canvas
    const engine = makeEngine(c);
    expect(engine.sync(1).changed).toBe(true);
    expect(engine.sync(4).changed).toBe(true);
    expect(c.requestRenderAll).not.toHaveBeenCalled();
  });

  it("pref 'zoom': newborn objects follow the regime via the prototype default", () => {
    setObjectCachingMode('zoom');
    const objects: fabric.FabricObject[] = [];
    const engine = makeEngine(makeFakeCanvas(objects));

    engine.sync(4); // regime enabled → ownDefaults flipped true
    const bornCached = new fabric.Path('M 0 0 L 5 5');
    expect(bornCached.objectCaching).toBe(true);

    engine.sync(1); // regime disabled → ownDefaults back to the shipped false
    const bornCrisp = new fabric.Path('M 0 0 L 5 5');
    expect(bornCrisp.objectCaching).toBe(false);
    expect(fabric.FabricObject.ownDefaults.objectCaching).toBe(false);
  });

  it("flipping the pref back to 'off' undoes an applied regime", () => {
    setObjectCachingMode('zoom');
    const objects = makeObjects();
    const c = makeFakeCanvas(objects);
    const engine = makeEngine(c);
    engine.sync(4);
    expect(objects.every((o) => o.objectCaching === true)).toBe(true);
    expect(fabric.FabricObject.ownDefaults.objectCaching).toBe(true);

    // PreferencesDialog Apply → setObjectCachingMode('off') + refresh:
    setObjectCachingMode('off');
    expect(engine.sync(4)).toEqual({ applied: null, changed: true });
    expect(objects.every((o) => o.objectCaching === false)).toBe(true);
    expect(fabric.FabricObject.ownDefaults.objectCaching).toBe(false);
    // From here on the off path is inert again.
    expect(engine.sync(32)).toEqual({ applied: null, changed: false });
    expect(engine.applied()).toBeNull();
  });

  it("pref 'off' with corrupt storage mid-session: still off, still inert", () => {
    // Corrupt bytes appearing in the key must sanitize to 'off' (not crash,
    // not enable) and the off path stays side-effect free.
    localStorage.setItem('vector.objectCaching', '???');
    const objects = makeObjects();
    const c = makeFakeCanvas(objects);
    const engine = makeEngine(c);
    expect(engine.sync(32)).toEqual({ applied: null, changed: false });
    expect(objects.every((o) => o.objectCaching === false)).toBe(true);
    expect(fabric.FabricObject.ownDefaults.objectCaching).toBe(false);
    expect(c.requestRenderAll).not.toHaveBeenCalled();
  });

  it('tolerates a null canvas (pre-init or between dispose and init)', () => {
    setObjectCachingMode('zoom');
    const engine = makeEngine(null);
    // Regime transition without a canvas: memo + prototype default only.
    expect(engine.sync(8)).toEqual({ applied: true, changed: true });
    expect(fabric.FabricObject.ownDefaults.objectCaching).toBe(true);
    // A canvas appearing later below the threshold gets walked back.
    const objects = [new fabric.Path('M 0 0 L 4 4'), new fabric.Path('M 0 0 L 4 4')];
    objects.forEach((o) => { o.objectCaching = true; }); // born under the regime
    const c = makeFakeCanvas(objects);
    const withCanvas = makeEngine(c);
    expect(withCanvas.sync(1)).toEqual({ applied: false, changed: true });
    expect(objects.every((o) => o.objectCaching === false)).toBe(true);
    expect(c.requestRenderAll).toHaveBeenCalledTimes(1);
  });
});

/* --------------------- PreferencesDialog integration -------------------- */
/*
 * dialogMigratePreferences.test.tsx pattern: mount the real dialog with
 * createRoot + act, drive it with DOM events, assert the aria-pressed pair
 * (the contract the preferences-wheel e2e anchors on) and that Apply
 * persists through fabricBootstrap's accessor. Roots are tracked and torn
 * down in the dialog suite's own afterEach, matching the migration suite.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let dialogHost: HTMLDivElement | null = null;
let dialogRoots: Root[] = [];

async function mountDialog(): Promise<HTMLElement> {
  dialogHost = document.createElement('div');
  document.body.appendChild(dialogHost);
  const container = document.createElement('div');
  dialogHost.appendChild(container);
  const root = createRoot(container);
  dialogRoots.push(root);
  act(() => {
    useEditor.setState({ showPreferences: true });
    root.render(createElement(PreferencesDialog));
  });
  // Flush the dialog's focus-on-next-frame effect up front (same reason as
  // the migration suite: it must never steal focus mid-script).
  await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  return container;
}

afterEach(() => {
  for (const root of dialogRoots) act(() => root.unmount());
  dialogRoots = [];
  dialogHost?.remove();
  dialogHost = null;
  act(() => useEditor.setState({ showPreferences: false }));
});

function cachingGroup(c: HTMLElement): HTMLElement {
  return c.querySelector('[role="group"][aria-label="Object caching"]') as HTMLElement;
}

function footerButton(c: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(c.querySelectorAll<HTMLButtonElement>('[data-pref-action]'))
    .find((b) => b.textContent === label)!;
}

describe('PreferencesDialog — Object caching control (Editor tab)', () => {
  it('renders the aria-pressed off/zoom pair with off active by default', async () => {
    const c = await mountDialog();
    act(() => (c.querySelector('#pref-tab-editor') as HTMLElement).click());
    const group = cachingGroup(c);
    expect(group).toBeTruthy();
    const [offBtn, onBtn] = Array.from(group.querySelectorAll('button'));
    expect(offBtn.textContent).toBe('Off (crisp at any zoom)');
    expect(onBtn.textContent).toBe('On at 4× zoom and above');
    expect(offBtn.getAttribute('aria-pressed')).toBe('true');
    expect(onBtn.getAttribute('aria-pressed')).toBe('false');
    // Default draft must not have written anything to storage yet.
    expect(localStorage.getItem('vector.objectCaching')).toBeNull();
  });

  it('selecting zoom and Apply persists the preference via the accessor round-trip', async () => {
    const c = await mountDialog();
    act(() => (c.querySelector('#pref-tab-editor') as HTMLElement).click());
    const onBtn = Array.from(cachingGroup(c).querySelectorAll('button'))[1];
    act(() => onBtn.click());
    expect(onBtn.getAttribute('aria-pressed')).toBe('true');
    act(() => footerButton(c, 'Apply').click());
    // Apply keeps the dialog open (existing contract) and persists.
    expect(localStorage.getItem('vector.objectCaching')).not.toBeNull();
    expect(getObjectCachingMode()).toBe('zoom');
  });
});
