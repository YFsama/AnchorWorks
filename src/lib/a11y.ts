/**
 * Accessibility helpers.
 *
 * `announce(text)` pushes a message into the global aria-live region rendered
 * inside <App />. Screen readers read polite updates as they're written.
 *
 * The live region is registered at runtime via `setLiveRegion(...)` from
 * App.tsx — until that happens, calls are no-ops (safe during boot).
 */

let liveEl: HTMLElement | null = null;

export function setLiveRegion(el: HTMLElement | null) {
  liveEl = el;
}

export function announce(text: string) {
  if (!liveEl || !text) return;
  // Toggle textContent so the same message announces twice (screen readers
  // ignore identical consecutive updates).
  liveEl.textContent = '';
  // Use a microtask so the DOM update actually flushes between writes.
  Promise.resolve().then(() => {
    if (liveEl) liveEl.textContent = text;
  });
}
