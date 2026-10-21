import { test, expect, toolsToolbar } from './fixtures';
import type { Locator, Page } from '@playwright/test';

// MakeStickerDialog e2e regression net — the dialog
// (src/components/MakeStickerDialog.tsx, lazy-loaded behind a null Suspense
// fallback in App.tsx) had zero e2e coverage. These specs drive the UI flow:
//   - the Ctrl+Alt+K binding ("document.makeSticker", src/lib/keymap.ts) is
//     the ONE entry that opens the modal unguarded, so an empty-canvas press
//     must land in the dialog's own open-guard effect: "Select something
//     first." warn toast + auto-close (App.tsx toggles showMakeSticker
//     directly; MenuBar/palette/context entries pre-guard)
//   - with a drawn rectangle selected, the dialog opens with its defaults
//     equal to the "Sticker Mule white 2.54 mm" preset (border 2.54 + white
//     underlay), a preset click rewrites border + chip aria-pressed, and
//     Apply welds/offsets the art: success toast, white underlay ring added
//     under the art (Objects 1 → 2), the die contour added to the store's cut
//     paths (StatusBar "N cut paths" chip), and the whole step is a single
//     Ctrl+Z (history snapshots carry cutPaths, src/lib/history.ts)
//   - Escape closes (useEscapeClose) and focus returns to the invoking tool
//     button (useFocusRestore)
//
// Anchors: dialog by role/name (aria-labelledby → the "Make Sticker" h2),
// preset chips via the shared PresetRow kit (role=toolbar by name, buttons
// with aria-pressed), spinbutton by aria-label, StatusBar live counters, and
// toasts by their ToastHost roles — warn renders role="alert", success
// renders role="status" (the StatusBar "Objects"/"Selected" spans are also
// role="status", so success toasts are matched with a hasText filter).

/** Drag-draw a single rectangle, mirroring the canonical sequence in
 *  drawing.spec.ts / undo.spec.ts / variable-data.spec.ts. Fabric leaves the
 *  fresh shape as the active selection — exactly what the sticker guard
 *  needs. */
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

function objectsCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

function selectedCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Selected "]').first();
}

/** StatusBar's cut-path chip — a button whose aria-label reads
 *  "N cut paths — Open Send to Plotter. …" (src/components/StatusBar.tsx);
 *  it only mounts while cutPathCount > 0. */
function cutPathsChip(page: Page) {
  return page.getByRole('button', { name: /^\d+ cut paths/ });
}

/** Open via the "document.makeSticker" binding. 10s first-visibility wait —
 *  the dialog chunk is lazy, like every dialog spec here (templates.spec
 *  precedent). `exact` keeps the name distinct from nothing else today but
 *  documents the intent against future "Make Sticker …"-style labels. */
