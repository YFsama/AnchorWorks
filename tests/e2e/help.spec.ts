import { test, expect } from './fixtures';

// Help Center — opened with F1. Lazy-loaded, so the dialog can take a beat
// to appear on first invocation. The left rail must surface the "Welcome"
// topic so newcomers have a landing page.
test('F1 opens the Help Center with the Welcome topic, and Escape dismisses it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  // F1 is bound to help.helpCenter in the keymap.
  await page.keyboard.press('F1');

  const dialog = page.getByRole('dialog', { name: /help center/i });
  // The HelpCenter chunk is code-split; give the lazy import time to land.
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // The left rail enumerates topics; one of them must be the introductory
  // "Welcome" topic. Use getByRole('button') so we ignore the title-card
  // heading on the body side.
  await expect(dialog.getByRole('button', { name: 'Welcome' })).toBeVisible();

  // Escape closes the dialog. The capture-phase document listener (added
  // to HelpCenter) sits ahead of the search input's own keydown handler so
  // Escape works even when focus is in the search field — regression guard
  // for the bug Agent OO surfaced.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

// Independent guard: Escape works even when focus is explicitly in the
// search input (verifies the capture-phase listener actually runs first).
test('Escape closes Help Center even with the search input focused', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('F1');
  const dialog = page.getByRole('dialog', { name: /help center/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Force-focus the search input; type a character so the input takes
  // control of subsequent keydowns. Then Escape must still close.
  const search = dialog.getByPlaceholder(/search topics/i);
  await search.click();
  await search.fill('outline');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
