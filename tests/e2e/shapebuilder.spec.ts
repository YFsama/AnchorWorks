import { test, expect, toolsToolbar } from './fixtures';

// Shape Builder (Illustrator Shift+M / Affinity) — the region-merge tool
// from the boolean-ops wave. The toolbar surface, the Shift+M keymap route,
// and the tool-state reflection are guarded here; the region math itself is
// owned by the vitest suite (src/lib/shapeBuilder.ts,
// shapeBuilderRegions.test.ts) so this spec never drags on the canvas.
test('shape builder sits on the toolbar and Shift+M activates it', async ({ page }) => {
  // Surface-level console noise is part of the contract — a tool mount that
  // throws would land here even if the button still rendered.
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  const toolbar = toolsToolbar(page);
  await expect(toolbar).toBeVisible();

  // The button exposes its localized name and the Shift+M binding separately
  // (aria-label + aria-keyshortcuts, see Toolbar.tsx).
  const builderBtn = toolbar.locator('button[aria-label="Shape Builder"]');
  await expect(builderBtn).toBeVisible();
  await expect(builderBtn).toHaveAttribute('aria-keyshortcuts', 'Shift+M');
  await expect(builderBtn).toHaveAttribute('aria-pressed', 'false');

  // Shift+M flips the active tool; the button mirrors the store.
  await page.keyboard.press('Shift+M');
  await expect(builderBtn).toHaveAttribute('aria-pressed', 'true');
  // StatusBar announces the active tool by name in its Editor status group.
  await expect(page.locator('[role="group"][aria-label="Editor status"]')).toContainText('Shape Builder');

  expect(errors).toEqual([]);
});
