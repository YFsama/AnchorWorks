import { test, expect, toolsToolbar } from './fixtures';
import type { Page } from '@playwright/test';

// Drag-and-drop import, end to end — one spec for the dev server and the
// production build alike.
//
// Real file drags cannot be driven by Playwright, so each gesture is
// dispatched the way the browser would: a DataTransfer carrying real File
// objects, and dragenter → dragover → drop on whatever element actually sits
// under the pointer (document.elementFromPoint). Before this work only the
// canvas wrapper listened, so a file released on a panel, the top bar or the
// tool rail did nothing at all.
//
// The scene is observed black-box only — the status bar's readouts plus the
// pixels of Fabric's own scene canvas — never through the app's module graph,
// which only the dev server exposes by source path.

const OBJECTS = '[role="status"][aria-label^="Objects"]';
const OVERLAY = page => page.locator('div[aria-hidden="true"]', { hasText: 'Release to import' });
/** Fabric's scene canvas: the paper and the objects, nothing else. */
const SCENE = '#main-canvas canvas.lower-canvas';
/** The status bar's size readout for the selection: "W × H px", plus "@ left, top" in its title. */
const READOUT = '[aria-label="Editor status"] span[aria-label^="Width "]';

interface DropFile { name: string; type: string; text?: string; png?: [number, number] }

async function objectsCount(page: Page): Promise<number> {
  const label = (await page.locator(OBJECTS).getAttribute('aria-label')) ?? '';
  return Number(label.match(/\d+/)?.[0] ?? -1);
}

/** The scene canvas's exact pixels: "nothing landed on the canvas" is a pixel identity. */
const scenePixels = (page: Page): Promise<string> =>
  page.locator(SCENE).evaluate((el) => (el as HTMLCanvasElement).toDataURL());

/** …once two reads in a row agree, so a still-settling first paint is not the reference. */
async function settledScene(page: Page): Promise<string> {
  let prev = '';
  for (let i = 0; i < 10; i++) {
    const now = await scenePixels(page);
    if (now === prev) return now;
    prev = now;
    await page.waitForTimeout(120);
  }
  return prev;
}

/** The view's zoom as the Zoom chip announces it (a whole percent). */
async function zoomPercent(page: Page): Promise<number> {
  const label = (await page.getByRole('button', { name: /^Zoom \d+%$/ }).getAttribute('aria-label')) ?? '';
  return Number(label.match(/\d+/)?.[0] ?? NaN);
}

/** Selects everything through the command palette, so the status bar reports on it. */
async function selectAll(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  const input = page.locator('input[placeholder="Type a command or search…"]');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill('Select All');
  await page.locator('#command-palette-list [role="option"]')
    .filter({ hasText: 'Select All' }).filter({ hasNotText: /Deselect/ }).first().click();
}

/** Display units → document px, for reading the status bar's readouts back as px. */
const PX_PER_UNIT: Record<string, number> = { px: 1, mm: 3.7795, in: 96 };

/**
 * The selection's box in document px, from the status bar's size readout —
 * at the readout's own precision (2 decimals of its display unit: 0.01 mm ≈ 0.04 px).
 */
