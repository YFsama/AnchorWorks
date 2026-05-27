import { test, expect } from './fixtures';

// Recent Files — surfaced in the File menu after the user saves or opens a
// project. The list lives in `localStorage` under `vector.recentFiles`
// (envelope: `{ v: 1, files: [{ name, ts, preview? }] }` — see
// src/lib/recentFiles.ts). We seed an entry before navigation so the menu
// renders the row on first open without going through the FS picker.
test('seeded recent files appear in the File menu', async ({ page }) => {
  // Seed BEFORE the page loads so the React subscription picks it up on mount.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vector.recentFiles',
        JSON.stringify({ v: 1, files: [{ name: 'design.vstudio.json', ts: Date.now() }] }),
      );
    } catch {
      /* private mode — ignore */
    }
  });

  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  // Open File menu (CSS group-hover).
  const fileTrigger = page.getByRole('menuitem', { name: 'File' }).first();
  await fileTrigger.hover();

  // The recent-files button is rendered by MenuBar's `buildRecentFilesItems`
  // with `aria-label="Open recent: <name>"`. Match by that label so a label
  // rename in the on-screen text doesn't break the test.
  const recentItem = page.getByRole('menuitem', { name: 'Open recent: design.vstudio.json' });
  await expect(recentItem).toBeVisible({ timeout: 10_000 });

  // The "Recent Files" section header is a static label (not a menuitem).
  // It should also be present in the open File menu.
  await expect(page.getByRole('menu', { name: 'File' }).getByText('Recent Files')).toBeVisible();
});
