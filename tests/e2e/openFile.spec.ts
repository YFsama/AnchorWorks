import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures';

// File > Open SVG — the first e2e coverage of the file-open flow (P1-5).
// Before this spec no test ever pushed a file through the app: the MenuBar
// owns a hidden <input type="file" accept=".svg,.json"> (MenuBar.tsx
// `fileRef`) whose change handler routes .svg through the format registry's
// smart importer (svgImport.ts → one Group on the canvas, selected). That
// input is e2e-friendly — Playwright's setInputFiles works on hidden
// inputs — so we drive the real production path end to end:
//
//   1. push the fixture two-rect SVG through the hidden input
//   2. the Layers panel gains one Group row; StatusBar counts 1 object
//   3. Ctrl+Shift+G (Ungroup) exposes both rectangles as their own layers
//   4. no console errors / page errors along the way
//
// The fixture lives at tests/e2e/fixtures/two-rects.svg (two disjoint
// filled rects, no styles — deliberately warning-free for the importer).

const FIXTURE = fileURLToPath(new URL('./fixtures/two-rects.svg', import.meta.url));

function layersSection(page: import('@playwright/test').Page) {
  return page.locator('.panel-section').filter({ has: page.locator('.panel-header h3', { hasText: /^Layers$/ }) });
}

test('opening an SVG through the File > Open input places its objects on the canvas', async ({ page }) => {
  // Surface-level console noise is part of the contract — an importer
  // throw would land here even if the layers panel still updated.
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  const section = layersSection(page);
  await expect(section.locator('.panel-header .panel-count').first()).toHaveText('0');

  // The MenuBar's hidden SVG/JSON input — same node the File menu's
  // "Open SVG / JSON…" entry clicks. setInputFiles fires its change event.
  const fileInput = page.locator('input[type="file"][accept=".svg,.json"]');
  await fileInput.setInputFiles(FIXTURE);

  // The two rects import as one selected Group: 1 layer, 1 canvas object.
  await expect(section.locator('.panel-header .panel-count').first()).toHaveText('1');
  await expect(section.getByText('Group', { exact: true }).first()).toBeVisible();
  await expect(page.locator('span[role="status"][aria-label^="Objects "]')).toHaveText(/Objects\s*1/);

  // Ungroup (Ctrl+Shift+G, the keymap's edit.ungroup) exposes both rects
  // as individual layers — proving both shapes really arrived.
  await page.keyboard.press('Control+Shift+g');
  await expect(section.locator('.panel-header .panel-count').first()).toHaveText('2');
  await expect(section.getByText('Rect', { exact: true })).toHaveCount(2);
  await expect(page.locator('span[role="status"][aria-label^="Objects "]')).toHaveText(/Objects\s*2/);

  expect(errors).toEqual([]);
});

test('the open-file input resets after use, so a second open still fires', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  const section = layersSection(page);
  const fileInput = page.locator('input[type="file"][accept=".svg,.json"]');

  // Open the same file twice — MenuBar's onFile clears input.value after
  // each import so picking the identical path re-fires the change event.
  await fileInput.setInputFiles(FIXTURE);
  await expect(section.locator('.panel-header .panel-count').first()).toHaveText('1');
  await fileInput.setInputFiles(FIXTURE);
  await expect(section.locator('.panel-header .panel-count').first()).toHaveText('2');

  expect(errors).toEqual([]);
});
