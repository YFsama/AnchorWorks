import { test, expect, type Page, type Locator } from './fixtures';

// TemplatesDialog e2e regression net (P2-2 + a11y-suite migration) — the
// dialog (src/components/TemplatesDialog.tsx) had zero e2e coverage. These
// specs exercise it the way a keyboard user does:
//   - Ctrl+Alt+N ("file.newFromTemplate" default binding, src/lib/keymap.ts)
//     opens the dialog
//   - the template grid (role="grid", aria-label "Template results") roves by
//     ArrowDown/ArrowRight/ArrowUp with aria-selected following the review
//     index (makeGridKeys, 3 columns, clamped — no wrap)
//   - Enter applies the reviewed template: its build() clears the canvas and
//     adds its objects, so the StatusBar "Objects N" counter is the outcome
//     anchor (square-social adds exactly 5 — src/lib/templates.ts)
//   - Escape closes (useEscapeClose)
//
// Selectors stick to the project's role/accessible-name/aria-state
// convention; the only text-matched nodes are i18n-sourced user-visible
// strings ("6 templates" result summary, the "Reviewing …" live-region
// announcement).

/** Open Templates via its keyboard binding and return the dialog locator.
 *  The accessible name comes from aria-labelledby → the "New from Template…"
 *  h2, so match on a prefix regex to stay robust against the trailing
 *  ellipsis character. */
async function openTemplates(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+Alt+n');
  const dialog = page.getByRole('dialog', { name: /^New from Template/ });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

function objectsCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

// Intent: the dialog opens with the full gallery as a keyboard-navigable
// grid — the first tile starts as the reviewed one (aria-selected), arrows
// move the review index horizontally and vertically (3-column grid), the
// external live region announces the reviewed template, and Escape closes.
// Anchors: role=grid by accessible name, aria-selected per gridcell, the
// focus position, and the dialog's visible i18n strings.
test('Ctrl+Alt+N opens Templates with 2-D keyboard grid navigation; Escape closes', async ({ page }) => {
  await page.goto('/');
  // Wait for the chrome so the shortcut isn't eaten by the boot splash.
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

  const dialog = await openTemplates(page);

  // The results grid is present with the full gallery listed (6 templates in
  // src/lib/templates.ts — the "N templates" result summary is a visible,
  // i18n-sourced count anchor).
  const grid = dialog.getByRole('grid', { name: 'Template results' });
  await expect(grid).toBeVisible();
  await expect(dialog.getByText('6 templates')).toBeVisible();

  const tiles = grid.getByRole('gridcell');
  await expect(tiles).toHaveCount(6);

  // Tile 0 ("Business Card") is the default review target.
  await expect(tiles.first()).toHaveAttribute('aria-selected', 'true');

  // ArrowDown from the search box moves focus onto the first tile (the
  // dialog's own key handling — click the search box first so focus is
  // deterministic rather than relying on the autofocus animation frame).
  await dialog.getByRole('searchbox', { name: /^Search templates/ }).click();
  await page.keyboard.press('ArrowDown');
  await expect(tiles.nth(0)).toBeFocused();

  // ArrowRight crosses the row boundary freely: 0 → 1 ("Square Social
  // Post"). aria-selected follows the focused tile.
  await page.keyboard.press('ArrowRight');
  await expect(tiles.nth(1)).toBeFocused();
  await expect(tiles.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tiles.nth(0)).toHaveAttribute('aria-selected', 'false');

  // The external live region announces the reviewed tile with its position.
  await expect(dialog.getByText(/Reviewing Square Social Post 2 \/ 6/)).toBeVisible();

  // ArrowDown steps a full row (3 columns): 1 → 4; ArrowUp climbs back —
  // vertical navigation is clamped, never wrapping.
  await page.keyboard.press('ArrowDown');
  await expect(tiles.nth(4)).toBeFocused();
  await expect(tiles.nth(4)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(tiles.nth(1)).toHaveAttribute('aria-selected', 'true');

  // Escape closes the dialog.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

// Intent: Enter applies the template under review — build() clears the canvas
// and adds the template's objects, then the dialog closes. The StatusBar
// "Objects" counter is the outcome anchor: "Square Social Post" adds exactly
// 5 objects (blob, square, dot, headline, sub), so 0 → 5 proves the template
// actually landed on the canvas.
test('Enter on the reviewed tile applies the template to the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 0$/);

  const dialog = await openTemplates(page);
  const tiles = dialog.getByRole('grid', { name: 'Template results' }).getByRole('gridcell');

  // Focus the grid, then ArrowRight onto tile 1 = "Square Social Post".
  await dialog.getByRole('searchbox', { name: /^Search templates/ }).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(tiles.nth(1)).toHaveAttribute('aria-selected', 'true');

  // Enter activates the focused gridcell (a native button) → pick() →
  // build() → close().
  await page.keyboard.press('Enter');

  await expect(dialog).toBeHidden();
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 5$/);
});
