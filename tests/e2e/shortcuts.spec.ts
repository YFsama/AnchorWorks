import { test, expect, type Page } from './fixtures';

// Keyboard-shortcut suite — verifies the round-trip from a key press through
// the canvas store update through the StatusBar's live counters:
//   - Ctrl+A → selects every object
//   - Esc    → deselects
//   - Delete → removes the active object (objects count drops by 1)
//   - Ctrl+Z → undoes the delete and brings the object back
//
// Each assertion reads `aria-label="Selected N"` / `aria-label="Objects N"`
// from the StatusBar — see src/components/StatusBar.tsx.

async function drawOneRect(page: Page): Promise<void> {
  const toolbar = page.locator('[role="toolbar"]').first();
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

function selectedCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Selected "]').first();
}
function objectsCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

test('Ctrl+A selects all and Escape deselects', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page);

  // After a fresh draw, fabric leaves the new shape selected — pop back to
  // select tool so Ctrl+A doesn't interact with a drawing-tool state.
  await page.keyboard.press('v');

  // Discard whatever selection exists so we start from a known 0 state.
  await page.keyboard.press('Escape');
  await expect(selectedCount(page)).toHaveAttribute('aria-label', /Selected 0$/);

  // Select all.
  await page.keyboard.press('Control+a');
  await expect(selectedCount(page)).toHaveAttribute('aria-label', /Selected [1-9]\d*$/);

  // Escape clears the selection.
  await page.keyboard.press('Escape');
  await expect(selectedCount(page)).toHaveAttribute('aria-label', /Selected 0$/);
});

test('Delete removes the active object and Ctrl+Z restores it', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page);
  await page.keyboard.press('v');

  // Should have one object on canvas.
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);

  // Select all so something is the active target for Delete.
  await page.keyboard.press('Control+a');
  await expect(selectedCount(page)).toHaveAttribute('aria-label', /Selected [1-9]\d*$/);

  // Delete the selection — objects count drops to 0.
  await page.keyboard.press('Delete');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 0$/);

  // Undo brings it back.
  await page.keyboard.press('Control+z');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
});
