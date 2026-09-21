import { test, expect } from './fixtures';

// Lazy Chinese dictionary — since the 0.13 code-split, i18n-zh is its own
// chunk loaded on demand (see src/lib/i18n.ts). Switching the language via
// the top-bar pill must eventually re-render the chrome in Chinese once the
// chunk lands, and switching back restores English. We assert eventual
// correctness only — no English-flash assertion (the interim English paint
// while the chunk is in flight is by design).
test('switching to Chinese re-renders the menu in Chinese, then back to English', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  // Baseline: the File menu is English (fresh context, persisted lang 'en').
  await expect(page.getByRole('menuitem', { name: 'File' })).toBeVisible();

  // The language switcher is a hover-revealed menu next to the menu bar —
  // hover the pill (aria-label "Language") to open it, then pick 中文.
  await page.getByRole('button', { name: 'Language' }).hover();
  await page.getByRole('menuitemradio', { name: '中文' }).click();

  // The zh dictionary chunk lazy-loads: `lang` flips immediately but the
  // labels only localise once `zhReady` flips (both re-render useT()
  // consumers, see i18n.ts). Poll for the File menu's accessible name
  // becoming 文件 with enough headroom for the chunk fetch.
  await expect(page.getByRole('menuitem', { name: '文件' })).toBeVisible({ timeout: 10_000 });

  // Switch back via the now Chinese-labelled pill (aria-label 语言) and
  // confirm English returns.
  await page.getByRole('button', { name: '语言' }).hover();
  await page.getByRole('menuitemradio', { name: 'EN' }).click();
  await expect(page.getByRole('menuitem', { name: 'File' })).toBeVisible({ timeout: 10_000 });
});
