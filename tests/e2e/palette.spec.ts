import { test, expect } from './fixtures';

// Command Palette — the keyboard-first action surface. Validates the Ctrl+K
// open path, the query → filtered-list pipeline, and Escape-to-close.
test('Ctrl+K opens the command palette, filters by query, and closes on Escape', async ({ page }) => {
  await page.goto('/');

  // Wait for the app shell so global keydown listeners are wired up. The
  // menubar is itself a lazy chunk (skeleton first frame) — allow the same
  // generous cold-start window as the palette assertion below.
  await expect(page.locator('[role="menubar"]')).toBeVisible({ timeout: 15_000 });

  // Cmd+K is the convention; the App.tsx handler treats Ctrl+K and Cmd+K as
  // equivalent. Use Control+K since this suite targets Linux Chromium.
  await page.keyboard.press('Control+K');

  // The palette mounts a role="dialog" with the search input inside. The
  // palette is a lazy chunk (idle-warmed at boot); on a cold server/browser
  // the first Ctrl+K may have to fetch it, so allow a generous first paint.
  const dialog = page.getByRole('dialog', { name: /command palette/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // The search input carries the placeholder text.
  const search = dialog.locator('input[placeholder="Type a command or search…"]');
  await expect(search).toBeVisible();

  // Typing "outline view" narrows the list to exactly the "Outline View"
  // command. (A bare "outline" isn't unique anymore — dozens of vinyl/sign
  // commands carry "outline" in their keywords: contours, swatch strokes,
  // multi-outline, …. The two-word query pins the label itself, whose
  // keywords are "wireframe geometry preview".)
  await search.fill('outline view');
  const options = dialog.locator('[role="option"]');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText(/outline view/i);

  // Escape closes the palette — the dialog should detach from the DOM.
  // The palette's input consumes the FIRST Escape to clear a non-empty
  // query (see CommandPalette onKeyDown); only the second closes. Empty
  // the box first so a single Escape demonstrably closes.
  await search.fill('');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
