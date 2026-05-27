import { test as base, expect } from '@playwright/test';

// Shared Playwright base test for Anchorworks.
//
// All e2e specs import { test, expect } from this file. The fixture pre-seeds
// localStorage so the first-run Onboarding overlay (z-60, drawn over the rest
// of the UI) is skipped — without this, every test has to dismiss it manually
// and many keyboard interactions would target the onboarding modal instead of
// the editor chrome.
export const test = base.extend({
  page: async ({ page }, use) => {
    // Match the `vector.onboarded` key in src/lib/onboarding.ts.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('vector.onboarded', 'true');
      } catch {
        /* private-mode or sandboxed iframe — ignore */
      }
    });
    await use(page);
  },
});

export { expect };
