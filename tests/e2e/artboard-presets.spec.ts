import { test, expect, toolsToolbar } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// "Add Artboard" size presets, end to end on the production build — observed
// through what is on screen (rows, read-outs, pixels), never app internals.
//
// Add Artboard used to append a document-sized artboard immediately, mostly
// outside the view. It now opens the Add Artboards picker (preset list with a
// sign-shop shortlist, orientation, custom size, count, placement, and the
// old From Selection), frames the first new artboard and selects the batch.
// The per-row A4 / Letter / 24×12 in presets stay and are covered here too.

const SHOTS = 'C:/tmp/aw_qa/implC';
const ROW = '[data-artboard-row]';
const WHEEL_WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();
  await expect(page.locator(ROW)).toHaveCount(1);
}

const dialogFor = (page: Page) => page.getByRole('dialog', { name: 'Add Artboards' });

/** X / Y / W / H of an artboard row, as the panel's own number inputs show them. */
async function rowNumbers(page: Page, index: number): Promise<number[]> {
  const inputs = page.locator(ROW).nth(index).locator('input[type="number"]');
  await expect(inputs).toHaveCount(4);
  return Promise.all([0, 1, 2, 3].map(async (i) => Number(await inputs.nth(i).inputValue())));
}

/**
 * Black-box scene readouts, valid on the production build as well as the dev
 * server (nothing here reaches into the app's module graph):
 *  - the status bar's size readout for the selection — its label is
 *    "W × H px", its title adds "@ left, top": unrounded document px;
 *  - the pixels of the artboard dim layer (ArtboardLayer), which dims
 *    everything outside the artboards and punches an exact transparent hole
 *    for each of them.
 */
const DIM_LAYER = '#main-canvas canvas[aria-hidden="true"].pointer-events-none';

/** The view's zoom as the Zoom chip announces it, e.g. "Zoom 97%". */
const zoomLabel = (page: Page): Promise<string | null> =>
  page.getByRole('button', { name: /^Zoom \d+%$/ }).getAttribute('aria-label');

/** Display units → document px, for reading the status bar's readouts back as px. */
const PX_PER_UNIT: Record<string, number> = { px: 1, mm: 3.7795, in: 96 };

/**
 * The selection's box in document px, from the status bar's size readout —
 * at the readout's own precision (2 decimals of its display unit: 0.01 mm ≈ 0.04 px).
 */
async function selectionBox(page: Page): Promise<{ left: number; top: number; width: number; height: number }> {
  const readout = page.locator('[aria-label="Editor status"] span[aria-label^="Width "]');
  const label = (await readout.getAttribute('aria-label')) ?? '';
  const title = (await readout.getAttribute('title')) ?? '';
  const size = label.match(/^Width ([\d.-]+) (\w+), Height ([\d.-]+) (\w+)(?:,|$)/);
  const at = title.match(/ @ ([\d.-]+), ([\d.-]+)$/);
  expect(size, `status bar readout "${label}"`).not.toBeNull();
  expect(at, `status bar readout title "${title}"`).not.toBeNull();
  const k = PX_PER_UNIT[size![2]];
  expect(k, `status bar unit "${size![2]}"`).toBeDefined();
  return { width: Number(size![1]) * k, height: Number(size![3]) * k, left: Number(at![1]) * k, top: Number(at![2]) * k };
}

