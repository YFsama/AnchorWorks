import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useResizableWidth } from '../useResizableWidth';

// Same act opt-in as the dialogKit tests.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* The drag/resize plumbing behind the responsive panels. The behaviours that
 * earned regression coverage:
 *  - viewport-aware ceiling incl. the ≤1200px mid-band cap (mirrors the
 *    `.aside-right` CSS backstop — a JS/CSS disagreement is a drag dead zone),
 *  - shrink-only fallback on window resize that leaves the persisted
 *    preference untouched,
 *  - degraded-to-min on windows narrower than min + reserve.
 *
 * rAF is stubbed onto the macrotask queue (NOT synchronously — a sync rAF
 * turns the hook's rAF-throttle into synchronous re-entrant recursion and
 * stack-overflows); `flushFrames` awaits it so assertions see committed state. */

const KEY = 'test.aside.width';

let api: ReturnType<typeof useResizableWidth> | null = null;
function Probe() {
  // Same shape as the right properties panel in App.tsx.
  api = useResizableWidth({ storageKey: KEY, edge: 'left', min: 240, max: 560, initial: 288 });
  return null;
}

function setViewport(px: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });
}

async function mount(): Promise<{ root: Root; host: HTMLDivElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<Probe />); });
  return { root, host };
}

async function unmount({ root, host }: { root: Root; host: HTMLDivElement }) {
  await act(async () => { root.unmount(); });
  host.remove();
  api = null;
}

/** Let the stubbed rAF callbacks (throttled drag reflow, resize fallback) run. */
async function flushFrames() {
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}

/** Press the drag handle at `startX`, move to each x in `moves`, release. */
async function drag(startX: number, ...moves: number[]) {
  await act(async () => { api!.onMouseDown({ button: 0, clientX: startX, preventDefault() {} } as React.MouseEvent); });
  for (const x of moves) {
    await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: x })); });
  }
  await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number));
  vi.stubGlobal('cancelAnimationFrame', ((id: unknown) => clearTimeout(id as number)) as typeof clearTimeout);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useResizableWidth', () => {
  it('clamps a persisted oversized width to the viewport ceiling on mount', async () => {
    localStorage.setItem(KEY, '560'); // chosen on a 1920 display
    setViewport(1024); // ceiling: min(560, 1024−720, 320, 32vw≈328) = 304
    const ctx = await mount();
    expect(api!.width).toBe(304);
    await unmount(ctx);
  });

  it('degrades to min (never 0/negative) when the window is narrower than min + reserve', async () => {
    setViewport(800); // everything spareable: 80px — below min
    const ctx = await mount();
    expect(api!.width).toBe(240);
    await unmount(ctx);
  });

  it('applies the ≤1200px mid-band cap while dragging — no dead zone vs the CSS backstop', async () => {
    setViewport(1100); // JS-only cap would be 380; CSS paints 320 → dead zone
    const ctx = await mount();
    // edge 'left': dragging left (clientX decreasing) widens the panel.
    await drag(600, 100, 0, -500);
    expect(api!.width).toBe(320); // min(560, 1100−720=380, 320, 0.32·1100=352)
    await unmount(ctx);
  });

  it('shrinks the live width on window resize but leaves the persisted preference intact', async () => {
    setViewport(1440);
    const ctx = await mount();
    await drag(600, 360); // widen to 528 and persist on mouseup
    expect(api!.width).toBe(528);
    expect(localStorage.getItem(KEY)).toBe('528');
    // Shrink the window: the live width falls to the new ceiling, but the
    // stored preference survives so the chosen width returns when the window
    // grows again.
    setViewport(1024);
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    await flushFrames();
    expect(api!.width).toBe(304); // min(560, 1024−720=304, 320, 32vw≈328)
    expect(localStorage.getItem(KEY)).toBe('528');
    // Growing back must NOT auto-restore: shrink-only by design.
    setViewport(1440);
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    await flushFrames();
    expect(api!.width).toBe(304);
    await unmount(ctx);
  });

  it('reset() re-applies the initial width under the current ceiling', async () => {
    localStorage.setItem(KEY, '560');
    setViewport(1024);
    const ctx = await mount();
    expect(api!.width).toBe(304);
    await act(async () => { api!.reset(); });
    expect(api!.width).toBe(288); // initial, still under the 304 ceiling
    await unmount(ctx);
  });
});
