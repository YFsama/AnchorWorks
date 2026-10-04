import { test, expect, toolsToolbar, type Page } from './fixtures';

// FindReplaceDialog e2e regression net (P2-2 + a11y-suite migration) — the
// dialog (src/components/FindReplaceDialog.tsx) had zero e2e coverage. The
// specs drive the full keyboard flow:
//   - drop a text object with the Text tool (T + click, placeholder is
//     selected-in-editing so typing overwrites it — registerTools.ts)
//   - Ctrl+Alt+F ("text.findReplace" default binding, src/lib/keymap.ts)
//     opens the dialog
//   - the live match-count region ("N matches", the dialog's aria-live span
//     fed by countTextMatches) reacts to the Find field
//   - Replace All (replaceAllText) mutates the canvas text
//   - Escape closes (useEscapeClose)
//
// The post-replacement assertion deliberately re-opens the dialog and reads
// the match count for the old and new strings ("Hello" → 0, "Hi" → 1):
// the count is the dialog's own user-visible contract and avoids any fragile
// canvas-DOM or layer-label probing.

function objectsCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

/** Click-draw one IText on the canvas via the Text tool and overwrite the
 *  placeholder with `content`. The tool click drops an editing-mode IText
 *  with the placeholder select-all'ed, then flips back to the select tool;
 *  clicking empty canvas afterwards commits the edit. */
async function drawOneText(page: Page, content: string): Promise<void> {
  const toolbar = toolsToolbar(page);
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('t');
  await expect(toolbar.getByRole('button', { name: 'Text', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const canvas = page.locator('#main-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  // Drop the text object mid-canvas; editing starts with the placeholder
  // selected, so the inserted text replaces it wholesale.
  await page.mouse.click(box.x + 300, box.y + 300);
  await page.keyboard.insertText(content);

  // Click well clear of the text to commit the edit and drop selection.
  await page.mouse.click(box.x + 80, box.y + 80);
}

test('Find & Replace counts matches, Replace All rewrites the canvas text, Escape closes', async ({ page }) => {
  await page.goto('/');
  await drawOneText(page, 'Hello Anchor');

  // Exactly one object on canvas — the committed IText.
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);

  // Open the dialog via its keyboard binding.
  await page.keyboard.press('Control+Alt+f');
  const dialog = page.getByRole('dialog', { name: 'Find & Replace' });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const findField = dialog.getByRole('textbox', { name: 'Find', exact: true });

  // The live match-count region reports the single occurrence of "Hello".
  await findField.fill('Hello');
  await expect(dialog.getByText('1 matches', { exact: true })).toBeVisible();

  // Replace All: "Hello Anchor" becomes "Hi Anchor", dialog closes.
  await dialog.getByRole('textbox', { name: 'Replace with' }).fill('Hi');
  await dialog.getByRole('button', { name: 'Replace All' }).click();
  await expect(dialog).toBeHidden();

  // Re-open and read the count both ways — the old string is gone from the
  // canvas while the replacement is present. This is the dialog's own
  // user-visible contract, so no canvas-DOM probing is needed.
  await page.keyboard.press('Control+Alt+f');
  await expect(dialog).toBeVisible();
  await findField.fill('Hi');
  await expect(dialog.getByText('1 matches', { exact: true })).toBeVisible();
  await findField.fill('Hello');
  await expect(dialog.getByText('0 matches', { exact: true })).toBeVisible();

  // Escape closes the dialog.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // The replacement never added or removed objects — still one text object.
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
});
