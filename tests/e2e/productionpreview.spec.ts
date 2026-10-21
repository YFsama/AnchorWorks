import { test, expect, toolsToolbar } from './fixtures';
import type { Locator, Page } from '@playwright/test';

// ProductionPreviewDialog e2e regression net — the dialog
// (src/components/ProductionPreviewDialog.tsx, lazy-loaded behind a null
// Suspense fallback in App.tsx) had zero e2e coverage. Coverage:
//   - with nothing selected, the Document menu entry never opens the dialog:
//     MenuBar's openWithSelection answers with the "Select something first."
//     warn toast (role="alert"). Every UI entry pre-guards like this (menu,
//     command palette, canvas context menu) and no keybinding exists, so the
//     dialog's own open-guard effect is defense-in-depth for programmatic
//     opens — the menu guard is the observable no-selection contract.
//   - with a drawn rectangle selected, the dialog opens and the live raster
//     pipeline settles after the 250ms debounce: the composed sheet (img
//     alt "Production Preview") and the stats line ("N copies · W×H mm · P%
//     material used") appear, the footer Apply unlocks (disabled while a
//     result is still building), and a sheet preset click (A4 → A3) moves
//     the chip aria-pressed and rebuilds the stats with the A3 dimensions.
//     Escape closes.
//
// Apply is deliberately NEVER clicked: it REPLACES the store's cut paths
// with the imposed layout and inserts the sheet bitmap — destructive to
// document state. Its enabled-state transition is asserted instead, and the
// safe close (Escape) is the flow outcome. The apply path itself is covered
// by the lib unit tests (productionPreview) and the sibling Make Sticker
// apply e2e, which asserts the same toast/history/chip contract on a
// non-destructive insert.
//
// Anchors: menu items by role/name (CSS-hover dropdown walk, envelope.spec.ts
// precedent), dialog by role/name (aria-labelledby → the "Production
// Preview" h2), sheet presets via the shared PresetRow kit (role=toolbar by
// name, buttons with aria-pressed), the stats line by its exact text pattern
// (inside the dialog's aria-live region), the sheet img by role/name, and
// the StatusBar "Selected N" counter for the selection precondition.

/** Drag-draw a single rectangle, mirroring the canonical sequence in
 *  drawing.spec.ts / undo.spec.ts / variable-data.spec.ts. Fabric leaves the
 *  fresh shape as the active selection — the imposition guard's input. */
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

function selectedCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Selected "]').first();
}

/** Open via Document → Production Preview… (the selection-satisfying entry —
 *  openWithSelection lets it through once a shape is active). 10s
 *  first-visibility wait: the dialog chunk is lazy (templates.spec
 *  precedent). */
async function openProductionPreview(page: Page): Promise<Locator> {
  await page.getByRole('menuitem', { name: 'Document' }).hover();
  await page.getByRole('menuitem', { name: 'Production Preview…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Production Preview' });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

// Intent: the no-selection contract — the menu entry warns off with the
// shared guard toast and the dialog never opens, leaving no stuck modal.
// Anchors: menuitem roles, warn toast as role="alert" (ToastHost), dialog
// count 0.
test('Production Preview… with nothing selected warns off and the dialog never opens', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  await page.getByRole('menuitem', { name: 'Document' }).hover();
  await page.getByRole('menuitem', { name: 'Production Preview…' }).click();

  // openWithSelection (MenuBar) answers with the bare warn toast — no title
  // on this path, so the message is the anchor.
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Select something first.');

  // Guarded shut: the dialog chunk never even mounts.
  await expect(page.getByRole('dialog', { name: 'Production Preview' })).toHaveCount(0);
});

// Intent: the imposition happy path up to (but not through) Apply — with a
// selection the debounced raster pipeline produces a composed sheet and a
// numeric stats line on the A4 default, the A3 preset click moves the chip
// state and rebuilds the stats with A4 → A3 dimensions swapped, and Escape
// closes without touching the document. A real Chromium canvas runs the
// whole rasterize/nest pipeline (the jsdom limitation never applies here).
// Console/page errors are captured the envelope.spec.ts way: an uncaught
// throw inside the build promise chain must surface as a failure even if the
// degraded-UI captions still render.
// Anchors: dialog by name, sheet img by role/name, stats line by exact text
// pattern (A4 then A3 dims), preset chips + aria-pressed, footer Apply
// enabled-state transition, StatusBar Selected counter.
test('with a selection the imposed sheet builds; the A3 preset swaps the stats; Escape closes without applying', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await drawOneRect(page);
  await page.keyboard.press('v');
  await expect(selectedCount(page)).toHaveAttribute('aria-label', /Selected 1$/);

  const dialog = await openProductionPreview(page);

  // The raster pipeline settles after the 250ms debounce + build: the
  // composed sheet image appears inside the dialog's aria-live region.
  await expect(dialog.getByRole('img', { name: 'Production Preview' })).toBeVisible({ timeout: 10_000 });

  // Stats line on the A4 default: "N copies · 210×297 mm · P% material used".
  const stats = dialog.getByText(/^\d+ copies · \d+×\d+ mm · \d+% material used$/);
  await expect(stats).toBeVisible();
  await expect(stats).toContainText('210×297');

  // Once a result exists the footer Apply unlocks — it is disabled while
  // building or when the build failed, so this doubles as the success proof.
  const apply = dialog.getByRole('button', { name: 'Apply', exact: true });
  await expect(apply).toBeEnabled();

  // A3 preset: chip aria-pressed moves and the rebuilt stats carry the A3
  // dimensions (297×420 — the width×height swap vs the A4 line above).
  const presets = dialog.getByRole('toolbar', { name: 'Production preview sheet presets' });
  const a3 = presets.getByRole('button', { name: /^A3/ });
  await a3.click();
  await expect(a3).toHaveAttribute('aria-pressed', 'true');
  await expect(presets.getByRole('button', { name: /^A4/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByText(/^\d+ copies · 297×420 mm · \d+% material used$/)).toBeVisible({ timeout: 10_000 });

  // Close without applying — Apply replaces the document's cut paths with
  // the imposed layout, deliberately not triggered in e2e (see header).
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  expect(errors).toEqual([]);
});
