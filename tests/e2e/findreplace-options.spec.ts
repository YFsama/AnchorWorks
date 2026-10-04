import { test, expect, toolsToolbar, type Page } from './fixtures';

// FindReplaceDialog option branches (P2-2 follow-up) — findreplace.spec.ts
// covers the open / live count / Replace All happy path; these specs cover
// the two option surfaces it never touched (src/components/FindReplaceDialog.tsx):
//   - the "Match case" checkbox: case-sensitivity flows into BOTH the live
//     match count (countTextMatches) and Replace All's output
//     (replaceAllText) — outcomes are read back through the dialog's own
//     count region after re-opening, never through canvas DOM
//   - the recipe chips (FIND_REPLACE_RECIPES): a click applies its
//     find/replace/matchCase triple to the fields verbatim, roving
//     ArrowRight COMMITS the next recipe (handleRecipeActionKeys'
//     onNavigate), the aria-pressed highlight follows, and a recipe then
//     drives a real replacement on canvas text
//
// The dialog is conditionally mounted (App.tsx), so every re-open starts
// from clean state — fields empty, matchCase off, no recipe pressed.

function objectsCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

/** Click-draw one IText and overwrite the placeholder with `content` —
 *  same canonical sequence as findreplace.spec.ts (T + click, placeholder
 *  select-all'ed, click away to commit). */
