import { test, expect } from './fixtures';

// Preferences → Editor tab's Mouse wheel segmented control — 'pan' (Figma
// default) vs 'zoom' (Illustrator-style). The choice is read live per wheel
// event, and Apply persists it to localStorage under `vector.prefs`
// (src/lib/preferences.ts), which is the reload-survival contract.
test('Mouse wheel preference offers Zoom and Apply persists it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  // Cmd/Ctrl+, opens preferences (App.tsx routes window.preferences).
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: /preferences/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // The wheel row lives on the Editor tab alongside the snap/guide toggles.
  await dialog.getByRole('tab', { name: 'Editor' }).click();
  const wheel = dialog.getByRole('group', { name: 'Mouse wheel' });
  await expect(wheel).toBeVisible();

  // Segmented pair: Scroll (pan) is the pressed default, Zoom starts off.
  const scrollBtn = wheel.getByRole('button', { name: /Scroll/ });
  const zoomBtn = wheel.getByRole('button', { name: /^Zoom/ });
  await expect(scrollBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(zoomBtn).toHaveAttribute('aria-pressed', 'false');

  // Flip to Zoom and apply — the draft commits to localStorage.
  await zoomBtn.click();
  await expect(zoomBtn).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Apply' }).click();

  const stored = await page.evaluate(() => {
    try {
      return JSON.parse(window.localStorage.getItem('vector.prefs') ?? '{}').wheelMode;
    } catch {
      return '(unreadable)';
    }
  });
  expect(stored).toBe('zoom');
});
