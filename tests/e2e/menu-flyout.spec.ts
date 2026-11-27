import { test, expect, type Page } from './fixtures';

// Flyout hit-testing regression net — menus driven by REAL pointer movement.
//
// The bug class this guards against: a flyout panel inside a scrolling
// ancestor gets clipped by it. `overflow-y: auto` clips on both axes even
// when nothing overflows, so a submenu hanging outside its parent panel's
// box is cut off — CSS still reports it "visible", but elementFromPoint on
// its rows returns whatever is behind it (the canvas), i.e. no mouse user
// can open or click it. Three instances shipped at various points:
//   - the menubar's top-level panel (height cap added in wave 3b) clipped
//     EVERY nested submenu;
//   - the menubar's nested panels (own overflow) clipped depth 3+;
//   - the context menu's root clipped all of its submenus (since 0.18.0).
// Fixed by positioning every flyout level `position: fixed` from its
// anchor's viewport rect (src/components/ui/useFlyoutPosition.ts).
//
// Why this spec never uses locator.hover()/click() on menu items: Playwright
// SCROLLS scrollable ancestors to bring an element into view before acting,
// which silently moved the clipped flyout into the panel's visible box and
// made the broken layout pass. Here the pointer only ever goes to
// coordinates read from layout, scrolling happens the way a user does it
// (mouse wheel with the pointer over the panel), and every flyout is
// verified by hit-testing its first enabled row against elementFromPoint.

type Box = { x: number; y: number; w: number; h: number };

const viewports = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '960x600', width: 960, height: 600 },
] as const;

const MENUS = ['File', 'Edit', 'Object', 'Type', 'Effects', 'Production', 'View', 'Insert', 'Help'];

// --- in-page primitives (serialised into evaluate) -------------------------

/** Centre of the last shown element matching `sel` ("shown": laid out with
 *  size, not visibility:hidden, and not parked off-screen at left:-9999). */
async function shownCentre(page: Page, sel: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((s) => {
    const shown = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0 && r.left > -1000;
    };
    const els = [...document.querySelectorAll(s)].filter(shown);
    const el = els[els.length - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
}

/** 'TOPMOST' when the last shown element matching `sel` is what the browser
 *  would hand a click at its centre to. */
async function hitState(page: Page, sel: string): Promise<'TOPMOST' | 'COVERED' | 'MISSING'> {
  return page.evaluate((s) => {
    const shown = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0 && r.left > -1000;
    };
    const els = [...document.querySelectorAll(s)].filter(shown);
    const el = els[els.length - 1];
    if (!el) return 'MISSING';
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && (hit === el || el.contains(hit)) ? 'TOPMOST' : 'COVERED';
  }, sel);
}

/** The open menu root (`sel`) and its DIRECT submenu rows. */
async function rootAndRows(page: Page, sel: string): Promise<{ root: Box; rows: Array<{ label: string; disabled: boolean; box: Box }> } | null> {
  return page.evaluate((s) => {
    const shown = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0 && r.left > -1000;
    };
    const box = (r: DOMRect): { x: number; y: number; w: number; h: number } => ({ x: r.left, y: r.top, w: r.width, h: r.height });
    const root = [...document.querySelectorAll(s)].filter(shown).pop() as HTMLElement | undefined;
    if (!root) return null;
    const rows = [...root.querySelectorAll(':scope button[role="menuitem"][aria-haspopup="menu"]')]
      .filter((b) => (b.closest('[role="menu"]') as HTMLElement | null) === root)
      .map((b) => ({ label: b.getAttribute('aria-label') ?? '', disabled: (b as HTMLButtonElement).disabled, box: box(b.getBoundingClientRect()) }));
    return { root: box(root.getBoundingClientRect()), rows };
  }, sel);
}

/** Scroll `sel` (under the pointer) by wheel until row `index` sits inside the root's visible box. */
async function wheelRowIntoView(page: Page, sel: string, index: number): Promise<{ row: Box; root: Box } | null> {
  for (let attempt = 0; attempt < 14; attempt++) {
    const s = await rootAndRows(page, sel);
    if (!s) return null;
    const row = s.rows[index]?.box;
    if (!row) return null;
    const inside = row.y >= s.root.y - 0.5 && row.y + row.h <= s.root.y + s.root.h + 0.5;
    if (inside) return { row, root: s.root };
    // Park the pointer on the root's left edge (never over a row's right half,
    // where a flyout could open) and wheel toward the row.
    await page.mouse.move(s.root.x + 6, s.root.y + s.root.h / 2);
    const delta = row.y + row.h > s.root.y + s.root.h ? Math.ceil(row.y + row.h - (s.root.y + s.root.h)) + 24 : -Math.ceil(s.root.y - row.y) - 24;
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(160);
  }
  return null;
}