async function drawOneText(page: Page, content: string): Promise<void> {
  const toolbar = toolsToolbar(page);
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('t');
  await expect(toolbar.getByRole('button', { name: 'Text', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const canvas = page.locator('#main-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.mouse.click(box.x + 300, box.y + 300);
  await page.keyboard.insertText(content);
  // Click well clear of the text to commit the edit and drop selection.
  await page.mouse.click(box.x + 80, box.y + 80);
}

/** Open Find & Replace via its keyboard binding ("text.findReplace",
 *  findreplace.spec.ts precedent) and return the dialog locator. */
async function openFindReplace(page: Page) {
  await page.keyboard.press('Control+Alt+f');
  const dialog = page.getByRole('dialog', { name: 'Find & Replace' });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

// Intent: "Match case" is a live scope for both the counter and the
// replacement. On "Anchor anchor ANCHOR": case-insensitively "anchor"
// counts 3, case-sensitively 1, and unchecking restores 3 (a real two-way
// toggle). With Match case on, Replace All "ANCHOR" → "Marker" rewrites
// ONLY the uppercase occurrence, proven through the count region after
// re-opening: "ANCHOR" still matches the surviving mixed-case words twice
// case-insensitively, but zero times case-sensitively. The object count
// stays 1 — text mutated, never added or removed.
// Anchors: checkbox by its label-derived name, count region matched
// exactly ("1 matches" can never collide with "11 matches"), footer
// toolbar by name, Objects counter.
test('Match case toggles the count and scopes Replace All to exact-case matches', async ({ page }) => {
  await page.goto('/');
  await drawOneText(page, 'Anchor anchor ANCHOR');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);

  const dialog = await openFindReplace(page);
  const findField = dialog.getByRole('textbox', { name: 'Find', exact: true });
  const matchCase = dialog.getByRole('checkbox', { name: 'Match case' });

  // Case-insensitive by default: all three occurrences count.
  await findField.fill('anchor');
  await expect(dialog.getByText('3 matches', { exact: true })).toBeVisible();

  // Case-sensitive: only the lowercase occurrence survives.
  await matchCase.check();
  await expect(dialog.getByText('1 matches', { exact: true })).toBeVisible();

  // Unchecking is not a one-way door.
  await matchCase.uncheck();
  await expect(dialog.getByText('3 matches', { exact: true })).toBeVisible();

  // Replace All with Match case on rewrites only the exact-case match:
  // "Anchor anchor ANCHOR" → "Anchor anchor Marker".
  await matchCase.check();
  await findField.fill('ANCHOR');
  await expect(dialog.getByText('1 matches', { exact: true })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Replace with' }).fill('Marker');
  await dialog.getByRole('toolbar', { name: 'Find & Replace actions' }).getByRole('button', { name: 'Replace All' }).click();
  await expect(dialog).toBeHidden();

  // Re-open (clean state) and read the outcome back through the counter:
  // the uppercase string is gone from the canvas, while the remaining
  // "Anchor"/"anchor" words still match it case-insensitively.
  const reopened = await openFindReplace(page);
  const reopenedFind = reopened.getByRole('textbox', { name: 'Find', exact: true });
  await reopenedFind.fill('ANCHOR');
  await expect(reopened.getByText('2 matches', { exact: true })).toBeVisible();
  await reopened.getByRole('checkbox', { name: 'Match case' }).check();
  await expect(reopened.getByText('0 matches', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(reopened).toBeHidden();
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
});

// Intent: the recipe chips are one-click field bundles. Clicking "Dash
// cleanup" applies its find/replace pair verbatim (asserted through the
// textboxes' values, so field population is verified directly, not just
// implied), marks itself aria-pressed, and the recipe live region announces
// the reviewed recipe with its position ("Reviewing Dash cleanup 2 / 4").
// ArrowRight roves to the next chip and COMMITS it — pressed state and
// fields move together to "Number token". Finally "Double spaces" drives a
// real Replace All: three double-spaces collapse to single spaces, proven
// by the count dropping to 0 after re-opening.
// Anchors: recipe toolbar by name, chips by name + aria-pressed + focus,
// textbox values, live-region announcement text, count region, Objects
// counter.
test('recipe chips fill the fields, roving arrows commit the next recipe, and a recipe drives Replace All', async ({ page }) => {
  await page.goto('/');
  await drawOneText(page, 'Low  --  resolution  scan');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);

  const dialog = await openFindReplace(page);
  const findField = dialog.getByRole('textbox', { name: 'Find', exact: true });
  const replaceField = dialog.getByRole('textbox', { name: 'Replace with' });
  const recipes = dialog.getByRole('toolbar', { name: 'Find replace recipe actions' });
  const spaces = recipes.getByRole('button', { name: 'Double spaces' });
  const dash = recipes.getByRole('button', { name: 'Dash cleanup' });
  const number = recipes.getByRole('button', { name: 'Number token' });

  // Empty fields match no recipe — nothing pressed yet.
  await expect(spaces).toHaveAttribute('aria-pressed', 'false');

  // Clicking a chip applies its find/replace pair verbatim.
  await dash.click();
  await expect(dash).toHaveAttribute('aria-pressed', 'true');
  await expect(findField).toHaveValue('--');
  await expect(replaceField).toHaveValue('—');
  // The recipe region announces the reviewed recipe with its position.
  await expect(dialog.getByText(/Reviewing Dash cleanup 2 \/ 4/)).toBeVisible();

  // ArrowRight roves the chips and commits the next recipe on the way:
  // fields flip to the Number token pair, pressed follows focus.
  await page.keyboard.press('ArrowRight');
  await expect(number).toBeFocused();
  await expect(number).toHaveAttribute('aria-pressed', 'true');
  await expect(dash).toHaveAttribute('aria-pressed', 'false');
  await expect(findField).toHaveValue('###');
  await expect(replaceField).toHaveValue('001');
  await expect(dialog.getByText(/Reviewing Number token 3 \/ 4/)).toBeVisible();

  // A recipe then drives a real replacement: "Double spaces" finds the
  // three double-spaces in the canvas text and collapses them.
  await spaces.click();
  await expect(dialog.getByText('3 matches', { exact: true })).toBeVisible();
  await dialog.getByRole('toolbar', { name: 'Find & Replace actions' }).getByRole('button', { name: 'Replace All' }).click();
  await expect(dialog).toBeHidden();

  const reopened = await openFindReplace(page);
  await reopened.getByRole('textbox', { name: 'Find', exact: true }).fill('  ');
  await expect(reopened.getByText('0 matches', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(reopened).toBeHidden();
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
});
