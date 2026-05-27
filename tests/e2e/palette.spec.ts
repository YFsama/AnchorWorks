import { test, expect } from './fixtures';

// Command Palette — the keyboard-first action surface. Validates the Ctrl+K
// open path, the query → filtered-list pipeline, and Escape-to-close.
test('Ctrl+K opens the command palette, filters by query, and closes on Escape', async ({ page }) => {
  await page.goto('/');

  // Wait for the app shell so global keydown listeners are wired up.
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  // Cmd+K is the convention; the App.tsx handler treats Ctrl+K and Cmd+K as
  // equivalent. Use Control+K since this suite targets Linux Chromium.
  await page.keyboard.press('Control+K');

  // The palette mounts a role="dialog" with the search input inside.
  const dialog = page.getByRole('dialog', { name: /command palette/i });
  await expect(dialog).toBeVisible();

  // The search input carries the placeholder text.
  const search = dialog.locator('input[placeholder="Type a command or search…"]');
  await expect(search).toBeVisible();

  // Typing "outline" should narrow the list to exactly the "Outline View"
  // command (only entry whose label/keywords contain "outline").
  await search.fill('outline');
  const options = dialog.locator('[role="option"]');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText(/outline/i);

  // Escape closes the palette — the dialog should detach from the DOM.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
