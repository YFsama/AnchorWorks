import { test, expect } from './fixtures';

// Pen tool — exercise the new bezier authoring path. After the rewrite,
// the pen accepts:
//   - Click to place a corner anchor
//   - Press-and-drag to place a smooth anchor with an outgoing tangent
//   - Escape finishes the open path; Enter would close it
// This test goes through the corner path because Enter/Escape semantics
// are the most likely to regress (they're at the App-level keydown).

test('Pen + clicks + Escape commits a Path layer', async ({ page }) => {
  await page.goto('/');
  const toolbar = page.locator('[role="toolbar"]').first();
  await expect(toolbar).toBeVisible();

  const penBtn = toolbar.locator('button[aria-label="Pen"]');
  await page.keyboard.press('p');
  await expect(penBtn).toHaveAttribute('aria-pressed', 'true');

  const layersSection = page.locator('.panel-section').filter({
    has: page.locator('.panel-header h3', { hasText: /^Layers$/ }),
  });
  const layerCount = layersSection.locator('.panel-header .panel-count').first();
  await expect(layerCount).toHaveText('0');

  const canvas = page.locator('#main-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  // Place three anchors as plain clicks (corner anchors). Spread them out
  // so the path isn't degenerate.
  for (const [dx, dy] of [
    [300, 300],
    [450, 350],
    [380, 480],
  ] as const) {
    await page.mouse.click(box.x + dx, box.y + dy);
  }

  // Esc — finishes the open path. Pen→penEscape→finishPath(false) → commits.
  await page.keyboard.press('Escape');

  // A Path row should appear in Layers and the count should bump to 1.
  await expect(layerCount).toHaveText('1');
  const pathRow = layersSection.getByText('Path', { exact: true });
  await expect(pathRow.first()).toBeVisible();
});

test('Pen + drag-tangent + Enter closes a path with a smooth anchor', async ({ page }) => {
  await page.goto('/');
  const toolbar = page.locator('[role="toolbar"]').first();
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('p');

  const layersSection = page.locator('.panel-section').filter({
    has: page.locator('.panel-header h3', { hasText: /^Layers$/ }),
  });
  const layerCount = layersSection.locator('.panel-header .panel-count').first();
  await expect(layerCount).toHaveText('0');

  const canvas = page.locator('#main-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  // First anchor — plain click (corner).
  await page.mouse.click(box.x + 300, box.y + 300);
  // Second anchor — press, drag, release. The drag tail becomes the
  // outgoing tangent, so this anchor lands as smooth in the path data.
  await page.mouse.move(box.x + 500, box.y + 320);
  await page.mouse.down();
  await page.mouse.move(box.x + 540, box.y + 360);
  await page.mouse.up();
  // Third anchor — plain click.
  await page.mouse.click(box.x + 480, box.y + 480);

  // Enter — closes the path. penEnter → finishPath(true).
  await page.keyboard.press('Enter');

  await expect(layerCount).toHaveText('1');
});