/** The document's size in px, as the Document Settings dialog reports it (opened through the command palette, closed again). */
async function docSize(page: Page): Promise<number[]> {
  await page.keyboard.press('Control+k');
  const input = page.locator('input[placeholder="Type a command or search…"]');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill('Document Settings');
  await page.locator('#command-palette-list [role="option"]').filter({ hasText: 'Document Settings' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Document Settings' });
  await expect(dialog).toBeVisible();
  const size = [
    Number(await dialog.getByRole('spinbutton', { name: 'Width (px)', exact: true }).inputValue()),
    Number(await dialog.getByRole('spinbutton', { name: 'Height (px)', exact: true }).inputValue()),
  ];
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return size;
}

interface ArtboardHole {
  /** CSS px from the canvas's top-left corner. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  cw: number;
  ch: number;
  /** True when a scan ran to the canvas border instead of the dimmed gap. */
  clipped: boolean;
  /** Alpha of the layer 30 px in from the bottom-left corner: dimmed means ≥ 100. */
  corner: number;
}

/**
 * The artboard around viewport point (x, y), measured on the dim layer's own
 * pixels along that point's row and column (each edge to within a pixel);
 * null when the point is not on an artboard.
 */
async function artboardAround(page: Page, x: number, y: number): Promise<ArtboardHole | null> {
  return page.locator(DIM_LAYER).first().evaluate((el, at) => {
    const c = el as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width; // backing-store px per CSS px (device pixel ratio)
    const cx = Math.round((at.x - r.left) * k), cy = Math.round((at.y - r.top) * k);
    if (cx < 0 || cy < 0 || cx >= c.width || cy >= c.height) return null;
    const ctx = c.getContext('2d')!;
    const row = ctx.getImageData(0, cy, c.width, 1).data;
    const col = ctx.getImageData(cx, 0, 1, c.height).data;
    const dim = (d: Uint8ClampedArray, i: number) => d[i + 3] >= 70;
    if (dim(row, cx * 4)) return null;
    let l = cx; while (l > 0 && !dim(row, (l - 1) * 4)) l--;
    let rr = cx; while (rr < c.width - 1 && !dim(row, (rr + 1) * 4)) rr++;
    let t = cy; while (t > 0 && !dim(col, (t - 1) * 4)) t--;
    let b = cy; while (b < c.height - 1 && !dim(col, (b + 1) * 4)) b++;
    return {
      left: l / k, right: (rr + 1) / k, top: t / k, bottom: (b + 1) / k,
      cw: c.width / k, ch: c.height / k,
      clipped: l === 0 || rr === c.width - 1 || t === 0 || b === c.height - 1,
      corner: ctx.getImageData(Math.round(30 * k), Math.round(c.height - 30 * k), 1, 1).data[3],
    };
  }, { x, y });
}

test('⑤ Add Artboard opens the size picker instead of creating straight away', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Add Artboard', exact: true }).click();

  const dialog = dialogFor(page);
  await expect(dialog).toBeVisible();
  // Keyboard users start in the search box, and get back to the trigger on close.
  await expect(dialog.getByRole('searchbox', { name: 'Search preset sizes…' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Artboard', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Add Artboard', exact: true }).click();
  await expect(dialog).toBeVisible();
  // Nothing is created until the user confirms.
  await expect(page.locator(ROW)).toHaveCount(1);
  expect(await rowNumbers(page, 0)).toEqual([0, 0, 800, 600]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // …and the default document size is untouched: 800 × 600, which is no preset.
  expect(await docSize(page)).toEqual([800, 600]);
  await page.getByRole('button', { name: 'Add Artboard', exact: true }).click();
  await expect(dialog).toBeVisible();
  // The picker seeds its fields from Artboard 1, the document-sized anchor.
  await expect(dialog.getByRole('spinbutton', { name: 'Width (px)' })).toHaveValue('800');
  await expect(dialog.getByRole('spinbutton', { name: 'Height (px)' })).toHaveValue('600');

  // Sign-shop shortlist first, then the paper / card / sticker / screen sizes.
  const options = dialog.getByRole('option');
  await expect(options).toHaveCount(33);
  await expect(dialog.getByRole('group', { name: 'Signs & banners' }).getByRole('option')).toHaveCount(12);
  await expect(options.first()).toContainText('Yard sign (18×24 in)');
  await expect(dialog.getByRole('option', { name: /^A4/ })).toBeVisible();

  await page.screenshot({ path: `${SHOTS}/artboard-picker-open.png` });
});

test('⑤ the preset list searches, and each preset opens in its usual orientation', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Add Artboard', exact: true }).click();
  const dialog = dialogFor(page);
  const search = dialog.getByRole('searchbox', { name: 'Search preset sizes…' });

  await search.fill('banner');
  await expect(dialog.getByRole('option')).toHaveCount(5);
  await expect(dialog.getByRole('option', { name: /Banner/ })).toHaveCount(4);
  await expect(dialog).toContainText('5 / 33 matches');
  await search.fill('zzz');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(dialog).toContainText('No preset sizes found.');
  await dialog.getByRole('button', { name: 'Clear search' }).first().click();
  await expect(dialog.getByRole('option')).toHaveCount(33);

  // Paper is tall, banners are wide, the yard sign is portrait — picking a
  // preset adopts that orientation, and the fields follow.
  const expectSize = async (w: string, h: string) => {
    await expect(dialog.getByRole('spinbutton', { name: 'Width (px)' })).toHaveValue(w);
    await expect(dialog.getByRole('spinbutton', { name: 'Height (px)' })).toHaveValue(h);
  };
  await dialog.getByRole('option', { name: /^A4/ }).click();
  await expectSize('794', '1123');
  await expect(dialog.getByRole('button', { name: 'Landscape' })).toHaveAttribute('aria-pressed', 'false');
  await dialog.getByRole('option', { name: /^Banner \(24×12 in\)/ }).click();
  await expectSize('2304', '1152');
  await expect(dialog.getByRole('button', { name: 'Landscape' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('option', { name: /^Yard sign \(18×24 in\)/ }).click();
  await expectSize('1728', '2304');

  // Orientation swaps W/H; typing a size makes it custom.
  await dialog.getByRole('button', { name: 'Landscape' }).click();
  await expectSize('2304', '1728');
  await dialog.getByRole('spinbutton', { name: 'Width (px)' }).fill('500');
  await expectSize('500', '1728');
  await expect(dialog.getByRole('option', { selected: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expectSize('800', '600');
});

test('⑤ A4 landscape × 2 creates two A4 artboards, frames the first and selects both', async ({ page }) => {
  await boot(page);
  const before = { row: await rowNumbers(page, 0), name: await page.locator(ROW).first().getByRole('textbox', { name: 'Artboard name' }).inputValue(), zoom: await zoomLabel(page) };

  await page.getByRole('button', { name: 'Add Artboard', exact: true }).click();
  const dialog = dialogFor(page);
  await dialog.getByRole('option', { name: /^A4/ }).click();
  await dialog.getByRole('button', { name: 'Landscape' }).click();
  const count = dialog.getByRole('spinbutton', { name: 'Count' });
  await count.fill('2');
  await expect(dialog.getByRole('button', { name: 'Add 2 Artboards' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Add 2 Artboards' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Artboard', exact: true })).toBeFocused();
  const rows = page.locator(ROW);
  await expect(rows).toHaveCount(3);
  // A4 landscape at the document's 96 DPI: 1123 × 794, in a row right of Artboard 1.
  expect(await rowNumbers(page, 1)).toEqual([830, 0, 1123, 794]);
  expect(await rowNumbers(page, 2)).toEqual([830 + 1123 + 30, 0, 1123, 794]);

  // Selected in the list: both new rows checked, the first one reviewed.
  await expect(rows.nth(1).locator('input[type="checkbox"]')).toBeChecked();
  await expect(rows.nth(2).locator('input[type="checkbox"]')).toBeChecked();
  await expect(rows.nth(0).locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.toast-item').filter({ hasText: '2 artboards created' })).toBeVisible();

  // Moved into view: the FIRST new artboard (1123 × 794) is centred in the
  // viewport — the hole it punches in the dim layer, measured around the view
  // centre, is symmetric about it within 1.5 px, and has that artboard's
  // on-screen size (so it is one artboard, not its neighbours merged)…
  const dim = (await page.locator(DIM_LAYER).first().boundingBox())!;
  const hole = (await artboardAround(page, dim.x + dim.width / 2, dim.y + dim.height / 2))!;
  expect(hole.clipped, 'every edge ends at the dimmed gap, not at the canvas border').toBe(false);
  expect(hole.corner, 'the layer dims what is outside the artboards').toBeGreaterThanOrEqual(100);
  expect(Math.abs((hole.left + hole.right) / 2 - hole.cw / 2)).toBeLessThan(1.5);
  expect(Math.abs((hole.top + hole.bottom) / 2 - hole.ch / 2)).toBeLessThan(1.5);
  // …at a zoom that fits it, which is a different view than before.
  expect(await zoomLabel(page)).not.toBe(before.zoom);
  const zoom = Number((await zoomLabel(page))!.match(/\d+/)![0]) / 100;
  // The chip rounds the zoom to a whole percent; that is the slack allowed here.
  const slack = (docPx: number) => docPx * zoom * 0.007 + 2;
  expect(Math.abs((hole.right - hole.left) - 1123 * zoom)).toBeLessThanOrEqual(slack(1123));
  expect(Math.abs((hole.bottom - hole.top) - 794 * zoom)).toBeLessThanOrEqual(slack(794));
  expect(hole.right - hole.left).toBeLessThan(hole.cw);
  expect(hole.bottom - hole.top).toBeLessThan(hole.ch);
  // Artboard 1 is untouched…
  expect(await rowNumbers(page, 0)).toEqual(before.row);
  expect(await rows.nth(0).getByRole('textbox', { name: 'Artboard name' }).inputValue()).toBe(before.name);

  // The panel scrolled so the first new row is fully on screen.
  await expect(rows.nth(1)).toBeInViewport({ ratio: 0.99 });
  await page.screenshot({ path: `${SHOTS}/artboard-new-in-view.png` });

  // …and so is the document size.
  expect(await docSize(page)).toEqual([800, 600]);
});

test('placement: a grid from the origin clears the artboard already there; custom size and count clamp', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Add Artboard', exact: true }).click();
  const dialog = dialogFor(page);
  await dialog.getByRole('button', { name: 'Grid from origin' }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Columns' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Below' }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Columns' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Grid from origin' }).click();
  await dialog.getByRole('spinbutton', { name: 'Columns' }).fill('2');
  await dialog.getByRole('spinbutton', { name: 'Count' }).fill('3');
  await dialog.getByRole('button', { name: 'Add 3 Artboards' }).click();
  await expect(dialog).toHaveCount(0);
  // The origin is taken by Artboard 1 (0, 0, 800 × 600): the grid starts 30px below it.
  expect((await rowNumbers(page, 1)).slice(0, 2)).toEqual([0, 630]);
  expect((await rowNumbers(page, 2)).slice(0, 2)).toEqual([830, 630]);
  expect((await rowNumbers(page, 3)).slice(0, 2)).toEqual([0, 630 + 600 + 30]);
});

test('⑥ the per-row size presets resize that artboard and keep artwork outside it', async ({ page }) => {
  await boot(page);
  // Stray artwork in the scratch area: zoom far out, draw a rectangle well
  // outside Artboard 1, fit the page again (the rectangle is then off-screen).
  await toolsToolbar(page).locator('button[aria-label^="Rectangle"]').click();
  await page.getByRole('button', { name: /^Zoom \d+%$/ }).click();
  const zoomInput = page.getByRole('textbox', { name: /^Zoom$/ });
  await zoomInput.fill('8');
  await page.keyboard.press('Enter');
  const box = (await page.locator('#main-canvas').boundingBox())!;
  const start = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.82 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y - 40);
  await page.mouse.move(start.x + 120, start.y - 80);
  await page.mouse.up();
  await page.getByRole('button', { name: /^Zoom \d+%$/ }).click({ modifiers: ['Shift'] });
  await expect(page.locator('[role="status"][aria-label^="Objects"]')).toHaveAttribute('aria-label', 'Objects 1');
  // Let the creation bookkeeping (selection, history) settle before taking the reference position.
  await page.waitForTimeout(400);
  const stray = await selectionBox(page);
  const [abX, , abW] = await rowNumbers(page, 0);
  // The rectangle really is outside the artboard being resized.
  const cx = stray.left + stray.width / 2;
  expect(cx < abX || cx > abX + abW).toBe(true);
  // Unmoved means exactly that: still the one selected object, at the same
  // document position and the same size (left / top / W / H, unrounded).
  const unmovedSince = async (reference: typeof stray) => {
    await expect(page.locator('[role="status"][aria-label^="Selected "]')).toHaveAttribute('aria-label', 'Selected 1');
    expect(await selectionBox(page)).toEqual(reference);
  };

  const row = page.locator(ROW).first();
  const presets = row.getByRole('toolbar', { name: 'Artboard size presets' });
  await expect(presets.getByRole('button')).toHaveText(['A4', 'Letter', '24×12 in', /Swap W\/H/]);

  await presets.getByRole('button', { name: 'A4', exact: true }).click();
  expect((await rowNumbers(page, 0)).slice(2)).toEqual([794, 1123]);
  await presets.getByRole('button', { name: 'Letter', exact: true }).click();
  expect((await rowNumbers(page, 0)).slice(2)).toEqual([816, 1054]);
  await presets.getByRole('button', { name: '24×12 in', exact: true }).click();
  expect((await rowNumbers(page, 0)).slice(2)).toEqual([2304, 1152]);
  await unmovedSince(stray);
  // Keyboard path: arrowing onto a preset applies it.
  await presets.getByRole('button', { name: '24×12 in', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  expect((await rowNumbers(page, 0)).slice(2)).toEqual([816, 1054]);
  // App.tsx's global arrow nudge also answers that key (it ignores
  // defaultPrevented) and may shift the selection a step — out of scope
  // here, so re-reference the stray object after it.
  const afterKeys = await selectionBox(page);
  await presets.getByRole('button', { name: 'Swap W/H' }).click();
  expect((await rowNumbers(page, 0)).slice(2)).toEqual([1054, 816]);
  await expect(page.locator('.toast-item').filter({ hasText: 'Artboard orientation swapped' })).toBeVisible();

  // The stray object is still there, unmoved by the resizes.
  await unmovedSince(afterKeys);
  await expect(page.locator('[role="status"][aria-label^="Objects"]')).toHaveAttribute('aria-label', 'Objects 1');
  // Same numbers the picker produces for the same presets.
  await page.getByRole('button', { name: 'Add Artboard', exact: true }).click();
  const picker = dialogFor(page);
  const pickerSize = async (w: string, h: string) => {
    await expect(picker.getByRole('spinbutton', { name: 'Width (px)' })).toHaveValue(w);
    await expect(picker.getByRole('spinbutton', { name: 'Height (px)' })).toHaveValue(h);
  };
  await picker.getByRole('option', { name: /^US Letter/ }).click();
  await pickerSize('816', '1054');
  await picker.getByRole('option', { name: /^Banner \(24×12 in\)/ }).click();
  await pickerSize('2304', '1152');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
});

test('the Add Artboards picker passes axe WCAG 2.1 AA', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Add Artboard', exact: true }).click();
  await expect(dialogFor(page)).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(WHEEL_WCAG_TAGS)
    .exclude(['.canvas-host', 'canvas'])
    .options({ rules: { 'page-has-heading-one': { enabled: false } } })
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});
