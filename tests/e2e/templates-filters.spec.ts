import { test, expect, type Locator, type Page } from './fixtures';

// TemplatesDialog filter branches (P2-2 follow-up) — templates.spec.ts
// covers open / grid roving / Enter-to-apply; these specs cover the
// filtering layered on top of that gallery (src/components/TemplatesDialog.tsx):
//   - the search box narrows the grid, the result-count live region ("N / M
//     matches") follows, and the search-actions toolbar's Clear search
//     restores the full gallery
//   - the category chips switch the grid both by click and by roving
//     ArrowRight (makeRovingKeys' onNavigate COMMITS the focused category),
//     with the per-chip aria-pressed and the "N templates · Category"
//     summary tracking
//   - a dead-end search swaps the grid for the empty state whose recovery
//     toolbar adapts to what is filtered (Clear search / Show all
//     categories / Reset filters)
//
// Template facts pinned here come from src/lib/templates.ts: 6 templates —
// Business Card (Business), Square Social Post (Social), Mountain Logo
// (Logo), Poster A4 + Flyer (Print), Sticker Pack (Stickers).

/** Open Templates via its keyboard binding (templates.spec.ts precedent)
 *  and return the dialog locator. */
async function openTemplates(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+Alt+n');
  const dialog = page.getByRole('dialog', { name: /^New from Template/ });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

// Intent: typing in the search box filters the gallery across
// name/description/category/id — "poster" matches exactly one template
// ("Poster A4"; no other name, description or id contains it), the live
// count region reads "1 / 6 matches", and the search-actions toolbar (only
// rendered while a query is active) clears the query to restore all six
// tiles and the "6 templates" summary.
// Anchors: searchbox by its label prefix, grid by role/name, gridcell
// counts, per-tile heading, i18n count strings matched exactly so
// "1 / 6 matches" can never collide with a longer count.
test('search narrows the grid and the count live region; Clear search restores', async ({ page }) => {
  await page.goto('/');
  // Wait for the chrome so the shortcut isn't eaten by the boot splash.
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

  const dialog = await openTemplates(page);
  const grid = dialog.getByRole('grid', { name: 'Template results' });
  const tiles = grid.getByRole('gridcell');
  await expect(tiles).toHaveCount(6);

  await dialog.getByRole('searchbox', { name: /^Search templates/ }).fill('poster');
  await expect(tiles).toHaveCount(1);
  await expect(dialog.getByText('1 / 6 matches', { exact: true })).toBeVisible();
  // The surviving tile is the matching template, identified by its heading.
  await expect(grid.getByRole('heading', { name: 'Poster A4' })).toBeVisible();

  // The search-recovery toolbar only exists while a query is set.
  const searchActions = dialog.getByRole('toolbar', { name: 'Template search actions' });
  await expect(searchActions).toBeVisible();
  await searchActions.getByRole('button', { name: 'Clear search' }).click();
  await expect(tiles).toHaveCount(6);
  await expect(dialog.getByText('6 templates', { exact: true })).toBeVisible();
});

// Intent: the category chips are the second filter — Print holds exactly
// two templates (Poster A4 + Flyer), the pressed chip carries aria-pressed
// while "All" loses it, and the result summary becomes
// "N templates · Category". ArrowRight from the focused chip roves onto the
// next chip and COMMITS it (handleCategoryActionKeys' onNavigate), so pure
// keyboard navigation also swaps the grid — Stickers holds only Sticker
// Pack.
// Anchors: category toolbar by name, chips by their "Name N" accessible
// names (label + count span), aria-pressed, gridcell count, tile heading,
// exact i18n summary strings.
test('category chips switch the grid; roving arrows commit the focused category', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

  const dialog = await openTemplates(page);
  const categories = dialog.getByRole('toolbar', { name: 'Template category filters' });
  const grid = dialog.getByRole('grid', { name: 'Template results' });
  const tiles = grid.getByRole('gridcell');

  const printChip = categories.getByRole('button', { name: 'Print 2' });
  await printChip.click();
  await expect(printChip).toHaveAttribute('aria-pressed', 'true');
  await expect(categories.getByRole('button', { name: 'All 6' })).toHaveAttribute('aria-pressed', 'false');
  await expect(tiles).toHaveCount(2);
  await expect(dialog.getByText('2 templates · Print', { exact: true })).toBeVisible();

  // ArrowRight (focus sits on Print after the click) roves onto Stickers
  // and the roving handler commits the category change as a side effect.
  await page.keyboard.press('ArrowRight');
  const stickersChip = categories.getByRole('button', { name: 'Stickers 1' });
  await expect(stickersChip).toBeFocused();
  await expect(stickersChip).toHaveAttribute('aria-pressed', 'true');
  await expect(printChip).toHaveAttribute('aria-pressed', 'false');
  await expect(tiles).toHaveCount(1);
  await expect(grid.getByRole('heading', { name: 'Sticker Pack' })).toBeVisible();
  // The summary string is the dialog's own (unpluralized) i18n output.
  await expect(dialog.getByText('1 templates · Stickers', { exact: true })).toBeVisible();
});

