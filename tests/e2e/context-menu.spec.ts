import { test, expect, type Page } from './fixtures';

// The canvas right-click menu, regrouped so that a selection's menu fits on one
// screen (Impl-D). The old flat list ran to 67 lines / ~1800px: at 1440x900 only
// three of its submenu rows were visible without scrolling.
//
// Everything here is driven by REAL pointer movement to coordinates read from
// layout — never locator.hover()/click() on a menu row. Playwright scrolls a
// scrollable ancestor to bring an element into view before acting, which would
// silently turn "the user cannot reach this" into a pass. A flyout is entered
// horizontally at the row's y (an L: right into the panel, then down), the way
// a hand on a mouse does it.

type Box = { x: number; y: number; w: number; h: number };
type RowInfo = { label: string; disabled: boolean; sub: boolean; box: Box };
type PanelInfo = { box: Box; rows: RowInfo[] };
type MenuSnapshot = {
  box: Box; content: number; visible: number; lines: string[]; rows: RowInfo[];
  panels: Record<string, PanelInfo>; hints: string[];
};

const ROOT = 'div[role="menu"][class*="z-1000"]';

/** The root's direct lines for a plain vector object: 20 rows + 2 separators. */
const VECTOR_ROOT = [
  'Undo', 'Redo', '|', 'Cut', 'Copy', 'Paste', 'Paste special ▸', 'Duplicate', 'Delete', 'Rename Selection…',
  'Group', 'Ungroup', 'Arrange ▸', 'Lock & Hide ▸', '|',
  'Pathfinder ▸', 'Align & Distribute ▸', 'Transform ▸', 'Path ▸', 'Select ▸', 'Appearance ▸', 'Image ▸',
];

// --- app helpers ------------------------------------------------------------

async function openApp(page: Page, width: number, height: number): Promise<Box> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(700);
  const b = (await page.locator('#main-canvas').boundingBox())!;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/** A drawn 140x80 rectangle, then selected by a real click. Returns its screen box. */
async function selectedRect(page: Page, x: number, y: number): Promise<Box> {
  await page.locator('button[data-tool="rect"]').click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 140, y + 80, { steps: 6 });
  await page.mouse.up();
  await page.locator('button[data-tool="select"]').click();
  await page.mouse.click(x + 70, y + 40);
  await page.waitForTimeout(200);
  return { x, y, w: 140, h: 80 };
}

const objectCount = (page: Page) => page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();

async function canvasPixel(page: Page, pageX: number, pageY: number): Promise<[number, number, number]> {
  return page.evaluate(([x, y]) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#main-canvas canvas.lower-canvas')!;
    const box = canvas.getBoundingClientRect();
    const d = canvas.getContext('2d', { willReadFrequently: true })!
      .getImageData(Math.round((x - box.left) * canvas.width / box.width), Math.round((y - box.top) * canvas.height / box.height), 1, 1).data;
    return [d[0], d[1], d[2]] as [number, number, number];
  }, [pageX, pageY]);
}

/** Pixels in and just around `b` that are clearly blue (the default fill / stroke). */
async function bluePixels(page: Page, b: Box): Promise<number> {
  return page.evaluate((b) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#main-canvas canvas.lower-canvas')!;
    const cb = canvas.getBoundingClientRect();
    const sx = canvas.width / cb.width, sy = canvas.height / cb.height;
    const x0 = Math.max(0, Math.floor((b.x - cb.left - 6) * sx)), y0 = Math.max(0, Math.floor((b.y - cb.top - 6) * sy));
    const d = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, Math.ceil((b.w + 12) * sx), Math.ceil((b.h + 12) * sy)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 2] - d[i] > 80) n++;
    return n;
  }, b);
}

// --- menu readers (pure layout reads, no pointer side effects) --------------

