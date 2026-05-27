import { test, expect } from './fixtures';

// Keyboard tool switching — exercises the global onKey handler in App.tsx
// that routes V/R/X (and other letter keys) to setTool. Catches regressions
// where the keymap wiring breaks or a tool button stops reflecting state.
test('keyboard shortcuts switch tools and the toolbar reflects the active tool', async ({ page }) => {
  await page.goto('/');

  // Wait for the toolbar to mount before sending keys (otherwise our
  // keystrokes hit the splash and get dropped on the floor).
  const toolbar = page.locator('[role="toolbar"]').first();
  await expect(toolbar).toBeVisible();

  // Tool buttons use aria-label="Rectangle (R)" etc. — match by prefix so
  // localisation tweaks to the suffix don't break us.
  const selectBtn = toolbar.locator('button[aria-label^="Select"]');
  const rectBtn = toolbar.locator('button[aria-label^="Rectangle"]');
  const eraserBtn = toolbar.locator('button[aria-label^="Eraser"]');

  // 'R' → Rectangle
  await page.keyboard.press('r');
  await expect(rectBtn).toHaveAttribute('aria-pressed', 'true');

  // 'V' → Select (return to the default pointer).
  await page.keyboard.press('v');
  await expect(selectBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(rectBtn).toHaveAttribute('aria-pressed', 'false');

  // 'X' → Eraser. Verifies that the dedicated eraser binding still fires.
  await page.keyboard.press('x');
  await expect(eraserBtn).toHaveAttribute('aria-pressed', 'true');
});
