import { test, expect, toolsToolbar, type Page } from './fixtures';

// Variable Data (CSV merge wave) — Ctrl+Alt+V opens the dialog once
// something is selected (the shortcut warns off with a toast otherwise, see
// the text.variableData branch in App.tsx). The dialog must expose the CSV
// source tab so a merge run can be configured without leaving the keyboard
// flow.

/** Drag-draw a single rectangle so the VD shortcut has a selection. Mirrors
 *  the canonical sequence in drawing.spec.ts. */
async function drawOneRect(page: Page): Promise<void> {
  const toolbar = toolsToolbar(page);
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('r');
  await expect(toolbar.locator('button[aria-label^="Rectangle"]')).toHaveAttribute('aria-pressed', 'true');

  const canvas = page.locator('#main-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 350, box.y + 325);
  await page.mouse.move(box.x + 500, box.y + 450);
  await page.mouse.up();
}

test('Ctrl+Alt+V opens Variable Data with the CSV source tab', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page);

  await page.keyboard.press('Control+Alt+v');
  const dialog = page.getByRole('dialog', { name: /variable data/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Mode tabs: Numbers / List / CSV. Selecting CSV must mark it active.
  const csvTab = dialog.getByRole('tab', { name: 'CSV' });
  await expect(csvTab).toBeVisible();
  await csvTab.click();
  await expect(csvTab).toHaveAttribute('aria-selected', 'true');
});