/** One layout read of the open menu: root, its direct lines, and every shown flyout. */
async function snapshot(page: Page): Promise<MenuSnapshot | null> {
  return page.evaluate((rootSel) => {
    const shown = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0 && r.left > -1000;
    };
    const box = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });
    const root = [...document.querySelectorAll(rootSel)].filter(shown).pop() as HTMLElement | undefined;
    if (!root) return null;
    const info = (host: HTMLElement) => {
      const rows = [...host.querySelectorAll('button[role="menuitem"]')]
        .filter((el) => el.closest('[role="menu"]') === host)
        .map((b) => ({
          label: b.getAttribute('aria-label') ?? '',
          disabled: (b as HTMLButtonElement).disabled,
          sub: b.getAttribute('aria-haspopup') === 'menu',
          box: box(b.getBoundingClientRect()),
        }));
      return { box: box(host.getBoundingClientRect()), rows };
    };
    // A row is a plain Item button, a separator, or a submenu's wrapper.
    const isLine = (el: Element) => el.matches('button[role="menuitem"]') || el.matches('[role="separator"]')
      || !!el.querySelector(':scope > button[role="menuitem"][aria-haspopup="menu"]');
    // Root rows sit inside the root's single content wrapper (the root also hosts the scroll hints).
    const plain = [...root.children].filter((el) => !isLine(el) && el.querySelector('button[role="menuitem"]'));
    const host = plain.length === 1 ? plain[0] as HTMLElement : root;
    const lines = [...host.children].filter(isLine).map((el) => {
      if (el.matches('[role="separator"]')) return '|';
      const b = el.matches('button') ? el : el.querySelector(':scope > button');
      return `${b!.getAttribute('aria-label')}${b!.getAttribute('aria-haspopup') === 'menu' ? ' ▸' : ''}`;
    });
    const panels: Record<string, PanelInfo> = {};
    for (const p of [...root.querySelectorAll('div[role="menu"]')].filter(shown)) panels[p.getAttribute('aria-label') ?? ''] = info(p as HTMLElement);
    return {
      box: box(root.getBoundingClientRect()), content: root.scrollHeight, visible: root.clientHeight,
      lines, rows: info(root).rows, panels,
      hints: [...root.querySelectorAll('[data-scroll-hint]')].map((el) => el.getAttribute('data-scroll-hint')),
    };
  }, ROOT);
}

async function openContext(page: Page, x: number, y: number): Promise<MenuSnapshot> {
  await page.mouse.click(x, y, { button: 'right' });
  await expect.poll(async () => (await snapshot(page)) !== null, 'the context menu opened').toBe(true);
  await page.waitForTimeout(150);
  return (await snapshot(page))!;
}

const menuClosed = (page: Page) => expect.poll(async () => (await snapshot(page)) === null, 'the context menu closed').toBe(true);

/** The panel labelled `panel` — the root itself when null. */
function panelOf(s: MenuSnapshot, panel: string | null): PanelInfo | undefined {
  return panel === null ? { box: s.box, rows: s.rows } : s.panels[panel];
}

// --- pointer navigation ------------------------------------------------------

/** Put the pointer on item `label` of `panel` (root when null). When `fly` is
 *  given, the pointer is on a row of that flyout's parent panel at `fromY`:
 *  go straight into the flyout at that y first, THEN down / up to the item. */
async function pointAt(page: Page, s: MenuSnapshot, label: string, panel: string | null, fly?: Box, fromY?: number): Promise<Box> {
  const row = panelOf(s, panel)?.rows.find((r) => r.label === label);
  expect(row, `row "${label}" in ${panel ?? 'the root'}`).toBeDefined();
  if (fly) {
    await page.mouse.move(fly.x + 14, fromY!, { steps: 8 });
    await page.mouse.move(fly.x + 14, row!.box.y + row!.box.h / 2, { steps: 8 });
  }
  await page.mouse.move(row!.box.x + row!.box.w / 2, row!.box.y + row!.box.h / 2, { steps: 6 });
  await page.waitForTimeout(160);
  return row!.box;
}