async function openMakeSticker(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+Alt+k');
  const dialog = page.getByRole('dialog', { name: 'Make Sticker', exact: true });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

// Intent: the keyboard binding is the unguarded entry — on an empty canvas
// the dialog's open-guard effect must answer with the "Select something
// first." warn toast (title "Make Sticker") and immediately close, leaving
// no stuck modal behind.
// Anchors: role=alert (warn toasts in ToastHost), the toast's title +
// message text, dialog count 0 after the guard settles.
test('Ctrl+Alt+K with nothing selected guard-closes with the warn toast', async ({ page }) => {
  await page.goto('/');
  await expect(toolsToolbar(page)).toBeVisible();

  await page.keyboard.press('Control+Alt+k');

  // The lazy chunk loads, the dialog mounts, and the guard fires — the warn
  // toast is the durable evidence of the whole round-trip.
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(alert).toContainText('Make Sticker');
  await expect(alert).toContainText('Select something first.');

  // Guard-closed: the dialog unmounted again.
  await expect(page.getByRole('dialog', { name: 'Make Sticker', exact: true })).toHaveCount(0);
});

// Intent: the happy path end-to-end — defaults mirror the "Sticker Mule"
// preset (its chip starts aria-pressed), the "Wide white 4 mm" preset chip
// rewrites the border spinbutton and swaps aria-pressed, and Apply builds the
// sticker: white underlay ring inserted behind the art (Objects 1 → 2), die
// contour added to the cut-path store (StatusBar chip appears), success
// toast, dialog closed. The apply is one history step — Ctrl+Z restores both
// the object count and the empty cut-path store (history.ts snapshots carry
// cutPaths).
// Anchors: preset toolbar by name + chip aria-pressed, spinbutton by
// aria-label + value, success toast role=status filtered by text, StatusBar
// Objects counter, cut-path chip by its aria-label pattern.
test('Apply builds the sticker — contour and underlay land, and Ctrl+Z undoes them', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page);
  // Pop back to the select tool so later keystrokes target the editor chrome
  // state, not a drawing tool (shortcuts.spec.ts precaution).
  await page.keyboard.press('v');

  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
  await expect(selectedCount(page)).toHaveAttribute('aria-label', /Selected 1$/);

  const dialog = await openMakeSticker(page);

  // Defaults (borderMm 2.54 + white underlay) equal the Sticker Mule preset.
  const presets = dialog.getByRole('toolbar', { name: 'Sticker preset actions' });
  const mule = presets.getByRole('button', { name: /Sticker Mule/ });
  await expect(mule).toHaveAttribute('aria-pressed', 'true');

  // The Wide preset moves the chip state and the border field together.
  const wide = presets.getByRole('button', { name: /Wide white/ });
  await wide.click();
  await expect(wide).toHaveAttribute('aria-pressed', 'true');
  await expect(mule).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByRole('spinbutton', { name: 'Border (mm)' })).toHaveValue('4');

  // The footer Apply carries no disabled contract (the selection guard is
  // the toast), so with a live selection it is enabled.
  const apply = dialog.getByRole('button', { name: 'Apply', exact: true });
  await expect(apply).toBeEnabled();
  await apply.click();

  // Success toast (role="status" for success kinds) + dialog close.
  const success = page.getByRole('status').filter({ hasText: 'Sticker created' });
  await expect(success).toBeVisible();
  await expect(dialog).toBeHidden();

  // The canvas gained the underlay ring under the rect; the store gained the
  // die-cut contour — both observable in the StatusBar.
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 2$/);
  await expect(cutPathsChip(page)).toBeVisible();

  // One undo step back to the bare rectangle (cut paths restored too).
  await page.keyboard.press('Control+z');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
  await expect(cutPathsChip(page)).toHaveCount(0);
});

// Intent: Escape closes (capture-phase useEscapeClose) and useFocusRestore
// walks focus back to the element that was focused when the dialog opened —
// the WAI-ARIA "focus returns to the invoker" contract. The invoker anchor
// is the menubar's Document trigger (a plain top-strip button; the tool rail
// buttons are NOT clickable here — the vertical ruler canvas overlays the
// rail, which is why every other spec drives tools by keyboard). Focus is
// moved INSIDE the dialog first (the Border spinbutton), so the restore is
// observable rather than a focus that never left.
// Anchors: menubar trigger by role/name (exact — the open Document dropdown
// also exposes a "Document Settings…" menuitem), dialog by name, spinbutton
// by aria-label, focus via toBeFocused.
test('Escape closes the sticker dialog and focus returns to the invoking element', async ({ page }) => {
  await page.goto('/');
  await drawOneRect(page);
  await expect(selectedCount(page)).toHaveAttribute('aria-label', /Selected 1$/);

  // Focus the menubar's Document trigger (its dropdown opening is harmless).
  const documentTrigger = page.getByRole('menuitem', { name: 'Document', exact: true });
  await documentTrigger.click();

  const dialog = await openMakeSticker(page);

  // Move focus into the dialog — the restore has to pull it back out again.
  await dialog.getByRole('spinbutton', { name: 'Border (mm)' }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Border (mm)' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Focus restored to the element that invoked the dialog.
  await expect(documentTrigger).toBeFocused();
});
