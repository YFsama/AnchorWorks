import { test, expect, toolsToolbar } from './fixtures';

// Knife tool — the freehand slicing tool landed with the cut-production wave.
// The toolbar surface, the K keymap route, and the tool-state reflection are
// guarded here; the cut geometry itself is owned by the vitest suite
// (src/lib/knife.ts) so this spec never drags on the canvas.
test('knife tool sits on the toolbar and K activates it', async ({ page }) => {
  // Surface-level console noise is part of the contract — a tool mount that
  // throws would land here even if the button still rendered.
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  const toolbar = toolsToolbar(page);
  await expect(toolbar).toBeVisible();

  // The button exposes its localized name and the K binding separately
  // (aria-label + aria-keyshortcuts, see Toolbar.tsx).
  const knifeBtn = toolbar.locator('button[aria-label="Knife"]');
  await expect(knifeBtn).toBeVisible();
  await expect(knifeBtn).toHaveAttribute('aria-keyshortcuts', 'K');
  await expect(knifeBtn).toHaveAttribute('aria-pressed', 'false');

  // Single-key shortcut flips the active tool; the button mirrors the store.
  await page.keyboard.press('k');
  await expect(knifeBtn).toHaveAttribute('aria-pressed', 'true');
  // StatusBar announces the active tool by name in its Editor status group.
  await expect(page.locator('[role="group"][aria-label="Editor status"]')).toContainText('Knife');

  expect(errors).toEqual([]);
});