// Intent: a query that matches nothing replaces the grid with the empty
// state, whose recovery toolbar adapts to the active filters — with only a
// query set: Clear search + Reset filters; with a query AND a non-All
// category: all three buttons. Reset filters restores the full gallery;
// Show all categories keeps the query but widens the pool so "flyer" finds
// the Flyer template again ("1 / 6 matches").
// Anchors: "No templates found." text, empty-actions toolbar by name and
// its per-button names/count, gridcell count, count live region.
test('no-result search shows the empty state; Reset filters and Show all categories recover', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

  const dialog = await openTemplates(page);
  const grid = dialog.getByRole('grid', { name: 'Template results' });
  const search = dialog.getByRole('searchbox', { name: /^Search templates/ });
  const emptyActions = dialog.getByRole('toolbar', { name: 'Template empty-result actions' });

  // Gibberish matches no name/description/category/id.
  await search.fill('zzz-no-match');
  await expect(grid).toBeHidden();
  await expect(dialog.getByText('No templates found.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('0 / 6 matches', { exact: true })).toBeVisible();

  // Category is still "All", so only the two query-driven actions render.
  await expect(emptyActions.getByRole('button')).toHaveCount(2);
  await expect(emptyActions.getByRole('button', { name: 'Clear search' })).toBeVisible();
  await expect(emptyActions.getByRole('button', { name: 'Reset filters' })).toBeVisible();

  // Reset filters clears query + category — the full gallery returns.
  await emptyActions.getByRole('button', { name: 'Reset filters' }).click();
  await expect(grid.getByRole('gridcell')).toHaveCount(6);
  await expect(dialog.getByText('No templates found.', { exact: true })).toBeHidden();

  // Category-scoped dead end: Logo holds only Mountain Logo, so "flyer"
  // dies inside it — the empty state gains "Show all categories".
  await dialog.getByRole('toolbar', { name: 'Template category filters' }).getByRole('button', { name: 'Logo 1' }).click();
  await search.fill('flyer');
  await expect(dialog.getByText('No templates found.', { exact: true })).toBeVisible();
  await expect(emptyActions.getByRole('button')).toHaveCount(3);
  const showAll = emptyActions.getByRole('button', { name: 'Show all categories' });
  await expect(showAll).toBeVisible();

  // Show all categories keeps the query but widens the pool: "flyer" now
  // matches exactly one template again.
  await showAll.click();
  await expect(grid.getByRole('gridcell')).toHaveCount(1);
  await expect(grid.getByRole('heading', { name: 'Flyer' })).toBeVisible();
  await expect(dialog.getByText('1 / 6 matches', { exact: true })).toBeVisible();
});