/** Click the item at `path` (submenu titles, then the leaf) by pointer only. */
async function clickThrough(page: Page, path: string[]): Promise<void> {
  let panel: string | null = null;
  let fly: Box | null = null;
  let fromY = 0;
  for (const [i, label] of path.entries()) {
    const s = (await snapshot(page))!;
    const row = await pointAt(page, s, label, panel, fly ?? undefined, fromY);
    if (i === path.length - 1) {
      // The leaf is really under the pointer: nothing clips or covers it.
      const topmost = await page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit && hit.closest('button[role="menuitem"]')?.getAttribute('aria-label');
      }, { x: row.x + row.w / 2, y: row.y + row.h / 2 });
      expect(topmost, `"${label}" is the top-most hit target`).toBe(label);
      await page.mouse.down();
      await page.mouse.up();
      return;
    }
    fly = (await snapshot(page))!.panels[label]?.box ?? null;
    expect(fly, `"${label}" opened its flyout on hover`).not.toBeNull();
    fromY = row.y + row.h / 2;
    panel = label;
  }
  throw new Error('clickThrough needs at least one step');
}

// --- tests -------------------------------------------------------------------

for (const vp of [{ name: '1440x900', width: 1440, height: 900 }, { name: '1280x720', width: 1280, height: 720 }]) {
  test(`a selected rectangle's context menu fits the viewport without scrolling at ${vp.name}`, async ({ page }) => {
    const canvas = await openApp(page, vp.width, vp.height);
    // Two placements: opening DOWNWARD from a click near the top, and upward-
    // flipped from mid-canvas. Both must end entirely on screen. (The canvas's
    // first ~18px are covered by a strip, so "near the top" starts below it.)
    for (const at of [{ x: canvas.x + 300, y: canvas.y + 40 }, { x: canvas.x + 520, y: canvas.y + 260 }]) {
      await selectedRect(page, at.x, at.y);
      const menu = await openContext(page, at.x + 70, at.y + 40);
      const r = menu.box;
      expect(r.x, 'left edge on screen').toBeGreaterThanOrEqual(-1);
      expect(r.y, 'top edge on screen').toBeGreaterThanOrEqual(-1);
      expect(r.x + r.w, 'right edge on screen').toBeLessThanOrEqual(vp.width + 1);
      expect(r.y + r.h, 'bottom edge on screen').toBeLessThanOrEqual(vp.height + 1);
      // Every direct line is on screen and nothing is clipped by the height cap.
      expect(menu.lines).toEqual(VECTOR_ROOT);
      expect(menu.lines).toHaveLength(22);
      expect(menu.content, 'content fits the capped box').toBeLessThanOrEqual(menu.visible + 1);
      expect(menu.hints, 'no scroll hint when nothing is clipped').toEqual([]);
      for (const row of menu.rows) {
        expect(row.box.y, `"${row.label}" top inside the menu`).toBeGreaterThanOrEqual(r.y - 0.5);
        expect(row.box.y + row.box.h, `"${row.label}" bottom inside the menu`).toBeLessThanOrEqual(r.y + r.h + 0.5);
      }
      // The original conditions still decide what is enabled.
      const byLabel = Object.fromEntries(menu.rows.map((row) => [row.label, row.disabled]));
      expect(byLabel).toMatchObject({ Paste: true, Pathfinder: true, Group: true, Ungroup: true });
      expect(byLabel).toMatchObject({ 'Paste special': false, Arrange: false, 'Lock & Hide': false, Select: false, Image: false });
      await page.keyboard.press('Escape');
      await menuClosed(page);
    }
  });
}

