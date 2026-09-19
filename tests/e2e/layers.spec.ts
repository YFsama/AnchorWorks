import { test, expect, toolsToolbar, type Page } from './fixtures';

// LayersPanel interactions — once a layer exists, the user can toggle its
// visibility (Eye / EyeOff icon swap) and rename it via double-click → input
// → Enter. Both surfaces are touched here in a single test sequence so the
// fixture only has to spin the app once per assertion path, while still
// keeping each `test()` focused on a single user story.

/**
 * Drag-draw a single rectangle so we have a layer to interact with. Mirrors
 * the canonical sequence in drawing.spec.ts.
 */
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

function layersSection(page: Page) {
  return page.locator('.panel-section').filter({ has: page.locator('.panel-header h3', { hasText: /^Layers$/ }) });
}

test('toggling a layer\'s visibility swaps the Eye icon to EyeOff', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page);

  // The first row in the Layers panel maps to our new Rect. Visibility is the
  // first icon button after the drag handle. It exposes title="Hide" while
  // visible and title="Show" once hidden — see LayersPanel.tsx.
  const section = layersSection(page);
  await expect(section.locator('.panel-header .panel-count').first()).toHaveText('1');

  // Find the row containing our "Rect" text — the row itself sits one level up
  // from that <span>. We then scope queries to that row.
  const rectRow = section.locator('div.relative').filter({ has: page.getByText('Rect', { exact: true }) }).first();
  await expect(rectRow).toBeVisible();

  // Pre-toggle: the row renders the "Eye" icon (visible). We can't rely on
  // the `title` attribute because TooltipHost stashes it into
  // `data-tip-orig=""` after first DOM scan, leaving title="" on the live
  // node. Instead match on the lucide-eye/lucide-eye-off SVG class — the
  // structural signal of which icon is rendered. All queries stay scoped to
  // the row: the panel's "Layer quick actions" toolbar above the list also
  // carries Eye/EyeOff buttons (Show All / Hide Others) and would otherwise
  // swallow the assertions.
  const eyeBtn = rectRow.locator('button:has(svg.lucide-eye)').first();
  await expect(eyeBtn).toBeVisible();

  // Click the visibility button. After the toggle the same button slot in
  // the row renders the EyeOff icon and the original Eye is gone from it.
  await eyeBtn.click();
  await expect(rectRow.locator('button:has(svg.lucide-eye-off)')).toBeVisible();
  await expect(rectRow.locator('svg.lucide-eye')).toHaveCount(0);
});

test('double-clicking a layer name opens an input and Enter commits the new name', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page);
  const section = layersSection(page);
  await expect(section.locator('.panel-header .panel-count').first()).toHaveText('1');

  // The default name span shows "Rect". Double-click it to enter edit mode.
  const nameSpan = section.getByText('Rect', { exact: true }).first();
  await nameSpan.dblclick();

  // After dblclick the span is replaced with an <input>. It is auto-focused
  // and selects all existing text.
  const input = section.locator('input[type="text"], input:not([type])').first();
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();

  // Replace current selection with "Hero shape" then commit with Enter.
  await page.keyboard.type('Hero shape');
  await page.keyboard.press('Enter');

  // Input dismisses; the new name shows in the row.
  await expect(input).toBeHidden();
  await expect(section.getByText('Hero shape', { exact: true })).toBeVisible();
});