/** The flyout of direct row `index` of the open root `sel`, after the pointer rests on that row. */
async function flyoutOfRow(page: Page, sel: string, index: number): Promise<{ label: string; box: Box; withinViewport: boolean; firstItem: string | null; firstItemTopmost: boolean } | null> {
  const s = await rootAndRows(page, sel);
  if (!s) return null;
  const row = s.rows[index];
  if (!row) return null;
  // A single teleport (no intermediate points): nothing else is hovered on the way.
  await page.mouse.move(row.box.x + row.box.w / 2, row.box.y + row.box.h / 2);
  await page.waitForTimeout(220);
  return page.evaluate(({ s, index }) => {
    const shown = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0 && r.left > -1000;
    };
    const root = [...document.querySelectorAll(s)].filter(shown).pop() as HTMLElement | undefined;
    if (!root) return null;
    const button = [...root.querySelectorAll(':scope button[role="menuitem"][aria-haspopup="menu"]')]
      .filter((b) => (b.closest('[role="menu"]') as HTMLElement | null) === root)[index] as HTMLButtonElement | undefined;
    const fly = button?.parentElement?.querySelector(':scope > [role="menu"]') as HTMLElement | null;
    if (!button || !fly) return null;
    const r = fly.getBoundingClientRect();
    const tol = 1;
    const withinViewport = r.left >= -tol && r.top >= -tol && r.right <= window.innerWidth + tol && r.bottom <= window.innerHeight + tol;
    const first = [...fly.querySelectorAll(':scope button[role="menuitem"]')].find((b) => !(b as HTMLButtonElement).disabled)
      ?? fly.querySelector(':scope button[role="menuitem"]') as HTMLButtonElement | null | undefined;
    let topmost = false;
    let firstLabel: string | null = null;
    if (first) {
      const fr = first.getBoundingClientRect();
      const hit = document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2);
      topmost = !!hit && (hit === first || first.contains(hit));
      firstLabel = first.getAttribute('aria-label') ?? '';
    }
    return {
      label: button.getAttribute('aria-label') ?? '',
      box: { x: r.left, y: r.top, w: r.width, h: r.height },
      withinViewport: withinViewport && shown(fly),
      firstItem: firstLabel,
      firstItemTopmost: topmost,
    };
  }, { s: sel, index });
}

/** Crawl every enabled direct submenu of the open root `sel` by pointer only.
 *  Returns a failure per flyout that is clipped, off-viewport, or whose first
 *  row is not the top-most hit target. */
async function crawlFlyouts(page: Page, sel: string, what: string): Promise<string[]> {
  const failures: string[] = [];
  const initial = await rootAndRows(page, sel);
  if (!initial) return [`${what}: root did not open`];
  const enabled = initial.rows.map((r, i) => ({ ...r, index: i })).filter((r) => !r.disabled);
  // A menu without submenus (Insert) is a valid, empty crawl.
  for (const r of enabled) {
    const inView = await wheelRowIntoView(page, sel, r.index);
    if (!inView) { failures.push(`${what} ▸ ${r.label}: row could not be scrolled into view`); continue; }
    const fly = await flyoutOfRow(page, sel, r.index);
    if (!fly) { failures.push(`${what} ▸ ${r.label}: flyout did not render`); continue; }
    const where = `[${Math.round(fly.box.x)},${Math.round(fly.box.y)} ${Math.round(fly.box.w)}×${Math.round(fly.box.h)}]`;
    if (!fly.withinViewport) failures.push(`${what} ▸ ${r.label}: flyout escapes the viewport at ${where}`);
    if (fly.firstItem && !fly.firstItemTopmost) {
      failures.push(`${what} ▸ ${r.label}: first row "${fly.firstItem}" is not clickable (clipped or covered) — flyout at ${where}`);
    }
    // Leave the row straight down/left inside the root so the flyout closes before the next one.
    await page.mouse.move(inView.root.x + 6, inView.root.y + inView.root.h / 2);
    await page.waitForTimeout(120);
  }
  return failures;
}

