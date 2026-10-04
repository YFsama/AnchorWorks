import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { MenuBarSkeleton } from '../../../App';

/**
 * Pins the MenuBar lazy-loading contract introduced in App.tsx:
 *
 *  1. The Suspense fallback (MenuBarSkeleton) is a DECORATIVE same-shape
 *     stand-in — same root element and class string as the real MenuBar bar
 *     (so the swap is a recolour, not a layout shift), aria-hidden, and free
 *     of interactive/semantic descendants while the chunk streams in.
 *  2. The exact lazy declaration App.tsx uses shows the skeleton on the
 *     first committed paint, then swaps in the real MenuBar once the
 *     dynamic import resolves.
 *
 * Real timers on purpose (lazyContextMenu.test.tsx pattern): the dynamic
 * import()'s microtask chain must interleave with React commits.
 *
 * MenuBar's About dialog reads the build-injected version constant; vitest
 * doesn't run vite's define() pass (same stub as the StatusBar suite).
 */
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = '9.9.9';
// Repo-standard act() opt-in (dialog/panel migrate suites).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The exact lazy declaration shape App.tsx uses (named export re-wrapped).
const LazyMenuBar = lazy(() => import('../../MenuBar').then(m => ({ default: m.MenuBar })));

const menuBarProps = {
  onToggleAI: () => {},
  onToggleDebug: () => {},
  onShowOnboarding: () => {},
};

async function waitFor(cond: () => boolean, ms = 4000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}

describe('MenuBar lazy mount (App.tsx Suspense contract)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('skeleton is a decorative same-shape bar: aria-hidden, height-pinned, no focusables', () => {
    act(() => { root.render(<MenuBarSkeleton />); });
    const skeleton = container.querySelector('header');
    expect(skeleton).not.toBeNull();
    // Same chrome classes as the real MenuBar root — .topbar supplies the
    // identical gradient/border strip and h-11 the identical 44px height.
    expect(skeleton!.className).toBe('topbar h-11 flex items-center px-3 gap-2 text-xs');
    expect(skeleton!.className).toContain('h-11');
    // Decorative only: invisible to AT entirely.
    expect(skeleton!.getAttribute('aria-hidden')).toBe('true');
    // Nothing joins the tab order, focus ring, or a11y tree while the chunk
    // streams in — no buttons, links, inputs, roles, or tabbable elements.
    expect(
      skeleton!.querySelector('button, a, input, select, textarea, [role], [tabindex]'),
    ).toBeNull();
    // Shape: logo block + separator + the six dropdown-label blocks + a
    // trailing right-side chip (>= 6 muted placeholder blocks total).
    expect(skeleton!.querySelectorAll('.bg-panel3').length).toBeGreaterThanOrEqual(6);
  });

  it('Suspense shows the skeleton on first paint, then swaps in the real MenuBar with the same root classes', async () => {
    // Capture the skeleton's committed root class from the same tree shape.
    act(() => {
      root.render(
        <Suspense fallback={<MenuBarSkeleton />}>
          <LazyMenuBar {...menuBarProps} />
        </Suspense>,
      );
    });
    // First committed paint: fallback header present, real menubar absent
    // (the dynamic import cannot resolve inside the synchronous act flush).
    const skeletonAtFirstPaint = container.querySelector('header[aria-hidden="true"]');
    expect(skeletonAtFirstPaint).not.toBeNull();
    expect(skeletonAtFirstPaint!.className).toBe('topbar h-11 flex items-center px-3 gap-2 text-xs');
    expect(container.querySelector('[role="menubar"]')).toBeNull();

    // Once the import resolves the real MenuBar takes over…
    await waitFor(() => container.querySelector('[role="menubar"]') !== null);
    // …the skeleton is gone (no duplicate banner strip)…
    expect(container.querySelector('header[aria-hidden="true"]')).toBeNull();
    // …and the real bar commits the IDENTICAL root class string as the
    // skeleton, so the swap causes zero layout shift.
    const realHeader = container.querySelector('header.topbar');
    expect(realHeader).not.toBeNull();
    expect(realHeader!.className).toBe(skeletonAtFirstPaint!.className);
    expect(realHeader!.getAttribute('aria-hidden')).toBeNull();
  });
});
