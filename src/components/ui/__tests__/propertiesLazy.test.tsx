import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { PropertiesSkeleton } from '../../../App';

/**
 * Pins the PropertiesPanel lazy-loading contract introduced in App.tsx:
 *
 *  1. The Suspense fallback (PropertiesSkeleton) is a DECORATIVE same-shape
 *     stand-in — same root element and class string as the real panel's
 *     scroll container (so the swap fills the rows in rather than shifting
 *     the right column), aria-hidden, and free of interactive/semantic
 *     descendants while the chunk streams in.
 *  2. The exact lazy declaration App.tsx uses shows the skeleton on the
 *     first committed paint, then swaps in the real PropertiesPanel once the
 *     dynamic import resolves.
 *
 * Real timers on purpose (menubarLazy.test.tsx pattern): the dynamic
 * import()'s microtask chain must interleave with React commits.
 */

// Repo-standard act() opt-in (dialog/panel migrate suites).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The exact lazy declaration shape App.tsx uses (named export re-wrapped).
const LazyPropertiesPanel = lazy(() => import('../../PropertiesPanel').then(m => ({ default: m.PropertiesPanel })));

async function waitFor(cond: () => boolean, ms = 4000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}

describe('PropertiesPanel lazy mount (App.tsx Suspense contract)', () => {
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

  it('skeleton is a decorative same-shape panel: aria-hidden, section dividers, no focusables', () => {
    act(() => { root.render(<PropertiesSkeleton />); });
    const skeleton = container.querySelector('div');
    expect(skeleton).not.toBeNull();
    // Same scroll-container classes as the real PropertiesPanel root —
    // .panel-section supplies the identical section dividers/padding.
    expect(skeleton!.className).toBe('flex flex-col text-xs overflow-y-auto h-full');
    // Decorative only: invisible to AT entirely.
    expect(skeleton!.getAttribute('aria-hidden')).toBe('true');
    // Nothing joins the tab order, focus ring, or a11y tree while the chunk
    // streams in — no buttons, links, inputs, roles, or tabbable elements.
    expect(
      skeleton!.querySelector('button, a, input, select, textarea, [role], [tabindex]'),
    ).toBeNull();
    // Shape: two section blocks mirroring the real panel's first screen
    // (Appearance + one more), each with a label block and control rows.
    expect(skeleton!.querySelectorAll('.panel-section').length).toBe(2);
    expect(skeleton!.querySelectorAll('.bg-panel3').length).toBeGreaterThanOrEqual(6);
  });

  it('Suspense shows the skeleton on first paint, then swaps in the real PropertiesPanel with the same root classes', async () => {
    // Capture the skeleton's committed root class from the same tree shape.
    act(() => {
      root.render(
        <Suspense fallback={<PropertiesSkeleton />}>
          <LazyPropertiesPanel />
        </Suspense>,
      );
    });
    // First committed paint: fallback present, real panel absent (the
    // dynamic import cannot resolve inside the synchronous act flush). The
    // real panel's tell is its field-label section headings (the skeleton's
    // labels are plain divs) — the Appearance section renders even with no
    // selection.
    const skeletonAtFirstPaint = container.querySelector('div[aria-hidden="true"]');
    expect(skeletonAtFirstPaint).not.toBeNull();
    expect(skeletonAtFirstPaint!.className).toBe('flex flex-col text-xs overflow-y-auto h-full');
    expect(container.querySelector('h3.field-label')).toBeNull();

    // Once the import resolves the real PropertiesPanel takes over…
    await waitFor(() => container.querySelector('h3.field-label') !== null);
    // …the skeleton is gone (no duplicate scroll container)…
    expect(container.querySelector('div[aria-hidden="true"]')).toBeNull();
    // …and the real panel commits the IDENTICAL root class string as the
    // skeleton, so the swap causes zero layout shift.
    const realRoot = Array.from(container.querySelectorAll('div')).find(
      (d) => d.className === skeletonAtFirstPaint!.className,
    );
    expect(realRoot).not.toBeNull();
    expect(realRoot!.getAttribute('aria-hidden')).toBeNull();
    // Sanity: this really is the properties panel (Appearance heading).
    const headings = Array.from(container.querySelectorAll('h3.field-label')).map((h) => h.textContent);
    expect(headings).toContain('Appearance');
  });
});
