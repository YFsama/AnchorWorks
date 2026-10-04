import { test, expect, toolsToolbar, type Page } from './fixtures';

// Undo / redo regression net (P2-2) — shortcuts.spec.ts only proved that ONE
// delete can be undone; nothing exercised the multi-step flow of drawing
// edits. These specs drive Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y through real canvas
// edits and read the outcome from the StatusBar's live counters
// (`aria-label="Objects N"`, see src/components/StatusBar.tsx) plus the
// top-bar History toolbar's Undo/Redo button enabled state
// (`canUndo` / `canRedo` flags mirrored from the History instance, see
// src/lib/historyOps.ts refreshHistoryFlags + MenuBar.tsx "History actions").
//
// Coverage:
//   (a) draw → undo → redo round-trip, redo via the Ctrl+Shift+Z binding
//   (b) two draws → undo one step at a time (2 → 1 → 0), redo via Ctrl+Y
//   (c) over-undo at the bottom of the stack is a harmless no-op

/** Drag-draw a single rectangle, mirroring the canonical sequence in
 *  drawing.spec.ts / shortcuts.spec.ts. `slot` shifts the drag rectangle so
 *  consecutive draws produce two distinct objects instead of stacking them
 *  at the same coordinates. */
async function drawOneRect(page: Page, slot = 0): Promise<void> {
  const toolbar = toolsToolbar(page);
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('r');
  await expect(toolbar.locator('button[aria-label^="Rectangle"]')).toHaveAttribute('aria-pressed', 'true');

  const canvas = page.locator('#main-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const off = slot * 120;
  await page.mouse.move(box.x + 300 + off, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 350 + off, box.y + 325);
  await page.mouse.move(box.x + 500 + off, box.y + 450);
  await page.mouse.up();
}

function objectsCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

/** The top-bar History cluster's Undo/Redo buttons — their native disabled
 *  state mirrors the History instance's canUndo/canRedo, so they double as a
 *  stable a11y anchor for "the stack is exhausted". */
function undoButton(page: Page) {
  return page.getByRole('toolbar', { name: 'History actions' }).getByRole('button', { name: 'Undo' });
}
function redoButton(page: Page) {
  return page.getByRole('toolbar', { name: 'History actions' }).getByRole('button', { name: 'Redo' });
}

// (a) Intent: a drawn shape is a single undo step — Ctrl+Z removes it from
// the canvas (Objects 1 → 0, Undo disabled at the initial snapshot) and
// Ctrl+Shift+Z replays the snapshot to bring it back (Objects 0 → 1, Redo
// consumed). Uses the Ctrl+Shift+Z redo binding; Ctrl+Y is covered in (b)/(c).
test('Ctrl+Z undoes a drawn shape and Ctrl+Shift+Z redoes it', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page);
  // Pop back to the select tool so later keystrokes target the editor chrome
  // state, not a drawing tool (same precaution as shortcuts.spec.ts).
  await page.keyboard.press('v');

  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);

  // Undo the draw — the canvas must return to the empty initial snapshot.
  await page.keyboard.press('Control+z');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 0$/);
  await expect(undoButton(page)).toBeDisabled();

  // Redo (Shift+Z binding) — the rectangle comes back.
  await page.keyboard.press('Control+Shift+z');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
  await expect(redoButton(page)).toBeDisabled();
});

// (b) Intent: consecutive edits form separate undo steps — after two draws
// (Objects 2) each Ctrl+Z peels off exactly one shape (2 → 1 → 0), and Ctrl+Y
// walks the redo stack forward one step at a time (0 → 1 → 2).
test('two edits undo and redo one step at a time', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page, 0);
  // The rect tool stays active after a draw, so the second drag starts a
  // second rectangle without re-pressing R.
  await drawOneRect(page, 1);
  await page.keyboard.press('v');

  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 2$/);

  // Undo the second rectangle only.
  await page.keyboard.press('Control+z');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);

  // Undo the first rectangle — bottom of the stack.
  await page.keyboard.press('Control+z');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 0$/);
  await expect(undoButton(page)).toBeDisabled();

  // Redo both steps one at a time via the Ctrl+Y binding.
  await page.keyboard.press('Control+y');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
  await page.keyboard.press('Control+y');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 2$/);
});

// (c) Intent: hammering Ctrl+Z past the bottom of the history stack must be a
// harmless no-op — History.undo early-returns when canUndo() is false, so the
// object count stays 0, no error surfaces, and the history stack itself is
// still intact enough for a subsequent redo to work (proving the app is very
// much alive rather than crashed or desynced).
test('extra Ctrl+Z at the bottom of the history is a harmless no-op', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page, 0);
  await drawOneRect(page, 1);
  await page.keyboard.press('v');

  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 2$/);

  // Walk back to the initial snapshot.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 0$/);
  await expect(undoButton(page)).toBeDisabled();

  // Over-undo: two more Ctrl+Z presses with nothing left to undo.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');

  // Count unchanged, still parked at the bottom of the stack.
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 0$/);
  await expect(undoButton(page)).toBeDisabled();

  // The stack survived the over-undo: redo still replays the last edit.
  await expect(redoButton(page)).toBeEnabled();
  await page.keyboard.press('Control+y');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
});
