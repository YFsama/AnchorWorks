import { test, expect, toolsToolbar } from './fixtures';

// Width tool (Illustrator Shift+W / Affinity) — hover a stroked path to see
// its width stations, drag to taper. Same guard-rail scope as the knife and
// shape-builder specs: toolbar surface, keymap route, tool-state reflection.
// The station math and live overlays are owned by the vitest suite
// (src/lib/variableWidth.ts) so this spec never drags the canvas.
test('width tool sits on the toolbar and Shift+W activates it', async ({ page }) => {
  // Surface-level console noise is part of the contract — a tool mount that
  // throws would land here even if the button still rendered.
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  const toolbar = toolsToolbar(page);
  await expect(toolbar).toBeVisible();

  // The button exposes its localized name and the Shift+W binding separately
  // (aria-label + aria-keyshortcuts, see Toolbar.tsx). The registry label is
  // "Width Tool" — keep the aria-label exact, not a prefix match, so a future
  // "Width" rename shows up as a deliberate spec change.
  const widthBtn = toolbar.locator('button[aria-label="Width Tool"]');
  await expect(widthBtn).toBeVisible();
  await expect(widthBtn).toHaveAttribute('aria-keyshortcuts', 'Shift+W');
  await expect(widthBtn).toHaveAttribute('aria-pressed', 'false');

  // Shift+W flips the active tool; the button mirrors the store.
  await page.keyboard.press('Shift+W');
  await expect(widthBtn).toHaveAttribute('aria-pressed', 'true');
  // StatusBar announces the active tool by name in its Editor status group.
  await expect(page.locator('[role="group"][aria-label="Editor status"]')).toContainText('Width Tool');

  expect(errors).toEqual([]);
});
