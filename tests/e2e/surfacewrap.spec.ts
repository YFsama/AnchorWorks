import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';

// WrapDialog (Surface Wrap) e2e regression net — the dialog
// (src/components/WrapDialog.tsx, lazy-loaded behind a null Suspense fallback
// in App.tsx) had zero e2e coverage. Unlike MakeSticker/ProductionPreview,
// Surface Wrap needs NO selection (it computes flat developments from the
// dimension fields alone), and its only entries are the Document menu, the
// command palette, and the canvas context menu. Coverage:
//   - Document → Surface Wrap… opens the dialog with the cylinder defaults
//     (dims equal the "Straight bottle label" preset, so that chip starts
//     aria-pressed, the Wrap type radio reads Cylinder, and the live readout
//     shows a "Flat size W × H mm" line with digits)
//   - the "30 oz tumbler" preset switches kind to the cone frustum: chip
//     aria-pressed moves, the Wrap type radios follow, and the readout swaps
//     to the sector geometry (R · r · θ); Apply draws the dashed guide on the
//     canvas (Objects 0 → 1), stores the outline as a manual cut path
//     (StatusBar "N cut paths" chip), toasts "Surface wrap added", closes,
//     and the whole insertion is one Ctrl+Z step (history snapshots carry
//     cutPaths, src/lib/history.ts)
//   - Escape closes (useEscapeClose)
//
// Anchors: menu items by role/name (MenuBar dropdowns are CSS-hover surfaces
// — the envelope.spec.ts walk), dialog by role/name (aria-labelledby → the
// "Surface Wrap" h2), Wrap type via role=radiogroup/radio + aria-checked,
// preset chips via the shared PresetRow kit (role=toolbar by name, buttons
// with aria-pressed), the aria-live readout by its exact text pattern, the
// success toast as role="status" filtered by text (StatusBar counters are
// role="status" too), and the StatusBar Objects counter.

function objectsCount(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

/** StatusBar's cut-path chip — a button whose aria-label reads
 *  "N cut paths — Open Send to Plotter. …" (src/components/StatusBar.tsx);
 *  it only mounts while cutPathCount > 0. */
function cutPathsChip(page: Page) {
  return page.getByRole('button', { name: /^\d+ cut paths/ });
}

/** Open via Document → Surface Wrap… — the menu walk mirrors envelope.spec.ts
 *  (CSS-hover dropdowns; getByRole only sees the visible items). 10s
 *  first-visibility wait: the dialog chunk is lazy (templates.spec
 *  precedent). */
async function openSurfaceWrap(page: Page): Promise<Locator> {
  await page.getByRole('menuitem', { name: 'Document' }).hover();
  await page.getByRole('menuitem', { name: 'Surface Wrap…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Surface Wrap' });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

// Intent: the dialog opens straight from the Document menu with its cylinder
// defaults intact — kind radio Cylinder checked, the live readout already
// carrying a numeric "Flat size" development (π·D overlap strip for the
// 70×160 straight-bottle dims), the matching preset chip pressed, and Apply
// enabled (both output toggles default on). Escape closes.
// Anchors: menuitem roles, dialog by name, radiogroup/radio + aria-checked,
// preset toolbar + chip aria-pressed, readout text pattern, footer Apply.
test('Document → Surface Wrap… opens with the cylinder defaults; Escape closes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  const dialog = await openSurfaceWrap(page);

  // Cylinder is the default kind.
  const types = dialog.getByRole('radiogroup', { name: 'Wrap type' });
  await expect(types.getByRole('radio', { name: 'Cylinder' })).toHaveAttribute('aria-checked', 'true');

  // The live readout unwraps the default 70×160 (5 overlap) dims into a
  // numeric Flat size — the math pipeline answering on open.
  await expect(dialog.getByText(/^Flat size \d+(\.\d+)? × \d+(\.\d+)? mm$/)).toBeVisible();

  // The defaults equal the "Straight bottle label" preset exactly, so its
  // chip starts pressed.
  const presets = dialog.getByRole('toolbar', { name: 'Wrap preset actions' });
  await expect(presets.getByRole('button', { name: /Straight bottle/ })).toHaveAttribute('aria-pressed', 'true');

  // Apply is enabled while at least one output toggle is on (both default).
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

// Intent: a cone preset is a one-click bundle — "30 oz tumbler wrap 95→82
// taper" must move its own chip's aria-pressed, drop the straight-bottle
// chip's, flip the Wrap type radios to Cone (frustum), and rewrite the live
// readout from the Flat size strip to the annular-sector geometry (R · r · θ
// with digits). Apply then draws the dashed guide (Objects 0 → 1), stores the
// outline as a manual cut path (StatusBar chip), toasts "Surface wrap added"
// and closes; one Ctrl+Z peels the whole insertion back off.
// Anchors: preset chips by name + aria-pressed, kind radios + aria-checked,
// readout exact text pattern, success toast role=status + text, StatusBar
// Objects counter + cut-path chip.
test('The tumbler preset switches to the cone development; Apply inserts a guide and cut path', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 0$/);

  const dialog = await openSurfaceWrap(page);

  const presets = dialog.getByRole('toolbar', { name: 'Wrap preset actions' });
  const tumbler = presets.getByRole('button', { name: /30 oz tumbler/ });
  await tumbler.click();
  await expect(tumbler).toHaveAttribute('aria-pressed', 'true');
  await expect(presets.getByRole('button', { name: /Straight bottle/ })).toHaveAttribute('aria-pressed', 'false');

  // The kind radios follow the preset, and the readout swaps to the sector
  // geometry — R / r in mm and the sector angle θ in degrees.
  const types = dialog.getByRole('radiogroup', { name: 'Wrap type' });
  await expect(types.getByRole('radio', { name: 'Cone (frustum)' })).toHaveAttribute('aria-checked', 'true');
  await expect(types.getByRole('radio', { name: 'Cylinder' })).toHaveAttribute('aria-checked', 'false');
  await expect(dialog.getByText(/^R \d+(\.\d+)? · r \d+(\.\d+)? · θ \d+(\.\d+)?°$/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();

  // Success toast (role="status" for success kinds) + close.
  const success = page.getByRole('status').filter({ hasText: 'Surface wrap added' });
  await expect(success).toBeVisible();
  await expect(dialog).toBeHidden();

  // The dashed guide landed on the canvas and the outline entered the
  // cut-path store — both visible in the StatusBar.
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
  await expect(cutPathsChip(page)).toBeVisible();

  // The insertion is a single undo step: back to the empty canvas.
  await page.keyboard.press('Control+z');
  await expect(objectsCount(page)).toHaveAttribute('aria-label', /Objects 0$/);
  await expect(cutPathsChip(page)).toHaveCount(0);
});