test('"Paste special ▸ Paste in Place" pastes a copy through the context menu by pointer', async ({ page }) => {
  const canvas = await openApp(page, 1440, 900);
  const at = { x: canvas.x + 320, y: canvas.y + 220 };
  await selectedRect(page, at.x, at.y);
  await expect(objectCount(page)).toHaveAttribute('aria-label', /Objects 1$/);
  const on = { x: at.x + 70, y: at.y + 40 };

  // Empty internal clipboard: the row itself stays enabled (its last item reads
  // the SYSTEM clipboard), while the four internal paste variants are disabled.
  let menu = await openContext(page, on.x, on.y);
  await pointAt(page, menu, 'Paste special', null);
  let fly = (await snapshot(page))!.panels['Paste special'];
  expect(fly, 'Paste special flyout opens on an empty clipboard').toBeDefined();
  expect(fly!.rows.map((r) => r.label)).toEqual(['Paste Here', 'Paste in Place', 'Paste in Front', 'Paste in Back', 'Paste from Clipboard']);
  expect(fly!.rows.map((r) => r.disabled)).toEqual([true, true, true, true, false]);
  expect(menu.rows.find((r) => r.label === 'Paste special')!.disabled).toBe(false);
  await page.keyboard.press('Escape');
  await menuClosed(page);

  // Copy, reopen: every paste variant is enabled now.
  await page.mouse.click(on.x, on.y);
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(250);
  menu = await openContext(page, on.x, on.y);
  expect(menu.rows.find((r) => r.label === 'Paste')!.disabled, 'Paste enabled after a copy').toBe(false);
  await pointAt(page, menu, 'Paste special', null);
  fly = (await snapshot(page))!.panels['Paste special'];
  expect(fly!.rows.map((r) => r.disabled)).toEqual([false, false, false, false, false]);

  // Drive the NEW path in one go: Paste special ▸ Paste in Place → two objects.
  await clickThrough(page, ['Paste special', 'Paste in Place']);
  await expect(objectCount(page)).toHaveAttribute('aria-label', /Objects 2$/);
  await menuClosed(page);
});

test('a three-level context-menu command lands and takes effect (Appearance ▸ Fill / Stroke ▸ No Fill)', async ({ page }) => {
  const canvas = await openApp(page, 1440, 900);
  const at = { x: canvas.x + 520, y: canvas.y + 200 };
  await selectedRect(page, at.x, at.y);
  const probe = { x: at.x + 70, y: at.y + 40 };
  const before = await canvasPixel(page, probe.x, probe.y);
  expect(before[2] - before[0], 'the default blue fill').toBeGreaterThan(80);

  await openContext(page, probe.x, probe.y);
  await clickThrough(page, ['Appearance', 'Fill / Stroke', 'No Fill']);
  await expect.poll(async () => (await canvasPixel(page, probe.x, probe.y)).join(), 'the shape fill clears').toBe('255,255,255');
  await menuClosed(page);
});

test('a four-level context-menu command is reachable and takes effect (Appearance ▸ Stroke style ▸ Dash ▸ Dotted)', async ({ page }) => {
  const canvas = await openApp(page, 1440, 900);
  const at = { x: canvas.x + 520, y: canvas.y + 200 };
  const shape = await selectedRect(page, at.x, at.y);
  const on = { x: at.x + 70, y: at.y + 40 };
  const filled = await bluePixels(page, shape);
  expect(filled, 'a filled blue shape').toBeGreaterThan(4000);

  // Give it a visible blue outline first: Appearance ▸ Fill / Stroke ▸ Swap Fill / Stroke.
  // (Fabric re-renders on the next animation frame, so pixel assertions poll.)
  await openContext(page, on.x, on.y);
  await clickThrough(page, ['Appearance', 'Fill / Stroke', 'Swap Fill / Stroke']);
  await menuClosed(page);
  await expect.poll(() => bluePixels(page, shape), 'an outline, not a fill').toBeLessThan(filled / 2);
  const solid = await bluePixels(page, shape);
  expect(solid, 'an outline is drawn').toBeGreaterThan(120);

  // Four panels deep: root ▸ Appearance ▸ Stroke style ▸ Dash ▸ Dotted.
  await openContext(page, on.x, on.y);
  await clickThrough(page, ['Appearance', 'Stroke style', 'Dash', 'Dotted']);
  await menuClosed(page);
  await expect.poll(() => bluePixels(page, shape), 'a dotted outline draws far less than a solid one').toBeLessThan(solid * 0.7);
  const dotted = await bluePixels(page, shape);
  expect(dotted, 'some of the outline is still drawn').toBeGreaterThan(20);
});