async function selectionBox(page: Page): Promise<{ left: number; top: number; width: number; height: number }> {
  const readout = page.locator(READOUT);
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

/**
 * CSS-px box (viewport coordinates) of the solid magenta image around
 * viewport point (x, y), measured on the scene canvas: the horizontal extent
 * along six rows and the vertical extent along six columns, all off the
 * other axis's centre line — a selected object carries a centre marker
 * there, which must not count. null when the point is not magenta, or when
 * the scans do not agree on one rectangle. Each edge is located to within a pixel.
 */
async function magentaRectAt(page: Page, x: number, y: number): Promise<{ left: number; right: number; top: number; bottom: number } | null> {
  return page.locator(SCENE).evaluate((el, at) => {
    const c = el as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width; // backing-store px per CSS px (device pixel ratio)
    const cx = Math.round((at.x - r.left) * k), cy = Math.round((at.y - r.top) * k);
    if (cx < 0 || cy < 0 || cx >= c.width || cy >= c.height) return null;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    // #ff2e9a, tolerating the anti-aliased rim (≥ ~70 % coverage, over paper or scratch alike).
    const magenta = (x: number, y: number) => {
      const i = (y * c.width + x) * 4;
      return d[i] > 150 && d[i + 1] < 110 && d[i + 2] > 70 && d[i] - d[i + 1] > 90 && d[i + 2] - d[i + 1] > 20;
    };
    if (!magenta(cx, cy)) return null;
    const spanX = (y: number): [number, number] => {
      let l = cx, rr = cx;
      while (l > 0 && magenta(l - 1, y)) l--;
      while (rr < c.width - 1 && magenta(rr + 1, y)) rr++;
      return [l, rr + 1];
    };
    const spanY = (x: number): [number, number] => {
      let t = cy, b = cy;
      while (t > 0 && magenta(x, t - 1)) t--;
      while (b < c.height - 1 && magenta(x, b + 1)) b++;
      return [t, b + 1];
    };
    const [l0, r0] = spanX(cy), [t0, b0] = spanY(cx);
    // The edges are read off six scans per axis, all away from the centre
    // line (a selected object carries a centre marker on it); they must all agree.
    const off = [-0.4, -0.3, -0.2, 0.2, 0.3, 0.4];
    const ys = off.map((f) => spanY(cx + Math.round((r0 - l0) * f)));
    const xs = off.map((f) => spanX(cy + Math.round((b0 - t0) * f)));
    const edge = (v: number[]): number | null => {
      const m = [...v].sort((a, b) => a - b)[v.length >> 1];
      return v.every((n) => Math.abs(n - m) <= 2) ? m : null;
    };
    const top = edge(ys.map(([t]) => t)), bottom = edge(ys.map(([, b]) => b));
    const left = edge(xs.map(([l]) => l)), right = edge(xs.map(([, r]) => r));
    if (top === null || bottom === null || left === null || right === null) return null;
    return { left: r.left + left / k, right: r.left + right / k, top: r.top + top / k, bottom: r.top + bottom / k };
  }, { x, y });
}

/** The image is centred on (x, y): its measured centre is within a screen pixel, its size is w × h × zoom (± 2 px). */
function expectImageAt(rect: NonNullable<Awaited<ReturnType<typeof magentaRectAt>>>, x: number, y: number, w: number, h: number, zoom: number): void {
  const where = `image box ${JSON.stringify(rect)} vs drop (${x}, ${y})`;
  expect(Math.abs((rect.left + rect.right) / 2 - x), where).toBeLessThanOrEqual(1);
  expect(Math.abs((rect.top + rect.bottom) / 2 - y), where).toBeLessThanOrEqual(1);
  // The chip rounds the zoom to a whole percent, so the expected size carries that slack.
  expect(Math.abs((rect.right - rect.left) - w * zoom), where).toBeLessThanOrEqual(w * zoom * 0.007 + 1.5);
  expect(Math.abs((rect.bottom - rect.top) - h * zoom), where).toBeLessThanOrEqual(h * zoom * 0.007 + 1.5);
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();
  // io3 is a lazy chunk: a hover over the canvas only toggles the ring once
  // its window-level listeners are attached, so that is the readiness signal.
  const canvas = await page.locator('#main-canvas').boundingBox();
  expect(canvas).not.toBeNull();
  const mid = { x: Math.round(canvas!.x + canvas!.width / 2), y: Math.round(canvas!.y + canvas!.height / 2) };
  const probe = [{ name: 'probe.png', type: 'image/png' }];
  await expect.poll(async () => {
    await drag(page, mid.x, mid.y, probe, 'hover');
    return page.locator('#main-canvas').evaluate((el) => el.classList.contains('dragging-files'));
  }, { timeout: 15_000 }).toBe(true);
  // End the probe drag so the ring is gone before the test proper.
  await drag(page, mid.x, mid.y, probe, 'leave');
  await expect(page.locator('#main-canvas')).not.toHaveClass(/dragging-files/);
  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects \d+$/);
}

