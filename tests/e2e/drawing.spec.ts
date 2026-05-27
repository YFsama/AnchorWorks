import { test, expect } from './fixtures';

// Drawing — the rectangle tool's mouse-drag drawing flow. Pressing R should
// activate the rect tool; dragging on #main-canvas should add a `Rect` object
// to the canvas, which the LayersPanel should reflect in real time:
//   - The Layers header counter moves from 0 → 1
//   - A row with the default "Rect" label appears
//
// Fabric installs its own .upper-canvas DOM node inside #main-canvas; mouse
// events on the wrapper bubble down to it.
test('pressing R + dragging on the canvas adds a Rectangle layer', async ({ page }) => {
  await page.goto('/');
  // Wait for the chrome (the toolbar is the tool-state mirror) so single-key
  // shortcuts don't get eaten by the splash.
  const toolbar = page.locator('[role="toolbar"]').first();
  await expect(toolbar).toBeVisible();

  // Activate rect tool. Verify against the toolbar's aria-pressed signal so
  // we're sure the keystroke landed before we drag.
  const rectBtn = toolbar.locator('button[aria-label^="Rectangle"]');
  await page.keyboard.press('r');
  await expect(rectBtn).toHaveAttribute('aria-pressed', 'true');

  // Sanity check: Layers panel reports "0" before drawing.
  // The .panel-header for Layers contains two spans: the label "Layers" and a
  // count. Locate the section whose header text starts with "Layers" then
  // pluck the count span (`.tabular-nums`).
  const layersSection = page.locator('.panel-section').filter({ has: page.locator('.panel-header h3', { hasText: /^Layers$/ }) });
  const layerCount = layersSection.locator('.panel-header .panel-count').first();
  await expect(layerCount).toHaveText('0');

  // Drag-draw a rectangle. Use the wrapper bounding box so the coordinates
  // are absolute viewport pixels, matching what page.mouse expects.
  const canvas = page.locator('#main-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  // Start (300, 300) and end (500, 450) are RELATIVE to the canvas wrapper —
  // translate to absolute viewport coords.
  const startX = box.x + 300;
  const startY = box.y + 300;
  const endX = box.x + 500;
  const endY = box.y + 450;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Intermediate move helps fabric's drag-tracking emit a `mouse:move`.
  await page.mouse.move(startX + 50, startY + 25);
  await page.mouse.move(endX, endY);
  await page.mouse.up();

  // Layers count should bump to 1.
  await expect(layerCount).toHaveText('1');

  // A "Rect" label row should now be in the layers list.
  const rectRow = layersSection.getByText('Rect', { exact: true });
  await expect(rectRow.first()).toBeVisible();
});
