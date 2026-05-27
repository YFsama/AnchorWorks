import { test, expect } from './fixtures';

// MenuBar's zoom indicator (`ZoomChip`) is a click-to-edit chip — clicking
// opens an input where the user can type a percentage; Enter or blur commits;
// Escape cancels; Shift-click bypasses edit and fits to page.
//
// Regression guard for the new ZoomChip behaviour shipped after the Wave-17
// e2e layer.

test('Zoom chip enters edit mode on click and applies a typed percentage', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  // Locate the chip by its aria-label prefix ("Zoom 100%" / "Zoom 90%" etc).
  // The percentage shifts between viewports so we match the prefix only.
  const chip = page.getByRole('button', { name: /^Zoom \d+%/ });
  await expect(chip).toBeVisible();

  // Click to open editor — the chip is replaced with an input labelled "Zoom".
  await chip.click();
  const input = page.getByRole('textbox', { name: /^Zoom$/ });
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();

  // Type a new value and press Enter.
  await input.fill('200');
  await page.keyboard.press('Enter');

  // After commit, chip re-renders showing 200%.
  await expect(page.getByRole('button', { name: /^Zoom 200%/ })).toBeVisible();
});

test('Escape cancels zoom edit and preserves the previous value', async ({ page }) => {
  await page.goto('/');
  const chip = page.getByRole('button', { name: /^Zoom (\d+)%/ });
  await expect(chip).toBeVisible();
  // Capture the initial zoom % from the aria-label so the assertion adapts
  // to whatever the viewport landed on.
  const label = (await chip.getAttribute('aria-label')) ?? '';
  const initialPct = label.match(/(\d+)%/)?.[1] ?? '100';

  await chip.click();
  const input = page.getByRole('textbox', { name: /^Zoom$/ });
  await input.fill('500');
  await page.keyboard.press('Escape');

  // Editor dismisses; chip still shows the original zoom level.
  await expect(input).toBeHidden();
  await expect(page.getByRole('button', { name: new RegExp(`^Zoom ${initialPct}%`) })).toBeVisible();
});

test('Shift-click on the zoom chip fits to page without entering edit mode', async ({ page }) => {
  await page.goto('/');
  const chip = page.getByRole('button', { name: /^Zoom \d+%/ });
  await chip.click(); // bring up the editor first
  const input = page.getByRole('textbox', { name: /^Zoom$/ });
  await input.fill('500');
  await page.keyboard.press('Enter'); // now zoomed to 500%

  // Shift-click should NOT enter edit mode, should refit.
  const chipNow = page.getByRole('button', { name: /^Zoom \d+%/ });
  await chipNow.click({ modifiers: ['Shift'] });
  await expect(page.getByRole('textbox', { name: /^Zoom$/ })).toBeHidden();
  // Verify the % changed away from 500 (we don't pin a specific value —
  // viewport-dependent — just that the explicit 500% is no longer shown).
  await expect(page.getByRole('button', { name: /^Zoom 500%/ })).toBeHidden();
});
