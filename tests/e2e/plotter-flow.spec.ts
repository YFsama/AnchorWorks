import { test, expect, type Locator, type Page } from './fixtures';
import * as fs from 'node:fs';

// Plotter dialog workflow (2026-11, Impl-A): "connect → position → test cut →
// send" and "check the preview" are the two real jobs of this card, so the
// spec drives exactly those, on the running dev app:
//
//   ① every open lands on Output (the preview) — connected or not
//   ② the connection strip above the preview says "Not connected" and its
//      "Connect…" button jumps to the Machine tab's connection card
//   ③ that connection card is on the Machine tab's FIRST screen — no
//      scrolling, nothing to expand
//   ④ Test cut / Send via USB while unlinked never surface a raw browser
//      exception: a readable hint, and the Machine tab. Web Serial cannot be
//      driven by Playwright, so navigator.serial is stubbed per test
//      (requestPort rejecting = the user dismissed the chooser; resolving a
//      fake port = the user picked one).
//   ⑤ the diagnostics card starts collapsed; once linked, the positioning
//      card (jog / origin / pen / test cuts) is on screen uncollapsed
//   ⑥ 960×600: the connection card still fits without scrolling and the
//      pinned footer action is hit-testable on first paint
//   ⑦ the cut line stays a thin line at any preview scale (rasterised and
//      measured), and the sheet no longer renders as a dark "black frame"
//
// Console policy: page errors must be zero. Console errors are asserted to
// contain nothing from the plotter files — one unrelated dev-mode React
// warning (PropertiesPanel → Toolbar render-phase update, owned elsewhere)
// is known to print as console.error.

const SHOTS = 'C:/tmp/aw_qa/implA';
const OUTLINE = 'CUT PREVIEW';

function attachErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  return errors;
}

function expectNoPlotterErrors(errors: string[]): void {
  const pageErrors = errors.filter((e) => e.startsWith('PAGEERROR'));
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  const mine = errors.filter((e) => /PlotterDialog|PlotterConsole|CutPreview|plotterLink|plotterGuards/i.test(e));
  expect(mine, mine.join('\n')).toEqual([]);
}

/** navigator.serial stub: counts chooser requests, can "cancel", and records
 *  every byte written to a fake port. Installed before the app boots. */
async function stubSerial(page: Page, { cancel = false } = {}): Promise<void> {
  await page.addInitScript(({ cancel: doCancel }) => {
    type Stub = { requestPort: number; open: number; openArgs: unknown; written: string; cancel: boolean };
    const calls: Stub = { requestPort: 0, open: 0, openArgs: null, written: '', cancel: !!doCancel };
    (window as unknown as { __plotterStub: Stub }).__plotterStub = calls;
    const makePort = () => ({
      open: async (o: unknown) => { calls.open++; calls.openArgs = o; },
      close: async () => { /* released */ },
      setSignals: async () => { /* not needed */ },
      getInfo: () => ({}),
      readable: new ReadableStream<Uint8Array>({ start() { /* stays open */ } }),
      writable: new WritableStream<Uint8Array>({
        write(chunk: Uint8Array) { calls.written += new TextDecoder().decode(chunk); },
      }),
    });
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: {
        getPorts: async () => [],
        requestPort: () => {
          calls.requestPort++;
          if (calls.cancel) {
            return Promise.reject(new DOMException(
              "Failed to execute 'requestPort' on 'Serial': No port selected by the user.", 'NotFoundError'));
          }
          return Promise.resolve(makePort());
        },
      },
    });
  }, { cancel });
}

interface SerialStub { requestPort: number; open: number; openArgs: { baudRate: number } | null; written: string }
const stub = (page: Page): Promise<SerialStub> => page.evaluate(() => (window as unknown as { __plotterStub: SerialStub }).__plotterStub);

