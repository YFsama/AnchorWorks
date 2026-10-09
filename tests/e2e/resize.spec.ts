import { test, expect } from './fixtures';

// Window-resize viewport preservation. Before the fix, every canvas-size
// change (OS window resize, sidebar drag, panel toggle) funneled through
// reflow → zoomFit(), stomping the user's zoom/pan; now only the first
// layout fits, later resizes keep the zoom and re-centre the same scene
// point (computeResizeViewportTransform — the centre/zoom invariants
// themselves are owned by src/lib/__tests__/viewportResize.test.ts, this
// spec guards the user-visible readout end to end).
//
// Anchors follow zoom.spec.ts: the MenuBar ZoomChip button announces
// "Zoom <pct>%" and its editor input is the textbox named "Zoom".

/** Rounded CSS width of fabric's lower canvas inside the canvas wrap —
 *  reflow's setDimensions writes this, so polling it against the wrap's
 *  clientWidth proves the resize was *processed* (not merely that layout
 *  settled), which makes the zoom assertions below race-free. */
const lowerCanvasCssWidth = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#main-canvas canvas.lower-canvas');
    return canvas ? Math.round(canvas.getBoundingClientRect().width) : -1;
  });

test('window resize keeps the user zoom instead of refitting', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  // Set a zoom no fit would produce at either window size: the default
  // 800×600 doc fits ≈79% at 1000×700 and ≈112% at 1440×900, so 150% is
  // distinctive at both — if the old refit-on-resize behaviour regressed,
  // the chip would drop off 150 immediately.
  const chip = page.getByRole('button', { name: /^Zoom \d+%/ });
  await expect(chip).toBeVisible();
  await chip.click();
  const input = page.getByRole('textbox', { name: /^Zoom$/ });
  await input.fill('150');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Zoom 150%/ })).toBeVisible();

  // Shrink the window, wait until reflow committed the new size, then the
  // zoom readout must be untouched and the canvas still on screen.
  await page.setViewportSize({ width: 1000, height: 700 });
  const wrapAfterShrink = await page.evaluate(() => document.getElementById('main-canvas')?.clientWidth ?? -1);
  await expect.poll(() => lowerCanvasCssWidth(page), { timeout: 5000 }).toBe(wrapAfterShrink);
  await expect(page.getByRole('button', { name: /^Zoom 150%/ })).toBeVisible();
  await expect(page.locator('#main-canvas canvas.lower-canvas')).toBeVisible();

  // Grow back — same invariants.
  await page.setViewportSize({ width: 1440, height: 900 });
  const wrapAfterGrow = await page.evaluate(() => document.getElementById('main-canvas')?.clientWidth ?? -1);
  await expect.poll(() => lowerCanvasCssWidth(page), { timeout: 5000 }).toBe(wrapAfterGrow);
  await expect(page.getByRole('button', { name: /^Zoom 150%/ })).toBeVisible();
  await expect(page.locator('#main-canvas canvas.lower-canvas')).toBeVisible();
});