// --- shared canvas setup ---------------------------------------------------

async function drawRect(page: Page, x0: number, y0: number, x1: number, y1: number): Promise<void> {
  await page.click('button[data-tool="rect"]');
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 6 });
  await page.mouse.up();
}

async function canvasPixel(page: Page, pageX: number, pageY: number): Promise<[number, number, number]> {
  return page.evaluate(([x, y]) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#main-canvas canvas.lower-canvas')!;
    const box = canvas.getBoundingClientRect();
    const d = canvas.getContext('2d', { willReadFrequently: true })!
      .getImageData(Math.round((x - box.left) * canvas.width / box.width), Math.round((y - box.top) * canvas.height / box.height), 1, 1).data;
    return [d[0], d[1], d[2]] as [number, number, number];
  }, [pageX, pageY]);
}

async function openApp(page: Page, width: number, height: number): Promise<Box> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(700);
  const b = (await page.locator('#main-canvas').boundingBox())!;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

const MENUBAR_ROOT = (menu: string) => `div[role="menu"][aria-label="${menu}"]`;
const CONTEXT_ROOT = 'div[role="menu"][class*="z-1000"]';

async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(3, 260);
  await page.waitForTimeout(200);
}

/** Every topbar control — the nine menu triggers, Undo/Redo, and the right
 *  cluster's buttons — must be its own top-most hit target at its centre.
 *  Below ~1400px the bar runs compact (icon-only toolbar, mark-only logo
 *  below 1100px) precisely so this holds down to the 960px shell minimum. */
async function unreachableTopbarControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const blocked = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return true;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(hit && (hit === el || el.contains(hit)));
    };
    const strip = document.querySelector('[role="menubar"]')!;
    const menus = [...strip.querySelectorAll(':scope > div > button')]
      .filter(blocked).map((b) => `menu ${b.getAttribute('aria-label')}`);
    const bar = document.querySelector('.topbar')!;
    const right = [...bar.querySelector('.ml-auto')!.querySelectorAll('button')]
      .filter((b) => b.closest('[role="menu"]') === null)
      .filter(blocked).map((b) => `button ${b.getAttribute('aria-label') ?? b.textContent}`);
    const history = [...bar.querySelectorAll('[aria-label="History actions"] button')]
      .filter((b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(hit && (hit === b || b.contains(hit))); })
      .map((b) => `button ${b.getAttribute('aria-label')}`);
    const scrolls = (el: Element, what: string) => (el.scrollWidth > el.clientWidth + 1 ? [`${what} overflows (scrolls horizontally)`] : []);
    return [...menus, ...right, ...history,
      ...scrolls(strip, 'menubar strip'), ...scrolls(document.querySelector('.output-actions-toolbar')!, 'output toolbar')];
  });
}

// --- tests -----------------------------------------------------------------

