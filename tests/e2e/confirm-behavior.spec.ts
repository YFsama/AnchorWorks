import { test, expect, toolsToolbar, type Page } from './fixtures';

// ConfirmHost behaviour contract (2026-11 wave 4, implementer I-2).
//
// src/components/ConfirmHost.tsx renders every global confirm (showConfirm in
// src/lib/confirm.ts). This spec drives the entry every user meets — File →
// New on a non-empty canvas ("New document" / "Clear canvas?" / confirm
// "Clear", danger:true → location.reload()) — and pins the host's contracts:
//
//   1. role="alertdialog" (not a plain dialog) with the danger convention
//   2. Escape ANSWERS FALSE (answerConfirm(false)) — dismissing never
//      confirms the destructive action, and the document survives
//   3. danger confirms default focus to Cancel (Enter can't impulsively
//      trigger "Clear")
//   4. on answer, focus returns to the invoking element
//
// Two invocation paths, deliberately:
//   - the File → New dropdown row (the menu path) for contracts 1–3, and
//   - the `file.new` binding (Ctrl+N) with focus parked on the always-visible
//     File trigger for contract 4.
//
// The menu path originally could not observe contract 4: while the confirm
// holds focus the dropdown panel loses its group-focus-within visibility, so
// the host's restoreTo.focus() no-opped on a visibility:hidden row. The
// wave-4 ConfirmHost fix walks to the nearest VISIBLE focusable ancestor
// (the File trigger) — the trailing test pins that on the real menu path;
// the binding path remains the canonical deterministic anchor.

function objectsLabel(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

/** One drag-drawn rectangle (drawing.spec.ts / undo.spec.ts sequence). */
async function drawOneRect(page: Page): Promise<void> {
  const toolbar = toolsToolbar(page);
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('r');
  const canvas = page.locator('#main-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 350, box.y + 325);
  await page.mouse.move(box.x + 500, box.y + 450);
  await page.mouse.up();
  await page.keyboard.press('v');
}

/** The File → New dropdown row. A CSS locator (not getByRole): while the
 *  confirm holds focus the dropdown panel drops its group-focus-within
 *  visibility and role queries stop matching the (still mounted) row. */
function newMenuItem(page: Page) {
  return page.locator('button[role="menuitem"][aria-label="New"]').last();
}

async function openNewConfirmViaMenu(page: Page) {
  await page.getByRole('menuitem', { name: 'File', exact: true }).first().hover();
  await page.waitForTimeout(350);
  await newMenuItem(page).click({ timeout: 5_000 });
  const alert = page.getByRole('alertdialog');
  await expect(alert).toBeVisible({ timeout: 5_000 });
  return alert;
}

test('File → New confirm: alertdialog role, Escape answers false, canvas kept', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await drawOneRect(page);
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 1$/);

  const alert = await openNewConfirmViaMenu(page);

  // Contract 1 — the confirm host renders role=alertdialog (danger + modal),
  // with its title/message pair and the Cancel/Clear action row.
  await expect(alert).toContainText('New document');
  await expect(alert).toContainText('Clear canvas?');
  const actions = alert.getByRole('toolbar', { name: 'Confirm actions' });
  await expect(actions.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();

  // Contract 3 — danger default focus is Cancel, never the destructive
  // action (Enter must not be able to "accidentally" clear the canvas).
  await expect(actions.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();

  // Contract 2 — Escape answers the confirm FALSE: the host closes and the
  // document survives untouched (no location.reload() — the rect is still
  // the one and only object).
  await page.keyboard.press('Escape');
  await expect(alert).toBeHidden();
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 1$/);

  expect(errors).toEqual([]);
});

test('File → New confirm: clicking Cancel keeps the canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await drawOneRect(page);
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 1$/);

  const alert = await openNewConfirmViaMenu(page);

  // Answer via the button click: same false outcome, same survival.
  await alert.getByRole('toolbar', { name: 'Confirm actions' })
    .getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(alert).toBeHidden();

  // Cancel kept the work: no reload, still exactly the one drawn object.
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 1$/);

  expect(errors).toEqual([]);
});

test('file.new binding: answered confirms restore focus to the invoking element', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await drawOneRect(page);
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 1$/);

  // Park focus on the always-visible File trigger, then invoke the SAME
  // confirm through the `file.new` binding (App.tsx match('file.new')).
  const fileTrigger = page.getByRole('menuitem', { name: 'File', exact: true }).first();
  await fileTrigger.click();
  await expect(fileTrigger).toBeFocused();

  // --- Escape round ---------------------------------------------------------
  await page.keyboard.press('Control+n');
  const alert = page.getByRole('alertdialog');
  await expect(alert).toBeVisible({ timeout: 5_000 });
  await expect(alert).toContainText('Clear canvas?');
  // Danger default focus is Cancel in this entry path too.
  await expect(alert.getByRole('toolbar', { name: 'Confirm actions' })
    .getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(alert).toBeHidden();
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 1$/);
  // Contract 4 — focus walked back out to the invoking element.
  await expect(fileTrigger).toBeFocused();

  // --- Cancel-click round ---------------------------------------------------
  await page.keyboard.press('Control+n');
  await expect(alert).toBeVisible({ timeout: 5_000 });
  await alert.getByRole('toolbar', { name: 'Confirm actions' })
    .getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(alert).toBeHidden();
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 1$/);
  await expect(fileTrigger).toBeFocused();
});

test('menu path: focus returns to the File trigger after the confirm closes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();

  // The dropdown row that triggers the confirm is hidden the moment the
  // alertdialog steals focus-within. Wave-4 fix: ConfirmHost's restore walks
  // to the nearest VISIBLE focusable ancestor (the File trigger) instead of
  // no-opping on the hidden row — this pins that contract on the real path.
  const fileTrigger = page.getByRole('menuitem', { name: 'File', exact: true }).first();
  const alert = await openNewConfirmViaMenu(page);

  await page.keyboard.press('Escape');
  await expect(alert).toBeHidden();
  await expect(fileTrigger).toBeFocused();
});