test('the smallest window scrolls a little and says so with an edge hint (960x600)', async ({ page }) => {
  const canvas = await openApp(page, 960, 600);
  const at = { x: canvas.x + 300, y: canvas.y + 120 };
  await selectedRect(page, at.x, at.y);
  const menu = await openContext(page, at.x + 70, at.y + 40);
  // 586px of content under a 540px cap: about a row and a half is clipped.
  expect(menu.content).toBeGreaterThan(menu.visible + 1);
  expect(menu.content - menu.visible).toBeLessThan(90);
  expect(menu.hints, 'only the bottom edge can still be scrolled to').toEqual(['bottom']);
  const hint = await page.evaluate(() => {
    const fade = document.querySelector('[data-scroll-hint="bottom"] > div')!;
    const r = fade.getBoundingClientRect();
    return { visible: getComputedStyle(fade).visibility !== 'hidden' && r.width > 0 && r.height > 0, h: r.height, pointerEvents: getComputedStyle(fade).pointerEvents };
  });
  expect(hint, 'a visible 20px fade that never blocks the rows').toEqual({ visible: true, h: 20, pointerEvents: 'none' });
  // The last row is below the fold…
  const last = menu.rows[menu.rows.length - 1];
  expect(last.label).toBe('Image');
  expect(last.box.y + last.box.h).toBeGreaterThan(menu.box.y + menu.box.h);

  // …wheel to the end: the hint flips to the top edge and "Image ▸" is reachable.
  await page.mouse.move(menu.box.x + 6, menu.box.y + menu.box.h / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(async () => (await snapshot(page))?.hints, 'hints after scrolling to the end').toEqual(['top']);
  const end = (await snapshot(page))!;
  const imageRow = end.rows.find((row) => row.label === 'Image')!;
  expect(imageRow.box.y + imageRow.box.h, '"Image ▸" scrolled into view').toBeLessThanOrEqual(end.box.y + end.box.h + 0.5);
  await pointAt(page, end, 'Image', null);
  const fly = (await snapshot(page))!.panels.Image;
  expect(fly, 'Image flyout opens after scrolling').toBeDefined();
  expect(fly!.box.x, 'flyout left edge').toBeGreaterThanOrEqual(-1);
  expect(fly!.box.x + fly!.box.w, 'flyout right edge').toBeLessThanOrEqual(961);
  expect(fly!.box.y, 'flyout top edge').toBeGreaterThanOrEqual(-1);
  expect(fly!.box.y + fly!.box.h, 'flyout bottom edge').toBeLessThanOrEqual(601);
  const first = fly!.rows[0];
  const topmost = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('button[role="menuitem"]'), { x: first.box.x + first.box.w / 2, y: first.box.y + first.box.h / 2 });
  expect(topmost, 'first row of the flyout is clickable after scrolling').toBe(true);
});

test('a text object gets Edit Text and Type ▸; a plain shape does not', async ({ page }) => {
  const canvas = await openApp(page, 1440, 900);
  const at = { x: canvas.x + 300, y: canvas.y + 260 };
  // The text tool drops an IText with its top-left at the click, in editing mode.
  await page.locator('button[data-tool="text"]').click();
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(250);
  await page.keyboard.type('Hello');
  await page.keyboard.press('Escape');
  await page.locator('button[data-tool="select"]').click();
  await page.mouse.click(at.x + 14, at.y + 14);
  await page.waitForTimeout(200);

  const menu = await openContext(page, at.x + 14, at.y + 14);
  const lines = menu.lines;
  // The two type-only rows lead the tools block, right after its separator.
  const cut = lines.indexOf('|', lines.indexOf('Lock & Hide ▸')) + 1;
  expect(lines.slice(cut, cut + 2)).toEqual(['Edit Text', 'Type ▸']);
  expect(lines).toHaveLength(VECTOR_ROOT.length + 2);
  expect(menu.content, 'a text selection still fits without scrolling').toBeLessThanOrEqual(menu.visible + 1);
  expect(menu.rows.find((row) => row.label === 'Edit Text')!.disabled).toBe(false);

  await pointAt(page, menu, 'Type', null);
  const type = (await snapshot(page))!.panels.Type;
  expect(type, 'Type flyout').toBeDefined();
  expect(type!.rows.map((r) => r.label)).toEqual(['Create Outlines', 'Break Text into Letters', 'Text on Arc (Up)', 'Text on Arc (Down)']);
});
