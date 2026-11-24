import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';

// Recolor Artwork e2e — the dialog (src/components/RecolorDialog.tsx) had
// ZERO coverage, which is how it shipped broken: its colour harvest lived in
// an "open transition" reconciliation that never fires under App.tsx's
// conditional mount (`{showRecolor && …}` — a first mount already has
// open === prevOpen), so for users the dialog opened with zero colours — "No
// solid colors in the selection to recolor", Reset/Apply disabled — for
// EVERY selection. The mechanism is guarded by
// src/components/__tests__/openSeed.productionMount.test.tsx; this spec
// proves the feature end to end on the real canvas, at the pixel level:
//
//   1. two differently coloured rects → the dialog lists both fills, each
//      row targeting its own source, Reset/Apply enabled;
//   2. "Map to gray" + Apply → each rect's fill really changes on the canvas
//      (lower-canvas pixel sample: red → a mid gray, green → a LIGHTER gray —
//      the per-colour mapping, not one flat colour), object count unchanged;
//   3. one Ctrl+Z restores both original fills;
//   4. a shape with no fill and no stroke is the legitimate empty state:
//      the message shows and Reset/Apply stay disabled.
//
// Anchors: dialog by role/name (aria-labelledby → "Recolor Artwork" h2),
// colour rows by aria-label `Recolor <hex>`, footer buttons by name,
// StatusBar "Objects" counter, and lower-canvas pixel samples.

const RED = '#ff3d3d';
const GREEN = '#3dff7a';

async function drawRect(page: Page, x0: number, y0: number, x1: number, y1: number): Promise<void> {
  // The rect tool is re-armed before each drag — drawing auto-switches tools.
  await page.click('button[data-tool="rect"]');
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 6 });
  await page.mouse.up();
}

async function hoverMenu(page: Page, name: string): Promise<void> {
  await page.getByRole('menuitem', { name, exact: true }).first().hover();
  await page.waitForTimeout(350);
}

/** Object ▸ Appearance ▸ Swatches ▸ "Apply swatch fill: <hex>" to the current selection. */
async function applySwatchFill(page: Page, hex: string): Promise<void> {
  await hoverMenu(page, 'Object');
  await hoverMenu(page, 'Appearance');
  await hoverMenu(page, 'Swatches');
  await page.locator(`button[role="menuitem"][aria-label="Apply swatch fill: ${hex}"]`).last().click();
  await page.waitForTimeout(250);
}

async function openRecolor(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+k');
  const input = page.locator('input[placeholder="Type a command or search…"]');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill('Recolor Artwork…');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Recolor Artwork', exact: true });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

type Rgb = [number, number, number];

/** Lower-canvas pixel at a PAGE coordinate — what fabric actually painted. */
async function canvasPixel(page: Page, pageX: number, pageY: number): Promise<Rgb> {
  return page.evaluate(([x, y]) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#main-canvas canvas.lower-canvas')!;
    const box = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const px = Math.round((x - box.left) * canvas.width / box.width);
    const py = Math.round((y - box.top) * canvas.height / box.height);
    const d = ctx.getImageData(px, py, 1, 1).data;
    return [d[0], d[1], d[2]] as [number, number, number];
  }, [pageX, pageY]);
}

const isReddish = ([r, g, b]: Rgb) => r > 200 && g < 100 && b < 100;
const isGreenish = ([r, g, b]: Rgb) => g > 200 && r < 110 && b < 140;
/** Neutral and mid-tone: neither white nor the near-black stroke. */
const isMidGray = ([r, g, b]: Rgb) => Math.abs(r - g) <= 4 && Math.abs(g - b) <= 4 && r > 50 && r < 220;

const objectsLabel = (page: Page) =>
  page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();