async function setupSession(page: Page, rects: Array<readonly [number, number, number, number]> = [[-60, -40, 140, 70]]): Promise<void> {
  await page.goto('/');
  await page.getByRole('menubar').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#main-canvas').waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(600);
  const { width: vw, height: vh } = page.viewportSize()!;
  for (const [dx, dy, w, h] of rects) {
    await page.click('button[data-tool="rect"]');
    await page.mouse.move(vw / 2 + dx, vh / 2 + dy);
    await page.mouse.down();
    await page.mouse.move(vw / 2 + dx + w, vh / 2 + dy + h, { steps: 6 });
    await page.mouse.up();
  }
  await page.click('button[data-tool="select"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // The preview counts what is on the canvas — make sure the shapes landed
  // (a cold first load after a dev-server re-transform can swallow a drag).
  if (rects.length) await expect(page.getByText(new RegExp(`Objects\\s+${rects.length}\\b`)).first()).toBeVisible({ timeout: 10_000 });
}

async function openPlotter(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+k');
  const input = page.locator('input[placeholder="Type a command or search…"]');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill('Send to Plotter…');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Send to Plotter / Cutter' });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(500); // palette close + dialog open transition
  return dialog;
}

const footer = (dialog: Locator, label: string) => dialog.locator('[aria-label="Plotter output actions"]').getByRole('button', { name: label, exact: true });
const selectedTabId = (dialog: Locator) => dialog.locator('[role="tablist"][aria-label="Plotter sections"] [aria-selected="true"]').getAttribute('id');

async function shot(page: Page, dialog: Locator, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await dialog.screenshot({ path: `${SHOTS}/${name}.png` });
}

test.describe('plotter dialog workflow', () => {
  test('① every open lands on Output with the cut preview; tabs read Output → Cut settings → Calibrate & test → Machine', async ({ page }) => {
    const errors = attachErrors(page);
    await setupSession(page); // one rect → the canvas-SVG fallback cuts its outline
    const dialog = await openPlotter(page);

    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-output');
    await expect(dialog.locator('[data-plotter-pane="output"]')).toBeVisible();
    const preview = dialog.locator('svg[aria-label="Cut preview"]');
    await expect(preview).toBeVisible();
    // Display order = workflow order (and the arrow-key roaming order).
    const order = await dialog.locator('[role="tablist"][aria-label="Plotter sections"] [role="tab"]').allTextContents();
    expect(order.map((s) => s.trim())).toEqual(['Output', 'Cut settings', 'Calibrate & test', 'Machine']);
    // Exactly the rect's outline is drawn — the canvas background rect is not a cut path.
    await expect(preview.locator('polygon, polyline')).toHaveCount(1);
    // Pinned summary (and its screen-reader twin) count the paths that ship.
    await expect(dialog.getByText(/Canvas artwork · 1 paths/).first()).toBeVisible();
    // …and it sits ON the artwork (document space), not stacked on the page
    // origin: the rect was drawn around the viewport centre.
    const placed = await preview.evaluate((svg) => {
      const el = svg as unknown as SVGSVGElement;
      const sheet = el.querySelector('rect[fill^="url(#cut-checker)"]')!.getBoundingClientRect();
      const poly = el.querySelector('polygon, polyline')!.getBoundingClientRect();
      return {
        fx: (poly.left + poly.width / 2 - sheet.left) / sheet.width,
        fy: (poly.top + poly.height / 2 - sheet.top) / sheet.height,
        onSheet: poly.left > sheet.left + 4 && poly.top > sheet.top + 4,
      };
    });
    console.log(`    canvas-mode outline placement on the sheet: ${JSON.stringify(placed)}`);
    expect(placed.onSheet).toBe(true);
    expect(placed.fx).toBeGreaterThan(0.35);
    expect(placed.fx).toBeLessThan(0.7);
    expect(placed.fy).toBeGreaterThan(0.2);
    expect(placed.fy).toBeLessThan(0.7);
    await preview.screenshot({ path: `${SHOTS}/preview-canvas-mode.png` });

    // Roving tabindex: only the selected tab is in the Tab sequence; arrows roam.
    await expect(dialog.locator('#plotter-tab-output')).toHaveAttribute('tabindex', '0');
    await expect(dialog.locator('#plotter-tab-cut')).toHaveAttribute('tabindex', '-1');
    await dialog.locator('#plotter-tab-output').focus();
    await page.keyboard.press('ArrowRight');
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-cut');
    await expect(dialog.locator('#plotter-tab-cut')).toBeFocused();
    await page.keyboard.press('End');
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-machine');
    await page.keyboard.press('ArrowRight'); // wraps
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-output');

    // Reopening lands on Output again (the landing tab is not sticky).
    await footer(dialog, 'Cancel').click();
    await expect(dialog).toBeHidden();
    await openPlotter(page);
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-output');
    expectNoPlotterErrors(errors);
  });

  test('② the connection strip reads "Not connected"; "Connect…" lands on the Machine tab connection card', async ({ page }) => {
    await setupSession(page);
    const dialog = await openPlotter(page);
    const strip = dialog.locator('[data-plotter-pane="output"] [data-plotter-link-status]');
    await expect(strip).toHaveAttribute('data-plotter-link-status', 'none');
    await expect(strip).toHaveAttribute('role', 'status');
    await expect(strip).toContainText('Not connected');
    // The strip is on the first screen, above the preview.
    const stripBox = await strip.boundingBox();
    const previewBox = await dialog.locator('svg[aria-label="Cut preview"]').boundingBox();
    expect(stripBox!.y).toBeLessThan(previewBox!.y);
    expect(stripBox!.y).toBeGreaterThanOrEqual(0);

    await dialog.locator('#plotter-status-connect').click();
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-machine');
    await expect(dialog.locator('[data-plotter-card="connect"]')).toBeVisible();
    await expect(dialog.locator('#plotter-connect-primary')).toBeFocused();
    await expect(dialog.locator('#plotter-connect-primary')).toHaveText(/serial port|Connect/); // web shell: the chooser is the connect action
  });

  for (const vp of [{ name: '1440x900', width: 1440, height: 900 }, { name: '960x600', width: 960, height: 600 }]) {
    test(`③ + ⑥ ${vp.name}: the connection card is on the Machine tab's first screen — no scrolling, nothing to expand`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setupSession(page);
      const dialog = await openPlotter(page);
      await dialog.locator('#plotter-tab-machine').click();

      // Geometry proof: the scroll container is at the top and the whole card
      // lies inside its visible box (which itself lies inside the viewport).
      const geo = await dialog.locator('[data-plotter-pane="machine"]').evaluate((pane) => {
        const scroller = pane.closest('.overflow-y-auto') as HTMLElement;
        const card = pane.querySelector('[data-plotter-card="connect"]') as HTMLElement;
        const s = scroller.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
        return {
          scrollTop: scroller.scrollTop,
          cardTopInScroller: Math.round(c.top - s.top),
          cardBottomInScroller: Math.round(s.bottom - c.bottom), // ≥ 0 → fully visible without scrolling
          cardHeight: Math.round(c.height),
          cardTopInViewport: Math.round(c.top),
          covered: !!(hit && card.contains(hit)),
          firstCard: pane.querySelector('[data-plotter-card]')?.getAttribute('data-plotter-card'),
          order: Array.from(pane.querySelectorAll('[data-plotter-card]')).map((el) => el.getAttribute('data-plotter-card')),
        };
      });
      console.log(`    connection-card geometry @${vp.name}: ${JSON.stringify(geo)}`);
      expect(geo.firstCard).toBe('connect');
      expect(geo.order).toEqual(['connect', 'diagnostics']); // no jog card while unlinked; setup grid is slotted (no data attr)
      expect(geo.scrollTop).toBe(0);
      expect(geo.cardTopInScroller).toBeGreaterThanOrEqual(0);
      expect(geo.cardBottomInScroller).toBeGreaterThanOrEqual(0); // the proof: visible WITHOUT scrolling
      expect(geo.cardTopInViewport).toBeGreaterThanOrEqual(0);
      expect(geo.covered).toBe(true);

      // Every connection control is visible and hit-testable on that first screen.
      for (const sel of ['#plotter-connect-primary', 'select[aria-label="Baud rate"]', 'select[aria-label="Flow control"]']) {
        const el = dialog.locator(`[data-plotter-card="connect"] ${sel}`);
        await expect(el).toBeVisible();
        expect(await el.evaluate((n) => { const r = (n as HTMLElement).getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === n || n.contains(hit)); }), sel).toBe(true);
      }
      // Nothing had to be expanded: the diagnostics card is still collapsed.
      await expect(dialog.locator('#plotter-diagnostics-toggle')).toHaveAttribute('aria-expanded', 'false');

      // ⑥ The pinned footer action is clickable on first paint.
      const send = footer(dialog, 'Send via USB');
      await expect(send).toBeEnabled();
      expect(await send.evaluate((n) => { const r = (n as HTMLElement).getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.top >= 0 && r.bottom <= innerHeight && !!hit && (hit === n || n.contains(hit)); })).toBe(true);

      await shot(page, dialog, `machine-${vp.name}`);
      await dialog.locator('#plotter-tab-cut').click();
      await shot(page, dialog, `cut-${vp.name}`);
      await dialog.locator('#plotter-tab-output').click();
      await shot(page, dialog, `output-${vp.name}`);
    });
  }

  test('④ unlinked Test cut / Send via USB (chooser dismissed): readable hint, never the raw browser text, Machine tab', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 600 });
    await stubSerial(page, { cancel: true });
    await setupSession(page);
    const dialog = await openPlotter(page);

    await footer(dialog, 'Test cut').click();
    // The chooser was opened on the operator's behalf, exactly once…
    expect((await stub(page)).requestPort).toBe(1);
    // …and the dismissal is explained in plain words.
    await expect(page.getByText(/Port selection cancelled/).first()).toBeVisible();
    await expect(page.getByText(/Failed to execute|requestPort|No port selected by the user/)).toHaveCount(0);
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-machine');
    await expect(dialog.locator('[data-plotter-card="connect"]')).toBeVisible();
    // The status is "Not connected" — a dismissed chooser is not an error.
    await expect(dialog.locator('[data-plotter-card="connect"]')).toContainText('Not connected');
    // Nothing reached a port.
    const after = await stub(page);
    expect(after.open).toBe(0);
    expect(after.written).toBe('');
    await shot(page, dialog, 'unlinked-test-cut-960x600');

    // Back to Output; Send via USB takes the same route.
    await dialog.locator('#plotter-tab-output').click();
    await footer(dialog, 'Send via USB').click();
    await expect(page.getByText(/Port selection cancelled/).first()).toBeVisible();
    expect((await stub(page)).requestPort).toBe(2);
    await expect(page.getByText(/Failed to execute|requestPort/)).toHaveCount(0);
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-machine');
    await expect(page.getByText(/Sent to plotter|Test cut sent/)).toHaveCount(0);
  });

  test('④ unlinked Send via USB (port chosen): the chooser is opened, the port is connected + primed, the job streams — no tab pull-off', async ({ page }) => {
    await stubSerial(page);
    await setupSession(page);
    const dialog = await openPlotter(page);
    const progress = page.getByText(/Sending \d+\/\d+ B/);

    await footer(dialog, 'Send via USB').click();
    // The chooser was requested once…
    await expect.poll(async () => (await stub(page)).requestPort).toBe(1);
    // …the chosen port was opened at the dialog's baud rate and primed (HP-GL area query), then the job streamed.
    await expect.poll(async () => (await stub(page)).open, { timeout: 8_000 }).toBe(1);
    expect((await stub(page)).openArgs?.baudRate).toBeGreaterThan(0);
    await expect.poll(async () => (await stub(page)).written, { timeout: 8_000 }).toMatch(/^OH;[\s\S]*PU/);
    const wire = (await stub(page)).written;
    // KNOWN DEFECT, owned by plotter.ts (outside this change): a job that
    // ships in canvas mode (no cut paths) still carries the canvas BACKGROUND
    // rect flattened into one non-finite polyline ("PU…;PDNaN,NaN,…"). See the
    // fixme test at the end of this file; logged here so every run shows it.
    const bad = wire.split(/\r?\n/).filter((l) => /NaN/.test(l));
    if (bad.length) console.warn(`    KNOWN DEFECT (plotter.ts): canvas-mode job carries a non-finite polyline: ${bad.join(' ⏎ ')}`);
    await expect(page.getByText(/Sent to plotter/).first()).toBeVisible({ timeout: 8_000 });
    // Still on the preview; the strip now reports the link and offers the jog shortcut.
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-output');
    const strip = dialog.locator('[data-plotter-link-status]');
    await expect(strip).toHaveAttribute('data-plotter-link-status', 'connected');
    await expect(strip).toContainText(/@ \d+/);
    await expect(dialog.locator('#plotter-status-jog')).toBeVisible();
    await expect(progress).toHaveCount(0); // stream finished
    await shot(page, dialog, 'output-connected');
  });

  test('⑤ diagnostics start collapsed; once linked the positioning card is on screen, uncollapsed, next to the test cuts', async ({ page }) => {
    await stubSerial(page);
    await setupSession(page);
    const dialog = await openPlotter(page);
    await dialog.locator('#plotter-tab-machine').click();

    // Collapsed by default, and no longer called "Debug console".
    const toggle = dialog.locator('#plotter-diagnostics-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveText(/Diagnostics & console/);
    await expect(dialog.getByText(/Debug console/)).toHaveCount(0);
    await expect(dialog.locator('#plotter-diagnostics-body')).toHaveCount(0);
    await expect(dialog.locator('[data-plotter-card="jog"]')).toHaveCount(0); // nothing to jog yet

    // Connect through the card's own action → the positioning card appears.
    await dialog.locator('#plotter-connect-primary').click();
    const jog = dialog.locator('#plotter-jog-card');
    await expect(jog).toBeVisible({ timeout: 8_000 });
    await expect(dialog.locator('[data-plotter-card="connect"]')).toContainText(/Disconnect/);
    for (const name of ['Move up', 'Move down', 'Move left', 'Move right', 'Set origin']) {
      await expect(jog.getByRole('button', { name, exact: true })).toBeEnabled();
    }
    for (const label of ['Home', 'Pen up', 'Blade tap', 'Feed 50 mm', 'Eject', 'Test cut', 'Force test', 'Corner tour']) {
      await expect(jog.getByRole('button', { name: label, exact: true })).toBeEnabled();
    }
    // Move to coordinates takes "X,Y"; Go lights up once a target is typed.
    await expect(jog.getByLabel('Move to coordinates')).toBeEnabled();
    await expect(jog.getByRole('button', { name: 'Go', exact: true })).toBeDisabled();
    await jog.getByLabel('Move to coordinates').fill('25,10');
    await expect(jog.getByRole('button', { name: 'Go', exact: true })).toBeEnabled();
    await expect(jog.getByRole('group', { name: 'Jog step' }).getByRole('button', { name: '10mm' })).toHaveAttribute('aria-pressed', 'true');
    // The card sits between the connection card and the diagnostics card.
    const order = await dialog.locator('[data-plotter-pane="machine"]').evaluate((pane) => Array.from(pane.querySelectorAll('[data-plotter-card]')).map((el) => el.getAttribute('data-plotter-card')));
    expect(order).toEqual(['connect', 'jog', 'diagnostics']);
    // Jogging from the pad sends machine text over the (fake) port.
    const before = (await stub(page)).written.length;
    await jog.getByRole('button', { name: 'Move up', exact: true }).click();
    await expect.poll(async () => ((await stub(page)).written.length - before), { timeout: 5_000 }).toBeGreaterThan(0);
    expect((await stub(page)).written.slice(before)).toMatch(/^PU;PR0,\d+;/);
    await shot(page, dialog, 'machine-connected-jog');

    // Diagnostics are still collapsed until asked for.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const body = dialog.locator('#plotter-diagnostics-body');
    await expect(body).toBeVisible();
    await expect(body.getByLabel('Raw command')).toBeVisible();
    await expect(body.getByRole('log', { name: 'Serial traffic' })).toBeVisible();
    for (const label of ['Self-test', 'Detect baud', 'Identify machine', 'Download report', 'Save machine', 'Update machine', 'Delete machine']) {
      await expect(body.getByRole('button', { name: label, exact: true })).toHaveCount(1);
    }
    await expect(body.getByText(/Job history \(\d+\)/)).toBeVisible();
    await expect(body.getByRole('toolbar', { name: 'Quick machine commands' })).toBeVisible();
    await shot(page, dialog, 'machine-diagnostics-open');
  });

  // Owned by plotter.ts (not in this change) — TWO defects in the canvas-mode
  // path (a job shipped without cut paths), both reproduced on the real wire:
  //  1. svgToPolylines flattens the canvas BACKGROUND rect (width/height
  //     "100%") into a polyline with NaN coordinates → every canvas-mode job
  //     opens with a pen-DOWN statement full of NaN.
  //  2. matrixForNode parses fabric's space-separated `matrix(1 0 0 1 x y)`
  //     with new DOMMatrix(), whose CSS grammar rejects it (SyntaxError,
  //     swallowed) → every object's position / rotation / scale is dropped and
  //     the job cuts at the page origin. (The preview normalises the transform
  //     itself — see toCssTransforms in PlotterDialog.tsx.)
  // Fix both in plotter.ts, then flip this to a passing test.
  test('canvas-mode job keeps object transforms and carries no non-finite coordinates (plotter.ts)', async ({ page }) => {
    await stubSerial(page);
    await setupSession(page); // rect drawn around the viewport centre → well right of / below the origin
    const dialog = await openPlotter(page);
    await footer(dialog, 'Send via USB').click();
    await expect.poll(async () => (await stub(page)).written, { timeout: 8_000 }).toMatch(/^OH;[\s\S]*PU/);
    const wire = (await stub(page)).written;
    expect(wire).not.toContain('NaN');
    const moves = wire.match(/PU(-?\d+),(-?\d+);/g) ?? [];
    expect(moves.some((m) => Number(/PU(-?\d+)/.exec(m)![1]) > 3000)).toBe(true);
  });
  test('⑦ the cut line is a thin line at any preview scale; the sheet follows the light theme (no dark "frame")', async ({ page }) => {
    const errors = attachErrors(page);
    /** Draw one rect of the given on-canvas size, open the dialog, and
     *  rasterise the preview SVG: reports the cut line's on-screen thickness,
     *  its dash period, and the sheet's corner colour. */
    const measure = async (w: number, h: number) => {
      await setupSession(page, [[-w / 2, -h / 2, w, h]]);
      const dialog = await openPlotter(page);
      const m = await dialog.locator('svg[aria-label="Cut preview"]').evaluate(async (node) => {
        const svg = node as unknown as SVGSVGElement;
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.removeAttribute('class'); clone.removeAttribute('style');
        clone.setAttribute('width', String(svg.clientWidth)); clone.setAttribute('height', String(svg.clientHeight));
        const xml = new XMLSerializer().serializeToString(clone);
        const img = new Image();
        await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('svg raster failed')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        const px = (x: number, y: number) => { const i = (y * cv.width + x) * 4; return [d[i], d[i + 1], d[i + 2]] as const; };
        // Magenta ink = red high, green low.
        const ink = (x: number, y: number) => { const [r, gg, b] = px(x, y); return r > 200 && gg < 150 && b > 90; };
        let thickness = 0;
        for (let x = 2; x < cv.width - 2 && !thickness; x++) for (let y = 1; y < cv.height - 1; y++) {
          if (ink(x, y) && ink(x + 1, y)) { // a dash long enough to sample across
            let up = y, down = y;
            while (up > 0 && ink(x + 1, up - 1)) up--;
            while (down < cv.height - 1 && ink(x + 1, down + 1)) down++;
            thickness = down - up + 1;
            break;
          }
        }
        const inkPx = (() => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 150 && d[i + 2] > 90) n++; return n; })();
        // Sheet colours are theme tokens: read them from the LIVE element (a
        // separate SVG image document cannot resolve the page's CSS variables).
        const tiles = Array.from(svg.querySelectorAll('pattern rect')).map((r) => getComputedStyle(r).fill);
        const cut = svg.querySelector('polygon, polyline')!;
        return { width: cv.width, height: cv.height, thickness, inkPx, sheet: tiles, strokeWidth: getComputedStyle(cut).strokeWidth, vectorEffect: cut.getAttribute('vector-effect') };
      });
      await footer(dialog, 'Cancel').click();
      return m;
    };
    const big = await measure(900, 420);   // low zoom  (≈ 0.7 px per mm)
    const tiny = await measure(26, 26);    // high zoom (≈ 8 px per mm)
    console.log(`    cut line @low zoom: ${JSON.stringify(big)}\n    cut line @high zoom: ${JSON.stringify(tiny)}`);
    // Thin at BOTH extremes: the same non-scaling 1.2 px stroke (≤ 3 px with antialiasing).
    expect(big.vectorEffect).toBe('non-scaling-stroke');
    expect(tiny.vectorEffect).toBe('non-scaling-stroke');
    expect(big.thickness).toBeGreaterThan(0);
    expect(tiny.thickness).toBeGreaterThan(0);
    expect(big.thickness).toBeLessThanOrEqual(3);
    expect(tiny.thickness).toBeLessThanOrEqual(3);
    expect(Math.abs(big.thickness - tiny.thickness)).toBeLessThanOrEqual(1);
    // Ink was really on the raster at both scales (the thickness above is not vacuous).
    expect(big.inkPx).toBeGreaterThan(0);
    expect(tiny.inkPx).toBeGreaterThan(0);
    // The sheet (checkerboard) follows the light theme: pale panel tones, not
    // the former hard-coded near-black board that read as a thick black frame.
    for (const m of [big, tiny]) {
      expect(m.sheet.length).toBeGreaterThanOrEqual(2);
      for (const fill of m.sheet) {
        const rgb = fill.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
        expect(rgb[0], fill).toBeGreaterThan(200);
        expect(rgb[1], fill).toBeGreaterThan(200);
        expect(rgb[2], fill).toBeGreaterThan(200);
        expect(fill).not.toBe('rgb(27, 27, 34)');
      }
    }
    expectNoPlotterErrors(errors);
  });
});