for (const vp of viewports) {
  test(`every menubar submenu is clickable by mouse at ${vp.name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await openApp(page, vp.width, vp.height);
    const failures: string[] = await unreachableTopbarControls(page);
    let crawled = 0;

    for (const menu of MENUS) {
      const trig = await page.evaluate((m) => {
        const b = document.querySelector(`[role="menubar"] button[role="menuitem"][aria-label="${m}"]`);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, menu);
      if (!trig) { failures.push(`${menu}: menubar trigger not found`); continue; }
      await page.mouse.move(trig.x, trig.y);
      await page.waitForTimeout(260);
      const before = await rootAndRows(page, MENUBAR_ROOT(menu));
      if (!before) { failures.push(`${menu}: panel did not open on hover`); continue; }
      // The panel itself must sit inside the viewport.
      const r = before.root;
      if (r.x < -1 || r.y < -1 || r.x + r.w > vp.width + 1 || r.y + r.h > vp.height + 1) {
        failures.push(`${menu}: panel escapes the viewport [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)}]`);
      }
      const subRows = before.rows.filter((row) => !row.disabled).length;
      crawled += subRows;
      failures.push(...await crawlFlyouts(page, MENUBAR_ROOT(menu), menu));
      await parkPointer(page);
    }

    // Sanity: the crawl really exercised the nested menus (24 enabled submenus
    // across the nine menus with nothing selected — several more light up
    // with a selection).
    expect(crawled).toBeGreaterThanOrEqual(20);
    // `failures` opened with the topbar reachability sweep: a clipped menu
    // trigger or toolbar button shows up here by name.
    expect(failures, failures.join('\n')).toEqual([]);
  });
}

test('a three-level menubar command is reachable and takes effect by mouse (Object ▸ Appearance ▸ Fill / Stroke ▸ No Fill)', async ({ page }) => {
  const canvas = await openApp(page, 1440, 900);
  const shape = { x: canvas.x + 240, y: canvas.y + 150 };
  await drawRect(page, shape.x, shape.y, shape.x + 100, shape.y + 56);
  await page.waitForTimeout(250);
  const probe = { x: shape.x + 50, y: shape.y + 28 };
  const before = await canvasPixel(page, probe.x, probe.y);
  expect(before[2] - before[0]).toBeGreaterThan(80); // the default blue fill

  // Trigger → row → row → leaf, each hop an L: right into the flyout at the row's y first.
  const trigger = (await shownCentre(page, '[role="menubar"] button[role="menuitem"][aria-label="Object"]'))!;
  await page.mouse.move(trigger.x, trigger.y);
  await page.waitForTimeout(260);

  const hops: Array<[string, string | null]> = [
    ['div[role="menu"][aria-label="Object"] button[role="menuitem"][aria-label="Appearance"]', 'div[role="menu"][aria-label="Appearance"]'],
    ['div[role="menu"][aria-label="Appearance"] button[role="menuitem"][aria-label="Fill / Stroke"]', 'div[role="menu"][aria-label="Fill / Stroke"]'],
    ['div[role="menu"][aria-label="Fill / Stroke"] button[role="menuitem"][aria-label="No Fill"]', null],
  ];
  // Hovering "Appearance ▸" also CSS-reveals its nested panels (same group name) — parked off-screen
  // until measured, so `shownCentre` (left > -1000) only ever returns the measured one.
  for (const [rowSel, flySel] of hops) {
    // From wherever the pointer is, land on the row with a teleport-free two-leg move: stay at the
    // row's y while travelling right. Simplest reliable form: go to the row's y at the panel's left
    // inside edge, then horizontally to the row centre.
    const row = await page.evaluate((s) => {
      const shown = (el: Element) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.visibility !== 'hidden' && r.width > 0 && r.left > -1000; };
      const els = [...document.querySelectorAll(s)].filter(shown);
      const el = (els[els.length - 1] as HTMLElement | undefined);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, rowSel);
    expect(row, `row ${rowSel} is shown`).not.toBeNull();
    await page.mouse.move(row!.x + 14, row!.y + row!.h / 2, { steps: 6 });
    await page.mouse.move(row!.x + row!.w / 2, row!.y + row!.h / 2, { steps: 4 });
    await page.waitForTimeout(240);
    expect(await hitState(page, rowSel), `${rowSel} top-most under the pointer`).toBe('TOPMOST');
    if (flySel) {
      // Right into the flyout at the row's y (16px inside), so the next hop starts inside it.
      const fly = await page.evaluate((s) => {
        const shown = (el: Element) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.visibility !== 'hidden' && r.width > 0 && r.left > -1000; };
        const els = [...document.querySelectorAll(s)].filter(shown);
        const el = (els[els.length - 1] as HTMLElement | undefined);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top };
      }, flySel);
      expect(fly, `${flySel} flyout opened`).not.toBeNull();
      await page.mouse.move(fly!.x + 16, row!.y + row!.h / 2, { steps: 6 });
      await page.waitForTimeout(150);
    }
  }

  // The pointer now rests on "No Fill" — click it for real.
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await canvasPixel(page, probe.x, probe.y)).join(), 'the shape fill clears').toBe('255,255,255');
});

test('every context-menu submenu is clickable by mouse, and Pathfinder ▸ Union works through it', async ({ page }) => {
  test.setTimeout(120_000);
  const canvas = await openApp(page, 1440, 900);
  const a = { x: canvas.x + 380, y: canvas.y + 330 };
  await drawRect(page, a.x, a.y, a.x + 120, a.y + 70);
  await drawRect(page, a.x + 60, a.y + 30, a.x + 180, a.y + 100); // overlaps A → boolean ops make sense
  await page.click('button[data-tool="select"]');
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);
  const objects = page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
  await expect(objects).toHaveAttribute('aria-label', /Objects 2$/);

  await page.mouse.click(a.x + 30, a.y + 20, { button: 'right' });
  await page.waitForTimeout(450);
  const failures = await crawlFlyouts(page, CONTEXT_ROOT, 'context menu');
  expect(failures, failures.join('\n')).toEqual([]);
  // A wheel notch over the menu's own box must not dismiss it. It used to close
  // on the first notch — fatal while the root ran to ~1800px (everything below
  // the fold was unreachable by mouse), and still the right behaviour for the
  // short windows where the regrouped 22-line root does need to scroll.
  const beforeWheel = await rootAndRows(page, CONTEXT_ROOT);
  await page.mouse.move(beforeWheel!.root.x + 6, beforeWheel!.root.y + beforeWheel!.root.h / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  const scrolledRoot = await rootAndRows(page, CONTEXT_ROOT);
  expect(scrolledRoot, 'the context menu is still open after wheel-scrolling it').not.toBeNull();

  // Drive one real command through the context menu's Pathfinder flyout:
  // two shapes → Union → one object.
  const pathfinder = (await rootAndRows(page, CONTEXT_ROOT))!.rows.findIndex((r) => r.label === 'Pathfinder');
  expect(pathfinder).toBeGreaterThanOrEqual(0);
  await wheelRowIntoView(page, CONTEXT_ROOT, pathfinder);
  const fly = await flyoutOfRow(page, CONTEXT_ROOT, pathfinder);
  expect(fly?.label).toBe('Pathfinder');
  // Coordinates after the scroll + hover (the pre-crawl row boxes are stale).
  const rowNow = (await rootAndRows(page, CONTEXT_ROOT))!.rows[pathfinder].box;
  const union = await page.evaluate(() => {
    const shown = (el: Element) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.visibility !== 'hidden' && r.width > 0 && r.left > -1000; };
    const root = [...document.querySelectorAll('div[role="menu"][class*="z-1000"]')].filter(shown).pop() as HTMLElement;
    const row = [...root.querySelectorAll(':scope button[role="menuitem"][aria-haspopup="menu"]')].find((b) => b.getAttribute('aria-label') === 'Pathfinder')!;
    const panel = row.parentElement!.querySelector(':scope > [role="menu"]')!;
    const btn = [...panel.querySelectorAll(':scope button[role="menuitem"]')].find((b) => b.getAttribute('aria-label') === 'Union') as HTMLElement;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  // Right into the flyout at the row's y, then to "Union".
  await page.mouse.move(rowNow.x + rowNow.w - 10, rowNow.y + rowNow.h / 2, { steps: 6 });
  await page.mouse.move(union.x, union.y, { steps: 6 });
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.mouse.up();
  await expect(objects).toHaveAttribute('aria-label', /Objects 1$/);
});

test('a context-menu flyout flips to the left instead of leaving the viewport near the right edge (960×600)', async ({ page }) => {
  const canvas = await openApp(page, 960, 600);
  const nearRight = { x: canvas.x + canvas.w - 60, y: canvas.y + 120 };
  await drawRect(page, nearRight.x - 100, nearRight.y, nearRight.x, nearRight.y + 56);
  await page.waitForTimeout(250);
  await page.mouse.click(nearRight.x - 30, nearRight.y + 20, { button: 'right' });
  await page.waitForTimeout(450);

  const rows = await rootAndRows(page, CONTEXT_ROOT);
  expect(rows, 'context menu opened').not.toBeNull();
  const align = rows!.rows.findIndex((r) => r.label === 'Align & Distribute');
  expect(align).toBeGreaterThanOrEqual(0);
  // The row is in view already (the regrouped root is 22 lines), so this wheel
  // step is a no-op here — it still covers any layout that needs it.
  const inView = await wheelRowIntoView(page, CONTEXT_ROOT, align);
  expect(inView, 'Align & Distribute row scrolled into view').not.toBeNull();
  const fly = await flyoutOfRow(page, CONTEXT_ROOT, align);
  expect(fly, 'Align & Distribute flyout rendered').not.toBeNull();
  expect(fly!.box.x + fly!.box.w).toBeLessThanOrEqual(960 + 1);
  expect(fly!.box.x).toBeGreaterThanOrEqual(-1);
  expect(fly!.firstItemTopmost, `"${fly!.firstItem}" clickable inside the flipped flyout`).toBe(true);
  // It really flipped: the flyout sits to the LEFT of its row (the row hugs the viewport edge).
  expect(fly!.box.x + fly!.box.w).toBeLessThanOrEqual(inView!.row.x + 1);
});