async function setupTwoColoredRects(page: Page): Promise<{ a: [number, number]; b: [number, number] }> {
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await page.waitForTimeout(600);
  const box = (await page.locator('#main-canvas').boundingBox())!;
  const aRect = { x0: box.x + 320, y0: box.y + 255, x1: box.x + 440, y1: box.y + 325 };
  const bRect = { x0: box.x + 480, y0: box.y + 255, x1: box.x + 600, y1: box.y + 325 };
  await drawRect(page, aRect.x0, aRect.y0, aRect.x1, aRect.y1);
  await drawRect(page, bRect.x0, bRect.y0, bRect.x1, bRect.y1);
  await page.click('button[data-tool="select"]');

  await page.mouse.click((aRect.x0 + aRect.x1) / 2, (aRect.y0 + aRect.y1) / 2); // rect A only
  await applySwatchFill(page, RED);
  await page.mouse.click((bRect.x0 + bRect.x1) / 2, (bRect.y0 + bRect.y1) / 2); // rect B only
  await applySwatchFill(page, GREEN);
  await page.mouse.move(box.x + 60, box.y + 60); // park the pointer off the menubar
  await page.keyboard.press('Control+a');
  await expect(page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Selected "]').first())
    .toHaveAttribute('aria-label', /Selected 2$/);
  return {
    a: [(aRect.x0 + aRect.x1) / 2, (aRect.y0 + aRect.y1) / 2],
    b: [(bRect.x0 + bRect.x1) / 2, (bRect.y0 + bRect.y1) / 2],
  };
}

test('harvests the selection colours, maps them to gray on Apply, and one undo restores both', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  const at = await setupTwoColoredRects(page);
  // Precondition: the canvas really holds a red rect and a green one.
  expect(isReddish(await canvasPixel(page, ...at.a))).toBe(true);
  expect(isGreenish(await canvasPixel(page, ...at.b))).toBe(true);

  const dialog = await openRecolor(page);

  // 1. Both fills are harvested; each row starts mapped to its own source.
  const rowFor = (hex: string) => dialog.locator(`input[type="color"][aria-label="Recolor ${hex}" i]`);
  await expect(rowFor(RED)).toHaveCount(1);
  await expect(rowFor(GREEN)).toHaveCount(1);
  await expect(rowFor(RED)).toHaveValue(RED);
  await expect(rowFor(GREEN)).toHaveValue(GREEN);
  await expect(dialog).not.toContainText('No solid colors in the selection');
  await expect(dialog.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();
  const apply = dialog.getByRole('button', { name: 'Apply', exact: true });
  await expect(apply).toBeEnabled();

  // 2. Map to gray, then Apply — the canvas itself must change.
  await dialog.getByRole('button', { name: 'Map to gray', exact: true }).click();
  await expect(rowFor(RED)).not.toHaveValue(RED);
  await apply.click();
  await expect(dialog).toBeHidden();

  await expect.poll(async () => isMidGray(await canvasPixel(page, ...at.a))).toBe(true);
  await expect.poll(async () => isMidGray(await canvasPixel(page, ...at.b))).toBe(true);
  const [grayA, grayB] = [await canvasPixel(page, ...at.a), await canvasPixel(page, ...at.b)];
  // Per-colour mapping: green is the lighter source, so it lands on the lighter gray.
  expect(grayB[0] - grayA[0]).toBeGreaterThan(20);
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 2$/);

  // 3. A single undo restores both original fills.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => isReddish(await canvasPixel(page, ...at.a))).toBe(true);
  await expect.poll(async () => isGreenish(await canvasPixel(page, ...at.b))).toBe(true);
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 2$/);

  expect(errors).toEqual([]);
});

test('a shape with no fill and no stroke is the legitimate empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await page.waitForTimeout(600);
  const box = (await page.locator('#main-canvas').boundingBox())!;
  await drawRect(page, box.x + 320, box.y + 255, box.x + 440, box.y + 325);
  await page.click('button[data-tool="select"]');
  // Fabric leaves the fresh shape selected; strip both paints from it via
  // the appearance.noFill / appearance.noStroke bindings.
  await page.keyboard.press('Control+Alt+x');
  await page.keyboard.press('Control+Alt+Shift+x');
  await page.mouse.move(box.x + 60, box.y + 60);
  await expect(page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Selected "]').first())
    .toHaveAttribute('aria-label', /Selected 1$/);

  const dialog = await openRecolor(page);

  await expect(dialog).toContainText('No solid colors in the selection to recolor.');
  await expect(dialog.locator('input[type="color"]')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', /Objects 1$/);
});