/** Dispatches one synthetic file drag at viewport (x, y). */
async function drag(page: Page, x: number, y: number, files: DropFile[], phase: 'hover' | 'drop' | 'leave' = 'drop') {
  return page.evaluate(({ x, y, files, phase }) => {
    const target = document.elementFromPoint(x, y) ?? document.body;
    const dt = new DataTransfer();
    for (const f of files) {
      let file: File;
      if (f.png) {
        const c = document.createElement('canvas');
        c.width = f.png[0];
        c.height = f.png[1];
        const g = c.getContext('2d')!;
        g.fillStyle = '#ff2e9a';
        g.fillRect(0, 0, c.width, c.height);
        const bin = atob(c.toDataURL('image/png').split(',')[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        file = new File([bytes], f.name, { type: 'image/png' });
      } else {
        file = new File([f.text ?? 'x'], f.name, { type: f.type });
      }
      dt.items.add(file);
    }
    const init = { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: x, clientY: y };
    // dispatchEvent() inverts the flag: it returns false when the default was prevented.
    const fire = (type: string) => { const ev = new DragEvent(type, init); target.dispatchEvent(ev); return ev.defaultPrevented; };
    const enterPrevented = fire('dragenter');
    const overPrevented = fire('dragover');
    if (phase === 'leave') fire('dragleave');
    if (phase === 'drop') fire('drop');
    return {
      enterPrevented,
      overPrevented,
      target: target.closest('#main-canvas') ? 'canvas' : (target.id || target.className || target.tagName).toString().slice(0, 40),
    };
  }, { x, y, files, phase });
}

test('① a PNG dropped on the canvas imports and lands at the drop point', async ({ page }) => {
  await boot(page);
  const box = (await page.locator('#main-canvas').boundingBox())!;
  const at = { x: Math.round(box.x + box.width * 0.64), y: Math.round(box.y + box.height * 0.38) };
  expect(await objectsCount(page)).toBe(0);

  const res = await drag(page, at.x, at.y, [{ name: 'sticker.png', type: 'image/png', png: [120, 80] }]);
  expect(res.target).toBe('canvas');
  expect(res.overPrevented).toBe(true);

  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', 'Objects 1', { timeout: 10_000 });
  // One object, 120 × 80 document px…
  await selectAll(page);
  const img = await selectionBox(page);
  expect(img.width).toBeCloseTo(120, 1);
  expect(img.height).toBeCloseTo(80, 1);
  // …made of the dropped PNG's own pixels (solid #ff2e9a), centred on the
  // scene point under the cursor: the pixel box around the drop point is
  // symmetric about it and has the image's on-screen size.
  const zoom = (await zoomPercent(page)) / 100;
  expectImageAt((await magentaRectAt(page, at.x, at.y))!, at.x, at.y, 120, 80, zoom);
  // Nothing at the view centre, nor 300 px left of the drop: the position follows the drop point.
  const view = (await page.locator(SCENE).boundingBox())!;
  expect(await magentaRectAt(page, at.x - 300, at.y)).toBeNull();
  expect(await magentaRectAt(page, view.x + view.width / 2, view.y + view.height / 2)).toBeNull();
  await expect(OVERLAY(page)).toHaveCount(0);
  await expect(page.locator('#main-canvas')).not.toHaveClass(/dragging-files/);
});

test('② hovering the chrome shows the full-window drop affordance', async ({ page }) => {
  await boot(page);
  const box = (await page.locator('aside.aside-right').boundingBox())!;
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const res = await drag(page, at.x, at.y, [{ name: 'sticker.png', type: 'image/png', png: [120, 80] }], 'hover');
  expect(res.overPrevented).toBe(true);
  await expect(OVERLAY(page)).toBeVisible();
  await expect(page.locator('#main-canvas')).not.toHaveClass(/dragging-files/);
  await page.screenshot({ path: 'C:/tmp/aw_qa/implC/dragdrop-window-overlay.png' });

  // Leaving the window-sized drop zone clears it.
  await drag(page, at.x, at.y, [{ name: 'sticker.png', type: 'image/png', png: [120, 80] }], 'leave');
  await expect(OVERLAY(page)).toHaveCount(0);
});

for (const [label, pick] of [
  ['right panel', async (page: Page) => page.locator('aside.aside-right')],
  ['top bar', async (page: Page) => page.locator('header.topbar')],
  ['tool rail', async (page: Page) => toolsToolbar(page)],
] as const) {
  test(`② a PNG dropped on the ${label} imports at the centre of the view`, async ({ page }) => {
    await boot(page);
    const before = await objectsCount(page);
    const box = (await (await pick(page)).boundingBox())!;
    const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    const res = await drag(page, at.x, at.y, [{ name: 'logo.png', type: 'image/png', png: [90, 60] }]);
    expect(res.overPrevented).toBe(true);
    await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', `Objects ${before + 1}`, { timeout: 10_000 });

    // One new object, 90 × 60 document px… (the canvas starts empty, so it is the only one)
    await selectAll(page);
    const img = await selectionBox(page);
    expect(img.width).toBeCloseTo(90, 1);
    expect(img.height).toBeCloseTo(60, 1);
    // …centred on the viewport, wherever on the chrome the pointer was
    // released: its pixel box around the view centre is symmetric about it.
    const view = (await page.locator(SCENE).boundingBox())!;
    const centre = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    expectImageAt((await magentaRectAt(page, centre.x, centre.y))!, centre.x, centre.y, 90, 60, (await zoomPercent(page)) / 100);
    await expect(OVERLAY(page)).toHaveCount(0);
  });
}

test('③ an unsupported file is refused with a toast that names it', async ({ page }) => {
  await boot(page);
  const box = (await page.locator('#main-canvas').boundingBox())!;
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const scene = await settledScene(page);
  await drag(page, at.x, at.y, [{ name: 'notes.txt', type: 'text/plain', text: 'hello' }]);
  const toast = page.locator('.toast-item[role="alert"]').filter({ hasText: 'notes.txt' });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Unsupported file type.');
  await expect(toast).toContainText('Supported:');
  // Refused means refused: no object, and the scene canvas is pixel-identical.
  expect(await objectsCount(page)).toBe(0);
  expect(await scenePixels(page)).toBe(scene);
});

test('③ several unsupported files produce one toast, and a mixed drop reports both sides', async ({ page }) => {
  await boot(page);
  const box = (await page.locator('#main-canvas').boundingBox())!;
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  await drag(page, at.x, at.y, [{ name: 'a.docx', type: 'application/octet-stream' }, { name: 'b.exe', type: 'application/octet-stream' }]);
  await expect(page.locator('.toast-item[role="alert"]').filter({ hasText: 'a.docx' })).toHaveCount(1);
  await expect(page.locator('.toast-item[role="alert"]')).toHaveCount(1);
  expect(await objectsCount(page)).toBe(0);
});

test('④ an SVG goes through the format registry importer', async ({ page }) => {
  await boot(page);
  const box = (await page.locator('#main-canvas').boundingBox())!;
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><rect x="5" y="5" width="90" height="40" fill="#00c853"/></svg>';
  await drag(page, at.x, at.y, [{ name: 'logo.svg', type: 'image/svg+xml', text: svg }]);
  // The smart SVG importer is itself a lazy chunk.
  await expect(page.locator(OBJECTS)).not.toHaveAttribute('aria-label', 'Objects 0', { timeout: 15_000 });
  // …and it imports SHAPES, not a bitmap of the picture: the rect arrives
  // with its own fill, which a placed raster image does not have.
  await selectAll(page);
  await expect(page.getByRole('textbox', { name: 'Fill color value' })).toHaveValue(/#00c853/i);
  await expect(page.locator('.toast-item[role="alert"]')).toHaveCount(0);
});

test('a drop target with its own handler (Gang Sheet Builder intake) keeps its files — nothing lands on the canvas', async ({ page }) => {
  await boot(page);
  const scene = await settledScene(page);
  await page.keyboard.press('Control+k');
  const paletteInput = page.locator('input[placeholder="Type a command or search…"]');
  await paletteInput.waitFor({ state: 'visible', timeout: 10_000 });
  await paletteInput.fill('Gang Sheet Builder…');
  await page.locator('#command-palette-list [role="option"]').filter({ hasText: 'Gang Sheet Builder' }).first().click();
  const zone = page.getByText('Drop PNG / JPEG / WebP images here');
  await expect(zone).toBeVisible();
  const box = (await zone.boundingBox())!;
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const file = [{ name: 'dtf.png', type: 'image/png', png: [60, 60] }];

  // The intake's own dragover accepts the drag; the window-wide overlay stays out of it.
  const hover = await drag(page, at.x, at.y, file, 'hover');
  expect(hover.overPrevented).toBe(true);
  await expect(OVERLAY(page)).toHaveCount(0);

  await drag(page, at.x, at.y, file);
  await page.waitForTimeout(600);
  // Nothing reached the editor canvas: no object, and the scene canvas is pixel-identical.
  expect(await objectsCount(page)).toBe(0);
  expect(await scenePixels(page)).toBe(scene);
});

test('a drop before the io3 chunk loads is held, announced, then imported — and never navigates away', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  // The lazy io3 chunk is `/src/lib/io3.ts` on the dev server and a hashed
  // `/assets/io3-<hash>.js` in the production build; hold either.
  await page.route(/\/(?:src\/lib\/io3\.ts(?:\?.*)?|assets\/io3-[A-Za-z0-9_-]+\.js)$/, async (route) => { await gate; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // The chrome is committed and its mount effects (which arm the guard) have flushed…
  await expect(page.locator('[role="menubar"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('#main-canvas canvas').first()).toBeVisible();

  const box = (await page.locator('#main-canvas').boundingBox())!;
  const res = await drag(page, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2), [{ name: 'early.png', type: 'image/png', png: [40, 40] }]);
  expect(res.overPrevented).toBe(true);
  const preparing = page.locator('.toast-item').filter({ hasText: 'Preparing import' });
  await expect(preparing).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
  expect(await objectsCount(page)).toBe(0);

  release();
  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', 'Objects 1', { timeout: 20_000 });
  await expect(preparing).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/');
});
